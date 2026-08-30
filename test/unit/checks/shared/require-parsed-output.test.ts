import { describe, expect, it } from "vitest"
import { requireParsedOutput } from "../../../../checks/shared/require-parsed-output.js"
import type { ParsedOutput } from "../../../../src/types.js"

describe("requireParsedOutput", () => {
  it("fails with the given rationale when output is undefined", () => {
    const result = requireParsedOutput(undefined, "X did not produce parseable output.")
    expect(result).toEqual({
      ok: false,
      result: { outcome: "fail", rationale: "X did not produce parseable output." },
    })
  })

  it("appends output.error to the given rationale when output.success is false", () => {
    const output: ParsedOutput<unknown> = {
      format: "json",
      success: false,
      error: "Unexpected token in JSON",
    }
    const result = requireParsedOutput(output, "X did not produce parseable output.")
    expect(result).toEqual({
      ok: false,
      result: {
        outcome: "fail",
        rationale: "X did not produce parseable output. Unexpected token in JSON",
      },
    })
  })

  it("returns ok: true with the parsed value narrowed to T when output.success is true", () => {
    const output: ParsedOutput<unknown> = { format: "json", success: true, value: { count: 3 } }
    const result = requireParsedOutput<{ count: number }>(output, "unused")
    expect(result).toEqual({ ok: true, value: { count: 3 } })
  })
})
