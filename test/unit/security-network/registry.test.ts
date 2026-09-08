import { describe, expect, it } from "vitest"
import {
  NETWORK_EXCEPTION_SCHEMA,
  createNetworkStub,
  deriveNetworkExceptionId,
} from "../../../scripts/security-network/registry.js"
import { validateExceptionRegistry } from "../../../scripts/shared/exception-record.js"

function validRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "security-network:restricted-module-import:src/presets/evil.ts:3:5",
    version: 1,
    capability: "restricted-module-import",
    file: "src/presets/evil.ts",
    line: 3,
    column: 5,
    justification: "Type-only import, elided at build time.",
    alternatives: "None found.",
    remediation: "Tracked upstream.",
    method: "independent-human-review",
    exceptionType: "accepted-risk",
    ...overrides,
  }
}

const validate = (records: readonly unknown[]) =>
  validateExceptionRegistry(records, NETWORK_EXCEPTION_SCHEMA)

describe("deriveNetworkExceptionId", () => {
  it("joins the namespace, capability, file, line, and column", () => {
    expect(
      deriveNetworkExceptionId({
        capability: "restricted-global-usage",
        file: "src/presets/x.ts",
        line: 42,
        column: 1,
      }),
    ).toBe("security-network:restricted-global-usage:src/presets/x.ts:42:1")
  })
})

describe("createNetworkStub", () => {
  it("returns a blank record carrying the canonical id and identity fields", () => {
    const finding = {
      id: "security-network:restricted-global-usage:src/a.ts:9:2",
      file: "src/a.ts",
      line: 9,
      column: 2,
      capability: "restricted-global-usage" as const,
      detail: "uses fetch",
    }
    expect(createNetworkStub(finding, finding.id)).toEqual({
      id: finding.id,
      version: 1,
      justification: "",
      alternatives: "",
      remediation: "",
      method: "",
      exceptionType: "",
      capability: "restricted-global-usage",
      file: "src/a.ts",
      line: 9,
      column: 2,
    })
  })
})

describe("NETWORK_EXCEPTION_SCHEMA", () => {
  it("accepts a well-formed record", () => {
    const result = validate([validRecord()])
    expect(result.ok, result.ok ? "" : result.errors.join("\n")).toBe(true)
  })

  it("rejects a non-array value", () => {
    expect(validateExceptionRegistry({ not: "array" }, NETWORK_EXCEPTION_SCHEMA).ok).toBe(false)
  })

  it.each([
    ["a foreign namespace", { id: "suppression:x" }],
    ["an unknown capability kind", { capability: "wat" }],
    ["a non-positive line", { line: 0 }],
    ["a missing column", { column: undefined }],
    ["a bad exceptionType", { exceptionType: "not-real" }],
    ["a bad method", { method: "vibes" }],
  ])("rejects %s", (_desc, override) => {
    expect(validate([validRecord(override)]).ok).toBe(false)
  })

  it("rejects a record whose id disagrees with its own capability/file/line/column", () => {
    const result = validate([
      validRecord({ id: "security-network:restricted-module-import:src/presets/evil.ts:99:1" }),
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join("\n")).toContain("does not match the id derived")
  })

  it("rejects validated-false-positive backed by independent-human-review", () => {
    const result = validate([
      validRecord({
        exceptionType: "validated-false-positive",
        method: "independent-human-review",
      }),
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join("\n")).toContain("mechanical-reverification")
  })

  it("accepts validated-false-positive backed by a mechanical re-scan", () => {
    expect(
      validate([
        validRecord({
          exceptionType: "validated-false-positive",
          method: "mechanical-reverification",
        }),
      ]).ok,
    ).toBe(true)
  })

  it("rejects a duplicate id across two records", () => {
    const result = validate([validRecord(), validRecord()])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join("\n")).toContain("reuses the id")
  })

  it("reports every problem across multiple bad records, not just the first", () => {
    const result = validate([
      validRecord({ line: 0 }),
      validRecord({ file: "src/other.ts", exceptionType: "nope" }),
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(1)
  })
})
