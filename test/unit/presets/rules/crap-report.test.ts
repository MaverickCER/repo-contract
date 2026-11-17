import { describe, expect, it } from "vitest"
import { evaluateCrapReport } from "../../../../src/presets/rules/crap-report.js"

const LIMITS = { threshold: 30, maxComplexity: 20 }

const fn = (name: string, crap: unknown, complexity: unknown, startLine = 1) => ({
  file: "src/a.ts",
  name,
  startLine,
  complexity,
  crap,
})

describe("R7b crap report", () => {
  it("passes when every function is within both ceilings", () => {
    expect(
      evaluateCrapReport({ threshold: 99, functions: [fn("a", 30, 20), fn("b", 2, 1)] }, LIMITS),
    ).toEqual({
      outcome: "pass",
      rationale: "crap4ts scored 2 function(s); none is above CRAP 30 or cyclomatic complexity 20.",
    })
  })

  it("fails on a function above the CRAP threshold, worst first", () => {
    expect(
      evaluateCrapReport(
        { functions: [fn("low", 31, 5, 3), fn("high", 56.25, 6, 9), fn("ok", 4, 2)] },
        LIMITS,
      ),
    ).toEqual({
      outcome: "fail",
      rationale: [
        "2 function(s) are above CRAP 30:",
        "- src/a.ts:9 high: CRAP 56.25",
        "- src/a.ts:3 low: CRAP 31",
        "Split each function or cover its branches.",
      ].join("\n"),
    })
  })

  it("fails on a function above the complexity ceiling however well covered", () => {
    expect(
      evaluateCrapReport(
        { functions: [fn("branchy", 21, 21, 4), fn("ok", 20, 20)] },
        {
          threshold: 40,
          maxComplexity: 20,
        },
      ),
    ).toEqual({
      outcome: "fail",
      rationale: [
        "1 function(s) are above cyclomatic complexity 20:",
        "- src/a.ts:4 branchy: complexity 21",
        "Split each function or cover its branches.",
      ].join("\n"),
    })
  })

  it("lists both sections when functions trip both ceilings", () => {
    expect(evaluateCrapReport({ functions: [fn("both", 500, 25, 2)] }, LIMITS).rationale).toBe(
      [
        "1 function(s) are above CRAP 30:",
        "- src/a.ts:2 both: CRAP 500",
        "1 function(s) are above cyclomatic complexity 20:",
        "- src/a.ts:2 both: complexity 25",
        "Split each function or cover its branches.",
      ].join("\n"),
    )
  })

  it("judges against the limits passed in, not the threshold the report echoes", () => {
    expect(
      evaluateCrapReport({ threshold: 100, functions: [fn("a", 50, 5)] }, LIMITS).outcome,
    ).toBe("fail")
  })

  it.each([
    ["null", null, 1],
    ["a string", "12", 1],
    ["NaN", Number.NaN, 1],
    ["missing complexity", 12, undefined],
  ])("fails on a function whose score is not a finite number: %s", (_label, crap, complexity) => {
    const shown = (value: unknown): string =>
      value === undefined ? "undefined" : JSON.stringify(value)
    expect(evaluateCrapReport({ functions: [fn("bad", crap, complexity, 7)] }, LIMITS)).toEqual({
      outcome: "fail",
      rationale: [
        "crap4ts reported 1 function(s) with a CRAP or complexity score that is not a finite number:",
        `- src/a.ts:7 bad: CRAP ${shown(crap)}, complexity ${shown(complexity)}`,
      ].join("\n"),
    })
  })

  it.each([
    ["null", null],
    ["a number", 5],
    ["a string", "fn"],
  ])("fails on a function entry that is %s", (_label, entry) => {
    expect(evaluateCrapReport({ functions: [fn("ok", 1, 1), entry] }, LIMITS)).toEqual({
      outcome: "fail",
      rationale: "crap4ts produced an invalid report: a function entry is not an object.",
    })
  })

  it("lists functions above the complexity ceiling most complex first", () => {
    const functions = [
      fn("c22", 1, 22, 1),
      fn("c25", 1, 25, 2),
      fn("c21", 1, 21, 3),
      fn("c24", 1, 24, 4),
    ]
    expect(evaluateCrapReport({ functions }, LIMITS).rationale).toBe(
      [
        "4 function(s) are above cyclomatic complexity 20:",
        "- src/a.ts:2 c25: complexity 25",
        "- src/a.ts:4 c24: complexity 24",
        "- src/a.ts:1 c22: complexity 22",
        "- src/a.ts:3 c21: complexity 21",
        "Split each function or cover its branches.",
      ].join("\n"),
    )
  })

  it.each([
    ["functions is missing", {}],
    ["functions is an object", { functions: {} }],
    ["the report is null", null],
    ["the report is undefined", undefined],
    ["the report is a string", "report"],
  ])("fails when functions is not an array: %s", (_label, report) => {
    expect(evaluateCrapReport(report, LIMITS)).toEqual({
      outcome: "fail",
      rationale: "crap4ts produced an invalid report: `functions` is not an array.",
    })
  })

  it("passes an empty function list and says nothing was scored", () => {
    expect(evaluateCrapReport({ functions: [] }, LIMITS)).toEqual({
      outcome: "pass",
      rationale: "crap4ts scored 0 function(s); none is above CRAP 30 or cyclomatic complexity 20.",
    })
  })
})
