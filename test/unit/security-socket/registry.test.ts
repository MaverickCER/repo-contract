import { describe, expect, it } from "vitest"
import {
  SOCKET_EXCEPTION_SCHEMA,
  createSocketStub,
  deriveSocketExceptionId,
} from "../../../scripts/security-socket/registry.js"
import { validateExceptionRegistry } from "../../../scripts/shared/exception-record.js"

function validRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "socket:lodash@4.17.20:envVars",
    version: 1,
    package: "lodash",
    packageVersion: "4.17.20",
    type: "envVars",
    severity: "middle",
    justification: "Because.",
    alternatives: "None found.",
    remediation: "Tracked upstream.",
    method: "independent-human-review",
    exceptionType: "accepted-risk",
    ...overrides,
  }
}

const validate = (records: readonly unknown[]) =>
  validateExceptionRegistry(records, SOCKET_EXCEPTION_SCHEMA)

describe("deriveSocketExceptionId", () => {
  it("joins the namespace, package, packageVersion, and type", () => {
    expect(
      deriveSocketExceptionId({
        package: "left-pad",
        packageVersion: "1.3.0",
        type: "shellAccess",
      }),
    ).toBe("socket:left-pad@1.3.0:shellAccess")
  })
})

describe("createSocketStub", () => {
  it("returns a blank record carrying the canonical id and identity fields", () => {
    const alert = {
      id: "socket:left-pad@1.3.0:shellAccess",
      package: "left-pad",
      version: "1.3.0",
      type: "shellAccess",
      severity: "low" as const,
    }
    expect(createSocketStub(alert, alert.id)).toEqual({
      id: alert.id,
      version: 1,
      justification: "",
      alternatives: "",
      remediation: "",
      method: "",
      exceptionType: "",
      package: "left-pad",
      packageVersion: "1.3.0",
      type: "shellAccess",
      severity: "low",
    })
  })
})

describe("SOCKET_EXCEPTION_SCHEMA", () => {
  it("accepts a well-formed record", () => {
    const result = validate([validRecord()])
    expect(result.ok, result.ok ? "" : result.errors.join("\n")).toBe(true)
  })

  it("rejects a non-array value", () => {
    expect(validateExceptionRegistry({ not: "array" }, SOCKET_EXCEPTION_SCHEMA).ok).toBe(false)
  })

  it.each([
    ["a foreign namespace", { id: "suppression:x" }],
    ["a bad exceptionType", { exceptionType: "not-real" }],
    ["a bad method", { method: "vibes" }],
    ["a bad severity", { severity: "spicy" }],
    ["an empty package", { package: "" }],
  ])("rejects %s", (_desc, override) => {
    expect(validate([validRecord(override)]).ok).toBe(false)
  })

  it("rejects a record whose id disagrees with its own package/version/type", () => {
    const result = validate([validRecord({ id: "socket:lodash@9.9.9:envVars" })])
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
      validRecord({ package: "other", method: "nope" }),
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(1)
  })
})
