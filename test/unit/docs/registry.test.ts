import { describe, expect, it } from "vitest"
import {
  DOCS_LINK_EXCEPTION_SCHEMA,
  createDocsLinkStub,
  deriveDocsLinkExceptionId,
} from "../../../checks/docs.js"
import { validateExceptionRegistry } from "../../../scripts/shared/exception-record.js"

function validRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "docs-links:https://example.com",
    version: 1,
    url: "https://example.com",
    justification: "Confirmed live via direct curl; linkinator flakes on this host in CI.",
    ...overrides,
  }
}

const validate = (records: readonly unknown[]) =>
  validateExceptionRegistry(records, DOCS_LINK_EXCEPTION_SCHEMA)

describe("deriveDocsLinkExceptionId", () => {
  it("joins the namespace and url", () => {
    expect(deriveDocsLinkExceptionId({ url: "https://example.com" })).toBe(
      "docs-links:https://example.com",
    )
  })
})

describe("createDocsLinkStub", () => {
  it("returns a blank record carrying the canonical id and identity field", () => {
    const finding = { url: "https://example.com" }
    const id = deriveDocsLinkExceptionId(finding)
    expect(createDocsLinkStub(finding, id)).toEqual({
      id,
      version: 1,
      justification: "",
      url: "https://example.com",
    })
  })
})

describe("DOCS_LINK_EXCEPTION_SCHEMA", () => {
  it("accepts a well-formed record and preserves its own field values", () => {
    const result = validate([validRecord()])
    expect(result.ok, result.ok ? "" : result.errors.join("\n")).toBe(true)
    if (result.ok) {
      expect(result.records).toEqual([
        {
          id: "docs-links:https://example.com",
          version: 1,
          justification: "Confirmed live via direct curl; linkinator flakes on this host in CI.",
          url: "https://example.com",
        },
      ])
    }
  })

  it("names the exact record index in each error message", () => {
    const result = validate([validRecord(), validRecord({ url: "" })])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join("\n")).toContain("exceptions[1]")
  })

  it("rejects a non-string url that would otherwise coerce to a valid URL (e.g. an array)", () => {
    // If the `typeof url === "string"` guard were ever dropped, `new URL(["https://x"])` would
    // coerce the array to its single-element string via Array#toString and parse successfully --
    // this is the one input shape that actually distinguishes the guard from isExternalUrl's own
    // rejection of non-strings.
    expect(validate([validRecord({ url: ["https://example.com"] })]).ok).toBe(false)
  })

  it("rejects a non-array value", () => {
    expect(validateExceptionRegistry({ not: "array" }, DOCS_LINK_EXCEPTION_SCHEMA).ok).toBe(false)
  })

  it("rejects a foreign namespace", () => {
    expect(validate([validRecord({ id: "socket:x" })]).ok).toBe(false)
  })

  it("rejects a local (non-http(s)) url", () => {
    const result = validate([validRecord({ id: "docs-links:/missing.md", url: "/missing.md" })])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join("\n")).toContain("only an external link")
  })

  it("rejects an empty url", () => {
    expect(validate([validRecord({ url: "" })]).ok).toBe(false)
  })

  it("rejects a non-string url", () => {
    expect(validate([validRecord({ url: 42 })]).ok).toBe(false)
  })

  it("rejects a record whose id disagrees with its own url", () => {
    const result = validate([validRecord({ id: "docs-links:https://other.example" })])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join("\n")).toContain("does not match the id derived")
  })

  it("rejects an unrecognized field", () => {
    expect(validate([validRecord({ extra: "nope" })]).ok).toBe(false)
  })

  it("rejects a duplicate id across two records", () => {
    expect(validate([validRecord(), validRecord()]).ok).toBe(false)
  })

  it("reports every problem across multiple bad records, not just the first", () => {
    const result = validate([validRecord({ url: "" }), validRecord({ url: 42 })])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(1)
  })
})
