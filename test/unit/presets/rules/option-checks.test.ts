import { describe, expect, it } from "vitest"
import {
  checkBoolean,
  checkOptionsObject,
  checkPaths,
  shownValue,
} from "../../../../src/presets/rules/option-checks.js"

describe("option checks", () => {
  it("quotes a string, names a list or an object, and leaves any other value bare", () => {
    expect([
      shownValue("80"),
      shownValue(""),
      shownValue(80),
      shownValue(null),
      shownValue(undefined),
      shownValue([1]),
      shownValue({ a: 1 }),
    ]).toEqual(['"80"', '""', "80", "null", "undefined", "a list", "an object"])
  })

  it.each([
    ["null", null, "null"],
    ["a string", "x", '"x"'],
    ["a number", 1, "1"],
    ["a list", [], "a list"],
    ["undefined", undefined, "undefined"],
  ])("throws TypeError on options that are %s", (_label, options, shown) => {
    expect(() => {
      checkOptionsObject("demo", options)
    }).toThrow(new TypeError(`demo: options must be an object, got ${shown}.`))
  })

  it("accepts an options object", () => {
    expect(() => {
      checkOptionsObject("demo", {})
    }).not.toThrow()
  })

  it.each([
    ["a string", "yes", '"yes"'],
    ["a number", 1, "1"],
    ["null", null, "null"],
  ])("throws RangeError on a boolean option that is %s", (_label, value, shown) => {
    expect(() => {
      checkBoolean("demo", "write", value)
    }).toThrow(new RangeError(`demo: write must be true or false, got ${shown}.`))
  })

  it("accepts true, false and an option left out", () => {
    expect(() => {
      checkBoolean("demo", "write", true)
      checkBoolean("demo", "write", false)
      checkBoolean("demo", "write", undefined)
    }).not.toThrow()
  })

  it("names the first path option that is not a non-empty string", () => {
    expect(() => {
      checkPaths("demo", { a: "ok", b: "", c: 3 })
    }).toThrow(new RangeError('demo: b must be a non-empty path, got "".'))
  })
})
