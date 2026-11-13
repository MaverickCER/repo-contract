import { compareWithOfficial, notEvaluatedChecks, type OfficialScorecard } from "./official.js"
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

/** Why this evaluation leaves a check unscored, for each upstream check it does not score. */
const NOT_EVALUATED_REASONS: Readonly<Record<string, string>> = {
  "Binary-Artifacts": "not scored by this script; the official result above covers it.",
  "Branch-Protection": "the GitHub API could not be read for this run.",
  "CI-Tests": "not scored by this script; the official result above covers it.",
  "CII-Best-Practices":
    "requires a separate submission to the OpenSSF Best Practices Badge program, an action outside this repository's own automation.",
  "Code-Review": "the GitHub API could not be read for this run.",
  Contributors: "the GitHub API could not be read for this run.",
  "Dangerous-Workflow": "not scored by this script; the official result above covers it.",
  "Dependency-Update-Tool": "not scored by this script; the official result above covers it.",
  Fuzzing:
    "not scored by this script. Upstream counts property-based testing, which this repository runs with fast-check (`test/property/`); the official result above covers it.",
  License: "not scored by this script; the official result above covers it.",
  Maintained: "the GitHub API could not be read for this run.",
  Packaging: "not scored by this script; the official result above covers it.",
  "Pinned-Dependencies": "not scored by this script; the official result above covers it.",
  SAST: "not scored by this script; the official result above covers it.",
  SBOM: "not scored by this script. This repository commits two CycloneDX 1.6 SBOMs, `docs/sbom.production.cdx.json` and `docs/sbom.cdx.json` (see SECURITY.md#sboms).",
  "Security-Policy": "not scored by this script; the official result above covers it.",
  "Signed-Releases": "the GitHub API could not be read for this run.",
  "Token-Permissions": "not scored by this script; the official result above covers it.",
  Vulnerabilities: "the `security-deps` check's evidence was not available.",
  Webhooks:
    "requires org-admin-level GitHub API access this repository's automation does not have.",
}

/**
 * @param score - An official score: 0-10, or -1 when Scorecard could not score the check.
 * @returns `"N/A"` for -1, else `"<score>/10"`.
 */
function officialCell(score: number): string {
  return score < 0 ? "N/A" : `${String(score)}/10`
}

/**
 * @param text - Free text for one Markdown table cell.
 * @returns The text with backslashes, pipes and newlines escaped.
 */
function cell(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\n/g, " ")
}

/**
 * @param text - A reason, with or without a closing full stop.
 * @returns The text ending in exactly one full stop.
 */
function sentence(text: string): string {
  return text.endsWith(".") ? text : `${text}.`
}

/**
 * The `## Official OpenSSF Scorecard result` section and, when there is a result, the comparison
 * with this evaluation.
 * @param repo - The `owner/repo` slug.
 * @param results - This evaluation's results.
 * @param official - The published result, if it was fetched.
 * @param unavailableReason - Why it was not, if it was not.
 * @returns The section's lines.
 */
function officialSection(
  repo: string,
  results: readonly ScorecardCheckResult[],
  official: OfficialScorecard | undefined,
  unavailableReason: string | undefined,
): string[] {
  const lines = ["## Official OpenSSF Scorecard result", ""]
  const viewer = `[scorecard.dev viewer](https://scorecard.dev/viewer/?uri=github.com/${repo})`
  if (official === undefined) {
    lines.push(
      `The official result could not be fetched for this run: ${unavailableReason ?? "no reason was recorded"}. See the ${viewer} for the published score. Only this repository's own evaluation is shown below.`,
      "",
    )
    return lines
  }
  lines.push(
    `Produced by OpenSSF's own \`scorecard\` binary (run by \`.github/workflows/scorecard.yml\` and published to the public Scorecard API), so it is independent of this repository's code. When the two disagree, the official result is the one to cite.`,
    "",
    `- **Official score:** ${official.score.toFixed(1)}/10`,
    `- **Scorecard version:** \`${official.scorecardVersion}\``,
    `- **Commit evaluated:** \`${official.commit}\``,
    `- **Evaluated on:** ${official.date}`,
    `- **Source:** ${viewer}`,
    "",
    "| Check | Official | This evaluation | Official reason |",
    "| --- | --- | --- | --- |",
  )
  const rows = compareWithOfficial(results, official)
  for (const row of rows) {
    if (row.official === undefined) continue
    const mine = row.local === undefined ? "not evaluated" : scoreCell(row.local.score)
    lines.push(
      `| ${row.name} | ${officialCell(row.official.score)} | ${mine} | ${cell(row.official.reason)} |`,
    )
  }
  lines.push("", "## Where the two differ", "")
  const differing = rows.filter((row) => row.differs)
  if (differing.length === 0) {
    lines.push("The two agree on every check both of them scored.")
  }
  for (const row of differing) {
    if (row.official === undefined || row.local === undefined) continue
    lines.push(
      `- **${row.name}:** official ${officialCell(row.official.score)}, this evaluation ${scoreCell(row.local.score)}. Official: ${sentence(row.official.reason)} This evaluation: ${sentence(row.local.reason)}`,
    )
  }
  lines.push("")
  return lines
}

/**
 * Renders `docs/OpenSSF-Scorecard.md`. The disclaimer at the top is load-
 * bearing, not decorative: this document is repo-contract's own evaluation,
 * informed by OpenSSF Scorecard's published methodology, never a run of the
 * upstream `scorecard` binary and never a certification. It leads with the
 * official, published result when it can be fetched, so the two are never
 * confused.
 * @param input - What to render.
 * @param input.repo - The `owner/repo` slug this evidence was gathered against.
 * @param input.generatedAt - ISO 8601 timestamp of this render.
 * @param input.results - Every sub-check's result, in display order.
 * @param input.weightedAverage - `Σ(score_i × weight_i) / Σ(weight_i)` over every evaluated (non-`"not-applicable"`) sub-check, or `undefined` when nothing could be evaluated (see the caller's own "every sub-check not-applicable" warn path).
 * @param input.weights - The per-check weight table actually used to compute `weightedAverage` (`fetchScorecardWeights`'s own `.value.weights`, or `undefined` if that live fetch failed) -- rendered per-row via `weightCell` so the score is reconstructable from this document alone.
 * @param input.weightsUnavailableReason - Set when the live fetch of ossf/scorecard's own weight table failed, so `weightedAverage` fell back to equal weighting across evaluated checks -- `undefined` when the live weights were used.
 * @param input.provenance - When, against what commit, and by which version of this evaluator, this document was produced.
 * @param input.official - The published OpenSSF Scorecard result, when it was fetched.
 * @param input.officialUnavailableReason - Why the published result could not be fetched, when it was not.
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
  readonly official?: OfficialScorecard | undefined
  readonly officialUnavailableReason?: string | undefined
}): string {
  const {
    repo,
    generatedAt,
    results,
    weightedAverage,
    weights,
    weightsUnavailableReason,
    provenance,
    official,
    officialUnavailableReason,
  } = input
  const lines: string[] = []
  lines.push("# OpenSSF Scorecard: the official result and this repository's own evaluation")
  lines.push("")
  lines.push(
    "> **Informational evidence, not a certification.** The official result below is OpenSSF Scorecard's own published evaluation of `" +
      repo +
      "`. The rest of this document is `repo-contract`'s own evaluation, informed by [OpenSSF Scorecard's published check methodology](https://github.com/ossf/scorecard/blob/main/docs/checks.md) (Apache-2.0); it is **not** a run of the upstream `scorecard` binary and does not claim numeric parity with it. Neither is an OpenSSF certification. Every local score traces to a cited piece of evidence (a file, a GitHub API field, or another check's result from the same run) gathered by [`scripts/openssf-scorecard/`](../scripts/openssf-scorecard/) during `npm run contract`.",
  )
  lines.push("")
  lines.push(`_Generated ${generatedAt} against \`${repo}\`._`)
  lines.push("")
  lines.push(...officialSection(repo, results, official, officialUnavailableReason))
  lines.push("## Provenance of this evaluation")
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
  lines.push("This repository's own evaluation:")
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

  const notEvaluated = notEvaluatedChecks(results)
  if (notEvaluated.length > 0) {
    lines.push("## Checks not evaluated")
    lines.push("")
    lines.push("Upstream checks this evaluation did not score:")
    lines.push("")
    for (const name of notEvaluated) {
      lines.push(`- **${name}** -- ${NOT_EVALUATED_REASONS[name] ?? "not scored by this script."}`)
    }
    lines.push("")
  }

  return lines.join("\n")
}
