import { describe, expect, it } from "vitest"
import { append, listOf, memoizeBy, valuesOf } from "../../../src/affected/memo.js"

describe("memoizeBy", () => {
  it("computes once per distinct arguments and returns the stored value after", () => {
    const calls: string[] = []
    const join = memoizeBy((a: string, b: string) => {
      calls.push(`${a}+${b}`)
      return `${a}${b}`
    })
    expect(join("a", "b")).toBe("ab")
    expect(join("a", "b")).toBe("ab")
    expect(join("b", "a")).toBe("ba")
    expect(calls).toEqual(["a+b", "b+a"])
  })

  it("does not mix up arguments that concatenate to the same text", () => {
    const join = memoizeBy((a: string, b: string) => [a, b])
    expect(join("a", "bc")).toEqual(["a", "bc"])
    expect(join("ab", "c")).toEqual(["ab", "c"])
    expect(join("", "abc")).toEqual(["", "abc"])
  })

  it("remembers a result that is undefined, rather than computing it again", () => {
    let count = 0
    const nothing = memoizeBy((_key: string): string | undefined => {
      count += 1
      return undefined
    })
    expect(nothing("a")).toBeUndefined()
    expect(nothing("a")).toBeUndefined()
    expect(count).toBe(1)
  })

  it("remembers falsy results of every kind", () => {
    let count = 0
    const falsy = memoizeBy((value: number) => {
      count += 1
      return [0, "", false, null][value]
    })
    for (const value of [0, 1, 2, 3]) {
      expect(falsy(value)).toBe([0, "", false, null][value])
      falsy(value)
    }
    expect(count).toBe(4)
  })

  it("keeps separate memories for separate functions", () => {
    const one = memoizeBy((key: string) => `1${key}`)
    const two = memoizeBy((key: string) => `2${key}`)
    expect(one("x")).toBe("1x")
    expect(two("x")).toBe("2x")
  })

  it("takes a single argument of any JSON shape", () => {
    const size = memoizeBy((value: unknown) => JSON.stringify(value).length)
    expect(size({ a: [1, 2] })).toBe(11)
    expect(size({ a: [1, 2] })).toBe(11)
  })
})

describe("append", () => {
  it("starts a list for a new key and adds to the list of an old one, in order", () => {
    const map = new Map<string, number[]>()
    append(map, "a", 1)
    append(map, "b", 2)
    append(map, "a", 3)
    expect(map).toEqual(
      new Map([
        ["a", [1, 3]],
        ["b", [2]],
      ]),
    )
  })

  it("does not share a list between keys", () => {
    const map = new Map<string, string[]>()
    append(map, "a", "x")
    append(map, "b", "y")
    expect(map.get("a")).toEqual(["x"])
    expect(map.get("b")).toEqual(["y"])
  })
})

describe("valuesOf", () => {
  it("returns the list stored under a key, and an empty list for a key with none", () => {
    const map = new Map([["a", [1, 2]]])
    expect(valuesOf(map, "a")).toEqual([1, 2])
    expect(valuesOf(map, "b")).toEqual([])
    expect(valuesOf(map, "b")).toHaveLength(0)
  })

  it("does not hand out a list that a caller could share with another key", () => {
    const map = new Map<string, number[]>()
    expect(valuesOf(map, "x")).not.toBe(valuesOf(map, "y"))
  })
})

describe("listOf", () => {
  it("returns the list it is given, itself", () => {
    const items = [1, 2]
    expect(listOf(items)).toBe(items)
  })

  it("returns an empty list for nothing", () => {
    expect(listOf(undefined)).toEqual([])
    expect(listOf(undefined)).toHaveLength(0)
  })
})
