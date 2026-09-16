import type { ScorecardCheckResult } from "./types.js"

/**
 * @param score - A sub-check's own score.
 * @returns `"N/A"` for `"not-applicable"`, else `"<score>/10"`.
 */
function scoreCell(score: number | "not-applicable"): string {
  return score === "not-applicable" ? "N/A" : `${String(score)}/10`
}

/**
 * Renders `docs/OpenSSF-Scorecard.md`. The disclaimer at the top is load-
 * bearing, not decorative: this document is repo-contract's own evaluation,
 * informed by OpenSSF Scorecard's published methodology, never a run of the
 * upstream `scorecard` binary and never a certification -- see
 * scripts/openssf-scorecard/README.md for the full reasoning.
 * @param input - What to render.
 * @param input.repo - The `owner/repo` slug this evidence was gathered against.
 * @param input.generatedAt - ISO 8601 timestamp of this render.
 * @param input.results - Every sub-check's result, in display order.
 * @returns The full Markdown document.
 */
export function renderScorecardMarkdown(input: {
  readonly repo: string
  readonly generatedAt: string
  readonly results: readonly ScorecardCheckResult[]
}): string {
  const { repo, generatedAt, results } = input
  const lines: string[] = []
  lines.push("# OpenSSF Scorecard-informed evidence")
  lines.push("")
  lines.push(
    "> **Informational evidence, not a certification.** This document is `repo-contract`'s own evaluation of `" +
      repo +
      "`, informed by [OpenSSF Scorecard's published check methodology](https://github.com/ossf/scorecard/blob/main/docs/checks.md) (Apache-2.0) -- it is **not** a run of the upstream `scorecard` binary, does not claim numeric parity with it, and is not an OpenSSF certification of any kind. Every score below traces to a specific, cited piece of evidence (a file, a GitHub API field, or another check's own result from this same run) gathered by [`scripts/openssf-scorecard/`](../scripts/openssf-scorecard/) -- generated automatically by `repo-contract`'s own `npm run contract`, dogfooding this repository's own contract/evidence mechanism rather than a separate, bespoke script.",
  )
  lines.push("")
  lines.push(`_Generated ${generatedAt} against \`${repo}\`._`)
  lines.push("")
  lines.push("## Checks")
  lines.push("")
  lines.push("| Check | Score | Why |")
  lines.push("| --- | --- | --- |")
  for (const result of results) {
    const escapedReason = result.reason.replace(/\|/g, "\\|").replace(/\n/g, " ")
    lines.push(`| ${result.name} | ${scoreCell(result.score)} | ${escapedReason} |`)
  }
  lines.push("")

  const withDetails = results.filter((r) => r.details.length > 0)
  if (withDetails.length > 0) {
    lines.push("## Details")
    lines.push("")
    for (const result of withDetails) {
      lines.push(`### ${result.name}`)
      lines.push("")
      for (const detail of result.details) lines.push(`- ${detail}`)
      lines.push("")
    }
  }

  lines.push("## Checks not evaluated")
  lines.push("")
  lines.push(
    "Upstream OpenSSF Scorecard also defines CII-Best-Practices, Fuzzing, SAST, SBOM, and Webhooks. None are evaluated here:",
  )
  lines.push("")
  lines.push(
    "- **CII-Best-Practices** -- requires a separate submission to the OpenSSF Best Practices Badge program, an action outside this repository's own automation.",
  )
  lines.push("- **Fuzzing** -- this repository has no fuzz-testing infrastructure to report on.")
  lines.push(
    "- **SAST** -- this repository's own `lint`/`security-network` checks cover a meaningfully overlapping but not identical surface to a dedicated SAST tool; not mapped to this specific upstream check yet.",
  )
  lines.push("- **SBOM** -- no Software Bill of Materials is currently generated.")
  lines.push(
    "- **Webhooks** -- requires org-admin-level GitHub API access this repository's automation does not have.",
  )
  lines.push("")

  return lines.join("\n")
}
