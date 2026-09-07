import { describe, expect, it } from "vitest"
import {
  CODERABBIT_EXCEPTION_TYPES,
  deriveCoderabbitExceptionId,
  validateCoderabbitExceptionRegistry,
} from "../../../scripts/coderabbitai/registry.js"

function validRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "src/example.ts:major",
    version: 1,
    file: "src/example.ts",
    severity: "major",
    justification: "Because.",
    remediation: "Tracked.",
    exceptionType: "accepted-risk",
    ...overrides,
  }
}

describe("CODERABBIT_EXCEPTION_TYPES", () => {
  it("excludes validated-false-positive -- no tool exists to mechanically re-verify an AI finding", () => {
    expect(CODERABBIT_EXCEPTION_TYPES).not.toContain("validated-false-positive")
    expect(CODERABBIT_EXCEPTION_TYPES).toContain("accepted-risk")
  })
})

describe("deriveCoderabbitExceptionId", () => {
  it("joins file and severity exactly like NormalizedFinding.identity", () => {
    const id = deriveCoderabbitExceptionId({
      id: "ignored",
      version: 1,
      file: "src/foo.ts",
      severity: "minor",
      justification: "",
      remediation: "",
      exceptionType: "accepted-risk",
    })
    expect(id).toBe("src/foo.ts:minor")
  })
})

describe("validateCoderabbitExceptionRegistry", () => {
  it("accepts a well-formed exceptions array", () => {
    const result = validateCoderabbitExceptionRegistry([validRecord()])
    expect(result.ok).toBe(true)
  })

  it("rejects a non-array value", () => {
    const result = validateCoderabbitExceptionRegistry({ not: "an array" })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected ok:false")
    expect(result.errors[0]).toContain("must be a JSON array")
  })

  it("rejects a record whose id doesn't match its own derived identity", () => {
    const result = validateCoderabbitExceptionRegistry([validRecord({ id: "wrong-id" })])
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected ok:false")
    expect(result.errors[0]).toContain("does not match its own derived identity")
  })

  it("rejects exceptionType: validated-false-positive outright", () => {
    const result = validateCoderabbitExceptionRegistry([
      validRecord({ exceptionType: "validated-false-positive" }),
    ])
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected ok:false")
    const [message] = result.errors
    expect(message).toContain("exceptionType must be one of")
    // "validated-false-positive" legitimately appears once, in the message's own "(got ...)"
    // echo of the rejected value -- it must never appear a second time, which would mean it was
    // also listed among the *allowed* values.
    const occurrences = (message ?? "").split('"validated-false-positive"').length - 1
    expect(occurrences).toBe(1)
  })

  it("rejects verification.method: mechanical-reverification -- no oracle exists for an AI finding", () => {
    const result = validateCoderabbitExceptionRegistry([
      validRecord({
        verification: {
          method: "mechanical-reverification",
          verifiedBy: "ci",
          verifiedAt: "2026-01-01T00:00:00.000Z",
          verifiedContentHash: "abc",
        },
      }),
    ])
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected ok:false")
    expect(result.errors[0]).toContain("independent-human-review")
  })

  it("accepts verification.method: independent-human-review", () => {
    const result = validateCoderabbitExceptionRegistry([
      validRecord({
        verification: {
          method: "independent-human-review",
          verifiedBy: "a-maintainer",
          verifiedAt: "2026-01-01T00:00:00.000Z",
          verifiedContentHash: "abc",
        },
      }),
    ])
    expect(result.ok).toBe(true)
  })

  it("rejects an invalid severity", () => {
    const result = validateCoderabbitExceptionRegistry([validRecord({ severity: "not-real" })])
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected ok:false")
    expect(result.errors[0]).toContain("severity must be one of")
  })

  it("rejects a duplicate id across two records", () => {
    const result = validateCoderabbitExceptionRegistry([validRecord(), validRecord()])
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected ok:false")
    expect(result.errors.some((e) => e.includes("duplicates an earlier record"))).toBe(true)
  })
})
