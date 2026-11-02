import { describe, expect, it } from "vitest"
import { Worklist } from "../../../src/affected/worklist.js"

describe("Worklist", () => {
  it("hands out what was offered, oldest first", () => {
    const work = new Worklist<string>()
    expect(work.offer("a", 0, "first")).toBe(true)
    expect(work.offer("b", 0, "second")).toBe(true)
    expect(work.take()).toEqual({ key: "a", hops: 0, value: "first" })
    expect(work.take()).toEqual({ key: "b", hops: 0, value: "second" })
    expect(work.take()).toBeUndefined()
  })

  it("refuses a key it already holds at the same distance", () => {
    const work = new Worklist<number>()
    expect(work.offer("a", 2, 1)).toBe(true)
    expect(work.offer("a", 2, 2)).toBe(false)
    expect(work.take()).toEqual({ key: "a", hops: 2, value: 1 })
    expect(work.take()).toBeUndefined()
  })

  it("refuses a key it already holds at a smaller distance, even after that one was taken", () => {
    const work = new Worklist<number>()
    work.offer("a", 1, 1)
    work.take()
    expect(work.offer("a", 3, 2)).toBe(false)
    expect(work.take()).toBeUndefined()
  })

  it("accepts the same key again when it is closer, and says so", () => {
    const work = new Worklist<number>()
    expect(work.offer("a", 3, 1)).toBe(true)
    expect(work.offer("a", 1, 2)).toBe(true)
    expect(work.offer("a", 2, 3)).toBe(false)
    expect(work.take()?.value).toBe(1)
    expect(work.take()).toEqual({ key: "a", hops: 1, value: 2 })
    expect(work.take()).toBeUndefined()
  })

  it("keeps keys apart", () => {
    const work = new Worklist<null>()
    expect(work.offer("a", 0, null)).toBe(true)
    expect(work.offer("b", 5, null)).toBe(true)
    expect(work.offer("a", 0, null)).toBe(false)
    expect(work.offer("b", 5, null)).toBe(false)
  })

  it("lets a loop over a cycle finish: each key is queued once per improvement", () => {
    // a -> b -> c -> a, each step one hop further; starting from a at 0.
    const next: Record<string, string> = { a: "b", b: "c", c: "a" }
    const work = new Worklist<string>()
    work.offer("a", 0, "a")
    const taken: string[] = []
    for (let item = work.take(); item !== undefined; item = work.take()) {
      taken.push(`${item.key}@${String(item.hops)}`)
      work.offer(next[item.key]!, item.hops + 1, item.value)
    }
    expect(taken).toEqual(["a@0", "b@1", "c@2"])
  })

  it("finishes on a dense cyclic graph too, visiting each key at its shortest distance", () => {
    const keys = ["a", "b", "c", "d", "e"]
    const work = new Worklist<null>()
    work.offer("a", 0, null)
    const distance = new Map<string, number>()
    for (let item = work.take(); item !== undefined; item = work.take()) {
      distance.set(item.key, Math.min(item.hops, distance.get(item.key) ?? Infinity))
      for (const other of keys) {
        work.offer(other, item.hops + 1, null)
      }
    }
    expect(Object.fromEntries(distance)).toEqual({ a: 0, b: 1, c: 1, d: 1, e: 1 })
  })
})
