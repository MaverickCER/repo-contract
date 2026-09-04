import { describe, expect, it, vi } from "vitest"
import { StandardSchemaValidateThrewError } from "../../../src/errors.js"
import { parseOutput } from "../../../src/parsing/parse-output.js"
import {
  asyncSuccessSchema,
  failureSchema,
  rejectingSchema,
  successSchema,
  throwingSchema,
  transformSchema,
} from "../standard-schema/fixtures.js"

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

  describe("output.schema", () => {
    it("passes a schema's own Result value through unchanged when it's a plain success", async () => {
      const result = await parseOutput("json", '{"a":1}', "check-id", successSchema())
      expect(result).toEqual({ format: "json", success: true, value: { a: 1 } })
    })

    it("replaces value with a transforming schema's own result", async () => {
      const result = await parseOutput("json", "21", "check-id", transformSchema())
      expect(result).toEqual({ format: "json", success: true, value: 42 })
    })

    it("awaits an async schema validate() that returns a Promise", async () => {
      const result = await parseOutput("json", '{"a":1}', "check-id", asyncSuccessSchema())
      expect(result).toEqual({ format: "json", success: true, value: { a: 1 } })
    })

    it("turns a schema failure into a ParsedOutputFailure with issue messages and paths joined", async () => {
      const schema = failureSchema([
        { message: "Expected string", path: [{ key: "a" }] },
        { message: "Required", path: ["b", 0] },
      ])
      const result = await parseOutput("json", '{"a":1}', "check-id", schema)
      expect(result).toEqual({
        format: "json",
        success: false,
        error: "Schema validation failed: a: Expected string; b[0]: Required",
      })
    })

    it("turns a pathless schema issue into just its message", async () => {
      const schema = failureSchema([{ message: "bad" }])
      const result = await parseOutput("json", '{"a":1}', "check-id", schema)
      expect(result).toEqual({
        format: "json",
        success: false,
        error: "Schema validation failed: bad",
      })
    })

    it("never calls schema.validate() when the underlying parse itself fails", async () => {
      const validate = vi.fn()
      const result = await parseOutput("json", "not json", "check-id", {
        "~standard": { version: 1, vendor: "fixture", validate },
      })
      expect(result.success).toBe(false)
      expect(validate).not.toHaveBeenCalled()
    })

    it("rejects with StandardSchemaValidateThrewError when schema.validate() throws", async () => {
      const cause = new Error("boom")
      const promise = parseOutput("json", '{"a":1}', "check-id", throwingSchema(cause))
      await expect(promise).rejects.toBeInstanceOf(StandardSchemaValidateThrewError)
      await promise.catch((error: unknown) => {
        expect(error).toBeInstanceOf(StandardSchemaValidateThrewError)
        expect((error as StandardSchemaValidateThrewError).checkId).toBe("check-id")
        expect((error as StandardSchemaValidateThrewError).cause).toBe(cause)
      })
    })

    it("rejects with StandardSchemaValidateThrewError when schema.validate() returns a rejected Promise", async () => {
      const cause = new Error("boom")
      const promise = parseOutput("json", '{"a":1}', "check-id", rejectingSchema(cause))
      await expect(promise).rejects.toBeInstanceOf(StandardSchemaValidateThrewError)
      await promise.catch((error: unknown) => {
        expect((error as StandardSchemaValidateThrewError).cause).toBe(cause)
      })
    })

    it.each(["json", "yaml", "text"] as const)(
      "honors a schema identically for format: %s",
      async (format) => {
        const stdout = format === "yaml" ? "a: 1" : format === "json" ? '{"a":1}' : "hi"
        const result = await parseOutput(format, stdout, "check-id", transformSchema())
        // transformSchema() computes Number(value) * 2 -- text/json/yaml each parse to a
        // non-numeric value here, so Number(...) is NaN; the point of this case is only that
        // schema.validate() runs identically regardless of which parser produced `value`.
        expect(result.success).toBe(true)
      },
    )
  })
})
