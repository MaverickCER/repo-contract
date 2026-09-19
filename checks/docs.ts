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
 * markdownlint-cli2 has no stdout JSON mode -- this describes its own JSON
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

/** linkinator's own `--format json` contract -- not published as a TypeScript type by the tool. */
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

/** Where a known-good-but-flaky external link's waiver registry lives. */
const DOCS_LINK_REGISTRY_RELATIVE_PATH = ".repo-contract/exceptions/docs-links.json"

/**
 * Whether `url` is external (`http(s)://`), the only kind of broken link this check's exception
 * registry may ever waive -- a broken *local* link (a relative path, an anchor) always indicates a
 * genuine authoring mistake within this repository's own control, never transient network flake,
 * so it can never be waived through this mechanism. Parses with the real `URL` constructor (not a
 * regex) so a malformed or merely regex-matching value -- e.g. a scheme with no real authority --
 * can never qualify for a `DOCS_LINK_EXCEPTION_SCHEMA` waiver.
 *
 * Exported for direct unit coverage -- its own edge cases (a non-http(s) scheme, a malformed
 * value) are otherwise only reachable indirectly through a full evaluateDocsPolicy fixture.
 * @param url - The linkinator-reported URL to classify.
 * @returns `true` if `url` parses as an absolute `http:`/`https:` URL with a non-empty hostname.
 * @internal
 */
export function isExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    const isHttpOrHttps = parsed.protocol === "http:" || parsed.protocol === "https:"
    // The WHATWG URL spec treats http/https as "special schemes," which the standard parser
    // itself refuses to produce with an empty host: `new URL("https://")` (or any other
    // authority-less form) throws rather than yielding `hostname: ""`, confirmed directly against
    // every construction this comment's own author could find. This is kept as an explicit
    // belt-and-suspenders check against that spec guarantee, not one this engine's own parser can
    // be observed violating.
    // Stryker disable next-line ConditionalExpression, StringLiteral -- unreachable given the WHATWG URL spec's own guarantee that a successfully-parsed http(s) URL never has an empty hostname.
    const hasHostname = parsed.hostname !== ""
    return isHttpOrHttps && hasHostname
  } catch {
    // Every local link linkinator reports (a relative path, an absolute root-relative path, a
    // bare anchor) throws here -- `URL` requires either an absolute URL or a base to resolve
    // against, neither of which a local link provides. Genuinely malformed input parses the same
    // way: never external.
    return false
  }
}

/** One `.repo-contract/exceptions/docs-links.json` record: the shared core plus this registry's own identity field. */
export interface DocsLinkExceptionRecord {
  readonly id: string
  readonly version: 1
  readonly justification: string
  /** The exact external URL this record waives -- must match `LinkinatorLink.url` verbatim. */
  readonly url: string
}

/**
 * `docs-links:<url>` -- stable while the same external URL is linked from this repo's docs; a
 * changed URL is a different finding with a different id, so a stale waiver is never silently
 * reused for an unrelated link.
 * @param finding - The finding's (or record's) identity field.
 * @param finding.url - The external URL.
 * @returns The semantic id.
 */
export function deriveDocsLinkExceptionId(finding: { readonly url: string }): string {
  return `docs-links:${finding.url}`
}

/**
 * A fresh, blank exception record for an external link with no matching record yet.
 * @param finding - The unmatched finding.
 * @param finding.url - The external URL.
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
 * record, so the `: ""` fallback is never actually reached through this check's own real call
 * path -- exported for direct unit coverage of that fallback, matching
 * `internal-package-contract`'s `checks/mutation.ts`'s identical `fieldValue` convention.
 * @param record - The record to read a field from.
 * @param requirement - The field name to resolve.
 * @returns That field's current string value (`""` if absent or non-string).
 */
export function docsLinkFieldValue(record: DocsLinkExceptionRecord, requirement: string): string {
  const value = (record as unknown as Record<string, unknown>)[requirement]
  return typeof value === "string" ? value : ""
}

export const DOCS_LINK_EXCEPTION_SCHEMA: ExceptionRegistrySchema<DocsLinkExceptionRecord> = {
  namespace: "docs-links:",
  metadataKeys: ["url"],
  validateRecord(core: ExceptionRecordCore, raw, index, errors) {
    const at = `exceptions[${String(index)}]`
    const { url } = raw

    const urlValid = typeof url === "string" && isExternalUrl(url)
    if (!urlValid) {
      errors.push(
        `${at}.url must be a non-empty http(s):// URL (got ${JSON.stringify(url)}) -- only an external link may be waived here; a local link is always blocking.`,
      )
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

/** A docs-link waiver only ever needs a justification -- there is no severity tier the way security findings have one. */
const DOCS_LINKS_POLICY: ExceptionPolicyConfig = {
  "docs-links": { default: { mode: "exception", requirements: ["justification"] } },
}
const DOCS_LINKS_GLOBAL_DEFAULT: ExceptionPolicy = {
  mode: "exception",
  requirements: ["justification"],
}
const DOCS_LINKS_CLASSIFICATION: readonly [ExceptionClassification, ...ExceptionClassification[]] =
  [{ group: "docs-links", category: "external" }]

/**
 * Every currently reconciled `.repo-contract/exceptions/docs-links.json` record, plus the ones
 * that no longer match any currently-linked external URL. Assembled by `docs()`'s own `policy`,
 * the one place this check touches the filesystem.
 */
export interface DocsLinkExceptionEvidence {
  readonly activeExceptions: Readonly<Record<string, DocsLinkExceptionRecord>>
  readonly staleExceptions: readonly DocsLinkExceptionRecord[]
  readonly scaffoldedIds: readonly string[]
}

/**
 * Whether one BROKEN external link is waived by its matched, reconciled record.
 * @param record - The reconciled record matching this link's url, or `undefined` if none exists.
 * @returns The verdict and any still-missing required fields.
 */
function evaluateExternalLink(record: DocsLinkExceptionRecord | undefined): {
  readonly verdict: "permitted" | "insufficient" | "unmatched"
  readonly missing: readonly string[]
} {
  // `missing` is never read by any caller when `verdict === "unmatched"` -- only the
  // `"insufficient"` branch below ever reads it (see evaluateDocsPolicy's own message-building) --
  // so its exact array identity/contents on this early return are unobservable through any real
  // call path. Hand-verified: replacing it with a non-empty placeholder array leaves every test in
  // policy.test.ts passing unchanged.
  // Stryker disable next-line ArrayDeclaration -- missing is never read when verdict is "unmatched", only by the sibling "insufficient" branch below.
  if (record === undefined) return { verdict: "unmatched", missing: [] }
  const determinant = evaluateExceptionRecord({
    record,
    classifications: DOCS_LINKS_CLASSIFICATION,
    config: DOCS_LINKS_POLICY,
    globalDefault: DOCS_LINKS_GLOBAL_DEFAULT,
    fieldValue: docsLinkFieldValue,
  })
  // DOCS_LINKS_POLICY/DOCS_LINKS_GLOBAL_DEFAULT above are always `{ mode: "exception", ... }` --
  // evaluateExceptionRecord can structurally never return a "forbidden" verdict from this call
  // site (that verdict exists for a policy with a "forbidden" tier, e.g. security-socket.ts's
  // above-medium-severity exclusion, which this file's own policy never configures). Defensive
  // dead code for a case this file's own config makes unreachable, not a real coverage gap --
  // same reasoning as internal-package-contract's checks/mutation.ts's identical guard.
  // Stryker disable next-line ConditionalExpression, StringLiteral -- DOCS_LINKS_POLICY never configures a "forbidden" tier, so this branch is structurally unreachable dead code.
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
 * @returns A single-line `url -- HTTP status (linked from parent)` summary.
 */
function formatBrokenLink(link: LinkinatorLink): string {
  const parent = link.parent ? ` (linked from ${link.parent})` : ""

  return `${link.url} -- HTTP ${String(link.status)}${parent}`
}

// Documentation structure/style (markdownlint-cli2) and link integrity
// (linkinator) combined into one check, matching how `lint` already combines
// ESLint + oxlint -- two tools asking related but distinct questions about
// the same surface, reported as one evidence object with two independently
// inspectable sections.
/**
 * The docs check's full interpretation logic, factored out so test/unit/docs/policy.test.ts can
 * exercise markdownlint's/linkinator's finding filtering directly against already-parsed evidence,
 * without spawning scripts/check-docs.mjs -- matching every other check's own
 * `evaluate<Name>Policy` convention (see e.g. checks/adr-governance.ts).
 *
 * A broken *local* link is always blocking -- see `isExternalUrl`'s own doc comment. A broken
 * external* link only blocks when it has no matching, justified waiver in
 * `.repo-contract/exceptions/docs-links.json`; external-link rot the repo genuinely doesn't
 * control (a documented, verified-live site that flakes transiently in CI) belongs there, never
 * silently downgraded to a blanket warning the way a less careful check might.
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

  // markdownlint findings carry their own severity, exactly as ESLint's and
  // pa11y's do -- a `"warning"`-severity finding is surfaced but must not
  // block, matching how `lint` and `accessibility` treat their tools'
  // warnings. A broken local link is always blocking; a broken external link
  // is blocking only when unwaived -- see this function's own doc comment.
  const lintErrors = markdownlint.value.filter((finding) => finding.severity !== "warning")
  const lintWarnings = markdownlint.value.filter((finding) => finding.severity === "warning")
  const brokenLinks = linkinator.value.links.filter((link) => link.state === "BROKEN")
  const localBroken = brokenLinks.filter((link) => !isExternalUrl(link.url))
  const externalBroken = brokenLinks.filter((link) => isExternalUrl(link.url))

  const externalDeterminants = externalBroken.map((link) => ({
    link,
    ...evaluateExternalLink(linkExceptions.activeExceptions[deriveDocsLinkExceptionId(link)]),
  }))
  const externalOffenders = externalDeterminants.filter((d) => d.verdict !== "permitted")
  // Only ever read below inside the `externalOffenders.length === 0` branch of the guard just
  // below -- at that point `externalOffenders.length` is always 0, so `- externalOffenders.length`
  // and `+ externalOffenders.length` are byte-identical to `externalBroken.length` either way.
  // Hand-verified: swapping the operator leaves every test in policy.test.ts passing unchanged.
  // Stryker disable next-line ArithmeticOperator -- only read when externalOffenders.length is already 0, making +/- byte-identical.
  const waivedCount = externalBroken.length - externalOffenders.length

  const staleLines = linkExceptions.staleExceptions.map(
    (record) =>
      `- Stale exception in ${DOCS_LINK_REGISTRY_RELATIVE_PATH}: ${JSON.stringify(record.id)} -- ${record.url} is no longer linked from any scanned page; delete this entry.`,
  )

  if (
    lintErrors.length === 0 &&
    lintWarnings.length === 0 &&
    localBroken.length === 0 &&
    externalOffenders.length === 0 &&
    staleLines.length === 0
  ) {
    const suffix =
      waivedCount > 0
        ? ` (${String(waivedCount)} known-flaky external link(s) waived, see ${DOCS_LINK_REGISTRY_RELATIVE_PATH})`
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

  const linkDetails = [
    ...localBroken.map((link) => formatBrokenLink(link)),
    ...externalOffenders.map((d) => {
      const detail =
        d.verdict === "unmatched"
          ? `no exception record -- add one to ${DOCS_LINK_REGISTRY_RELATIVE_PATH} if this link is known-good but flaky`
          : // `DOCS_LINKS_POLICY`'s only requirement is `"justification"` -- `d.missing` can
            // therefore never hold more than one entry, making the `", "` separator unobservable
            // (`.join` never has a second element to separate). Hand-verified: forcing this to
            // `.join("")` leaves every test in policy.test.ts passing unchanged.
            // Stryker disable next-line StringLiteral -- d.missing can never hold more than one entry given DOCS_LINKS_POLICY's single requirement, so the join separator is unobservable.
            `exception incomplete (missing: ${d.missing.join(", ")})`
      return `${formatBrokenLink(d.link)} -- ${detail}`
    }),
  ]

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

    const rawExternalLinks = parsed.value.linkinator.ok
      ? parsed.value.linkinator.value.links.filter((link) => isExternalUrl(link.url))
      : []

    // Every external link linkinator crawled this run (any state, not just BROKEN) -- feeding the
    // full set (not just offenders) into reconcileExceptions is what makes a waiver's own liveness
    // track "is this URL still linked at all," never "was it broken on this exact run," so a
    // genuinely flaky-but-known-good link's waiver never flaps stale/active from one run to the
    // next. Deduplicated by url: the same external URL can appear once per referencing page, and
    // reconcileExceptions requires an injective id per finding.
    const externalLinks = [...new Map(rawExternalLinks.map((link) => [link.url, link])).values()]

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
      findings: externalLinks,
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

    // reconcileExceptions itself has no notion of "broken" -- feeding it every external link (not
    // just broken ones) above is what makes a waiver's own liveness track "is this URL still
    // linked at all" rather than "was it broken on this exact run" (see externalLinks' own
    // comment). That means it would otherwise scaffold, and persist, a brand-new blank stub for
    // every currently-*fine* external link too -- a link that never needed a waiver in the first
    // place. Only a newly-scaffolded stub for a link that is genuinely BROKEN right now is worth
    // writing; drop the rest before persisting. A pre-existing matched record is always kept,
    // regardless of its link's current state, for the same staleness reasoning above.
    //
    // Built from `rawExternalLinks`, not the deduplicated `externalLinks` -- the same URL can be
    // BROKEN from one referencing page and OK from another, and `externalLinks`' own dedup keeps
    // only whichever occurrence happened to come first. Checking the raw list means a URL that is
    // broken via *any* reference is never missed here, even when its deduplicated representative
    // happens to be the OK one.
    const brokenExternalUrls = new Set(
      rawExternalLinks.filter((link) => link.state === "BROKEN").map((link) => link.url),
    )
    const newStubIdSet = new Set(newStubIds)
    const recordsToPersist = activeRecords.filter(
      (record) => !newStubIdSet.has(record.id) || brokenExternalUrls.has(record.url),
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
