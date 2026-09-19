import { describe, expect, it } from "vitest"
import { evaluateVulnerabilities } from "../../../../scripts/openssf-scorecard/vulnerabilities-check.js"
import type { CheckEvidence } from "../../../../src/types.js"

function evidence(overrides: Partial<CheckEvidence> = {}): CheckEvidence {
  return {
    command: "npm",
    args: ["audit", "--omit=dev", "--json"],
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:01.000Z",
    durationMs: 1000,
    exitCode: 0,
    signal: null,
    stdout: "",
    stderr: "",
    status: "completed",
    ...overrides,
  }
}

function withCounts(counts: {
  critical: number
  high: number
  moderate: number
  low: number
}): unknown {
  return { metadata: { vulnerabilities: counts } }
}

describe("evaluateVulnerabilities", () => {
  it("is not-applicable when security-deps evidence is undefined", () => {
    const result = evaluateVulnerabilities(undefined)
    expect(result).toEqual({
      name: "Vulnerabilities",
      score: "not-applicable",
      reason:
        "The security-deps check's evidence was not available (it may not have run in this pass, or its output could not be parsed).",
      details: [],
    })
  })

  it("is not-applicable when security-deps evidence has no output field at all", () => {
    const result = evaluateVulnerabilities(evidence({ output: undefined }))
    expect(result.score).toBe("not-applicable")
    expect(result.reason).toContain("was not available")
  })

  it("is not-applicable when security-deps' own output.success is false", () => {
    const result = evaluateVulnerabilities(
      evidence({ output: { format: "json", success: false, error: "bad json" } }),
    )
    expect(result.score).toBe("not-applicable")
    expect(result.reason).toContain("was not available")
  })

  it("is not-applicable, not a crash, when npm audit's own value has no metadata at all", () => {
    // npm audit's own documented failure shape when it can't complete the scan (a registry/network
    // error) is `{ "error": {...} }` -- no "metadata" key. Regression guard: this exact shape
    // previously crashed with an unhandled TypeError ("Cannot read properties of undefined
    // (reading 'vulnerabilities')") instead of falling through to "not-applicable".
    const result = evaluateVulnerabilities(
      evidence({
        output: {
          format: "json",
          success: true,
          value: { error: { code: "ENETWORK", summary: "network error" } },
        },
      }),
    )
    expect(result).toEqual({
      name: "Vulnerabilities",
      score: "not-applicable",
      reason: "security-deps evidence did not contain a parseable npm audit vulnerability count.",
      details: [],
    })
  })

  it("is not-applicable when value is undefined", () => {
    const result = evaluateVulnerabilities(
      evidence({ output: { format: "json", success: true, value: undefined } }),
    )
    expect(result.score).toBe("not-applicable")
    expect(result.name).toBe("Vulnerabilities")
    expect(result.details).toEqual([])
  })

  it("scores 10 with 0 vulnerabilities of every severity", () => {
    const result = evaluateVulnerabilities(
      evidence({
        output: {
          format: "json",
          success: true,
          value: withCounts({ critical: 0, high: 0, moderate: 0, low: 0 }),
        },
      }),
    )
    expect(result).toEqual({
      name: "Vulnerabilities",
      score: 10,
      reason:
        "This run's security-deps check (npm audit) found 0 critical/high/moderate/low vulnerabilities.",
      details: [],
    })
  })

  it("scores 0 and names each severity's count when any vulnerability exists", () => {
    const result = evaluateVulnerabilities(
      evidence({
        output: {
          format: "json",
          success: true,
          value: withCounts({ critical: 1, high: 2, moderate: 3, low: 4 }),
        },
      }),
    )
    expect(result).toEqual({
      name: "Vulnerabilities",
      score: 0,
      reason:
        "This run's security-deps check (npm audit) found 1 critical, 2 high, 3 moderate, and 4 low-severity vulnerabilities.",
      details: [],
    })
  })

  it("scores 0 when only a single low-severity vulnerability exists -- not silently rounded to 0 total", () => {
    const result = evaluateVulnerabilities(
      evidence({
        output: {
          format: "json",
          success: true,
          value: withCounts({ critical: 0, high: 0, moderate: 0, low: 1 }),
        },
      }),
    )
    expect(result.score).toBe(0)
  })

  it("sums all four severities, not just the first two -- equal critical/high would cancel to a false 0 total if the low term were subtracted", () => {
    const result = evaluateVulnerabilities(
      evidence({
        output: {
          format: "json",
          success: true,
          value: withCounts({ critical: 1, high: 1, moderate: 1, low: 3 }),
        },
      }),
    )
    expect(result.score).toBe(0)
  })

  it("includes the moderate term in the total -- equal critical+high and moderate would cancel to a false 0 total if moderate were subtracted", () => {
    const result = evaluateVulnerabilities(
      evidence({
        output: {
          format: "json",
          success: true,
          value: withCounts({ critical: 1, high: 2, moderate: 3, low: 0 }),
        },
      }),
    )
    expect(result.score).toBe(0)
  })

  it("includes the high term in the total -- equal critical and high would cancel to a false 0 total if high were subtracted", () => {
    const result = evaluateVulnerabilities(
      evidence({
        output: {
          format: "json",
          success: true,
          value: withCounts({ critical: 3, high: 3, moderate: 0, low: 0 }),
        },
      }),
    )
    expect(result.score).toBe(0)
  })
})
