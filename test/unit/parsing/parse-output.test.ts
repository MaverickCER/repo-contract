import { describe, expect, it } from "vitest"
import { parseOutput } from "../../../src/parsing/parse-output.js"

describe("parseOutput", () => {
  it("dispatches to JSON parsing for format: json", async () => {
    const result = await parseOutput("json", '{"a":1}', "check-id")
    expect(result).toEqual({ format: "json", success: true, value: { a: 1 } })
  })

  it("dispatches to YAML parsing for format: yaml", async () => {
    const result = await parseOutput("yaml", "a: 1", "check-id")
    expect(result).toEqual({ format: "yaml", success: true, value: { a: 1 } })
  })

  it("dispatches to text parsing for format: text", async () => {
    const result = await parseOutput("text", "  hi  ", "check-id")
    expect(result).toEqual({ format: "text", success: true, value: "hi" })
  })

  it("propagates a JSON parse failure as data, not a throw", async () => {
    const result = await parseOutput("json", "not json", "check-id")
    expect(result.success).toBe(false)
  })
})
