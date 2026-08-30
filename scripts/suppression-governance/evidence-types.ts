/**
 * Shapes shared across the suppression-governance execution layer
 * (scripts/suppression-governance/*.ts, which discovers suppression comments and synchronizes
 * disable-comments.json) and its policy layer (checks/suppression-governance.ts, which evaluates
 * the synchronized registry against suppressionPolicy). See
 * specs/decisions/0006-suppression-governance.md for the full rationale.
 */

/**
 * Every allowed `category` value on a `DisableCommentRecord` -- the single source of truth
 * `SuppressionCategory` (below) is derived from, rather than a separate union this array is merely
 * checked against, so a member added here without updating the type (or vice versa) is
 * structurally impossible, not just something a test happens to catch. See `SuppressionCategory`'s
 * own doc comment for what each member means -- that's also what a generated JSON Schema surfaces
 * as this field's `description` (ts-json-schema-generator reads a type alias's own JSDoc, not this
 * array's), so the full semantics live there, not here.
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
 * What kind of suppression a `DisableCommentRecord` is. `""` is a deliberate member, not an
 * omission -- it is the "not yet classified" sentinel every other hand-authored field
 * (`justification`/`alternatives`/`remediation`) already uses: a freshly auto-created record
 * starts with `category: ""`, same as those three. This field is hand-authored the same way -- a
 * human/AI classifies it after the fact; nothing ever infers it from the comment's own text (see
 * `reason`'s doc comment below for why that would defeat this whole registry's purpose -- ADR
 * 0006's rejection of a mechanically-satisfiable model applies identically here).
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
 *   not exercised at all by the mutation run substantiating this record (defined against that
 *   run, not against "CI" specifically, so the category's meaning doesn't depend on today's CI
 *   topology -- e.g. a Windows-only branch, when the mutation run happened on Linux).
 *   `tooling-limit` means the behavior is exercised, but the mutation tool's own mechanics
 *   (per-process instrumentation overhead vs. a timeout budget, a signal handler only observable
 *   in a separate process, no API exposing a value back to any test) can't meaningfully observe
 *   the mutation's effect. The distinction matters for remediation: a `platform-limitation` could
 *   in principle be closed by running mutation testing on the missing platform; a `tooling-limit`
 *   is an inherent limit of comment-based mutation testing that no CI change fixes.
 * - `"rule-not-applicable"` vs. `"intentional-deviation"`: would complying with the suppressed
 *   rule change runtime behavior the author considers worse? If yes, it's `intentional-deviation`
 *   (the rule's concern is real and understood, but the discouraged thing is deliberate because the
 *   alternative is documented-worse). If complying would be a pure no-op refactor because the
 *   rule's underlying premise is simply false for this code, it's `rule-not-applicable`.
 *
 * No validation ties a `category` to a `domain` (e.g. `equivalent-mutant` is not restricted to
 * `domain: "stryker"`) -- deliberately out of scope; a domain/category compatibility matrix would
 * be a new class of rule with its own gaming surface and no current need.
 */
export type SuppressionCategory = (typeof SUPPRESSION_CATEGORIES)[number]

/**
 * Every allowed `verificationMethod` value on a `DisableCommentRecord` -- the single source of
 * truth `VerificationMethod` (below) is derived from, for the identical structural-drift-safety
 * reason `SUPPRESSION_CATEGORIES` is above. See `VerificationMethod`'s own doc comment for what
 * each member means and why -- that's what a generated JSON Schema surfaces as this field's
 * `description`, not this array's own comment.
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
 * makes," not "the only verification that was ever performed on this code." Several real records
 * legitimately have more than one kind of evidence (e.g. a static-invariant argument plus a
 * scoped Stryker run) -- record the strongest one actually obtained, using this precedence:
 * `"mutation-run" > "existing-test-suite" > "differential-testing" > "static-reasoning" >
 * "untestable"`.
 *
 * Anti-gaming rule, applying to every member equally: a verification method must describe
 * evidence that actually substantiates *this specific record's* claim -- never merely evidence
 * that exists somewhere in the same file, test suite, or CI run. A record must not be
 * `"mutation-run"` just because a Stryker run happened nearby in the same file for a *different*
 * mutant; equally, it must not be `"existing-test-suite"` just because some passing test exists
 * for the same module without that test actually covering the suppressed behavior. The same
 * applies to `"differential-testing"`.
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
 *   unsafe/impossible (e.g. would crash the test process from inside an event-listener exception;
 *   no API exposes the value to any test). **Not** an escape hatch: it must never mean
 *   "verification would have been inconvenient," "verification wasn't attempted," or "the author
 *   was unsure" -- those are not valid uses of this member.
 */
export type VerificationMethod = (typeof VERIFICATION_METHODS)[number]

/**
 * One row of disable-comments.json. Identity is `(file, line, domain, rule, content)` -- there is
 * no separate id field; see synchronize.ts for how that identity is used to preserve
 * `justification`/`alternatives`/`remediation`/`category`/`verificationMethod` across reruns,
 * including across an unambiguous line move. `category`/`verificationMethod` are deliberately
 * excluded from identity: they are classification metadata about a discovered suppression, not
 * part of what makes the suppression itself unique, and folding them into identity would make
 * editing a record's classification unmatchable against its own source comment on the next run --
 * silently wiping its `justification`/`alternatives`/`remediation` as a spurious removed+new pair.
 *
 * `rule` is a "policy-addressable suppression identifier," not always a literal static-analysis
 * rule id: for `domain: "eslint"` it genuinely is a rule id
 * (`security/detect-object-injection`); for `domain: "typescript"`, `@ts-ignore`/
 * `@ts-expect-error` are directives rather than parameterized rules, but are still modeled as
 * `rule: ["@ts-ignore"]`/`["@ts-expect-error"]` so the same exact/pattern/domain/global policy
 * mechanism (scripts/suppression-governance/resolve-policy.ts's `resolveRequirement`) applies uniformly across
 * every domain.
 *
 * `justification`/`alternatives`/`remediation` are three fixed, named prose fields -- deliberately
 * not a count of arbitrary free-form entries (the earlier design this replaced): a numeric "N
 * details required" threshold is trivially gameable by generating N generic-sounding filler
 * entries without ever doing the underlying work. Naming exactly what must be explained
 * (`justification`: why this is the best option; `alternatives`: what other approach was
 * considered; `remediation`: what was actually attempted, and why it didn't remove the need for
 * the suppression) doesn't make low-effort filler impossible, but it does make each field
 * individually reviewable against a specific question, rather than an undifferentiated count. The
 * check never invents these -- a fresh record always starts with all three as empty strings; a
 * developer/AI fills them in by hand after a record is auto-created (see
 * scripts/suppression-governance/policy-config.ts's doc comment for exactly how).
 *
 * `category`/`verificationMethod` are two more hand-authored fields, filled in the same way and at
 * the same time as the three above -- but unlike those three, they are *closed enumerations*
 * rather than free prose, so a reviewer or report can triage a suppression's kind and evidentiary
 * basis without reading three paragraphs. See `SUPPRESSION_CATEGORIES`/`VERIFICATION_METHODS`
 * above for their full semantics.
 *
 * `reason` is a sixth, differently-sourced field: unlike the five above, it is never
 * hand-authored. Every recognizer (recognizers.ts) derives it mechanically from the directive
 * comment's own content -- whatever text remains once the disable-domain keywords and the rule
 * list are stripped out -- so it is always freshly recomputed from current source on every run,
 * even for an otherwise-unchanged "existing" record (see synchronize.ts). A domain's policy opts
 * into requiring it via `SuppressionRequirement`'s `"reason"` (policy-config.ts); today only
 * `stryker` does.
 */
export interface DisableCommentRecord {
  readonly file: string
  readonly line: number
  readonly domain: string
  readonly rule: readonly string[]
  readonly content: string
  readonly justification: string
  readonly alternatives: string
  readonly remediation: string
  readonly category: SuppressionCategory
  readonly verificationMethod: VerificationMethod
  readonly reason: string
}

/** The on-disk shape of disable-comments.json itself -- a plain array of records, in `sortRecords`'s deterministic order. */
export type DisableCommentRegistry = readonly DisableCommentRecord[]

/** How this run's synchronization classified one record: freshly discovered, unchanged from the prior registry, or an unambiguous line move. */
export type SuppressionRecordStatus = "new" | "existing" | "moved"

/** A `DisableCommentRecord` augmented with how this run's synchronization classified it -- evidence-only, never written to disable-comments.json itself. */
export interface SuppressionGovernanceRecordEvidence extends DisableCommentRecord {
  readonly status: SuppressionRecordStatus
}

/**
 * Printed as JSON to stdout by scripts/suppression-governance/check.ts for repo-contract's
 * `output: { format: "json" }` to parse, and read (never re-derived) by
 * checks/suppression-governance.ts's policy.
 *
 * `ok: false` means the script itself could not complete its work -- a source file couldn't be
 * read, or a pre-existing disable-comments.json failed validation (in which case it is left on
 * disk untouched; see check.ts) -- a tool-infrastructure failure, distinct from "synchronization
 * succeeded and found suppressions the policy will go on to reject." A forbidden or
 * under-justified suppression is never itself an `ok: false` condition; only the policy layer
 * judges that.
 *
 * `newCount`/`movedCount`/`removedCount` are informational execution evidence describing what this
 * run's synchronization did -- not an independently-auditable registry assertion. The policy
 * trusts them the same way every other check's policy already trusts its own script's counts
 * (knip's issue counts, jscpd's clone counts): nothing re-derives them from source.
 */
export type SuppressionGovernanceEvidence =
  | {
      readonly ok: true
      readonly records: readonly SuppressionGovernanceRecordEvidence[]
      readonly newCount: number
      readonly movedCount: number
      readonly removedCount: number
      readonly registryPath: string
    }
  | {
      readonly ok: false
      readonly error: string
      readonly registryValidationErrors?: readonly string[]
    }
