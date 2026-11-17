import { describe, expect, it } from "vitest"
import { evaluateCoverageSummary } from "../../../../src/presets/rules/coverage-summary.js"

const summary = (total: Record<string, unknown>): unknown => ({ total })
const metric = (pct: unknown) => ({ total: 10, covered: 8, skipped: 0, pct })
const ALL_80 = { lines: 80, statements: 80, functions: 80, branches: 80 }

describe("R7b coverage summary", () => {
  it("passes when every judged metric meets its threshold", () => {
    expect(
      evaluateCoverageSummary(
        summary({
          lines: metric(80),
          statements: metric(91.5),
          functions: metric(100),
          branches: metric(85),
        }),
        ALL_80,
      ),
    ).toEqual({
      outcome: "pass",
      rationale:
        "Coverage met every threshold: lines 80% (80% required), statements 91.5% (80% required), functions 100% (80% required), branches 85% (80% required).",
    })
  })

  it("fails on a metric below its threshold and states actual, required and the gap", () => {
    expect(
      evaluateCoverageSummary(
        summary({
          lines: metric(79.99),
          statements: metric(90),
          functions: metric(60.5),
          branches: metric(80),
        }),
        ALL_80,
      ),
    ).toEqual({
      outcome: "fail",
      rationale: [
        "Coverage is below 2 threshold(s):",
        "- lines: 79.99% actual, 80% required, 0.01 points short",
        "- functions: 60.5% actual, 80% required, 19.50 points short",
      ].join("\n"),
    })
  })

  it("does not judge a metric with no threshold", () => {
    expect(
      evaluateCoverageSummary(
        summary({
          lines: metric(81),
          statements: metric(82),
          functions: metric(10),
          branches: metric("Unknown"),
        }),
        { lines: 80, statements: 80 },
      ),
    ).toEqual({
      outcome: "pass",
      rationale:
        "Coverage met every threshold: lines 81% (80% required), statements 82% (80% required).",
    })
  })

  it("passes with nothing to judge when no metric has a threshold, and says so", () => {
    expect(evaluateCoverageSummary(summary({ lines: metric(1) }), {})).toEqual({
      outcome: "pass",
      rationale: "Coverage judged no metric: no threshold is set.",
    })
  })

  it.each([
    ["the summary is null", null],
    ["the summary is not an object", "text"],
    ["total is missing", {}],
    ["total is not an object", { total: 3 }],
    ["total is null", { total: null }],
  ])("fails when %s", (_label, value) => {
    expect(evaluateCoverageSummary(value, ALL_80)).toEqual({
      outcome: "fail",
      rationale: "Coverage: the summary has no `total` section.",
    })
  })

  it("fails with one message when every metric is Unknown", () => {
    expect(
      evaluateCoverageSummary(
        summary({
          lines: metric("Unknown"),
          statements: metric("Unknown"),
          functions: metric("Unknown"),
          branches: metric("Unknown"),
        }),
        ALL_80,
      ),
    ).toEqual({
      outcome: "fail",
      rationale:
        "Coverage: the test run instrumented no code, so every metric reads Unknown. Add source files and tests for them; the check scores once the test run covers real code.",
    })
  })

  it("judges metrics one by one when only some read Unknown", () => {
    expect(
      evaluateCoverageSummary(summary({ lines: metric("Unknown"), statements: metric(90) }), {
        lines: 80,
        statements: 80,
      }),
    ).toEqual({
      outcome: "fail",
      rationale: [
        "Coverage is below 1 threshold(s):",
        "- lines: the percentage is missing or not a number",
      ].join("\n"),
    })
  })

  it("fails on an empty total rather than calling it uninstrumented", () => {
    expect(evaluateCoverageSummary(summary({}), { lines: 80 })).toEqual({
      outcome: "fail",
      rationale: [
        "Coverage is below 1 threshold(s):",
        "- lines: the percentage is missing or not a number",
      ].join("\n"),
    })
  })

  it.each([
    ["a string", "85"],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["null", null],
  ])("fails on a non-numeric pct: %s", (_label, pct) => {
    expect(
      evaluateCoverageSummary(summary({ lines: metric(pct), statements: metric(90) }), {
        lines: 80,
        statements: 80,
      }),
    ).toEqual({
      outcome: "fail",
      rationale: [
        "Coverage is below 1 threshold(s):",
        "- lines: the percentage is missing or not a number",
      ].join("\n"),
    })
  })

  it.each([
    ["undefined", undefined],
    ["null", null],
  ])("reads a metric entry that is %s as missing", (_label, entry) => {
    expect(evaluateCoverageSummary(summary({ lines: entry }), { lines: 80 })).toEqual({
      outcome: "fail",
      rationale: [
        "Coverage is below 1 threshold(s):",
        "- lines: the percentage is missing or not a number",
      ].join("\n"),
    })
  })

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a string", "summary"],
  ])("fails on a summary that is %s", (_label, value) => {
    expect(evaluateCoverageSummary(value, { lines: 80 })).toEqual({
      outcome: "fail",
      rationale: "Coverage: the summary has no `total` section.",
    })
  })

  it("fails on a metric entry that is not an object", () => {
    expect(evaluateCoverageSummary(summary({ lines: 90 }), { lines: 80 }).outcome).toBe("fail")
  })

  it("accepts the bounds 0 and 100 as thresholds", () => {
    expect(
      evaluateCoverageSummary(summary({ lines: metric(100), branches: metric(0) }), {
        lines: 100,
        branches: 0,
      }).outcome,
    ).toBe("pass")
  })
})
