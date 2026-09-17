import { describe, expect, it } from "vitest"
import {
  SECURITY_DEPS_EXCEPTION_SCHEMA,
  createSecurityDepsStub,
  deriveSecurityDepsExceptionId,
} from "../../../checks/security-deps.js"
import { validateExceptionRegistry } from "../../../scripts/shared/exception-record.js"

function validRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "security-deps:left-pad@<=1.3.0",
    version: 1,
    package: "left-pad",
    range: "<=1.3.0",
    severity: "high",
    justification: "Because.",
    alternatives: "None found.",
    remediation: "Tracked upstream.",
    method: "independent-human-review",
    exceptionType: "accepted-risk",
    ...overrides,
  }
}

const validate = (records: readonly unknown[]) =>
  validateExceptionRegistry(records, SECURITY_DEPS_EXCEPTION_SCHEMA)

describe("deriveSecurityDepsExceptionId", () => {
  it("joins the namespace, package, and range", () => {
    expect(deriveSecurityDepsExceptionId({ package: "left-pad", range: "<=1.3.0" })).toBe(
      "security-deps:left-pad@<=1.3.0",
    )
  })
})

describe("createSecurityDepsStub", () => {
  it("returns a blank record carrying the canonical id and identity fields", () => {
    const finding = {
      id: "security-deps:left-pad@<=1.3.0",
      package: "left-pad",
      range: "<=1.3.0",
      severity: "high" as const,
    }
    expect(createSecurityDepsStub(finding, finding.id)).toEqual({
      id: finding.id,
      version: 1,
      justification: "",
      alternatives: "",
      remediation: "",
      method: "",
      exceptionType: "",
      package: "left-pad",
      range: "<=1.3.0",
      severity: "high",
    })
  })
})

describe("SECURITY_DEPS_EXCEPTION_SCHEMA", () => {
  it("accepts a well-formed record", () => {
    const result = validate([validRecord()])
    expect(result.ok, result.ok ? "" : result.errors.join("\n")).toBe(true)
  })

  it("accepts the unknown severity a malformed/unrecognized npm audit report normalizes to", () => {
    const result = validate([validRecord({ severity: "unknown" })])
    expect(result.ok, result.ok ? "" : result.errors.join("\n")).toBe(true)
  })

  it("rejects a non-array value", () => {
    expect(validateExceptionRegistry({ not: "array" }, SECURITY_DEPS_EXCEPTION_SCHEMA).ok).toBe(
      false,
    )
  })

  it.each([
    ["a foreign namespace", { id: "socket:x" }],
    ["a bad exceptionType", { exceptionType: "not-real" }],
    ["a bad method", { method: "vibes" }],
    ["a bad severity", { severity: "spicy" }],
    ["an empty package", { package: "" }],
    ["an empty range", { range: "" }],
  ])("rejects %s", (_desc, override) => {
    expect(validate([validRecord(override)]).ok).toBe(false)
  })

  it("rejects a record whose id disagrees with its own package/range", () => {
    const result = validate([validRecord({ id: "security-deps:left-pad@9.9.9" })])
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

  it("accepts validated-false-positive backed by mechanical-reverification", () => {
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
    expect(validate([validRecord(), validRecord()]).ok).toBe(false)
  })

  it("reports every problem across multiple bad records, not just the first", () => {
    const result = validate([
      validRecord({ severity: "spicy" }),
      validRecord({ package: "other", range: "2.0.0", method: "nope" }),
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(1)
  })
})
