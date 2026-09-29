import type { ScorecardCheckResult, ScorecardProvenance } from "./types.js"

/**
 * @param score - A sub-check's own score.
 * @returns `"N/A"` for `"not-applicable"`, else `"<score>/10"`.
 */
function scoreCell(score: number | "not-applicable"): string {
  return score === "not-applicable" ? "N/A" : `${String(score)}/10`
}

/**
 * The `## Provenance` section's own "Weighted score" bullet, in full --
 * three genuinely distinct cases, not two: nothing evaluated at all (no
 * fetch was even attempted, so no weight-source wording applies -- see
 * `checks/openssf-scorecard.ts`'s own "skip the fetch when there's nothing
 * to weight" short-circuit), something evaluated with the live weight table
 * available, and something evaluated but the live fetch failed (equal-
 * weighting fallback). Collapsing the first case into the second would
 * claim live-fetched weights were used when no fetch ever ran.
 * @param weightedAverage - `Σ(score × weight) / Σ(weight)`, or `undefined` if nothing was evaluated.
 * @param weightsUnavailableReason - Set only when checks were evaluated but the live weight fetch failed.
 * @returns The bullet's full text, without its leading `- **Weighted score:**` prefix's own Markdown bolding (included here).
 */
function weightedScoreLine(
  weightedAverage: number | undefined,
  weightsUnavailableReason: string | undefined,
): string {
  if (weightedAverage === undefined) {
    return "- **Weighted score:** N/A (no checks were evaluated)."
  }
  const score = `${weightedAverage.toFixed(1)}/10`
  const formula = "`Σ(score × weight) / Σ(weight)` over every evaluated check below"
  if (weightsUnavailableReason === undefined) {
    return `- **Weighted score:** ${score} -- ${formula}, using ossf/scorecard's own live-fetched per-check weights.`
  }
  return `- **Weighted score:** ${score} -- ${formula} (per-check weight fetch failed -- **fell back to equal weighting**: ${weightsUnavailableReason}).`
}

/**
 * The per-check weight actually applied when computing the weighted score
 * above -- rendered per-row (not just cited by source URL) so a reader can
 * recompute `Σ(score × weight) / Σ(weight)` for themselves directly from
 * this table, without re-fetching ossf/scorecard's own live, mutable
 * weight table and trusting it hasn't since changed.
 * @param result - The sub-check result this row is for.
 * @param weights - The per-check weight table actually used for this run's weighted score (`undefined` if the live fetch failed entirely, or a specific check's own name was missing from it -- both fall back to a weight of `1`; see `computeWeightedAverage`'s own doc comment).
 * @returns `"--"` for a `"not-applicable"` result (excluded from the aggregate entirely, so it has no weight to show), else the weight actually used.
 */
function weightCell(
  result: ScorecardCheckResult,
  weights: Readonly<Record<string, number>> | undefined,
): string {
  if (result.score === "not-applicable") return "--"
  const weight = weights?.[result.name]
  return weight === undefined ? "1 (fallback)" : String(weight)
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
 * @param input.weightedAverage - `Σ(score_i × weight_i) / Σ(weight_i)` over every evaluated (non-`"not-applicable"`) sub-check, or `undefined` when nothing could be evaluated (see the caller's own "every sub-check not-applicable" warn path).
 * @param input.weights - The per-check weight table actually used to compute `weightedAverage` (`fetchScorecardWeights`'s own `.value.weights`, or `undefined` if that live fetch failed) -- rendered per-row via `weightCell` so the score is reconstructable from this document alone.
 * @param input.weightsUnavailableReason - Set when the live fetch of ossf/scorecard's own weight table failed, so `weightedAverage` fell back to equal weighting across evaluated checks -- `undefined` when the live weights were used.
 * @param input.provenance - When, against what commit, and by which version of this evaluator, this document was produced.
 * @returns The full Markdown document.
 */
export function renderScorecardMarkdown(input: {
  readonly repo: string
  readonly generatedAt: string
  readonly results: readonly ScorecardCheckResult[]
  readonly weightedAverage: number | undefined
  readonly weights: Readonly<Record<string, number>> | undefined
  readonly weightsUnavailableReason: string | undefined
  readonly provenance: ScorecardProvenance
}): string {
  const {
    repo,
    generatedAt,
    results,
    weightedAverage,
    weights,
    weightsUnavailableReason,
    provenance,
  } = input
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
  lines.push("## Provenance")
  lines.push("")
  lines.push(`- **Date:** ${provenance.date}`)
  lines.push(`- **Repository:** \`${provenance.repo.name}\` @ \`${provenance.repo.commit}\``)
  lines.push(
    `- **Evaluator version:** \`repo-contract@${provenance.scorecard.version}\` @ \`${provenance.scorecard.commit}\` (this is repo-contract's own evaluator version, **not** the upstream \`scorecard\` binary's -- this document was never produced by running that binary).`,
  )
  lines.push(weightedScoreLine(weightedAverage, weightsUnavailableReason))
  lines.push("")
  lines.push("## Checks")
  lines.push("")
  lines.push("| Check | Score | Weight | Why |")
  lines.push("| --- | --- | --- | --- |")
  for (const result of results) {
    const escapedReason = result.reason
      .replace(/\\/g, "\\\\")
      .replace(/\|/g, "\\|")
      .replace(/\n/g, " ")
    lines.push(
      `| ${result.name} | ${scoreCell(result.score)} | ${weightCell(result, weights)} | ${escapedReason} |`,
    )
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
