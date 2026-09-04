import { describe, expect, it } from "vitest"
import { formatSchemaIssues } from "../../../src/parsing/format-schema-issues.js"

describe("formatSchemaIssues", () => {
  it("renders a single pathless issue as just its message", () => {
    expect(formatSchemaIssues([{ message: "Required" }])).toBe("Schema validation failed: Required")
  })

  it("renders a bare string path segment", () => {
    expect(formatSchemaIssues([{ message: "Expected string", path: ["name"] }])).toBe(
      "Schema validation failed: name: Expected string",
    )
  })

  it("renders a bare numeric path segment with bracket notation", () => {
    expect(formatSchemaIssues([{ message: "Required", path: [0] }])).toBe(
      "Schema validation failed: [0]: Required",
    )
  })

  it("renders a {key} path segment object the same as a bare PropertyKey", () => {
    expect(formatSchemaIssues([{ message: "Expected string", path: [{ key: "name" }] }])).toBe(
      "Schema validation failed: name: Expected string",
    )
  })

  it("renders a symbol path segment via String(), never a raw template interpolation", () => {
    const sym = Symbol("id")
    expect(formatSchemaIssues([{ message: "Required", path: [sym] }])).toBe(
      `Schema validation failed: ${String(sym)}: Required`,
    )
  })

  it("renders a multi-segment path mixing string and numeric segments", () => {
    expect(formatSchemaIssues([{ message: "Required", path: ["items", 2, "name"] }])).toBe(
      "Schema validation failed: items[2].name: Required",
    )
  })

  it("joins multiple issues with '; '", () => {
    expect(
      formatSchemaIssues([
        { message: "Expected string", path: [{ key: "a" }] },
        { message: "Required", path: ["b", 0] },
      ]),
    ).toBe("Schema validation failed: a: Expected string; b[0]: Required")
  })

  it("renders an empty path array the same as no path at all", () => {
    expect(formatSchemaIssues([{ message: "Required", path: [] }])).toBe(
      "Schema validation failed: Required",
    )
  })
})
