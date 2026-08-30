import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { runWithConcurrency } from "../../src/execution/concurrency-pool.js"

/**
 * Property-based tests for runWithConcurrency's core bound: for any N items
 * and any concurrency limit K, at no point are more than K workers active
 * simultaneously, and every item's result lands at its original index
 * regardless of completion order.
 */
describe("runWithConcurrency -- property-based", () => {
  it("never runs more than the configured concurrency limit at once, and preserves result order", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 1, max: 10 }),
        async (itemCount, concurrency) => {
          const items = Array.from({ length: itemCount }, (_, index) => index)
          let active = 0
          let maxActive = 0

          const results = await runWithConcurrency(items, concurrency, async (item) => {
            active += 1
            maxActive = Math.max(maxActive, active)
            // A small, bounded delay is enough to force real overlap between
            // workers without making the property slow.
            await new Promise((resolve) => setTimeout(resolve, 1))
            active -= 1
            return item * 2
          })

          expect(results).toHaveLength(itemCount)
          for (let index = 0; index < itemCount; index += 1) {
            expect(results[index]).toBe(index * 2)
          }
          expect(maxActive).toBeLessThanOrEqual(Math.max(1, Math.min(concurrency, itemCount)))
        },
      ),
      { numRuns: 150 },
    )
  })
})
