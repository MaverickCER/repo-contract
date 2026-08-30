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
 * @param root0 - the policy input.
 * @param root0.evidence - scripts/check-docs.mjs's own combined markdownlint/linkinator evidence.
 * @returns the pass/fail verdict.
 */
export function evaluateDocsPolicy({
  evidence,
}: {
  readonly evidence: CombinedDocsEvidence
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
  // warnings. A broken link is always blocking.
  const lintErrors = markdownlint.value.filter((finding) => finding.severity !== "warning")
  const lintWarnings = markdownlint.value.filter((finding) => finding.severity === "warning")
  const brokenLinks = linkinator.value.links.filter((link) => link.state === "BROKEN")
  const linkDetails = brokenLinks.map(formatBrokenLink)

  if (lintErrors.length === 0 && lintWarnings.length === 0 && linkDetails.length === 0) {
    return {
      outcome: "pass",
      rationale: `markdownlint-cli2 reported 0 issues; linkinator found 0 broken link(s) across ${String(linkinator.value.links.length)} checked.`,
    }
  }

  const blockingSections: string[] = []

  if (lintErrors.length > 0) {
    blockingSections.push(
      `markdownlint-cli2 reported ${String(lintErrors.length)} error(s):`,
      ...lintErrors.map((finding) => `- ${formatMarkdownlintFinding(finding)}`),
    )
  }

  if (linkDetails.length > 0) {
    blockingSections.push(
      `linkinator found ${String(linkDetails.length)} broken link(s):`,
      ...linkDetails.map((detail) => `- ${detail}`),
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

export const docs: CheckDefinitionConfig = {
  run: ["node", "scripts/check-docs.mjs"],
  output: { format: "json" },
  policy: ({ result }) => {
    const parsed = requireParsedOutput<CombinedDocsEvidence>(
      result.output,
      "Docs check output could not be parsed as JSON.",
    )
    if (!parsed.ok) return parsed.result

    return evaluateDocsPolicy({ evidence: parsed.value })
  },
}
