import { describe, expect, it } from "vitest"
import { runWithConcurrencyGraph } from "../../../src/execution/dependency-scheduler.js"

const noDeps = (): readonly number[] => []

describe("runWithConcurrencyGraph -- zero-edges equivalence with runWithConcurrency", () => {
  it("returns an empty array for zero items", async () => {
    const results = await runWithConcurrencyGraph<number, number>([], 4, noDeps, (item) =>
      Promise.resolve(item * 2),
    )
    expect(results).toEqual([])
  })

  it("runs a single item", async () => {
    const results = await runWithConcurrencyGraph([5], 4, noDeps, (item) =>
      Promise.resolve(item * 2),
    )
    expect(results).toEqual([10])
  })

  it("preserves result order matching input order regardless of completion order", async () => {
    const delays = [30, 10, 20]
    const results = await runWithConcurrencyGraph(delays, 3, noDeps, (delayMs, index) => {
      return new Promise<number>((resolve) => {
        setTimeout(() => {
          resolve(index)
        }, delayMs)
      })
    })
    expect(results).toEqual([0, 1, 2])
  })

  it("never runs more than `concurrency` tasks at once", async () => {
    const items = Array.from({ length: 10 }, (_, i) => i)
    let inFlight = 0
    let maxInFlight = 0

    await runWithConcurrencyGraph(items, 3, noDeps, async () => {
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

    await runWithConcurrencyGraph(items, 4, noDeps, (item) => {
      seen.push(item)
      return Promise.resolve()
    })

    expect(seen.slice().sort((a, b) => a - b)).toEqual(items)
  })

  it("clamps concurrency to the number of items when concurrency exceeds item count", async () => {
    let maxInFlight = 0
    let inFlight = 0
    await runWithConcurrencyGraph([1, 2], 100, noDeps, async () => {
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
    await runWithConcurrencyGraph(items, 1, noDeps, async (item) => {
      order.push(item)
      await new Promise((resolve) => setTimeout(resolve, 5))
    })
    expect(order).toEqual([1, 2, 3])
  })

  it("still processes every item when concurrency is 0 or negative -- clamps up to at least 1 worker", async () => {
    const results = await runWithConcurrencyGraph([1, 2, 3], 0, noDeps, (item) =>
      Promise.resolve(item * 2),
    )
    expect(results).toEqual([2, 4, 6])
  })

  it("propagates a worker rejection", async () => {
    await expect(
      runWithConcurrencyGraph([1, 2, 3], 2, noDeps, (item) => {
        if (item === 2) return Promise.reject(new Error("boom"))
        return Promise.resolve(item)
      }),
    ).rejects.toThrow("boom")
  })

  it("does not launch a newly-unblocked dependent after the whole operation has already failed", async () => {
    // 0 = A, fails fast; 1 = B, no dependencies, settles slowly; 2 = C,
    // depends on B. A and B both start immediately (concurrency 2). A's
    // rejection fails the whole call well before B settles -- when B does
    // settle, it still unblocks C internally (remaining/ready bookkeeping
    // is unconditional), but C's worker must never actually be invoked,
    // since that would be real wasted work (a real spawned process, in
    // repo-contract's actual usage) after the run has already failed.
    const calls: number[] = []
    const promise = runWithConcurrencyGraph(
      [0, 1, 2],
      2,
      (_item, index) => (index === 2 ? [1] : []),
      (item, index) => {
        calls.push(index)
        if (index === 0) return Promise.reject(new Error("boom"))
        if (index === 1) {
          return new Promise<number>((resolve) => {
            setTimeout(() => {
              resolve(item)
            }, 30)
          })
        }
        return Promise.resolve(item)
      },
    )

    await expect(promise).rejects.toThrow("boom")
    // Give B's delayed settlement -- and any wrongly-triggered follow-up
    // launch of C -- a chance to actually happen before asserting.
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(calls).toEqual([0, 1])
  })
})

describe("runWithConcurrencyGraph -- dependency ordering", () => {
  it("does not start a dependent until its dependency has settled -- linear chain", async () => {
    const order: number[] = []
    // item 1 depends on item 0
    await runWithConcurrencyGraph(
      [0, 1],
      4,
      (_item, index) => (index === 1 ? [0] : []),
      async (item) => {
        order.push(item)
        await new Promise((resolve) => setTimeout(resolve, item === 0 ? 20 : 0))
      },
    )
    expect(order).toEqual([0, 1])
  })

  it("respects an arbitrarily deep chain, not just one hop", async () => {
    const order: number[] = []
    const items = [0, 1, 2, 3, 4]
    await runWithConcurrencyGraph(
      items,
      4,
      (_item, index) => (index === 0 ? [] : [index - 1]),
      (item) => {
        order.push(item)
        return Promise.resolve()
      },
    )
    expect(order).toEqual([0, 1, 2, 3, 4])
  })

  it("handles a diamond -- D starts only after both B and C settle, whichever finishes last", async () => {
    // 0 = A, 1 = B, 2 = C, 3 = D. B and C both depend on A; D depends on both B and C.
    const settleOrder: string[] = []
    const names = ["A", "B", "C", "D"]
    const deps: Record<number, number[]> = { 0: [], 1: [0], 2: [0], 3: [1, 2] }

    await runWithConcurrencyGraph(
      [0, 1, 2, 3],
      4,
      (_item, index) => deps[index] ?? [],
      async (item) => {
        // B (fast) and C (slow) both become ready at the same time once A
        // settles -- C is deliberately slower so D's dependency on *both*
        // is actually exercised, not just on whichever happens to be first.
        if (item === 2) await new Promise((resolve) => setTimeout(resolve, 20))
        settleOrder.push(names[item] ?? "?")
      },
    )

    expect(settleOrder.indexOf("D")).toBeGreaterThan(settleOrder.indexOf("B"))
    expect(settleOrder.indexOf("D")).toBeGreaterThan(settleOrder.indexOf("C"))
    expect(settleOrder.indexOf("A")).toBe(0)
  })

  it("makes every dependent of a single node ready together, once, bounded by concurrency", async () => {
    // 0 = root; 1,2,3,4 all depend on 0.
    let maxInFlight = 0
    let inFlight = 0
    const settled: number[] = []

    await runWithConcurrencyGraph(
      [0, 1, 2, 3, 4],
      2,
      (_item, index) => (index === 0 ? [] : [0]),
      async (item) => {
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        await new Promise((resolve) => setTimeout(resolve, 5))
        inFlight -= 1
        settled.push(item)
      },
    )

    expect(settled).toHaveLength(5)
    expect(settled[0]).toBe(0)
    expect(maxInFlight).toBeLessThanOrEqual(2)
  })

  it("a node with zero dependents settles without unblocking anything further", async () => {
    const results = await runWithConcurrencyGraph(
      [0, 1],
      4,
      (_item, index) => (index === 1 ? [0] : []),
      (item) => Promise.resolve(item * 10),
    )
    expect(results).toEqual([0, 10])
  })

  it("deduplicates repeated indexes within one item's own dependency list", async () => {
    // item 1 lists dependency 0 twice -- must not double-decrement and
    // must still resolve correctly (not stall, not double-count).
    const results = await runWithConcurrencyGraph(
      [0, 1],
      4,
      (_item, index) => (index === 1 ? [0, 0] : []),
      (item) => Promise.resolve(item),
    )
    expect(results).toEqual([0, 1])
  })

  it("calls dependencyIndexes exactly once per item, not once per phase", async () => {
    const calls: number[] = []
    await runWithConcurrencyGraph(
      [0, 1],
      4,
      (_item, index) => {
        calls.push(index)
        return index === 1 ? [0] : []
      },
      (item) => Promise.resolve(item),
    )
    expect(calls.slice().sort()).toEqual([0, 1])
  })

  it("rejects rather than hanging forever if the whole graph is a cycle, stalled before starting", async () => {
    // item 0 depends on item 1 and vice versa -- a cycle that should never
    // reach this primitive in practice (validate-config.ts's cycle
    // detector catches it first), constructed here deliberately to test
    // the stall guard in isolation. Nothing is ever ready, so this exercises
    // the "stalled before starting" guard specifically, not the
    // post-settlement one below.
    await expect(
      runWithConcurrencyGraph(
        [0, 1],
        4,
        (_item, index) => [index === 0 ? 1 : 0],
        (item) => Promise.resolve(item),
      ),
    ).rejects.toThrow(
      "runWithConcurrencyGraph: stalled before starting -- the dependency graph passed in is not acyclic.",
    )
  })

  it("rejects rather than hanging forever if a cycle stalls the graph only after some items have already settled", async () => {
    // item 0 has no dependencies and settles normally; items 1 and 2
    // mutually depend on each other and are never reachable -- exercises
    // the post-settlement stall guard specifically (some progress is made
    // before the stall is detected), distinct from the "nothing is ever
    // ready" case above.
    await expect(
      runWithConcurrencyGraph(
        [0, 1, 2],
        4,
        (_item, index) => {
          if (index === 1) return [2]
          if (index === 2) return [1]
          return []
        },
        (item) => Promise.resolve(item),
      ),
    ).rejects.toThrow(
      "runWithConcurrencyGraph: stalled with unsettled items remaining -- the dependency graph passed in is not acyclic.",
    )
  })

  it("tolerates an out-of-range caller-supplied dependency index by ignoring it", async () => {
    // Unlike this function's own internally-generated indexes, the indexes
    // returned by `dependencyIndexes` are caller-supplied and not validated
    // by this primitive itself (config-level validation is
    // run-checks.ts's/validate-config.ts's job, not this general-purpose
    // scheduler's). An index outside `0..items.length-1` can never be
    // satisfied -- nothing pushes its dependent onto a `dependents[]` bucket
    // that doesn't exist -- so it is dropped at the single snapshot point
    // rather than left to inflate `remaining` forever and stall the whole
    // run with a bogus "not acyclic" rejection on an otherwise acyclic graph.
    await expect(
      runWithConcurrencyGraph(
        [0, 1],
        4,
        (_item, index) => (index === 0 ? [99, -1, 1.5] : []),
        (item) => Promise.resolve(item),
      ),
    ).resolves.toEqual([0, 1])
  })
})
