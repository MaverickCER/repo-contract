import { describe, expect, it } from "vitest"
import { jsonErrorLocation } from "../../../src/helpers/registry-file.js"

/**
 * @param text - what to parse.
 * @returns the error JSON.parse throws on it.
 */
function parseError(text: string): unknown {
  try {
    JSON.parse(text)
  } catch (error) {
    return error
  }
  throw new Error(`${text} parsed`)
}

describe("jsonErrorLocation", () => {
  it("keeps the line and column of a JSON error, and never its quoted bytes", () => {
    expect(jsonErrorLocation(parseError('{"a":1'))).toBe(" (line 1, column 7)")
    expect(jsonErrorLocation(parseError('{\n  "a": 1\n  "b": 2\n}'))).toBe(" (line 3, column 3)")
    expect(jsonErrorLocation(parseError(`{${'\n"a": 1,'.repeat(11)}\n"b": 2`))).toBe(
      " (line 13, column 7)",
    )
  })

  it("falls back to the position when the message names no line", () => {
    expect(jsonErrorLocation(new SyntaxError("Unexpected token h in JSON at position 16"))).toBe(
      " (at position 16)",
    )
  })

  it("returns nothing for a message that names neither, such as one quoting the bytes", () => {
    expect(jsonErrorLocation(parseError("TOKEN=hunter2"))).toBe("")
    expect(jsonErrorLocation(parseError(""))).toBe("")
    expect(jsonErrorLocation("line 1 column 2")).toBe("")
    expect(jsonErrorLocation(undefined)).toBe("")
  })
})
