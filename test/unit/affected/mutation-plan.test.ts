import { describe, expect, it } from "vitest"
import {
  MAX_MUTATION_SHARDS,
  MUTATION_SHARD_BYTES,
  mutationShardCount,
  planMutationShards,
  shardMatrix,
} from "../../../src/affected/index.js"
import type { MutatedFile } from "../../../src/affected/index.js"

const KIB = 1024

describe("mutationShardCount", () => {
  it("sizes one shard per 64 KiB of mutated source", () => {
    expect(MUTATION_SHARD_BYTES).toBe(65_536)
    expect(MAX_MUTATION_SHARDS).toBe(256)
    expect(mutationShardCount({ bytes: 1, files: 10 })).toBe(1)
    expect(mutationShardCount({ bytes: 65_536, files: 10 })).toBe(1)
    expect(mutationShardCount({ bytes: 65_537, files: 10 })).toBe(2)
    expect(mutationShardCount({ bytes: 5 * 65_536, files: 10 })).toBe(5)
  })

  it("plans one shard for files that are all empty", () => {
    expect(mutationShardCount({ bytes: 0, files: 3 })).toBe(1)
  })

  it("is 0 with no files", () => {
    expect(mutationShardCount({ bytes: 0, files: 0 })).toBe(0)
  })

  it("never plans more shards than files", () => {
    expect(mutationShardCount({ bytes: 100 * 65_536, files: 3 })).toBe(3)
  })

  it("never plans more than 256 shards", () => {
    expect(mutationShardCount({ bytes: 1000 * 65_536, files: 1000 })).toBe(256)
    expect(mutationShardCount({ bytes: 256 * 65_536 + 1, files: 300 })).toBe(256)
  })

  it.each([
    [{ bytes: -1, files: 1 }, "bytes"],
    [{ bytes: 1.5, files: 1 }, "bytes"],
    [{ bytes: Number.NaN, files: 1 }, "bytes"],
    [{ bytes: Number.POSITIVE_INFINITY, files: 1 }, "bytes"],
    [{ bytes: 1, files: -1 }, "files"],
    [{ bytes: 1, files: 0.5 }, "files"],
    [{ bytes: 1, files: 0 }, "files"],
  ])("rejects %j", (input, name) => {
    expect(() => mutationShardCount(input)).toThrow(RangeError)
    expect(() => mutationShardCount(input)).toThrow(name)
  })
})

describe("planMutationShards", () => {
  const files: MutatedFile[] = [
    { path: "src/big.ts", bytes: 100 * KIB },
    { path: "src/mid.ts", bytes: 60 * KIB },
    { path: "src/small.ts", bytes: 30 * KIB },
    { path: "src/tiny.ts", bytes: 2 * KIB },
  ]

  it("weights files by size and gives a matching matrix", () => {
    const plan = planMutationShards(files)
    expect(plan.files).toBe(4)
    expect(plan.bytes).toBe(192 * KIB)
    expect(plan.count).toBe(3)
    expect(plan.plan).toEqual({
      count: 3,
      shards: [["src/big.ts"], ["src/mid.ts"], ["src/small.ts", "src/tiny.ts"]],
      weightsMs: [100 * KIB, 60 * KIB, 32 * KIB],
    })
    expect(plan.matrix).toEqual(shardMatrix(3))
  })

  it("plans nothing when nothing is mutated", () => {
    expect(planMutationShards([])).toEqual({
      files: 0,
      bytes: 0,
      count: 0,
      plan: { count: 0, shards: [], weightsMs: [] },
      matrix: { include: [] },
    })
  })

  it("plans one shard for one empty file", () => {
    expect(planMutationShards([{ path: "src/a.ts", bytes: 0 }])).toMatchObject({
      count: 1,
      plan: { shards: [["src/a.ts"]], weightsMs: [0] },
    })
  })

  it("rejects a file listed twice", () => {
    const twice = [...files, { path: "src/tiny.ts", bytes: 2 * KIB }]
    expect(() => planMutationShards(twice)).toThrow(RangeError)
    expect(() => planMutationShards(twice)).toThrow("src/tiny.ts")
  })

  it.each([[-1], [0.5], [Number.NaN]])("rejects a size of %d bytes", (bytes) => {
    expect(() => planMutationShards([{ path: "src/a.ts", bytes }])).toThrow(RangeError)
    expect(() => planMutationShards([{ path: "src/a.ts", bytes }])).toThrow("src/a.ts")
  })

  it("rejects an empty path", () => {
    expect(() => planMutationShards([{ path: "", bytes: 1 }])).toThrow(RangeError)
    expect(() => planMutationShards([{ path: "", bytes: 1 }])).toThrow(
      "A mutated file needs a path.",
    )
  })
})
