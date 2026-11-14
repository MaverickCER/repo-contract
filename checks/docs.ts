import { mkdir } from "node:fs/promises"
import path from "node:path"
import {
  evaluateExceptionRecord,
  loadExceptionRegistry,
  reconcileExceptions,
  writeExceptionRegistry,
} from "../src/helpers/index.js"
import type {
  ExceptionClassification,
  ExceptionPolicy,
  ExceptionPolicyConfig,
  ExceptionRecordCore,
  StandardSchemaV1,
} from "../src/helpers/index.js"
import {
  asFlatExceptionRecords,
  validateExceptionRegistry,
} from "../scripts/shared/exception-record.js"
import type { ExceptionRegistrySchema } from "../scripts/shared/exception-record.js"
import { requireParsedOutput } from "./shared/require-parsed-output.js"
import type { CheckDefinitionConfig, PolicyResult } from "../src/types.js"

/**
 * markdownlint-cli2 has no stdout JSON mode. This describes its own JSON
 * output-formatter contract (markdownlint-cli2-formatter-json), read back
 * from reports/markdownlint.json by scripts/check-docs.mjs. Not published as
 * a TypeScript type by either package.
 */
export interface MarkdownlintFinding {
  readonly fileName: string
  readonly lineNumber: number
  readonly ruleNames: readonly string[]
  readonly ruleDescription: string
  readonly errorDetail: string | null
  readonly severity: "error" | "warning"
}

/** linkinator's own `--format json` contract: not published as a TypeScript type by the tool. */
export interface LinkinatorLink {
  readonly url: string
  readonly status: number
  readonly state: "OK" | "BROKEN" | "SKIPPED"
  readonly parent?: string
}

export interface LinkinatorReport {
  readonly links: readonly LinkinatorLink[]
}

/** One tool's outcome from scripts/check-docs.mjs: either it ran and produced parseable JSON, or a tool-infrastructure failure occurred. */
export type ToolResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string }

export interface CombinedDocsEvidence {
  readonly markdownlint: ToolResult<readonly MarkdownlintFinding[]>
  readonly linkinator: ToolResult<LinkinatorReport>
}

/** Where a known-good link's waiver registry lives: see `DOCS_LINK_EXCEPTION_SCHEMA`'s own comment for what "known-good" covers. */
const DOCS_LINK_REGISTRY_RELATIVE_PATH = ".repo-contract/exceptions/docs-links.json"

/** One `.repo-contract/exceptions/docs-links.json` record: the shared core plus this registry's own identity field. */
export interface DocsLinkExceptionRecord {
  readonly id: string
  readonly version: 1
  readonly justification: string
  /** The exact URL this record waives (local or external): must match `LinkinatorLink.url` verbatim. */
  readonly url: string
}

/**
 * `docs-links:<url>`: stable while the same url is linked from this repo's docs. A changed url
 * is a different finding with a different id. A stale waiver is therefore never silently reused
 * for an unrelated link.
 * @param finding - The finding's (or record's) identity field.
 * @param finding.url - The linked url (local or external).
 * @returns The semantic id.
 */
export function deriveDocsLinkExceptionId(finding: { readonly url: string }): string {
  return `docs-links:${finding.url}`
}

/**
 * A fresh, blank exception record for a link with no matching record yet.
 * @param finding - The unmatched finding.
 * @param finding.url - The linked url (local or external).
 * @param id - The canonical id `reconcileExceptions` computed (equals `deriveDocsLinkExceptionId(finding)`).
 * @returns The blank stub record.
 */
export function createDocsLinkStub(
  finding: { readonly url: string },
  id: string,
): DocsLinkExceptionRecord {
  return { id, version: 1, justification: "", url: finding.url }
}

/**
 * Reads one required field's current string value straight off a reconciled record.
 *
 * `DOCS_LINKS_POLICY`'s only requirement is `"justification"`, always a string on a validated
 * record. The `: ""` fallback is therefore never reached through this check's own call path.
 * It is exported for direct unit coverage of that fallback. This matches the identical
 * `fieldValue` convention in `internal-package-contract`'s `checks/mutation.ts`.
 * @param record - The record to read a field from.
 * @param requirement - The field name to resolve.
 * @returns That field's current string value (`""` if absent or non-string).
 */
export function docsLinkFieldValue(record: DocsLinkExceptionRecord, requirement: string): string {
  const value = (record as unknown as Record<string, unknown>)[requirement]
  return typeof value === "string" ? value : ""
}

/**
 * A broken link (local, such as a relative path or an anchor, or external `http(s)://`) blocks
 * by default, like any other check finding, unless a matching, justified record exists here.
 * There is no separate "local links can never be waived" carve-out. This registry governs a
 * known-good-but-flaky external link with a real, reviewed justification checked into version
 * control. The same governance applies to a local link that is structurally correct but that this
 * check's own crawl cannot verify. One example is a link to a file that another check in the same
 * `npm run contract` run generates as a side effect of its own POLICY evaluation. Policies run
 * only after every check's EXECUTION (including this one's crawl) has completed. No scheduling
 * order can therefore make this check observe that file. A reviewer reads the record's own
 * justification. A bogus one is as visible on a diff as a bogus external-link justification.
 */
export const DOCS_LINK_EXCEPTION_SCHEMA: ExceptionRegistrySchema<DocsLinkExceptionRecord> = {
  namespace: "docs-links:",
  metadataKeys: ["url"],
  validateRecord(core: ExceptionRecordCore, raw, index, errors) {
    const at = `exceptions[${String(index)}]`
    const { url } = raw

    const urlValid = typeof url === "string" && url.length > 0
    if (!urlValid) {
      errors.push(`${at}.url must be a non-empty string (got ${JSON.stringify(url)}).`)
      return undefined
    }

    const derived = deriveDocsLinkExceptionId({ url })
    if (derived !== core.id) {
      errors.push(
        `${at}.id ${JSON.stringify(core.id)} does not match the id derived from its own url (${JSON.stringify(derived)}).`,
      )
      return undefined
    }

    return { id: core.id, version: 1, justification: core.justification, url }
  },
}

/** A docs-link waiver only ever needs a justification: there is no severity tier the way security findings have one. */
const DOCS_LINKS_POLICY: ExceptionPolicyConfig = {
  "docs-links": { default: { mode: "exception", requirements: ["justification"] } },
}
const DOCS_LINKS_GLOBAL_DEFAULT: ExceptionPolicy = {
  mode: "exception",
  requirements: ["justification"],
}
const DOCS_LINKS_CLASSIFICATION: readonly [ExceptionClassification, ...ExceptionClassification[]] =
  [{ group: "docs-links", category: "link" }]

/**
 * Every currently reconciled `.repo-contract/exceptions/docs-links.json` record, plus the ones
 * that no longer match any currently-linked URL. Assembled by `docs()`'s own `policy`, the one
 * place this check touches the filesystem.
 */
export interface DocsLinkExceptionEvidence {
  readonly activeExceptions: Readonly<Record<string, DocsLinkExceptionRecord>>
  readonly staleExceptions: readonly DocsLinkExceptionRecord[]
  readonly scaffoldedIds: readonly string[]
}

/**
 * Whether one BROKEN link (local or external) is waived by its matched, reconciled record.
 * @param record - The reconciled record matching this link's url, or `undefined` if none exists.
 * @returns The verdict and any still-missing required fields.
 */
function evaluateLinkWaiver(record: DocsLinkExceptionRecord | undefined): {
  readonly verdict: "permitted" | "insufficient" | "unmatched"
  readonly missing: readonly string[]
} {
  // No caller reads `missing` when `verdict === "unmatched"`. Only the `"insufficient"` branch
  // reads it (see evaluateDocsPolicy's message building), so its contents on this early return
  // are unobservable. Hand-verified: replacing it with a non-empty placeholder array leaves every test in
  // policy.test.ts passing unchanged.
  if (record === undefined) return { verdict: "unmatched", missing: [] }
  const determinant = evaluateExceptionRecord({
    record,
    classifications: DOCS_LINKS_CLASSIFICATION,
    config: DOCS_LINKS_POLICY,
    globalDefault: DOCS_LINKS_GLOBAL_DEFAULT,
    fieldValue: docsLinkFieldValue,
  })
  // DOCS_LINKS_POLICY/DOCS_LINKS_GLOBAL_DEFAULT above are always `{ mode: "exception", ... }`.
  // evaluateExceptionRecord can structurally never return a "forbidden" verdict from this call
  // site. That verdict exists for a policy with a "forbidden" tier, e.g. security-socket.ts's
  // above-medium-severity exclusion, which this file's own policy never configures. This is
  // defensive dead code for a case this file's own config makes unreachable, not a real coverage
  // gap. The same reasoning applies to internal-package-contract's checks/mutation.ts's identical
  // guard.
  if (determinant.verdict === "forbidden") return { verdict: "unmatched", missing: [] }
  return { verdict: determinant.verdict, missing: determinant.missing }
}

/**
 * @param finding One markdownlint-cli2 finding.
 * @returns A single-line `file:line [rule]: description (detail)` summary.
 */
function formatMarkdownlintFinding(finding: MarkdownlintFinding): string {
  const rule = finding.ruleNames.join("/")
  const detail = finding.errorDetail ? ` (${finding.errorDetail})` : ""

  return `${finding.fileName}:${String(finding.lineNumber)} [${rule}]: ${finding.ruleDescription}${detail}`
}

/**
 * @param link One linkinator link result with `state === "BROKEN"`.
 * @returns A single-line `url returned HTTP status (linked from parent)` summary.
 */
function formatBrokenLink(link: LinkinatorLink): string {
  const parent = link.parent ? ` (linked from ${link.parent})` : ""

  return `${link.url} returned HTTP ${String(link.status)}${parent}`
}

// Documentation structure/style (markdownlint-cli2) and link integrity
// (linkinator) combined into one check, matching how `lint` combines
// ESLint + oxlint. The two tools ask related but distinct questions about
// the same surface. They are reported as one evidence object with two
// independently inspectable sections.
/**
 * The docs check's full interpretation logic, factored out for direct unit testing.
 * test/unit/docs/policy.test.ts exercises markdownlint's/linkinator's finding filtering against
 * already-parsed evidence, without spawning scripts/check-docs.mjs. This matches every other
 * check's own `evaluate<Name>Policy` convention (see e.g. checks/adr-governance.ts).
 *
 * A broken link, local or external, blocks unless a justified waiver in
 * `.repo-contract/exceptions/docs-links.json` matches it (`DOCS_LINK_EXCEPTION_SCHEMA`'s doc
 * comment says what belongs there). It is never downgraded to a blanket warning.
 * @param root0 - the policy input.
 * @param root0.evidence - scripts/check-docs.mjs's own combined markdownlint/linkinator evidence.
 * @param root0.linkExceptions - The reconciled `docs-links.json` waiver registry for this run.
 * @returns the pass/fail verdict.
 */
export function evaluateDocsPolicy({
  evidence,
  linkExceptions,
}: {
  readonly evidence: CombinedDocsEvidence
  readonly linkExceptions: DocsLinkExceptionEvidence
}): PolicyResult {
  const { markdownlint, linkinator } = evidence

  if (!markdownlint.ok) {
    return {
      outcome: "fail",
      rationale: `markdownlint-cli2 could not be evaluated: ${markdownlint.error}`,
    }
  }

  if (!linkinator.ok) {
    return {
      outcome: "fail",
      rationale: `linkinator could not be evaluated: ${linkinator.error}`,
    }
  }

  // Each markdownlint finding carries its own severity, as ESLint's and
  // pa11y's do. A `"warning"`-severity finding is surfaced but must not
  // block, matching how `lint` and `accessibility` treat their tools'
  // warnings. A broken link (local or external) is blocking only when
  // unwaived: see DOCS_LINK_EXCEPTION_SCHEMA's own doc comment.
  const lintErrors = markdownlint.value.filter((finding) => finding.severity !== "warning")
  const lintWarnings = markdownlint.value.filter((finding) => finding.severity === "warning")
  const brokenLinks = linkinator.value.links.filter((link) => link.state === "BROKEN")

  const determinants = brokenLinks.map((link) => ({
    link,
    ...evaluateLinkWaiver(linkExceptions.activeExceptions[deriveDocsLinkExceptionId(link)]),
  }))
  const offenders = determinants.filter((d) => d.verdict !== "permitted")
  // Only ever read below inside the `offenders.length === 0` branch of the guard just below: at
  // that point `offenders.length` is always 0, so `- offenders.length` and `+ offenders.length`
  // are byte-identical to `brokenLinks.length` either way. Hand-verified: swapping the operator
  // leaves every test in policy.test.ts passing unchanged.
  const waivedCount = brokenLinks.length - offenders.length

  const staleLines = linkExceptions.staleExceptions.map(
    (record) =>
      `- Stale exception in ${DOCS_LINK_REGISTRY_RELATIVE_PATH}: ${JSON.stringify(record.id)}. ${record.url} is no longer linked from any scanned page; delete this entry.`,
  )

  if (
    lintErrors.length === 0 &&
    lintWarnings.length === 0 &&
    offenders.length === 0 &&
    staleLines.length === 0
  ) {
    const suffix =
      waivedCount > 0
        ? ` (${String(waivedCount)} known-good link(s) waived, see ${DOCS_LINK_REGISTRY_RELATIVE_PATH})`
        : ""
    return {
      outcome: "pass",
      rationale: `markdownlint-cli2 reported 0 issues; linkinator found 0 broken link(s)${suffix} across ${String(linkinator.value.links.length)} checked.`,
    }
  }

  const blockingSections: string[] = []

  if (lintErrors.length > 0) {
    blockingSections.push(
      `markdownlint-cli2 reported ${String(lintErrors.length)} error(s):`,
      ...lintErrors.map((finding) => `- ${formatMarkdownlintFinding(finding)}`),
    )
  }

  const linkDetails = offenders.map((d) => {
    const detail =
      d.verdict === "unmatched"
        ? `no exception record; add one to ${DOCS_LINK_REGISTRY_RELATIVE_PATH} if this link is known-good`
        : // `DOCS_LINKS_POLICY`'s only requirement is `"justification"`: `d.missing` can
          // therefore never hold more than one entry, making the `", "` separator unobservable
          // (`.join` never has a second element to separate). Hand-verified: forcing this to
          // `.join("")` leaves every test in policy.test.ts passing unchanged.
          `exception incomplete (missing: ${d.missing.join(", ")})`
    return `${formatBrokenLink(d.link)}: ${detail}`
  })

  if (linkDetails.length > 0) {
    blockingSections.push(
      `linkinator found ${String(linkDetails.length)} broken link(s):`,
      ...linkDetails.map((detail) => `- ${detail}`),
    )
  }

  if (staleLines.length > 0) {
    blockingSections.push(
      `${String(staleLines.length)} stale docs-link exception(s):`,
      ...staleLines,
    )
  }

  const warningSection =
    lintWarnings.length > 0
      ? [
          `markdownlint-cli2 reported ${String(lintWarnings.length)} warning(s):`,
          ...lintWarnings.map((finding) => `- ${formatMarkdownlintFinding(finding)}`),
        ]
      : []

  if (blockingSections.length > 0) {
    return { outcome: "fail", rationale: [...blockingSections, ...warningSection].join("\n") }
  }

  return { outcome: "warn", rationale: warningSection.join("\n") }
}

const docsLinkRegistrySchema: StandardSchemaV1<unknown, readonly DocsLinkExceptionRecord[]> = {
  "~standard": {
    version: 1,
    vendor: "repo-contract",
    validate: (value: unknown) => {
      const validated = validateExceptionRegistry(value, DOCS_LINK_EXCEPTION_SCHEMA)
      return validated.ok
        ? { value: validated.records }
        : { issues: validated.errors.map((message) => ({ message })) }
    },
  },
}

export const docs: CheckDefinitionConfig = {
  run: ["node", "scripts/check-docs.mjs"],
  output: { format: "json" },
  policy: async ({ result }): Promise<PolicyResult> => {
    const parsed = requireParsedOutput<CombinedDocsEvidence>(
      result.output,
      "Docs check output could not be parsed as JSON.",
    )
    if (!parsed.ok) return parsed.result

    const rawLinks = parsed.value.linkinator.ok ? parsed.value.linkinator.value.links : []

    // Every link (local or external) linkinator crawled this run, in any state, not only BROKEN.
    // Feeding the full set (not only offenders) into reconcileExceptions makes a waiver's own
    // liveness track "is this URL still linked at all," never "was it broken on this exact run".
    // A known-good link's waiver therefore never flaps stale/active from one run to the next.
    // Deduplicated by url: the same url can appear once per referencing page, and
    // reconcileExceptions requires an injective id per finding.
    const allLinks = [...new Map(rawLinks.map((link) => [link.url, link])).values()]

    const registryPath = path.join(process.cwd(), DOCS_LINK_REGISTRY_RELATIVE_PATH)
    const loaded = await loadExceptionRegistry({
      path: registryPath,
      schema: docsLinkRegistrySchema,
    })
    if (!loaded.ok) {
      return {
        outcome: "fail",
        rationale: [
          `${DOCS_LINK_REGISTRY_RELATIVE_PATH} failed to load and was left unchanged:`,
          ...loaded.errors.map((e) => `- ${e}`),
        ].join("\n"),
      }
    }

    const reconciled = reconcileExceptions<LinkinatorLink, DocsLinkExceptionRecord>({
      existing: loaded.records,
      findings: allLinks,
      deriveId: deriveDocsLinkExceptionId,
      createStub: createDocsLinkStub,
    })
    if (!reconciled.ok) {
      return {
        outcome: "fail",
        rationale: `${DOCS_LINK_REGISTRY_RELATIVE_PATH} could not be reconciled: ${reconciled.error}`,
      }
    }
    const { activeRecords, staleRecords, newStubIds } = reconciled.reconciliation

    // The reconcileExceptions helper has no notion of "broken". It is fed every link above, not
    // only broken ones (see allLinks' own comment for why). The side effect:
    // it would also scaffold and persist a brand-new blank stub for every currently-*fine* link
    // (in practice, every local link this repo's docs contain). Those links never needed a
    // waiver. Only a newly-scaffolded stub for a link that is BROKEN right now is worth writing;
    // drop the rest before persisting. A pre-existing matched record is always kept, whatever its
    // link's current state, for the same staleness reasoning above.
    //
    // Built from `rawLinks`, not the deduplicated `allLinks`. The same URL can be BROKEN from
    // one referencing page and OK from another, and `allLinks`' own dedup keeps only whichever
    // occurrence came first. Checking the raw list means a URL that is broken via *any*
    // reference is never missed here, even when its deduplicated representative is the OK one.
    const brokenUrls = new Set(
      rawLinks.filter((link) => link.state === "BROKEN").map((link) => link.url),
    )
    const newStubIdSet = new Set(newStubIds)
    const recordsToPersist = activeRecords.filter(
      (record) => !newStubIdSet.has(record.id) || brokenUrls.has(record.url),
    )

    try {
      await mkdir(path.dirname(registryPath), { recursive: true })
      const write = await writeExceptionRegistry({
        path: registryPath,
        records: asFlatExceptionRecords([...recordsToPersist, ...staleRecords]),
      })
      if (!write.ok) {
        return {
          outcome: "fail",
          rationale: `Writing ${DOCS_LINK_REGISTRY_RELATIVE_PATH} failed: ${write.error}`,
        }
      }
    } catch (error) {
      return {
        outcome: "fail",
        rationale: `Could not write ${DOCS_LINK_REGISTRY_RELATIVE_PATH}: ${(error as Error).message}`,
      }
    }

    const activeExceptions: Record<string, DocsLinkExceptionRecord> = {}
    for (const record of activeRecords) activeExceptions[record.id] = record

    return evaluateDocsPolicy({
      evidence: parsed.value,
      linkExceptions: {
        activeExceptions,
        staleExceptions: staleRecords,
        scaffoldedIds: newStubIds.filter((id) => recordsToPersist.some((r) => r.id === id)),
      },
    })
  },
}
