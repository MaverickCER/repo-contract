import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { runWithConcurrencyGraph } from "../../src/execution/dependency-scheduler.js"

/**
 * Property-based tests for runWithConcurrencyGraph's two documented
 * invariants: every item runs exactly once, and no item starts before every
 * one of its own dependencies has settled. Items only ever depend on
 * strictly earlier indexes, which trivially guarantees the generated graph
 * is acyclic (cycle rejection is exercised separately, deterministically,
 * below -- not left to chance generation).
 */

const ITEM_COUNT = 6

/** Item i's dependency bitmask only ever uses bits 0..i-1, so it can only reference strictly earlier items. */
function bitmaskToDeps(mask: number, index: number): number[] {
  const deps: number[] = []
  for (let bit = 0; bit < index; bit += 1) {
    if ((mask & (1 << bit)) !== 0) deps.push(bit)
  }
  return deps
}

const graphArbitrary = fc
  .tuple(
    fc.constant(0),
    fc.nat({ max: 2 ** 1 - 1 }),
    fc.nat({ max: 2 ** 2 - 1 }),
    fc.nat({ max: 2 ** 3 - 1 }),
    fc.nat({ max: 2 ** 4 - 1 }),
    fc.nat({ max: 2 ** 5 - 1 }),
  )
  .map((masks) => masks.map((mask, index) => bitmaskToDeps(mask, index)))

describe("runWithConcurrencyGraph -- property-based", () => {
  it("every item runs exactly once, and no item starts before all of its dependencies have settled", async () => {
    await fc.assert(
      fc.asyncProperty(
        graphArbitrary,
        fc.integer({ min: 1, max: ITEM_COUNT }),
        async (deps, concurrency) => {
          // A logical, monotonically-increasing counter -- not wall-clock
          // time -- so ordering assertions never depend on timer resolution.
          let clock = 0
          const tick = (): number => {
            clock += 1
            return clock
          }
          const runCounts = new Map<number, number>()

          const results = await runWithConcurrencyGraph(
            deps,
            concurrency,
            (_item, index) => deps[index] ?? [],
            async (_item, index) => {
              runCounts.set(index, (runCounts.get(index) ?? 0) + 1)
              const startTick = tick()
              await new Promise((resolve) => setTimeout(resolve, 1))
              const endTick = tick()
              return { index, startTick, endTick }
            },
          )

          expect(results).toHaveLength(deps.length)
          for (let index = 0; index < deps.length; index += 1) {
            expect(runCounts.get(index)).toBe(1)
          }

          for (let index = 0; index < deps.length; index += 1) {
            const own = results[index]
            for (const depIndex of deps[index] ?? []) {
              const dep = results[depIndex]
              expect(dep?.endTick).toBeLessThanOrEqual(own?.startTick ?? -Infinity)
            }
          }
        },
      ),
      { numRuns: 150 },
    )
  })

  it("a 2-cycle is always rejected -- runWithConcurrencyGraph never silently hangs or partially runs a cyclic graph", async () => {
    const items = ["a", "b"]
    const cyclicDeps = [[1], [0]]

    await expect(
      runWithConcurrencyGraph(
        items,
        2,
        (_item, index) => cyclicDeps[index] ?? [],
        async (item) => item,
      ),
    ).rejects.toThrow(/not acyclic/)
  })
})
