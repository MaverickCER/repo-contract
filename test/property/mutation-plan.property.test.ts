import fc from "fast-check"
import { describe, expect, it } from "vitest"
import {
  MAX_MUTATION_SHARDS,
  MUTATION_SHARD_BYTES,
  mutationShardCount,
  planMutationShards,
} from "../../src/affected/index.js"

const KIB = 1024

/** Distinct paths with sizes, as a Stryker `mutate` set would give them. */
const mutatedFiles = (maxLength: number) =>
  fc
    .uniqueArray(fc.stringMatching(/^src\/[a-z]{1,8}\.ts$/), { maxLength })
    .chain((paths) =>
      fc
        .array(fc.nat({ max: 400 * KIB }), { minLength: paths.length, maxLength: paths.length })
        .map((sizes) => paths.map((path, index) => ({ path, bytes: sizes[index] ?? 0 }))),
    )

describe("mutationShardCount: property-based", () => {
  it("uses 64 KiB shards and at most 256 of them", () => {
    expect(MUTATION_SHARD_BYTES).toBe(65_536)
    expect(MAX_MUTATION_SHARDS).toBe(256)
  })

  const sizes = fc
    .record({ files: fc.integer({ min: 1, max: 2000 }), perFile: fc.nat({ max: 1_000_000 }) })
    .map(({ files, perFile }) => ({ files, bytes: files * perFile }))

  it("stays between 1 and min(files, 256)", () => {
    fc.assert(
      fc.property(sizes, (input) => {
        const count = mutationShardCount(input)
        expect(count).toBeGreaterThanOrEqual(1)
        expect(count).toBeLessThanOrEqual(Math.min(input.files, MAX_MUTATION_SHARDS))
      }),
    )
  })

  it("equals ceil(bytes / 65536) whenever that is within the bounds", () => {
    fc.assert(
      fc.property(sizes, (input) => {
        const raw = Math.ceil(input.bytes / MUTATION_SHARD_BYTES)
        if (raw >= 1 && raw <= Math.min(input.files, MAX_MUTATION_SHARDS)) {
          expect(mutationShardCount(input)).toBe(raw)
        }
      }),
    )
  })

  it("never falls when the bytes grow", () => {
    fc.assert(
      fc.property(sizes, fc.nat({ max: 10_000_000 }), (input, more) => {
        const grown = { ...input, bytes: input.bytes + more }
        expect(mutationShardCount(grown)).toBeGreaterThanOrEqual(mutationShardCount(input))
      }),
    )
  })

  it("never falls when the files grow", () => {
    fc.assert(
      fc.property(sizes, fc.nat({ max: 500 }), (input, more) => {
        const grown = { ...input, files: input.files + more }
        expect(mutationShardCount(grown)).toBeGreaterThanOrEqual(mutationShardCount(input))
      }),
    )
  })
})

describe("planMutationShards: property-based", () => {
  it("never plans more shards than files, nor more than 256", () => {
    fc.assert(
      fc.property(mutatedFiles(300), (input) => {
        const plan = planMutationShards(input)
        expect(plan.count).toBeLessThanOrEqual(Math.min(input.length, MAX_MUTATION_SHARDS))
        expect(plan.plan.count).toBe(plan.count)
        expect(plan.plan.shards).toHaveLength(plan.count)
        expect(plan.matrix.include).toHaveLength(plan.count)
      }),
      { numRuns: 50 },
    )
  })

  it("puts every file in exactly one non-empty shard", () => {
    fc.assert(
      fc.property(mutatedFiles(60), (input) => {
        const plan = planMutationShards(input)
        const placed = plan.plan.shards.flat()
        expect([...placed].sort()).toEqual(input.map((file) => file.path).sort())
        for (const shard of plan.plan.shards) expect(shard.length).toBeGreaterThan(0)
      }),
    )
  })

  it("reports each shard's weight as the bytes of its files", () => {
    fc.assert(
      fc.property(mutatedFiles(60), (input) => {
        const plan = planMutationShards(input)
        const size = new Map(input.map((file) => [file.path, file.bytes]))
        const weights = plan.plan.shards.map((shard) =>
          shard.reduce((total, path) => total + (size.get(path) ?? Number.NaN), 0),
        )
        expect(plan.plan.weightsMs).toEqual(weights)
        expect(plan.bytes).toBe(input.reduce((total, file) => total + file.bytes, 0))
      }),
    )
  })

  it("gives the same plan for the same files in any order", () => {
    fc.assert(
      fc.property(
        mutatedFiles(60).chain((input) =>
          fc.tuple(fc.constant(input), fc.shuffledSubarray(input, { minLength: input.length })),
        ),
        ([input, shuffled]) => {
          expect(planMutationShards(shuffled)).toEqual(planMutationShards(input))
        },
      ),
    )
  })

  it("never falls in shard count when a file grows", () => {
    fc.assert(
      fc.property(
        mutatedFiles(60).filter((input) => input.length > 0),
        fc.nat({ max: 1_000_000 }),
        (input, more) => {
          const [first, ...rest] = input
          const grown = [{ path: first?.path ?? "", bytes: (first?.bytes ?? 0) + more }, ...rest]
          expect(planMutationShards(grown).count).toBeGreaterThanOrEqual(
            planMutationShards(input).count,
          )
        },
      ),
    )
  })
})
