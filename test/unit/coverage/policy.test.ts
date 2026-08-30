import { describe, expect, it } from "vitest"
import { evaluateCoveragePolicy } from "../../../checks/coverage.js"
import { COVERAGE_THRESHOLDS } from "../../../scripts/coverage-thresholds.mjs"
import type { CoverageSummary } from "../../../checks/coverage.js"

function summary(overrides: Partial<CoverageSummary> = {}): CoverageSummary {
  return {
    branches: { pct: COVERAGE_THRESHOLDS.branches },
    functions: { pct: COVERAGE_THRESHOLDS.functions },
    lines: { pct: COVERAGE_THRESHOLDS.lines },
    statements: { pct: COVERAGE_THRESHOLDS.statements },
    ...overrides,
  }
}

describe("evaluateCoveragePolicy", () => {
  it("passes when every metric is exactly at its threshold -- the boundary is inclusive", () => {
    const result = evaluateCoveragePolicy({ evidence: summary() })
    expect(result.outcome).toBe("pass")
  })

  it("fails when a metric is even fractionally below its threshold", () => {
    const result = evaluateCoveragePolicy({
      evidence: summary({ branches: { pct: COVERAGE_THRESHOLDS.branches - 0.01 } }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("branches")
    expect(result.rationale).toContain("percentage points below threshold")
  })

  it("passes when a metric is above its threshold", () => {
    const result = evaluateCoveragePolicy({
      evidence: summary({ lines: { pct: 100 } }),
    })
    expect(result.outcome).toBe("pass")
  })

  it("fails and names every metric missing or invalid, not just the first", () => {
    const result = evaluateCoveragePolicy({
      evidence: {
        branches: { pct: Number.NaN },
        functions: { pct: COVERAGE_THRESHOLDS.functions },
        lines: {} as { pct: number },
        statements: { pct: COVERAGE_THRESHOLDS.statements },
      },
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("branches: coverage percentage is missing or invalid")
    expect(result.rationale).toContain("lines: coverage percentage is missing or invalid")
    expect(result.rationale).not.toContain("functions: coverage percentage is missing or invalid")
  })

  it("reports every threshold metric's actual percentage in a passing rationale", () => {
    const result = evaluateCoveragePolicy({ evidence: summary() })
    for (const metric of Object.keys(COVERAGE_THRESHOLDS)) {
      expect(result.rationale).toContain(metric)
    }
  })
})
