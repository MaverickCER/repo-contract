import { describe, expect, it } from "vitest"
import { parseText } from "../../../src/parsing/parse-text.js"

describe("parseText", () => {
  it("returns the trimmed input as a successful result", () => {
    expect(parseText("  hello  \n")).toEqual({ format: "text", success: true, value: "hello" })
  })

  it("always succeeds, even for an empty string", () => {
    expect(parseText("")).toEqual({ format: "text", success: true, value: "" })
  })

  it("always succeeds for whitespace-only input, trimming to empty", () => {
    expect(parseText("   \t\n  ")).toEqual({ format: "text", success: true, value: "" })
  })

  it("preserves internal whitespace, only trimming leading/trailing", () => {
    expect(parseText("  a   b  c  ")).toEqual({ format: "text", success: true, value: "a   b  c" })
  })
})
