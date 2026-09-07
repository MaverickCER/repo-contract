import { describe, expect, it } from "vitest"
import {
  deriveNetworkExceptionId,
  validateNetworkExceptionRegistry,
} from "../../../scripts/security-network/registry.js"

function validRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "restricted-module-import:src/presets/evil.ts:3",
    version: 1,
    capability: "restricted-module-import",
    file: "src/presets/evil.ts",
    line: 3,
    justification: "Type-only import, elided at build time.",
    alternatives: "None found.",
    remediation: "Tracked upstream.",
    exceptionType: "accepted-risk",
    ...overrides,
  }
}

describe("deriveNetworkExceptionId", () => {
  it("joins capability, file, and line exactly like checks/security-network.ts's finding identity", () => {
    const id = deriveNetworkExceptionId({
      id: "ignored",
      version: 1,
      capability: "unreviewed-preset-command",
      file: "src/presets/x.ts",
      line: 42,
      justification: "",
      alternatives: "",
      remediation: "",
      exceptionType: "accepted-risk",
    })
    expect(id).toBe("unreviewed-preset-command:src/presets/x.ts:42")
  })
})

describe("validateNetworkExceptionRegistry", () => {
  it("accepts a well-formed exceptions array", () => {
    const result = validateNetworkExceptionRegistry([validRecord()])
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected ok:true")
    expect(result.records).toHaveLength(1)
  })

  it("rejects a non-array value", () => {
    const result = validateNetworkExceptionRegistry({ not: "an array" })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected ok:false")
    expect(result.errors[0]).toContain("must be a JSON array")
  })

  it("rejects a record whose id doesn't match its own derived identity", () => {
    const result = validateNetworkExceptionRegistry([validRecord({ id: "wrong-id" })])
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected ok:false")
    expect(result.errors[0]).toContain("does not match its own derived identity")
  })

  it("rejects an unknown capability kind", () => {
    const result = validateNetworkExceptionRegistry([validRecord({ capability: "wat" })])
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected ok:false")
    expect(result.errors[0]).toContain("capability must be one of")
  })

  it("rejects a non-positive-integer line", () => {
    const result = validateNetworkExceptionRegistry([
      validRecord({ id: "restricted-module-import:src/presets/evil.ts:0", line: 0 }),
    ])
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected ok:false")
    expect(result.errors.some((e) => e.includes("line must be a positive integer"))).toBe(true)
  })

  it("rejects an invalid exceptionType", () => {
    const result = validateNetworkExceptionRegistry([validRecord({ exceptionType: "not-real" })])
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected ok:false")
    expect(result.errors[0]).toContain("exceptionType must be one of")
  })

  it("rejects a duplicate id across two records", () => {
    const result = validateNetworkExceptionRegistry([validRecord(), validRecord()])
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected ok:false")
    expect(result.errors.some((e) => e.includes("duplicates an earlier record"))).toBe(true)
  })

  it("rejects a validated-false-positive record backed only by independent-human-review", () => {
    const result = validateNetworkExceptionRegistry([
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

  it("accepts a validated-false-positive record backed by a mechanical re-scan", () => {
    const result = validateNetworkExceptionRegistry([
      validRecord({
        exceptionType: "validated-false-positive",
        verification: {
          method: "mechanical-reverification",
          verifiedBy: "scoped-rescan",
          verifiedAt: "2026-01-01T00:00:00.000Z",
          verifiedContentHash: "abc",
        },
      }),
    ])
    expect(result.ok).toBe(true)
  })

  it("rejects a verification block missing a required field", () => {
    const result = validateNetworkExceptionRegistry([
      validRecord({ verification: { method: "independent-human-review" } }),
    ])
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected ok:false")
    expect(result.errors.some((e) => e.includes("verifiedBy"))).toBe(true)
    expect(result.errors.some((e) => e.includes("verifiedContentHash"))).toBe(true)
  })

  it("reports every problem across multiple bad records, not just the first", () => {
    const result = validateNetworkExceptionRegistry([
      validRecord({ id: "wrong-1" }),
      validRecord({ id: "wrong-2", file: "src/other.ts" }),
    ])
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected ok:false")
    expect(result.errors).toHaveLength(2)
  })
})
