import { describe, expect, it } from "vitest"
import {
  mergeMutationReports,
  parseShardSpec,
  planShards,
  shardMatrix,
} from "../../../src/affected/shard.js"

describe("parseShardSpec", () => {
  it("reads multi-digit indexes and totals", () => {
    expect(parseShardSpec("12/20")).toEqual({ ok: true, index: 12, total: 20 })
    expect(parseShardSpec("3/10")).toEqual({ ok: true, index: 3, total: 10 })
    expect(parseShardSpec("10/10")).toEqual({ ok: true, index: 10, total: 10 })
  })

  it("reads index/total, one-based", () => {
    expect(parseShardSpec("2/5")).toEqual({ ok: true, index: 2, total: 5 })
    expect(parseShardSpec("1/1")).toEqual({ ok: true, index: 1, total: 1 })
  })

  it.each(["", "2", "0/3", "4/3", "1/0", "a/b", "1/2/3", "-1/3", "1.5/3", " 1/3"])(
    "rejects %j",
    (text) => {
      const result = parseShardSpec(text)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain("<index>/<total>")
      }
    },
  )
})

describe("planShards", () => {
  it("puts every target in exactly one shard, sorted within it", () => {
    const targets = ["src/e.ts", "src/a.ts", "src/d.ts", "src/b.ts", "src/c.ts"]
    const plan = planShards({ targets, shards: 2 })
    expect(plan.count).toBe(2)
    expect(plan.shards.flat().sort()).toEqual([...targets].sort())
    for (const shard of plan.shards) {
      expect(shard).toEqual([...shard].sort())
    }
  })

  it("is deterministic and ignores the order the targets arrive in", () => {
    const a = planShards({ targets: ["x.ts", "y.ts", "z.ts"], shards: 2 })
    const b = planShards({ targets: ["z.ts", "x.ts", "y.ts"], shards: 2 })
    expect(a).toEqual(b)
  })

  it("balances by recorded time, heaviest first, ties to the earliest shard", () => {
    const plan = planShards({
      targets: ["a.ts", "b.ts", "c.ts", "d.ts"],
      shards: 2,
      timingsMs: { "a.ts": 90, "b.ts": 50, "c.ts": 40, "d.ts": 10 },
    })
    expect(plan.shards).toEqual([
      ["a.ts", "d.ts"],
      ["b.ts", "c.ts"],
    ])
    expect(plan.weightsMs).toEqual([100, 90])
  })

  it("weighs a file without a timing as the mean of the known ones", () => {
    const plan = planShards({
      targets: ["a.ts", "b.ts", "new.ts"],
      shards: 2,
      timingsMs: { "a.ts": 100, "b.ts": 300 },
    })
    // new.ts weighs 200: a(100)+new(200)=300 vs b(300)
    expect(plan.shards).toEqual([["b.ts"], ["a.ts", "new.ts"]])
  })

  it("weighs every file equally when nothing is known", () => {
    const plan = planShards({ targets: ["a.ts", "b.ts", "c.ts", "d.ts"], shards: 2 })
    expect(plan.shards.map((shard) => shard.length)).toEqual([2, 2])
  })

  it("sizes the count from the time budget when asked to, never above max or the target count", () => {
    const timingsMs = { "a.ts": 600_000, "b.ts": 600_000, "c.ts": 600_000, "d.ts": 600_000 }
    const targets = Object.keys(timingsMs)
    expect(planShards({ targets, timingsMs, targetMinutes: 10 }).count).toBe(4)
    expect(planShards({ targets, timingsMs, targetMinutes: 10, max: 3 }).count).toBe(3)
    expect(planShards({ targets, timingsMs, targetMinutes: 30 }).count).toBe(2)
    expect(planShards({ targets, timingsMs, targetMinutes: 1000 }).count).toBe(1)
    expect(
      planShards({ targets: ["a.ts"], timingsMs: { "a.ts": 9e9 }, targetMinutes: 1 }).count,
    ).toBe(1)
  })

  it("rounds the time-based count up", () => {
    const plan = planShards({
      targets: ["a.ts", "b.ts"],
      timingsMs: { "a.ts": 700_000, "b.ts": 100_000 },
      targetMinutes: 10,
    })
    expect(plan.count).toBe(2)
  })

  it("plans one empty shard when there is nothing to mutate", () => {
    expect(planShards({ targets: [], shards: 3 })).toEqual({
      count: 1,
      shards: [[]],
      weightsMs: [0],
    })
  })

  it("never plans more shards than targets, even when asked", () => {
    expect(planShards({ targets: ["a.ts", "b.ts"], shards: 5 }).count).toBe(2)
  })

  it("defaults to one shard with no count and no budget", () => {
    expect(planShards({ targets: ["a.ts", "b.ts"] }).count).toBe(1)
  })

  it("rejects counts that are not positive whole numbers, naming the option", () => {
    const plan = (patch: object) => () => planShards({ targets: ["a.ts"], ...patch })
    expect(plan({ shards: 0 })).toThrow(new RangeError("shards must be a positive whole number."))
    expect(plan({ shards: 1.5 })).toThrow(new RangeError("shards must be a positive whole number."))
    expect(plan({ shards: -2 })).toThrow(RangeError)
    expect(plan({ targetMinutes: 0 })).toThrow(
      new RangeError("targetMinutes must be a positive number."),
    )
    expect(plan({ targetMinutes: -1 })).toThrow(RangeError)
    expect(plan({ targetMinutes: 5, max: 0 })).toThrow(
      new RangeError("max must be a positive whole number."),
    )
    expect(plan({ targetMinutes: 5, max: 1.5 })).toThrow(
      new RangeError("max must be a positive whole number."),
    )
  })

  it("accepts a fractional time budget, since minutes need not be whole", () => {
    const timingsMs = { "a.ts": 60_000, "b.ts": 60_000 }
    expect(planShards({ targets: ["a.ts", "b.ts"], timingsMs, targetMinutes: 0.5 }).count).toBe(2)
  })

  it("sorts targets that arrive out of order, ties by name", () => {
    const plan = planShards({ targets: ["c.ts", "a.ts", "b.ts"], shards: 1 })
    expect(plan.shards).toEqual([["a.ts", "b.ts", "c.ts"]])
    const tied = planShards({ targets: ["z.ts", "m.ts", "a.ts", "q.ts"], shards: 2 })
    expect(tied.shards).toEqual([
      ["a.ts", "q.ts"],
      ["m.ts", "z.ts"],
    ])
  })
})

describe("shardMatrix", () => {
  it("is a GitHub Actions matrix with one entry per shard", () => {
    expect(shardMatrix(3)).toEqual({
      include: [
        { shard: 1, total: 3, spec: "1/3" },
        { shard: 2, total: 3, spec: "2/3" },
        { shard: 3, total: 3, spec: "3/3" },
      ],
    })
  })
})

const report = (files: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  schemaVersion: "2",
  thresholds: { high: 80, low: 60 },
  files,
  ...extra,
})
const file = (id: string) => ({
  language: "typescript",
  source: id,
  mutants: [{ id, status: "Killed" }],
})

describe("mergeMutationReports", () => {
  it("combines the files of every shard into one report, sorted by path", () => {
    const result = mergeMutationReports(
      [
        { shard: 2, report: report({ "src/b.ts": file("b") }) },
        { shard: 1, report: report({ "src/a.ts": file("a") }) },
      ],
      2,
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(Object.keys((result.report as { files: object }).files)).toEqual([
        "src/a.ts",
        "src/b.ts",
      ])
      expect((result.report as { schemaVersion: string }).schemaVersion).toBe("2")
    }
  })

  it("fails when a shard is missing", () => {
    const result = mergeMutationReports([{ shard: 1, report: report({}) }], 2)
    expect(result).toEqual({
      ok: false,
      error: "Expected 2 shard reports but got 1; missing shard 2.",
    })
  })

  it("fails on a duplicated or out-of-range shard", () => {
    expect(
      mergeMutationReports(
        [
          { shard: 1, report: report({}) },
          { shard: 1, report: report({}) },
        ],
        2,
      ),
    ).toEqual({ ok: false, error: "Shard 1 was reported more than once." })
    expect(
      mergeMutationReports(
        [
          { shard: 1, report: report({}) },
          { shard: 3, report: report({}) },
        ],
        2,
      ),
    ).toEqual({ ok: false, error: "Shard 3 is outside 1..2." })
  })

  it("fails on a shard that is zero, negative or not a whole number", () => {
    for (const shard of [0, -1, 1.5, Number.NaN]) {
      const result = mergeMutationReports([{ shard, report: report({}) }], 1)
      expect(result).toEqual({ ok: false, error: `Shard ${String(shard)} is outside 1..1.` })
    }
  })

  it("orders by shard number whatever order they arrive in: the lowest shard's fields win", () => {
    const result = mergeMutationReports(
      [
        { shard: 2, report: report({ "b.ts": file("b") }, { framework: { name: "second" } }) },
        { shard: 1, report: report({ "a.ts": file("a") }, { framework: { name: "first" } }) },
      ],
      2,
    )
    expect(result.ok && (result.report as { framework: { name: string } }).framework.name).toBe(
      "first",
    )
  })

  it("names the lower shard first when two shards mutated the same file", () => {
    const result = mergeMutationReports(
      [
        { shard: 2, report: report({ "a.ts": file("2") }) },
        { shard: 1, report: report({ "a.ts": file("1") }) },
      ],
      2,
    )
    expect(result).toEqual({ ok: false, error: "a.ts appears in shards 1 and 2." })
  })

  it("sorts files by path even when later shards hold earlier paths", () => {
    const result = mergeMutationReports(
      [
        { shard: 1, report: report({ "z.ts": file("z"), "m.ts": file("m") }) },
        { shard: 2, report: report({ "a.ts": file("a") }) },
      ],
      2,
    )
    expect(result.ok).toBe(true)
    const files = result.ok ? (result.report as { files: object }).files : {}
    expect(Object.keys(files)).toEqual(["a.ts", "m.ts", "z.ts"])
  })

  it("fails when two shards mutated the same file", () => {
    const result = mergeMutationReports(
      [
        { shard: 1, report: report({ "src/a.ts": file("a") }) },
        { shard: 2, report: report({ "src/a.ts": file("a2") }) },
      ],
      2,
    )
    expect(result).toEqual({ ok: false, error: "src/a.ts appears in shards 1 and 2." })
  })

  it("fails on a report that is not a mutation report", () => {
    expect(mergeMutationReports([{ shard: 1, report: "nope" }], 1)).toEqual({
      ok: false,
      error: "Shard 1 is not a mutation report (no files object).",
    })
    expect(mergeMutationReports([{ shard: 1, report: { files: [] } }], 1)).toEqual({
      ok: false,
      error: "Shard 1 is not a mutation report (no files object).",
    })
    expect(mergeMutationReports([{ shard: 1, report: null }], 1)).toEqual({
      ok: false,
      error: "Shard 1 is not a mutation report (no files object).",
    })
  })

  it("fails when shards disagree on the schema version", () => {
    const result = mergeMutationReports(
      [
        { shard: 1, report: report({}) },
        { shard: 2, report: { ...report({}), schemaVersion: "3" } },
      ],
      2,
    )
    expect(result).toEqual({
      ok: false,
      error: 'Shard 2 uses schema version "3" but shard 1 uses "2".',
    })
  })

  it("keeps the first shard's other fields and merges test files without overwriting", () => {
    const result = mergeMutationReports(
      [
        {
          shard: 1,
          report: report(
            { "a.ts": file("a") },
            { framework: { name: "vitest" }, testFiles: { "t.test.ts": { tests: [1] } } },
          ),
        },
        {
          shard: 2,
          report: report(
            { "b.ts": file("b") },
            {
              framework: { name: "other" },
              testFiles: { "t.test.ts": { tests: [2] }, "u.test.ts": { tests: [3] } },
            },
          ),
        },
      ],
      2,
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      const merged = result.report as {
        framework: { name: string }
        testFiles: Record<string, unknown>
      }
      expect(merged.framework.name).toBe("vitest")
      expect(merged.testFiles).toEqual({ "t.test.ts": { tests: [1] }, "u.test.ts": { tests: [3] } })
    }
  })

  it("does not invent test files when no shard has any", () => {
    const result = mergeMutationReports([{ shard: 1, report: report({}) }], 1)
    expect(result.ok && "testFiles" in (result.report as object)).toBe(false)
  })

  it("fails for a total that is not a positive whole number", () => {
    expect(mergeMutationReports([], 0)).toEqual({
      ok: false,
      error: "The shard total must be a positive whole number.",
    })
  })
})
