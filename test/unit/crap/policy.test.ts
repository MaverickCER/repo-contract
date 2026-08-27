import { describe, expect, it } from "vitest"
import { evaluateCrapPolicy } from "../../../checks/crap.js"
import type { CrapFunction, CrapReport } from "../../../checks/crap.js"

// Mirrors checks/crap.ts's own CRAP_THRESHOLD (30) -- not imported (it isn't exported), so this
// pins the same boundary value the policy actually enforces. If the threshold ever changes, the
// boundary tests below must change with it, which is the point: they'd otherwise silently test
// the wrong number.
const CRAP_THRESHOLD = 30

function fn(overrides: Partial<CrapFunction> = {}): CrapFunction {
  return { file: "src/example.ts", name: "example", startLine: 1, crap: 1, ...overrides }
}

function report(functions: readonly CrapFunction[]): CrapReport {
  return { threshold: CRAP_THRESHOLD, functions }
}

describe("evaluateCrapPolicy", () => {
  it("passes when every function is exactly at the threshold -- the boundary is inclusive", () => {
    const result = evaluateCrapPolicy({ evidence: report([fn({ crap: CRAP_THRESHOLD })]) })
    expect(result.outcome).toBe("pass")
  })

  it("fails when a function is even fractionally above the threshold", () => {
    const result = evaluateCrapPolicy({
      evidence: report([fn({ crap: CRAP_THRESHOLD + 0.01 })]),
    })
    expect(result.outcome).toBe("fail")
  })

  it("passes with zero functions analyzed", () => {
    const result = evaluateCrapPolicy({ evidence: report([]) })
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain("0 function(s) analyzed")
  })

  it("ignores this repo's own configured threshold echo, only ever trusting this file's own constant", () => {
    // A malicious/stale report claiming a much higher threshold must not weaken the gate --
    // the policy is documented to never read report.threshold.
    const result = evaluateCrapPolicy({
      evidence: { threshold: 9999, functions: [fn({ crap: CRAP_THRESHOLD + 1 })] },
    })
    expect(result.outcome).toBe("fail")
  })

  it("fails when the report's functions field is not an array", () => {
    const result = evaluateCrapPolicy({
      evidence: { threshold: CRAP_THRESHOLD, functions: undefined as unknown as CrapFunction[] },
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("invalid JSON report data")
  })

  it("lists every offending function, sorted by CRAP score descending, with file:line and name", () => {
    const result = evaluateCrapPolicy({
      evidence: report([
        fn({ file: "src/a.ts", name: "low", startLine: 5, crap: CRAP_THRESHOLD + 1 }),
        fn({ file: "src/b.ts", name: "high", startLine: 10, crap: CRAP_THRESHOLD + 50 }),
      ]),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("2 function(s)")
    const highIndex = result.rationale.indexOf("src/b.ts:10 high")
    const lowIndex = result.rationale.indexOf("src/a.ts:5 low")
    expect(highIndex).toBeGreaterThanOrEqual(0)
    expect(lowIndex).toBeGreaterThan(highIndex)
  })

  it("fails, rather than silently passing, when a function has no readable (finite) CRAP score", () => {
    const result = evaluateCrapPolicy({
      evidence: report([
        fn({ file: "src/a.ts", name: "broken", startLine: 7, crap: Number.POSITIVE_INFINITY }),
      ]),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("no readable CRAP score")
    expect(result.rationale).toContain("src/a.ts:7 broken")
  })

  it("fails when a function's CRAP score is missing entirely (untrusted tool JSON)", () => {
    const result = evaluateCrapPolicy({
      // @ts-expect-error -- deliberately modelling a malformed crap4ts row with no `crap` field
      evidence: report([{ file: "src/b.ts", name: "noScore", startLine: 3 }]),
    })
    expect(result.outcome).toBe("fail")
  })
})
