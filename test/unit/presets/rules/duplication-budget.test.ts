import { beforeEach, describe, expect, it, vi } from "vitest"
import { duplication } from "../../../../src/presets/duplication.js"
import {
  type DuplicateBlock,
  type DuplicationSummary,
  evaluateDuplicationBudget,
} from "../../../../src/presets/rules/duplication-budget.js"
import { fakeCheckEvidence, fakeContext } from "../fixtures.js"

// The preset reads jscpd's report from a fixed relative path. duplication.test.ts explains why the
// read is mocked rather than written to disk.
const { readFile } = vi.hoisted(() => ({ readFile: vi.fn() }))
vi.mock("node:fs/promises", () => ({ readFile }))

beforeEach(() => {
  readFile.mockReset()
})

const blockA: DuplicateBlock = {
  lines: 10,
  tokens: 50,
  firstFile: { name: "src/a.ts", start: 1 },
  secondFile: { name: "src/b.ts", start: 20 },
}
const blockB: DuplicateBlock = {
  lines: 5,
  tokens: 25,
  firstFile: { name: "src/c.ts", start: 2 },
  secondFile: { name: "src/d.ts", start: 40 },
}

function summary(duplicates: readonly DuplicateBlock[], percentage: number): DuplicationSummary {
  return { duplicates, percentage, lines: 200, sources: 4 }
}

const listA = "- src/a.ts:1 duplicates src/b.ts:20 (10 lines / 50 tokens)"
const listB = "- src/c.ts:2 duplicates src/d.ts:40 (5 lines / 25 tokens)"

describe("R2 duplication budget", () => {
  it("a budget of 0 fails on one block", () => {
    expect(evaluateDuplicationBudget(summary([blockA], 0.01), 0)).toEqual({
      outcome: "fail",
      rationale: [
        "jscpd found 1 duplicated block(s) (0.01% of 200 lines across 4 file(s)):",
        listA,
      ].join("\n"),
    })
  })

  it("a budget of 0 fails on a block even when jscpd rounds its share to 0%", () => {
    expect(evaluateDuplicationBudget(summary([blockA], 0), 0).outcome).toBe("fail")
  })

  it("a budget of 0 passes with no blocks", () => {
    expect(evaluateDuplicationBudget(summary([], 0), 0)).toEqual({
      outcome: "pass",
      rationale: "jscpd found 0 duplicated block(s) across 4 file(s) (200 lines).",
    })
  })

  it("a positive budget passes with no blocks, with the same rationale as a budget of 0", () => {
    expect(evaluateDuplicationBudget(summary([], 0), 2)).toEqual(
      evaluateDuplicationBudget(summary([], 0), 0),
    )
  })

  it("a positive budget passes at or below it and lists every block", () => {
    const below = evaluateDuplicationBudget(summary([blockA, blockB], 0.5), 0.75)
    expect(below).toEqual({
      outcome: "pass",
      rationale: [
        "jscpd found 2 duplicated block(s) (0.50% of 200 lines across 4 file(s)), within the 0.75% budget:",
        listA,
        listB,
      ].join("\n"),
    })

    const at = evaluateDuplicationBudget(summary([blockA], 0.75), 0.75)
    expect(at.outcome).toBe("pass")
    expect(at.rationale).toContain("within the 0.75% budget")
  })

  it("a positive budget fails above it and states the percentage and the budget", () => {
    expect(evaluateDuplicationBudget(summary([blockA, blockB], 0.76), 0.75)).toEqual({
      outcome: "fail",
      rationale: [
        "jscpd found 2 duplicated block(s) (0.76% of 200 lines across 4 file(s)), above the 0.75% budget:",
        listA,
        listB,
      ].join("\n"),
    })
  })

  it("the duplication preset passes maxPercentage to the budget", async () => {
    readFile.mockResolvedValue(
      JSON.stringify({
        duplicates: [
          { format: "typescript", ...blockA, firstFile: { ...blockA.firstFile, end: 10 } },
        ],
        statistics: {
          total: { clones: 1, duplicatedLines: 10, lines: 1000, percentage: 1, sources: 9 },
        },
      }),
    )

    const within = await duplication({ maxPercentage: 2 }).policy(fakeContext(fakeCheckEvidence()))
    expect(within.outcome).toBe("pass")
    expect(within.rationale).toContain("within the 2% budget")

    const above = await duplication({ maxPercentage: 0.75 }).policy(
      fakeContext(fakeCheckEvidence()),
    )
    expect(above.outcome).toBe("fail")
    expect(above.rationale).toContain(
      "(1.00% of 1000 lines across 9 file(s)), above the 0.75% budget",
    )

    const byDefault = await duplication().policy(fakeContext(fakeCheckEvidence()))
    expect(byDefault.outcome).toBe("fail")
    expect(byDefault.rationale).not.toContain("budget")
  })

  it("maxPercentage leaves the run command unchanged", () => {
    expect(duplication({ maxPercentage: 2 }).run).toEqual(duplication().run)
  })

  it.each([
    ["negative", -0.1],
    ["NaN", Number.NaN],
    ["infinite", Number.POSITIVE_INFINITY],
    ["above 100", 100.5],
  ])("a %s maxPercentage is rejected when the preset is built", (_label, maxPercentage) => {
    expect(() => duplication({ maxPercentage })).toThrow(
      new RangeError(
        `duplication: maxPercentage must be a number from 0 to 100, got ${String(maxPercentage)}.`,
      ),
    )
  })

  it("accepts the bounds 0 and 100", () => {
    expect(() => duplication({ maxPercentage: 0 })).not.toThrow()
    expect(() => duplication({ maxPercentage: 100 })).not.toThrow()
  })
})
