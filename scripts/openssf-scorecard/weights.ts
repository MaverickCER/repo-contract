import { parse as parseYaml } from "yaml"
import { ghApiRaw } from "./gh-api.js"
import type { GhApiResult, ScorecardCheckResult } from "./types.js"

/**
 * Where `fetchScorecardWeights` reads ossf/scorecard's own published
 * methodology from, at execution time. It is never hardcoded as a
 * remembered weight table, because upstream's own weighting can change
 * between releases. This evaluator's whole point is fidelity to the *real*,
 * current methodology. This directory's own module doc comments explain why
 * this evaluation is informed by, but never a run of, the upstream binary.
 *
 * `CHECKS_YAML_PATH` carries each check's own `risk` tier (`Critical` /
 * `High` / `Medium` / `Low`). It is the source of truth `docs/checks.md`
 * itself is generated from. That file's own header says "Do not edit this
 * file manually! Edit checks.yaml instead" (confirmed directly against
 * upstream).
 *
 * `AGGREGATION_SOURCE_PATH` carries the numeric weight that upstream's own
 * `GetAggregateScore` assigns to each risk tier. This was confirmed directly
 * against upstream's `Result.GetAggregateScore` in that exact file. This
 * evaluator's own weighted-aggregate formula (`computeWeightedAverage`,
 * below) deliberately mirrors it: `Σ(score_i × weight_i) / Σ(weight_i)`.
 */
const CHECKS_YAML_PATH = "repos/ossf/scorecard/contents/docs/checks/internal/checks.yaml"
const AGGREGATION_SOURCE_PATH = "repos/ossf/scorecard/contents/pkg/scorecard/scorecard_result.go"

export interface ScorecardWeightTable {
  /** Every upstream check name (exact upstream naming) mapped to its live-fetched numeric weight. */
  readonly weights: Readonly<Record<string, number>>
  /** Where each half of this table was fetched from, for citing in rendered output. */
  readonly source: {
    readonly checksYamlUrl: string
    readonly aggregationSourceUrl: string
  }
}

/**
 * Takes `unknown`, not a structured type, for the same reason
 * `checks/mutation.ts`'s own identically-named/-shaped helper does. `parsed`
 * here is untrusted YAML from another project's repository, cast from
 * whatever `parseYaml` happens to return. Typing it as a real object shape
 * would assert a guarantee this data doesn't actually have. It would also
 * make `no-unnecessary-condition` (rightly, by that asserted type) flag the
 * runtime check below as dead code.
 * @param value - The value to check.
 * @returns True if `value` is a non-null, non-array plain object.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * @param yamlText - `docs/checks/internal/checks.yaml`'s raw text.
 * @returns Every check name mapped to its own `risk` tier string, or `undefined` if the text doesn't parse into the expected `{checks: {<Name>: {risk: ...}}}` shape at all.
 */
function parseRiskLevels(yamlText: string): Readonly<Record<string, string>> | undefined {
  let parsed: unknown
  try {
    parsed = parseYaml(yamlText)
  } catch {
    return undefined
  }
  if (!isPlainObject(parsed)) return undefined
  const checks = parsed.checks
  if (!isPlainObject(checks)) return undefined

  const riskLevels: Record<string, string> = {}
  for (const [name, entry] of Object.entries(checks)) {
    const risk = isPlainObject(entry) ? entry.risk : undefined
    if (typeof risk === "string") riskLevels[name] = risk
  }
  return riskLevels
}

/**
 * Upstream's `Result.GetAggregateScore` (`pkg/scorecard/scorecard_result.go`)
 * declares its risk-tier weight table as a single Go literal:
 * `weights := map[string]float64{"Critical": 10, "High": 7.5, ...}`. This
 * extracts that same table from the file's real source text via a targeted
 * regex rather than a Go parser. A regex is proportionate to reading one
 * literal out of one well-known function. It re-runs every time this
 * evaluator runs, so a future change to those numbers is picked up without
 * a code change here.
 * @param goSource - `pkg/scorecard/scorecard_result.go`'s raw text.
 * @returns Every risk tier name mapped to its numeric weight, or `undefined` if no recognizable weight-table literal was found.
 */
function parseRiskWeightTable(goSource: string): Readonly<Record<string, number>> | undefined {
  const mapMatch = /weights\s*:=\s*map\[string\]float64\{([^}]*)\}/.exec(goSource)
  const body = mapMatch?.[1]
  if (!body) return undefined

  const weights: Record<string, number> = {}
  const pairPattern = /"([^"]+)"\s*:\s*([\d.]+)/g
  for (const match of body.matchAll(pairPattern)) {
    const risk = match[1]
    const value = Number(match[2])
    if (risk && Number.isFinite(value)) weights[risk] = value
  }
  return Object.keys(weights).length > 0 ? weights : undefined
}

/**
 * Fetches ossf/scorecard's own current per-check weight table, live, at
 * execution time. It combines each check's `risk` tier
 * (`docs/checks/internal/checks.yaml`) with that tier's own numeric weight
 * (`pkg/scorecard/scorecard_result.go`'s `GetAggregateScore`), rather than
 * hardcoding either. Never crashes the calling check. Any failure (`gh`
 * unavailable, a real 404, an unparseable response) is reported as a
 * classified `GhApiResult` failure, like every other gh-API-backed
 * evaluator in this directory. `GhApiResult`'s own doc comment covers that
 * classification. The
 * caller (`checks/openssf-scorecard.ts`) then falls back on equal weighting
 * for that run. It does not fail the whole check over a degraded, but
 * non-essential, fidelity signal.
 * @returns The live weight table, or a classified failure.
 */
export function fetchScorecardWeights(): GhApiResult<ScorecardWeightTable> {
  const checksYaml = ghApiRaw(CHECKS_YAML_PATH)
  if (!checksYaml.ok) return checksYaml

  const riskLevels = parseRiskLevels(checksYaml.value)
  if (!riskLevels) {
    return {
      ok: false,
      reason: "error",
      message:
        "ossf/scorecard's own docs/checks/internal/checks.yaml did not parse into the expected {checks: {<Name>: {risk: ...}}} shape.",
    }
  }

  const aggregationSource = ghApiRaw(AGGREGATION_SOURCE_PATH)
  if (!aggregationSource.ok) return aggregationSource

  const riskWeights = parseRiskWeightTable(aggregationSource.value)
  if (!riskWeights) {
    return {
      ok: false,
      reason: "error",
      message:
        "ossf/scorecard's own pkg/scorecard/scorecard_result.go did not contain a recognizable weights := map[string]float64{...} risk-weight table.",
    }
  }

  const weights: Record<string, number> = {}
  for (const [checkName, risk] of Object.entries(riskLevels)) {
    const weight = riskWeights[risk]
    if (weight !== undefined) weights[checkName] = weight
  }

  return {
    ok: true,
    value: {
      weights,
      source: {
        checksYamlUrl:
          "https://github.com/ossf/scorecard/blob/main/docs/checks/internal/checks.yaml",
        aggregationSourceUrl:
          "https://github.com/ossf/scorecard/blob/main/pkg/scorecard/scorecard_result.go",
      },
    },
  }
}

/**
 * The weighted aggregate `Σ(score_i × weight_i) / Σ(weight_i)`, computed
 * only over `evaluated`: mirroring upstream's own `GetAggregateScore`
 * (see this file's own top-of-file doc comment). A check can be missing
 * from `weights` for two reasons. The live fetch may have failed entirely,
 * so `weights` itself is `undefined`. Far less likely, a single check name
 * may have drifted out of sync with upstream's own naming. Either way that
 * check alone falls back to a weight of `1`. A missing entry then degrades
 * fidelity for that one check only. It neither crashes this computation
 * nor silently zero-weights (and thereby zero-scores) the check out of the
 * aggregate.
 * @param evaluated - Every sub-check result already narrowed to a real numeric score. Must be non-empty: the caller checks `evaluated.length > 0` before calling.
 * @param weights - This run's live-fetched per-check weight table (`fetchScorecardWeights`'s own `.value.weights`), or `undefined` if that fetch failed.
 * @returns The weighted aggregate, 0-10.
 */
export function computeWeightedAverage(
  evaluated: readonly (ScorecardCheckResult & { score: number })[],
  weights: Readonly<Record<string, number>> | undefined,
): number {
  let numerator = 0
  let denominator = 0
  for (const result of evaluated) {
    const weight = weights?.[result.name] ?? 1
    numerator += result.score * weight
    denominator += weight
  }
  return numerator / denominator
}
