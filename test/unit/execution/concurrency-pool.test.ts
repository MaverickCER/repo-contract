import { describe, expect, it } from "vitest"
import { runWithConcurrency } from "../../../src/execution/concurrency-pool.js"

describe("runWithConcurrency", () => {
  it("returns an empty array for zero items", async () => {
    const results = await runWithConcurrency<number, number>([], 4, (item) =>
      Promise.resolve(item * 2),
    )
    expect(results).toEqual([])
  })

  it("runs a single item", async () => {
    const results = await runWithConcurrency([5], 4, (item) => Promise.resolve(item * 2))
    expect(results).toEqual([10])
  })

  it("preserves result order matching input order regardless of completion order", async () => {
    const delays = [30, 10, 20]
    const results = await runWithConcurrency(delays, 3, (delayMs, index) => {
      return new Promise<number>((resolve) => {
        setTimeout(() => {
          resolve(index)
        }, delayMs)
      })
    })
    // index 0 (30ms) finishes last, index 1 (10ms) finishes first -- output
    // order must still be [0, 1, 2], matching input order, not completion order.
    expect(results).toEqual([0, 1, 2])
  })

  it("never runs more than `concurrency` tasks at once", async () => {
    const items = Array.from({ length: 10 }, (_, i) => i)
    let inFlight = 0
    let maxInFlight = 0

    await runWithConcurrency(items, 3, async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 10))
      inFlight -= 1
    })

    expect(maxInFlight).toBeLessThanOrEqual(3)
  })

  it("runs every item exactly once", async () => {
    const items = Array.from({ length: 20 }, (_, i) => i)
    const seen: number[] = []

    await runWithConcurrency(items, 4, (item) => {
      seen.push(item)
      return Promise.resolve()
    })

    expect(seen.slice().sort((a, b) => a - b)).toEqual(items)
  })

  it("clamps concurrency to the number of items when concurrency exceeds item count", async () => {
    let maxInFlight = 0
    let inFlight = 0
    await runWithConcurrency([1, 2], 100, async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight -= 1
    })
    expect(maxInFlight).toBeLessThanOrEqual(2)
  })

  it("treats a concurrency of 1 as fully sequential", async () => {
    const items = [1, 2, 3]
    const order: number[] = []
    await runWithConcurrency(items, 1, async (item) => {
      order.push(item)
      await new Promise((resolve) => setTimeout(resolve, 5))
    })
    expect(order).toEqual([1, 2, 3])
  })

  it("still processes every item when concurrency is 0 or negative -- clamps up to at least 1 worker", async () => {
    const results = await runWithConcurrency([1, 2, 3], 0, (item) => Promise.resolve(item * 2))
    expect(results).toEqual([2, 4, 6])
  })

  it("propagates a worker rejection -- the exact rejection value, unwrapped", async () => {
    const boom = new Error("boom")
    await expect(
      runWithConcurrency([1, 2, 3], 2, (item) => {
        if (item === 2) return Promise.reject(boom)
        return Promise.resolve(item)
      }),
      // `.toBe(boom)`, not `.toThrow("boom")`: vitest's `.rejects.toThrow(msg)`
      // passes for a rejection value of `undefined` regardless of `msg`, so it
      // would not notice the first rejection being recorded without its error.
    ).rejects.toBe(boom)
  })

  it("stops pulling new work as soon as any worker has rejected", async () => {
    const started: number[] = []
    await expect(
      runWithConcurrency([0, 1, 2, 3, 4, 5], 2, async (item) => {
        started.push(item)
        if (item === 1) throw new Error("stop")
        await new Promise((resolve) => setTimeout(resolve, 10))
        return item
      }),
    ).rejects.toThrow("stop")
    // Concurrency 2: the two workers pick up items 0 and 1; item 1 rejects
    // before item 0's timer fires, so neither worker should ever advance to
    // item 2. Without the early-out, every remaining item still runs.
    expect(started).toEqual([0, 1])
  })

  it("propagates the FIRST rejection and does not leak a later sibling rejection as unhandled", async () => {
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown): void => void unhandled.push(reason)
    process.on("unhandledRejection", onUnhandled)
    try {
      // Concurrency 8 so every item is genuinely in flight at once: item 2
      // rejects immediately, and item 7's worker -- already running -- rejects
      // only after a tick, i.e. after Promise.all would already have rejected.
      // With concurrency 2 the pool would stop pulling work after item 2 and
      // item 7 would never start, making this vacuous. With the old code that
      // late rejection had no handler.
      await expect(
        runWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8], 8, async (item) => {
          if (item === 2) throw new Error("first")
          if (item === 7) {
            await Promise.resolve()
            throw new Error("later sibling")
          }
          return item
        }),
      ).rejects.toThrow("first")
      await new Promise((r) => setTimeout(r, 20))
      expect(unhandled).toEqual([])
    } finally {
      process.off("unhandledRejection", onUnhandled)
    }
  })
})
