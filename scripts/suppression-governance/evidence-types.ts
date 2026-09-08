/**
 * Shapes shared across the suppression-governance execution layer
 * (scripts/suppression-governance/*.ts, which discovers suppression comments and reconciles
 * .repo-contract/exceptions/disable-comments.json) and its policy layer
 * (checks/suppression-governance.ts, which evaluates the reconciled registry against
 * suppressionPolicy). See specs/decisions/0006-suppression-governance.md and
 * specs/decisions/0013-reusable-exception-policy-helper.md's "The exception registry is the review
 * surface" section for the full rationale.
 *
 * The model, since ADR 0013's amendment: the check discovers **100% of suppression directives**
 * with zero knowledge of any exception, derives one semantic id per directive, reconciles those
 * ids against the on-disk registry via `repo-contract/helpers`' `reconcileExceptions` (a fresh
 * blank stub per unmatched directive, stale records surfaced never removed), writes the reconciled
 * registry back, and emits every raw finding plus the reconciled records as evidence. The policy
 * is a pure evidence->verdict function.
 */

import type { ExceptionRegistrySchema } from "../shared/exception-record.js"
import { validateExceptionRegistry } from "../shared/exception-record.js"

// Re-exported so the policy layer and tests reach the suppression registry validator through this
// same module they get `SUPPRESSION_EXCEPTION_SCHEMA` from. `reconcileExceptions`/
// `serializeExceptionRegistry`/`writeExceptionRegistry` are imported straight from
// `repo-contract/helpers` at their (few) use sites instead.
export { validateExceptionRegistry }

/**
 * Every allowed `category` value on a suppression exception record -- the single source of truth
 * `SuppressionCategory` (below) is derived from, rather than a separate union this array is merely
 * checked against, so a member added here without updating the type (or vice versa) is
 * structurally impossible, not just something a test happens to catch.
 */
export const SUPPRESSION_CATEGORIES = [
  "",
  "equivalent-mutant",
  "unreachable-invariant",
  "platform-limitation",
  "tooling-limit",
  "rule-not-applicable",
  "intentional-deviation",
] as const

/**
 * What kind of suppression an exception record is. `""` is a deliberate member, not an omission --
 * it is the "not yet classified" sentinel a freshly-scaffolded stub starts with, exactly like
 * `justification`. This field is hand-authored; nothing ever infers it from the comment's own text
 * (ADR 0006's rejection of a mechanically-satisfiable model applies identically here).
 *
 * Boundary tests, since several of these are easy to conflate:
 *
 * - `"equivalent-mutant"` vs. `"tooling-limit"`: `equivalent-mutant` asserts no observable
 *   behavioral difference exists at all. `tooling-limit` asserts a difference *does* exist but
 *   this specific tool can't observe it. If a record's own prose admits a real production
 *   consequence (a resource leak, unbounded growth) that just isn't visible to this test suite,
 *   it is never `equivalent-mutant` -- it's `tooling-limit`.
 * - `"tooling-limit"` vs. `"platform-limitation"`: both describe a real behavior mutation-testing
 *   can't verify, but for different reasons. `platform-limitation` means the mutated behavior is
 *   not exercised at all by the mutation run substantiating this record (e.g. a Windows-only
 *   branch, when the mutation run happened on Linux). `tooling-limit` means the behavior is
 *   exercised, but the mutation tool's own mechanics can't meaningfully observe the mutation's
 *   effect. A `platform-limitation` could in principle be closed by running mutation testing on
 *   the missing platform; a `tooling-limit` is an inherent limit of comment-based mutation testing
 *   that no CI change fixes.
 * - `"rule-not-applicable"` vs. `"intentional-deviation"`: would complying with the suppressed
 *   rule change runtime behavior the author considers worse? If yes, it's `intentional-deviation`.
 *   If complying would be a pure no-op refactor because the rule's underlying premise is simply
 *   false for this code, it's `rule-not-applicable`.
 *
 * No validation ties a `category` to a `domain` -- deliberately out of scope.
 */
export type SuppressionCategory = (typeof SUPPRESSION_CATEGORIES)[number]

/**
 * Every allowed `verificationMethod` value on a suppression exception record -- the single source
 * of truth `VerificationMethod` (below) is derived from, for the identical structural-drift-safety
 * reason `SUPPRESSION_CATEGORIES` is above.
 */
export const VERIFICATION_METHODS = [
  "",
  "mutation-run",
  "existing-test-suite",
  "differential-testing",
  "static-reasoning",
  "untestable",
] as const

/**
 * How a suppression's claim was substantiated. `""` is the same deliberate "not yet classified"
 * sentinel `SuppressionCategory` uses, hand-authored the same way, never inferred from comment
 * text.
 *
 * This field means "the strongest evidence actually obtained for the specific claim this record
 * makes," not "the only verification that was ever performed on this code." Where a record
 * legitimately has more than one kind of evidence, record the strongest one actually obtained,
 * using this precedence: `"mutation-run" > "existing-test-suite" > "differential-testing" >
 * "static-reasoning" > "untestable"`.
 *
 * Anti-gaming rule, applying to every member equally: a verification method must describe evidence
 * that actually substantiates *this specific record's* claim -- never merely evidence that exists
 * somewhere in the same file, test suite, or CI run.
 *
 * - `"mutation-run"` -- verified by literally un-exempting the mutant and running Stryker scoped
 *   to the file, observing the survivor (or `NoCoverage`) result directly.
 * - `"existing-test-suite"` -- an already-existing, already-passing test elsewhere independently
 *   proves the claim.
 * - `"differential-testing"` -- verified by actually *executing* multiple real input shapes and
 *   comparing outputs. Hand-tracing without execution does not count -- that's `"static-reasoning"`.
 * - `"static-reasoning"` -- a logical/structural argument alone (type-level guarantees, call-graph
 *   analysis, a documented language/API contract), nothing run empirically.
 * - `"untestable"` -- deliberately not verified empirically because doing so would be
 *   unsafe/impossible. **Not** an escape hatch: it must never mean "verification would have been
 *   inconvenient," "verification wasn't attempted," or "the author was unsure."
 */
export type VerificationMethod = (typeof VERIFICATION_METHODS)[number]

/**
 * One suppression directive discovered in governed source -- a raw *finding*, emitted whether or
 * not it is governed by an exception record. `id` is this finding's check-namespaced semantic
 * identity and the exact key an exception record must carry to waive it.
 *
 * `id` = `suppression:<domain>:<rule.join(",")>:<file>:<line>` (see `deriveSuppressionId`). The
 * line is deliberately *in* the identity: moving a suppressed directive to a new line makes its
 * old record go stale and scaffolds a fresh blank stub at the new line -- both fail the build
 * until a human carries the justification across. No move detection is attempted; an automated
 * registry silently transferring justification between locations is exactly the bypass ADR 0006
 * forbids.
 *
 * `content` is the canonicalized directive comment; `reason` is the text a recognizer
 * (recognizers.ts) mechanically extracts from it (everything after the domain keywords and rule
 * list). Both are evidence for a reviewer and for the `stryker`-domain `"reason"` policy
 * requirement -- neither is stored on the record (a record holds only what a human authors plus
 * the structured identity fields).
 */
export interface SuppressionFinding {
  readonly id: string
  readonly domain: string
  readonly rule: readonly string[]
  readonly file: string
  readonly line: number
  readonly content: string
  readonly reason: string
}

/**
 * One row of disable-comments.json -- the on-disk exception record shape. `id`/`version`/
 * `justification` are the core every `.repo-contract/exceptions/*.json` registry shares;
 * `category`/`domain`/`file`/`line`/`rule`/`verificationMethod` are this registry's typed
 * metadata. `id` must equal `deriveSuppressionId({ domain, rule, file, line })` -- a hand-edited
 * record cannot lie about which finding it waives.
 *
 * `justification` is the one human-authored prose field (it absorbed the older model's separate
 * `alternatives`/`remediation` fields): why this guardrail is deliberately bypassed for an
 * approved architectural reason, what alternatives were considered, and what was checked to
 * confirm the finding is real. `category`/`verificationMethod` are hand-authored closed
 * enumerations (see `SUPPRESSION_CATEGORIES`/`VERIFICATION_METHODS`). A freshly-scaffolded stub
 * starts with all three at their empty value; whether an empty value satisfies policy is
 * checks/suppression-governance.ts's concern, not the validator's.
 */
export interface SuppressionExceptionRecord {
  readonly id: string
  readonly version: 1
  readonly justification: string
  readonly category: SuppressionCategory
  readonly domain: string
  readonly file: string
  readonly line: number
  readonly rule: readonly string[]
  readonly verificationMethod: VerificationMethod
}

/**
 * Widens typed suppression records to the flat `Record<string, unknown> & { id }` shape the
 * generic `serializeExceptionRegistry`/`writeExceptionRegistry` accept. A
 * `SuppressionExceptionRecord` is structurally exactly that (flat, string `id`); TypeScript will
 * not infer the implicit index signature through an interface, so this narrow, single-purpose
 * assertion lives here rather than being repeated at each call site.
 * @param records - The typed records to widen.
 * @returns The same records, typed as flat string-keyed records.
 */
export function asFlatRecords(
  records: readonly SuppressionExceptionRecord[],
): readonly (Record<string, unknown> & { readonly id: string })[] {
  return records as unknown as readonly (Record<string, unknown> & { readonly id: string })[]
}

/**
 * Printed as JSON to stdout by scripts/suppression-governance/check.ts for repo-contract's
 * `output: { format: "json" }` to parse, and read (never re-derived) by
 * checks/suppression-governance.ts's policy and checks/mutation.ts's Stryker suppression gate.
 *
 * `ok: false` means the script itself could not complete its work -- a source file couldn't be
 * read, a pre-existing registry failed validation (left on disk untouched), a `deriveId` collision
 * (two indistinguishable directives), or the reconciled registry could not be written -- a
 * tool-infrastructure/integrity failure, distinct from "reconciliation succeeded and found
 * suppressions the policy will go on to reject."
 *
 * On `ok: true`: `findings` is every raw directive discovered (nothing filtered). `activeExceptions`
 * is the reconciled live record for each finding, keyed by finding id -- `set(findings.map(id))`
 * equals `set(keys(activeExceptions))` exactly (the policy asserts this bijection).
 * `staleExceptions` is every prior record whose id matched no finding this run -- surfaced for the
 * policy to fail on, never removed here. `scaffoldedIds` is the subset of `activeExceptions` keys
 * that were freshly stubbed this run (blank `justification`).
 */
export type SuppressionGovernanceEvidence =
  | {
      readonly ok: true
      readonly registryPath: string
      readonly findings: readonly SuppressionFinding[]
      readonly activeExceptions: Readonly<Record<string, SuppressionExceptionRecord>>
      readonly staleExceptions: readonly SuppressionExceptionRecord[]
      readonly scaffoldedIds: readonly string[]
    }
  | {
      readonly ok: false
      readonly error: string
      readonly registryValidationErrors?: readonly string[]
    }

const WINDOWS_DRIVE_PATH = /^[A-Za-z]:[/\\]/

/**
 * Whether `file` is a well-formed repository-relative POSIX path: non-empty, never absolute (POSIX
 * `/...` or a Windows drive path), never backslash-separated, and never containing a `..` segment
 * -- defense-in-depth against a hand-edited record smuggling in a path that escapes the repository
 * root.
 * @param file - The candidate `file` value.
 * @returns `true` if `file` is a well-formed repository-relative POSIX path.
 */
function isWellFormedRepoRelativePath(file: string): boolean {
  if (file.length === 0) return false
  if (file.startsWith("/") || WINDOWS_DRIVE_PATH.test(file)) return false
  if (file.includes("\\")) return false
  return !file.split("/").includes("..")
}

/**
 * The check-namespaced semantic identity of one suppression directive:
 * `suppression:<domain>:<rule.join(",")>:<file>:<line>`. Injective over a run's findings unless
 * two byte-distinct directives share a domain, rule set, file, and line -- a real condition the
 * check surfaces as an integrity failure (the human must make the two directives distinguishable).
 * @param finding - The directive's structured identity fields.
 * @param finding.domain - The suppression's governed domain (`"eslint"`, `"typescript"`, `"stryker"`).
 * @param finding.rule - The rule(s) the directive covers within its domain.
 * @param finding.file - The directive's repository-relative POSIX source path.
 * @param finding.line - The directive comment's 1-indexed source line.
 * @returns The semantic id.
 */
export function deriveSuppressionId(finding: {
  readonly domain: string
  readonly rule: readonly string[]
  readonly file: string
  readonly line: number
}): string {
  return `suppression:${finding.domain}:${finding.rule.join(",")}:${finding.file}:${String(finding.line)}`
}

/**
 * Builds a fresh, blank exception record for a directive that has no matching record yet -- every
 * hand-authored field at its empty value, the structured identity fields copied straight from the
 * finding. `reconcileExceptions` hands this the canonical id and asserts the result carries it.
 * @param finding - The unmatched directive.
 * @param id - The canonical id `reconcileExceptions` computed (equals `finding.id`).
 * @returns The blank stub record.
 */
export function createSuppressionStub(
  finding: SuppressionFinding,
  id: string,
): SuppressionExceptionRecord {
  return {
    id,
    version: 1,
    justification: "",
    category: "",
    domain: finding.domain,
    file: finding.file,
    line: finding.line,
    rule: [...finding.rule],
    verificationMethod: "",
  }
}

/**
 * The per-registry schema for disable-comments.json, plugged into the generic
 * `validateExceptionRegistry`. Owns the six typed metadata fields on top of the shared core, and
 * the self-consistency check that a record's stored `id` matches the id derived from its own
 * `domain`/`rule`/`file`/`line`.
 */
export const SUPPRESSION_EXCEPTION_SCHEMA: ExceptionRegistrySchema<SuppressionExceptionRecord> = {
  namespace: "suppression:",
  metadataKeys: ["category", "domain", "file", "line", "rule", "verificationMethod"],
  validateRecord(core, raw, index, errors) {
    const { category, domain, file, line, rule, verificationMethod } = raw
    const at = `exceptions[${String(index)}]`

    const domainValid = typeof domain === "string" && domain.length > 0
    if (!domainValid) errors.push(`${at}.domain must be a non-empty string.`)

    const fileValid = typeof file === "string" && isWellFormedRepoRelativePath(file)
    if (!fileValid) {
      errors.push(
        `${at}.file must be a non-empty, repository-relative POSIX path with no ".." segments (got ${JSON.stringify(file)}).`,
      )
    }

    const lineValid = typeof line === "number" && Number.isInteger(line) && line >= 1
    if (!lineValid) {
      errors.push(`${at}.line must be a positive integer (got ${JSON.stringify(line)}).`)
    }

    const ruleValid =
      Array.isArray(rule) &&
      rule.length > 0 &&
      rule.every((entry) => typeof entry === "string" && entry.length > 0)
    if (!ruleValid) {
      errors.push(`${at}.rule must be a non-empty array of non-empty strings.`)
    }

    const categoryValid =
      typeof category === "string" &&
      (SUPPRESSION_CATEGORIES as readonly string[]).includes(category)
    if (!categoryValid) {
      errors.push(
        `${at}.category must be one of ${SUPPRESSION_CATEGORIES.map((c) => JSON.stringify(c)).join(", ")} (got ${JSON.stringify(category)}).`,
      )
    }

    const verificationMethodValid =
      typeof verificationMethod === "string" &&
      (VERIFICATION_METHODS as readonly string[]).includes(verificationMethod)
    if (!verificationMethodValid) {
      errors.push(
        `${at}.verificationMethod must be one of ${VERIFICATION_METHODS.map((m) => JSON.stringify(m)).join(", ")} (got ${JSON.stringify(verificationMethod)}).`,
      )
    }

    if (
      !domainValid ||
      !fileValid ||
      !lineValid ||
      !ruleValid ||
      !categoryValid ||
      !verificationMethodValid
    ) {
      return undefined
    }

    const derived = deriveSuppressionId({ domain, rule: rule as string[], file, line })
    if (derived !== core.id) {
      errors.push(
        `${at}.id ${JSON.stringify(core.id)} does not match the id derived from its own domain/rule/file/line (${JSON.stringify(derived)}) -- this record's addressing key is inconsistent with its own identity fields.`,
      )
      return undefined
    }

    return {
      id: core.id,
      version: 1,
      justification: core.justification,
      category: category as SuppressionCategory,
      domain,
      file,
      line,
      rule: [...(rule as string[])],
      verificationMethod: verificationMethod as VerificationMethod,
    }
  },
}
