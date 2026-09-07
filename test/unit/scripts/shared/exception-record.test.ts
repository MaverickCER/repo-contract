import { describe, expect, it } from "vitest"
import {
  EXCEPTION_TYPES,
  indexRecordsById,
  isIso8601Timestamp,
  isVerified,
  validateCanonicalIdentity,
} from "../../../../scripts/shared/exception-record.js"
import type { ExceptionVerification } from "../../../../scripts/shared/exception-record.js"
import { hashRequirementFields } from "../../../../src/helpers/index.js"

describe("EXCEPTION_TYPES", () => {
  it("is exactly the documented, closed set of six members", () => {
    expect(EXCEPTION_TYPES).toEqual([
      "validated-false-positive",
      "accepted-risk",
      "compensating-control",
      "tooling-limitation",
      "scheduled-remediation",
      "platform-or-vendor-constraint",
    ])
  })
})

describe("isIso8601Timestamp", () => {
  it("accepts a date, a date-time, and an offset date-time", () => {
    expect(isIso8601Timestamp("2026-01-01")).toBe(true)
    expect(isIso8601Timestamp("2026-01-01T00:00:00.000Z")).toBe(true)
    expect(isIso8601Timestamp("2026-06-15T12:30+05:30")).toBe(true)
  })

  it("accepts a real leap day and rejects a non-leap-year Feb 29", () => {
    expect(isIso8601Timestamp("2024-02-29")).toBe(true)
    expect(isIso8601Timestamp("2026-02-29")).toBe(false)
  })

  it("rejects month-end overflow that Date.parse would silently normalize", () => {
    expect(isIso8601Timestamp("2026-04-31")).toBe(false)
    expect(isIso8601Timestamp("2026-06-31")).toBe(false)
    expect(isIso8601Timestamp("2026-00-10")).toBe(false)
    expect(isIso8601Timestamp("2026-13-01")).toBe(false)
  })

  it("rejects non-ISO shapes and free text", () => {
    expect(isIso8601Timestamp("later")).toBe(false)
    expect(isIso8601Timestamp("2026/01/01")).toBe(false)
    expect(isIso8601Timestamp("Jan 1 2026")).toBe(false)
    expect(isIso8601Timestamp("2026-01-01Tnope")).toBe(false)
    expect(isIso8601Timestamp("")).toBe(false)
  })
})

describe("validateCanonicalIdentity", () => {
  it("returns ok:true when the record's stored id matches its own derived identity", () => {
    const record = {
      id: "advisory-123:left-pad",
      advisoryId: "advisory-123",
      packageName: "left-pad",
    }
    const result = validateCanonicalIdentity(record, (r) => `${r.advisoryId}:${r.packageName}`)
    expect(result).toEqual({ ok: true })
  })

  it("returns ok:false naming both ids when the stored id does not match its own derived identity", () => {
    const record = { id: "wrong-id", advisoryId: "advisory-123", packageName: "left-pad" }
    const result = validateCanonicalIdentity(record, (r) => `${r.advisoryId}:${r.packageName}`)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected ok:false")
    expect(result.error).toContain('"wrong-id"')
    expect(result.error).toContain('"advisory-123:left-pad"')
  })
})

describe("indexRecordsById", () => {
  it("indexes every record by its own stored id", () => {
    const a = { id: "a", value: 1 }
    const b = { id: "b", value: 2 }
    const index = indexRecordsById([a, b])
    expect(index.get("a")).toBe(a)
    expect(index.get("b")).toBe(b)
    expect(index.get("missing")).toBeUndefined()
  })

  it("resolves a duplicate id to the later record (last write wins)", () => {
    const first = { id: "dup", value: "first" }
    const second = { id: "dup", value: "second" }
    const index = indexRecordsById([first, second])
    expect(index.get("dup")).toBe(second)
  })

  it("returns an empty map for an empty input", () => {
    expect(indexRecordsById([]).size).toBe(0)
  })
})

interface VerifiableRecord {
  readonly id: string
  readonly justification: string
  readonly verification?: ExceptionVerification
}

const PROSE_FIELDS = ["justification"] as const

function fieldValue(record: VerifiableRecord, requirement: string): string {
  if (requirement === "justification") return record.justification
  return ""
}

describe("isVerified", () => {
  it("is false when the record has no verification block at all", () => {
    const record: VerifiableRecord = { id: "r1", justification: "Because." }
    expect(isVerified(record, [...PROSE_FIELDS], fieldValue)).toBe(false)
  })

  it("is true when the verification's hash matches the record's current prose fields", () => {
    const unverified: VerifiableRecord = { id: "r1", justification: "Because." }
    const hash = hashRequirementFields(unverified, [...PROSE_FIELDS], fieldValue)
    const record: VerifiableRecord = {
      ...unverified,
      verification: {
        method: "independent-human-review",
        verifiedBy: "alice",
        verifiedAt: "2026-01-01T00:00:00.000Z",
        verifiedContentHash: hash,
      },
    }
    expect(isVerified(record, [...PROSE_FIELDS], fieldValue)).toBe(true)
  })

  it("is false (stale) when the verified content hash no longer matches the record's edited prose", () => {
    const original: VerifiableRecord = { id: "r1", justification: "Original justification." }
    const hash = hashRequirementFields(original, [...PROSE_FIELDS], fieldValue)
    const edited: VerifiableRecord = {
      id: "r1",
      justification: "Edited justification after verification.",
      verification: {
        method: "independent-human-review",
        verifiedBy: "alice",
        verifiedAt: "2026-01-01T00:00:00.000Z",
        verifiedContentHash: hash,
      },
    }
    expect(isVerified(edited, [...PROSE_FIELDS], fieldValue)).toBe(false)
  })
})
