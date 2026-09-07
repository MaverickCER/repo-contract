import { describe, expect, it } from "vitest"
import {
  deriveSocketExceptionId,
  validateSocketExceptionRegistry,
} from "../../../scripts/security-socket/registry.js"

function validRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "lodash@4.17.20:envVars",
    version: 1,
    package: "lodash",
    packageVersion: "4.17.20",
    alertType: "envVars",
    justification: "Because.",
    alternatives: "None found.",
    remediation: "Tracked upstream.",
    exceptionType: "accepted-risk",
    ...overrides,
  }
}

describe("deriveSocketExceptionId", () => {
  it("joins package, packageVersion, and alertType exactly like NormalizedSocketAlert.id", () => {
    const id = deriveSocketExceptionId({
      id: "ignored",
      version: 1,
      package: "left-pad",
      packageVersion: "1.3.0",
      alertType: "shellAccess",
      justification: "",
      alternatives: "",
      remediation: "",
      exceptionType: "accepted-risk",
    })
    expect(id).toBe("left-pad@1.3.0:shellAccess")
  })
})

describe("validateSocketExceptionRegistry", () => {
  it("accepts a well-formed exceptions array", () => {
    const result = validateSocketExceptionRegistry([validRecord()])
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected ok:true")
    expect(result.records).toHaveLength(1)
  })

  it("rejects a non-array value", () => {
    const result = validateSocketExceptionRegistry({ not: "an array" })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected ok:false")
    expect(result.errors[0]).toContain("must be a JSON array")
  })

  it("rejects a record whose id doesn't match its own derived identity", () => {
    const result = validateSocketExceptionRegistry([validRecord({ id: "wrong-id" })])
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected ok:false")
    expect(result.errors[0]).toContain("does not match its own derived identity")
  })

  it("rejects an invalid exceptionType", () => {
    const result = validateSocketExceptionRegistry([validRecord({ exceptionType: "not-real" })])
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected ok:false")
    expect(result.errors[0]).toContain("exceptionType must be one of")
  })

  it("rejects a duplicate id across two records", () => {
    const result = validateSocketExceptionRegistry([validRecord(), validRecord()])
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected ok:false")
    expect(result.errors.some((e) => e.includes("duplicates an earlier record"))).toBe(true)
  })

  it("rejects a validated-false-positive record whose verification.method is independent-human-review, not mechanical-reverification", () => {
    const result = validateSocketExceptionRegistry([
      validRecord({
        exceptionType: "validated-false-positive",
        verification: {
          method: "independent-human-review",
          verifiedBy: "someone",
          verifiedAt: "2026-01-01T00:00:00.000Z",
          verifiedContentHash: "abc",
        },
      }),
    ])
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected ok:false")
    expect(result.errors[0]).toContain("mechanical-reverification")
  })

  it("accepts a validated-false-positive record whose verification.method is mechanical-reverification", () => {
    const result = validateSocketExceptionRegistry([
      validRecord({
        exceptionType: "validated-false-positive",
        verification: {
          method: "mechanical-reverification",
          verifiedBy: "ci-rescan",
          verifiedAt: "2026-01-01T00:00:00.000Z",
          verifiedContentHash: "abc",
        },
      }),
    ])
    expect(result.ok).toBe(true)
  })

  it("rejects a verification block missing a required field", () => {
    const result = validateSocketExceptionRegistry([
      validRecord({ verification: { method: "independent-human-review" } }),
    ])
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected ok:false")
    expect(result.errors.some((e) => e.includes("verifiedBy"))).toBe(true)
    expect(result.errors.some((e) => e.includes("verifiedAt"))).toBe(true)
    expect(result.errors.some((e) => e.includes("verifiedContentHash"))).toBe(true)
  })

  it("rejects a verifiedAt that is not an ISO 8601 timestamp", () => {
    const result = validateSocketExceptionRegistry([
      validRecord({
        verification: {
          method: "independent-human-review",
          verifiedBy: "someone",
          verifiedAt: "later",
          verifiedContentHash: "abc",
        },
      }),
    ])
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected ok:false")
    expect(result.errors.some((e) => e.includes("verifiedAt must be an ISO 8601"))).toBe(true)
  })

  it.each(["2026-13-45", "2026-02-29", "2026-04-31"])(
    "rejects a shaped-but-impossible verifiedAt calendar date (%s)",
    (verifiedAt) => {
      const result = validateSocketExceptionRegistry([
        validRecord({
          verification: {
            method: "independent-human-review",
            verifiedBy: "someone",
            verifiedAt,
            verifiedContentHash: "abc",
          },
        }),
      ])
      expect(result.ok).toBe(false)
      if (result.ok) throw new Error("expected ok:false")
      expect(result.errors.some((e) => e.includes("verifiedAt must be an ISO 8601"))).toBe(true)
    },
  )

  it("accepts a real leap-day verifiedAt", () => {
    const result = validateSocketExceptionRegistry([
      validRecord({
        verification: {
          method: "independent-human-review",
          verifiedBy: "someone",
          verifiedAt: "2024-02-29T00:00:00.000Z",
          verifiedContentHash: "abc",
        },
      }),
    ])
    expect(result.ok).toBe(true)
  })

  it("reports every problem across multiple bad records, not just the first", () => {
    const result = validateSocketExceptionRegistry([
      validRecord({ id: "wrong-1" }),
      validRecord({ id: "wrong-2", package: "other" }),
    ])
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected ok:false")
    expect(result.errors).toHaveLength(2)
  })
})
