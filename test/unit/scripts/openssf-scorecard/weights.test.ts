import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ScorecardCheckResult } from "../../../../scripts/openssf-scorecard/types.js"

const { ghApiRaw } = vi.hoisted(() => ({ ghApiRaw: vi.fn() }))
vi.mock("../../../../scripts/openssf-scorecard/gh-api.js", () => ({ ghApiRaw }))

const { computeWeightedAverage, fetchScorecardWeights } =
  await import("../../../../scripts/openssf-scorecard/weights.js")

const VALID_CHECKS_YAML = `
checks:
  License:
    risk: Low
  Branch-Protection:
    risk: High
  Dangerous-Workflow:
    risk: Critical
  Packaging:
    risk: Medium
  Unmapped-Check:
    risk: Nonexistent-Tier
`

const VALID_AGGREGATION_SOURCE = `
func (r *Result) GetAggregateScore(checkDocs docChecks.Doc) (float64, error) {
	weights := map[string]float64{"Critical": 10, "High": 7.5, "Medium": 5, "Low": 2.5}
	total := float64(0)
`

function scored(name: string, score: number): ScorecardCheckResult & { score: number } {
  return { name, score, reason: `${name} reason`, details: [] }
}

describe("fetchScorecardWeights", () => {
  beforeEach(() => {
    ghApiRaw.mockReset()
  })

  it("combines checks.yaml's risk tiers with scorecard_result.go's numeric weights", () => {
    ghApiRaw.mockReturnValueOnce({ ok: true, value: VALID_CHECKS_YAML })
    ghApiRaw.mockReturnValueOnce({ ok: true, value: VALID_AGGREGATION_SOURCE })

    const result = fetchScorecardWeights()

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.weights).toEqual({
      License: 2.5,
      "Branch-Protection": 7.5,
      "Dangerous-Workflow": 10,
      Packaging: 5,
      // "Unmapped-Check" carries a risk tier ("Nonexistent-Tier") absent from
      // the aggregation source's own weight table -- excluded from the
      // result entirely rather than defaulting to 0 or crashing.
    })
    expect(result.value.source.checksYamlUrl).toContain("ossf/scorecard")
    expect(result.value.source.aggregationSourceUrl).toContain("scorecard_result.go")
  })

  it("propagates a checks.yaml fetch failure directly, without calling the second fetch", () => {
    ghApiRaw.mockReturnValueOnce({
      ok: false,
      reason: "unavailable",
      message: "gh CLI is not installed.",
    })

    const result = fetchScorecardWeights()

    expect(result).toEqual({
      ok: false,
      reason: "unavailable",
      message: "gh CLI is not installed.",
    })
    expect(ghApiRaw).toHaveBeenCalledTimes(1)
  })

  it("reports a classified error when checks.yaml doesn't parse into the expected shape", () => {
    ghApiRaw.mockReturnValueOnce({ ok: true, value: "not: [valid, {shape" })

    const result = fetchScorecardWeights()

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("error")
    expect(result.message).toContain("checks.yaml")
  })

  it("reports a classified error when checks.yaml parses but has no top-level checks map", () => {
    ghApiRaw.mockReturnValueOnce({ ok: true, value: "not_checks: true" })

    const result = fetchScorecardWeights()

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("error")
  })

  it("propagates an aggregation-source fetch failure directly", () => {
    ghApiRaw.mockReturnValueOnce({ ok: true, value: VALID_CHECKS_YAML })
    ghApiRaw.mockReturnValueOnce({ ok: false, reason: "not-found", message: "404" })

    const result = fetchScorecardWeights()

    expect(result).toEqual({ ok: false, reason: "not-found", message: "404" })
  })

  it("reports a classified error when scorecard_result.go carries no recognizable weight-table literal", () => {
    ghApiRaw.mockReturnValueOnce({ ok: true, value: VALID_CHECKS_YAML })
    ghApiRaw.mockReturnValueOnce({ ok: true, value: "package scorecard\n// no weights here" })

    const result = fetchScorecardWeights()

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("error")
    expect(result.message).toContain("weights")
  })
})

describe("computeWeightedAverage", () => {
  it("weights each score by its own check's weight, not uniformly", () => {
    // (0 * 10 + 10 * 2.5) / (10 + 2.5) = 25 / 12.5 = 2 -- deliberately far
    // from the simple average (5), so a mutant collapsing this back to an
    // unweighted average is caught.
    const evaluated = [scored("Dangerous-Workflow", 0), scored("License", 10)]
    const weights = { "Dangerous-Workflow": 10, License: 2.5 }

    expect(computeWeightedAverage(evaluated, weights)).toBe(2)
  })

  it("combines three checks with three distinct weights via the real formula", () => {
    // Σ(score*weight): 8*7.5 + 4*5 + 10*2.5 = 60 + 20 + 25 = 105
    // Σ(weight): 7.5 + 5 + 2.5 = 15
    // 105 / 15 = 7
    const evaluated = [
      scored("Branch-Protection", 8),
      scored("Packaging", 4),
      scored("License", 10),
    ]
    const weights = { "Branch-Protection": 7.5, Packaging: 5, License: 2.5 }

    expect(computeWeightedAverage(evaluated, weights)).toBe(7)
  })

  it("falls back to a weight of 1 for a check name missing from the weight table", () => {
    // Branch-Protection has a real weight (7.5); License is missing from
    // the table entirely and falls back to 1.
    // (10*7.5 + 0*1) / (7.5 + 1) = 75 / 8.5
    const evaluated = [scored("Branch-Protection", 10), scored("License", 0)]
    const weights = { "Branch-Protection": 7.5 }

    expect(computeWeightedAverage(evaluated, weights)).toBeCloseTo(75 / 8.5, 10)
  })

  it("falls back to uniform weight-1 equal weighting (a real average) when weights is undefined entirely", () => {
    const evaluated = [scored("A", 4), scored("B", 8), scored("C", 6)]

    expect(computeWeightedAverage(evaluated, undefined)).toBe(6)
  })

  it("returns a single evaluated check's own score regardless of its weight", () => {
    expect(computeWeightedAverage([scored("Solo", 7)], { Solo: 9.9 })).toBeCloseTo(7, 10)
  })
})
