import { describe, expect, it } from "vitest"
import { evaluateVitestJsonPolicy } from "../../../../src/presets/shared/vitest-json-policy.js"
import type { ParsedOutput } from "../../../../src/types.js"

function output(value: unknown): ParsedOutput<unknown> {
  return { format: "json", success: true, value }
}

function report(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    numTotalTests: 0,
    numTotalTestSuites: 0,
    numFailedTests: 0,
    numFailedTestSuites: 0,
    testResults: [],
    ...overrides,
  }
}

describe("evaluateVitestJsonPolicy", () => {
  it("fails with a fixed rationale when output is undefined", () => {
    const result = evaluateVitestJsonPolicy(undefined)
    expect(result).toEqual({
      outcome: "fail",
      rationale: "Vitest output could not be parsed as JSON.",
    })
  })

  it("fails with the same rationale when output.success is false", () => {
    const result = evaluateVitestJsonPolicy({
      format: "json",
      success: false,
      error: "boom",
    })
    expect(result).toEqual({
      outcome: "fail",
      rationale: "Vitest output could not be parsed as JSON.",
    })
  })

  it("fails cleanly (does not throw) on valid JSON that isn't Vitest's reporter shape", () => {
    // `numFailedTests`/`numFailedTestSuites` are `undefined` here, so the
    // pass branch is not taken and `testResults` would be walked -- it must
    // be guarded, not throw a TypeError out of the policy.
    const result = evaluateVitestJsonPolicy(output({ someOtherTool: true }))
    expect(result).toEqual({
      outcome: "fail",
      rationale: "Vitest produced invalid JSON report data.",
    })
  })

  it.each([
    ["null", null],
    ["a primitive", 42],
    ["a string", "nope"],
  ])(
    "fails with the invalid-report-data rationale (never throws) when the parsed value is %s",
    (_label, value) => {
      const result = evaluateVitestJsonPolicy(output(value))
      expect(result).toEqual({
        outcome: "fail",
        rationale: "Vitest produced invalid JSON report data.",
      })
    },
  )

  it("passes and reports the exact total counts when nothing failed", () => {
    const result = evaluateVitestJsonPolicy(
      output(report({ numTotalTests: 12, numTotalTestSuites: 3 })),
    )
    expect(result).toEqual({
      outcome: "pass",
      rationale: "Vitest completed 12 test(s) with 0 failures across 3 suite(s).",
    })
  })

  it("fails when numFailedTests is nonzero even though numFailedTestSuites is zero -- proves && not ||", () => {
    const result = evaluateVitestJsonPolicy(
      output(report({ numFailedTests: 1, numFailedTestSuites: 0, testResults: [] })),
    )
    expect(result.outcome).toBe("fail")
  })

  it("fails when numFailedTestSuites is nonzero even though numFailedTests is zero -- the other side of &&", () => {
    const result = evaluateVitestJsonPolicy(
      output(report({ numFailedTests: 0, numFailedTestSuites: 1, testResults: [] })),
    )
    expect(result.outcome).toBe("fail")
  })

  it("lists only the failed assertion within a suite, not a passing sibling", () => {
    const result = evaluateVitestJsonPolicy(
      output(
        report({
          numFailedTests: 1,
          numFailedTestSuites: 1,
          testResults: [
            {
              name: "suite.test.ts",
              assertionResults: [
                { status: "passed", fullName: "a passing test" },
                { status: "failed", fullName: "a failing test", failureMessages: ["boom"] },
              ],
            },
          ],
        }),
      ),
    )
    expect(result.outcome).toBe("fail")
    // Exact full-string equality, not a substring `toContain` -- pins the "- " bullet prefix, the
    // " — " separators between suite/name/message, and the "\n"-joined line structure all at
    // once, rather than three assertions that could each individually pass against a subtly
    // malformed join (e.g. a dropped separator or an array coerced to a comma-joined string).
    expect(result.rationale).toBe(
      "Vitest reported 1 failing test(s) across 1 failing suite(s):\n- suite.test.ts — a failing test — boom",
    )
  })

  it("appends the exact :line:column location when the failed assertion has one", () => {
    const result = evaluateVitestJsonPolicy(
      output(
        report({
          numFailedTests: 1,
          numFailedTestSuites: 1,
          testResults: [
            {
              name: "suite.test.ts",
              assertionResults: [
                {
                  status: "failed",
                  fullName: "located test",
                  location: { line: 42, column: 7 },
                  failureMessages: ["boom"],
                },
              ],
            },
          ],
        }),
      ),
    )
    expect(result.rationale).toContain("suite.test.ts:42:7")
  })

  it("omits the location suffix entirely (no stray ':undefined:undefined') when the failed assertion has none", () => {
    const result = evaluateVitestJsonPolicy(
      output(
        report({
          numFailedTests: 1,
          numFailedTestSuites: 1,
          testResults: [
            {
              name: "suite.test.ts",
              assertionResults: [
                { status: "failed", fullName: "unlocated test", failureMessages: ["boom"] },
              ],
            },
          ],
        }),
      ),
    )
    expect(result.rationale).toContain("suite.test.ts —")
    expect(result.rationale).not.toContain("undefined")
  })

  it("trims each failure message and drops empty ones, joining the rest with ' | '", () => {
    const result = evaluateVitestJsonPolicy(
      output(
        report({
          numFailedTests: 1,
          numFailedTestSuites: 1,
          testResults: [
            {
              name: "suite.test.ts",
              assertionResults: [
                {
                  status: "failed",
                  fullName: "messy test",
                  failureMessages: ["  first message  ", "", "   ", "second message"],
                },
              ],
            },
          ],
        }),
      ),
    )
    expect(result.rationale).toContain("first message | second message")
  })

  it("falls back to an empty message list (never throws) when failureMessages is absent", () => {
    const result = evaluateVitestJsonPolicy(
      output(
        report({
          numFailedTests: 1,
          numFailedTestSuites: 1,
          testResults: [
            {
              name: "suite.test.ts",
              assertionResults: [{ status: "failed", fullName: "no messages test" }],
            },
          ],
        }),
      ),
    )
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("suite.test.ts — no messages test")
    expect(result.rationale).not.toContain("Stryker was here")
  })

  it("lists every failing suite/test across multiple suites, each as its own bullet", () => {
    const result = evaluateVitestJsonPolicy(
      output(
        report({
          numFailedTests: 2,
          numFailedTestSuites: 2,
          testResults: [
            {
              name: "a.test.ts",
              assertionResults: [
                { status: "failed", fullName: "test a", failureMessages: ["fail a"] },
              ],
            },
            {
              name: "b.test.ts",
              assertionResults: [
                { status: "failed", fullName: "test b", failureMessages: ["fail b"] },
              ],
            },
          ],
        }),
      ),
    )
    // Exact full-string equality -- see the single-suite test above for why this is stronger
    // than per-line `toContain` checks: it also pins the "\n"-joined structure between bullets.
    expect(result.rationale).toBe(
      "Vitest reported 2 failing test(s) across 2 failing suite(s):\n" +
        "- a.test.ts — test a — fail a\n" +
        "- b.test.ts — test b — fail b",
    )
  })
})
