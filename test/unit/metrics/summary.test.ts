import { describe, expect, it } from "vitest"
import { createRunRecord } from "../../../src/metrics/record.js"
import type { RunRecordInput } from "../../../src/metrics/record.js"
import { pillarCoverage, summarizeRuns } from "../../../src/metrics/summary.js"

let clock = 0
const run = (patch: Partial<RunRecordInput> = {}) => {
  clock += 1
  return createRunRecord({
    startedAt: new Date(Date.UTC(2026, 10, clock)).toISOString(),
    durationMs: 1000,
    scope: "affected",
    checks: [{ id: "lint", durationMs: 100, verdict: "pass" }],
    ...patch,
  })
}
const failing = (id: string, pillar?: "security") => ({
  id,
  durationMs: 100,
  verdict: "fail" as const,
  ...(pillar ? { pillar } : {}),
})

describe("summarizeRuns", () => {
  it("is all zeros and no ratios for no runs", () => {
    expect(summarizeRuns([])).toEqual({
      runs: 0,
      passed: 0,
      failed: 0,
      totalDurationMs: 0,
      failuresByCheck: {},
      failuresByPillar: {},
      wideningsByReason: {},
    })
  })

  it("counts passes and failures, a warn counting as a pass", () => {
    const summary = summarizeRuns([
      run(),
      run({ checks: [{ id: "a", durationMs: 1, verdict: "warn" }] }),
      run({ checks: [failing("tests")] }),
    ])
    expect(summary).toMatchObject({ runs: 3, passed: 2, failed: 1, passRate: 2 / 3 })
  })

  it("tallies failures per check and per pillar, ignoring checks that passed", () => {
    const summary = summarizeRuns([
      run({
        checks: [failing("audit", "security"), { id: "lint", durationMs: 1, verdict: "pass" }],
      }),
      run({ checks: [failing("audit", "security"), failing("tests")] }),
    ])
    expect(summary.failuresByCheck).toEqual({ audit: 2, tests: 1 })
    expect(summary.failuresByPillar).toEqual({ security: 2 })
  })

  it("measures the cache hit ratio over checks that consulted the cache, ignoring off", () => {
    const summary = summarizeRuns([
      run({
        checks: [
          { id: "a", durationMs: 1, verdict: "pass", cache: "hit" },
          { id: "b", durationMs: 1, verdict: "pass", cache: "miss" },
          { id: "c", durationMs: 1, verdict: "pass", cache: "hit" },
          { id: "d", durationMs: 1, verdict: "pass", cache: "off" },
        ],
      }),
    ])
    expect(summary.cacheHitRatio).toBe(2 / 3)
  })

  it("has no cache ratio when no check consulted the cache", () => {
    expect(summarizeRuns([run()])).not.toHaveProperty("cacheHitRatio")
  })

  it("measures the affected ratio from runs that know both counts, ignoring full runs", () => {
    const summary = summarizeRuns([
      run({ affectedTests: 5, totalTests: 100 }),
      run({ affectedTests: 15, totalTests: 100 }),
      run({ scope: "full", affectedTests: 100, totalTests: 100 }),
      run({ affectedTests: 3 }),
    ])
    expect(summary.affectedRatio).toBeCloseTo(0.1)
  })

  it("estimates the minutes an affected run saved against the mean full run", () => {
    const summary = summarizeRuns([
      run({ scope: "full", durationMs: 600_000 }),
      run({ scope: "full", durationMs: 1_000_000 }),
      run({ scope: "affected", durationMs: 100_000 }),
      run({ scope: "affected", durationMs: 200_000 }),
    ])
    // mean full = 800_000; saved = (800k-100k)+(800k-200k) = 1_300_000ms
    expect(summary.minutesSaved).toBeCloseTo(1_300_000 / 60_000)
  })

  it("never reports negative savings and needs a full run to compare with", () => {
    expect(summarizeRuns([run({ durationMs: 100 })])).not.toHaveProperty("minutesSaved")
    const summary = summarizeRuns([
      run({ scope: "full", durationMs: 100 }),
      run({ scope: "affected", durationMs: 900 }),
    ])
    expect(summary.minutesSaved).toBe(0)
  })

  it("counts widenings by reason", () => {
    const summary = summarizeRuns([
      run({ widenings: ["global-trigger", "dynamic-import"] }),
      run({ widenings: ["global-trigger"] }),
    ])
    expect(summary.wideningsByReason).toEqual({ "global-trigger": 2, "dynamic-import": 1 })
  })

  it("measures first-pass rate over changes: the share whose earliest run passed", () => {
    const summary = summarizeRuns([
      run({ change: "pr-1", checks: [failing("tests")] }),
      run({ change: "pr-1" }),
      run({ change: "pr-2" }),
      run({ change: "pr-3", checks: [failing("tests")] }),
      run(),
    ])
    expect(summary.firstPassRate).toBeCloseTo(1 / 3)
  })

  it("orders a change's runs by time, whatever order they were given in", () => {
    const early = run({ change: "pr-1" })
    const late = run({ change: "pr-1", checks: [failing("tests")] })
    expect(summarizeRuns([late, early]).firstPassRate).toBe(1)
  })

  it("reports the mutation score trend and the latest exception and suppression counts", () => {
    const summary = summarizeRuns([
      run({ mutationScore: 90, exceptions: 4, suppressions: 10 }),
      run(),
      run({ mutationScore: 99, exceptions: 2, suppressions: 8 }),
    ])
    expect(summary.mutationScore).toEqual({ first: 90, latest: 99, delta: 9 })
    expect(summary.latestExceptions).toBe(2)
    expect(summary.latestSuppressions).toBe(8)
  })

  it("filters by actor and by start time", () => {
    const records = [
      run({ actor: "agent" }),
      run({ actor: "human", checks: [failing("tests")] }),
      run({ actor: "agent" }),
    ]
    expect(summarizeRuns(records, { actor: "agent" }).runs).toBe(2)
    expect(summarizeRuns(records, { actor: "human" }).failed).toBe(1)
    expect(summarizeRuns(records, { since: records[1]!.startedAt }).runs).toBe(2)
  })

  it("adds up the run time", () => {
    expect(summarizeRuns([run({ durationMs: 10 }), run({ durationMs: 32 })]).totalDurationMs).toBe(
      42,
    )
  })
})

describe("pillarCoverage", () => {
  it("counts the checks of each pillar and lists the pillars with none", () => {
    const coverage = pillarCoverage([
      { id: "a", pillar: "correctness" },
      { id: "b", pillar: "correctness" },
      { id: "c", pillar: "security" },
      { id: "d" },
    ])
    expect(coverage.counts).toEqual({
      correctness: 2,
      security: 1,
      performance: 0,
      accessibility: 0,
      compliance: 0,
      maintainability: 0,
    })
    expect(coverage.missing).toEqual([
      "performance",
      "accessibility",
      "compliance",
      "maintainability",
    ])
    expect(coverage.unclassified).toEqual(["d"])
  })

  it("has nothing missing when every pillar is covered", () => {
    const coverage = pillarCoverage(
      [
        "correctness",
        "security",
        "performance",
        "accessibility",
        "compliance",
        "maintainability",
      ].map((pillar) => ({ id: pillar, pillar: pillar as never })),
    )
    expect(coverage.missing).toEqual([])
    expect(coverage.unclassified).toEqual([])
  })
})

describe("summarizeRuns details", () => {
  it("counts a run as failed when any one of its checks failed", () => {
    const summary = summarizeRuns([
      run({
        checks: [
          { id: "a", durationMs: 1, verdict: "pass" },
          { id: "b", durationMs: 1, verdict: "fail" },
        ],
      }),
    ])
    expect(summary).toMatchObject({ runs: 1, passed: 0, failed: 1, passRate: 0 })
  })

  it("orders runs by time whatever order they come in, and keeps ties in arrival order", () => {
    const early = run({ mutationScore: 80 })
    const late = run({ mutationScore: 95 })
    expect(summarizeRuns([late, early]).mutationScore).toEqual({ first: 80, latest: 95, delta: 15 })
    const a = createRunRecord({
      startedAt: "2026-12-01T00:00:00.000Z",
      durationMs: 1,
      scope: "affected",
      checks: [],
      mutationScore: 1,
    })
    const b = createRunRecord({
      startedAt: "2026-12-01T00:00:00.000Z",
      durationMs: 1,
      scope: "affected",
      checks: [],
      mutationScore: 2,
    })
    expect(summarizeRuns([a, b]).mutationScore?.latest).toBe(2)
    expect(summarizeRuns([b, a]).mutationScore?.latest).toBe(1)
  })

  it("takes the first and the latest mutation score from the runs that recorded one", () => {
    const summary = summarizeRuns([
      run(),
      run({ mutationScore: 70 }),
      run({ mutationScore: 75 }),
      run({ mutationScore: 90 }),
      run(),
    ])
    expect(summary.mutationScore).toEqual({ first: 70, latest: 90, delta: 20 })
    expect(summarizeRuns([run({ mutationScore: 50 })]).mutationScore).toEqual({
      first: 50,
      latest: 50,
      delta: 0,
    })
  })

  it("takes the latest exception and suppression counts from the last run that recorded one", () => {
    const summary = summarizeRuns([
      run({ exceptions: 9, suppressions: 7 }),
      run({ exceptions: 4, suppressions: 3 }),
      run({ exceptions: 2, suppressions: 1 }),
      run(),
    ])
    expect(summary.latestExceptions).toBe(2)
    expect(summary.latestSuppressions).toBe(1)
  })

  it("leaves out the fields no run supports", () => {
    const summary = summarizeRuns([run()])
    for (const name of [
      "mutationScore",
      "latestExceptions",
      "latestSuppressions",
      "firstPassRate",
      "affectedRatio",
      "cacheHitRatio",
      "minutesSaved",
    ]) {
      expect(summary).not.toHaveProperty(name)
    }
    expect(summary.wideningsByReason).toEqual({})
  })

  it("ignores a run's test total when it recorded no affected count", () => {
    const summary = summarizeRuns([
      run({ totalTests: 100 }),
      run({ affectedTests: 5, totalTests: 100 }),
    ])
    expect(summary.affectedRatio).toBeCloseTo(0.05)
  })

  it("counts only runs with a positive test total toward the affected ratio", () => {
    const summary = summarizeRuns([
      run({ affectedTests: 0, totalTests: 0 }),
      run({ affectedTests: 1, totalTests: 10 }),
    ])
    expect(summary.affectedRatio).toBeCloseTo(0.1)
  })
})
