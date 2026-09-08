import fc from "fast-check"
import { describe, expect, it } from "vitest"
import {
  reconcileExceptions,
  serializeExceptionRegistry,
} from "../../src/helpers/reconcile-exceptions.js"

/**
 * The reconciliation invariants specs/decisions/0013-reusable-exception-policy-helper.md's "The
 * exception registry is the review surface" section makes load-bearing: reconciliation is
 * add-only, never loses a finding, never deletes a stale record, and produces one active record
 * per finding. Generated over deliberately adversarial registries (duplicate ids, ids that match
 * no finding, records with arbitrary extra fields).
 */

interface Finding {
  readonly subject: string
  readonly detail: number
}

interface Record {
  readonly id: string
  readonly version: number
  readonly justification: string
  readonly [key: string]: unknown
}

const deriveId = (finding: Finding): string => `x:${finding.subject}`
const createStub = (_finding: Finding, id: string): Record => ({
  id,
  version: 1,
  justification: "",
})

const subject = fc.stringMatching(/^[a-z]{1,4}$/)

/** Distinct findings (unique subjects) -- the precondition `reconcileExceptions` requires of `deriveId`. */
const distinctFindings: fc.Arbitrary<Finding[]> = fc.uniqueArray(
  fc.record({ subject, detail: fc.integer() }),
  { selector: (f) => f.subject, maxLength: 12 },
)

const record: fc.Arbitrary<Record> = fc.record({
  id: fc.oneof(
    subject.map((s) => `x:${s}`),
    fc.string({ minLength: 1, maxLength: 6 }),
  ),
  version: fc.constant(1),
  justification: fc.string(),
  extra: fc.option(fc.string(), { nil: undefined }),
})

describe("reconcileExceptions -- invariants", () => {
  it("emits exactly one active record per finding, and the id set is a bijection with the findings", () => {
    fc.assert(
      fc.property(distinctFindings, fc.array(record, { maxLength: 12 }), (findings, existing) => {
        const result = reconcileExceptions({ existing, findings, deriveId, createStub })
        expect(result.ok).toBe(true)
        if (!result.ok) return
        const { activeRecords } = result.reconciliation
        const findingIds = findings.map(deriveId)
        expect(activeRecords).toHaveLength(findings.length)
        expect(new Set(activeRecords.map((r) => r.id))).toEqual(new Set(findingIds))
        expect(activeRecords.map((r) => r.id).sort()).toEqual([...findingIds].sort())
      }),
      { numRuns: 200 },
    )
  })

  it("never removes a stale record -- every existing id absent from the findings appears in staleRecords", () => {
    fc.assert(
      fc.property(distinctFindings, fc.array(record, { maxLength: 12 }), (findings, existing) => {
        const result = reconcileExceptions({ existing, findings, deriveId, createStub })
        if (!result.ok) return
        const findingIds = new Set(findings.map(deriveId))
        const expectedStale = existing.filter((r) => !findingIds.has(r.id))
        expect(result.reconciliation.staleRecords).toEqual(expectedStale)
      }),
      { numRuns: 200 },
    )
  })

  it("preserves a matched record's fields byte-for-byte (returns the same object)", () => {
    fc.assert(
      fc.property(distinctFindings, (findings) => {
        fc.pre(findings.length > 0)
        const existing: Record[] = findings.map((f) => ({
          id: deriveId(f),
          version: 1,
          justification: `reviewed ${f.subject}`,
          note: f.subject,
        }))
        const result = reconcileExceptions({ existing, findings, deriveId, createStub })
        expect(result.ok).toBe(true)
        if (!result.ok) return
        for (const record of result.reconciliation.activeRecords) {
          expect(existing).toContain(record) // identity-equal, not just deep-equal
        }
        expect(result.reconciliation.newStubIds).toEqual([])
      }),
      { numRuns: 200 },
    )
  })

  it("a stub is created for every finding with no matching record, always with an empty justification and the canonical id", () => {
    fc.assert(
      fc.property(distinctFindings, (findings) => {
        const result = reconcileExceptions({ existing: [], findings, deriveId, createStub })
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect([...result.reconciliation.newStubIds].sort()).toEqual(findings.map(deriveId).sort())
        for (const stub of result.reconciliation.activeRecords) {
          expect(stub.justification).toBe("")
        }
      }),
      { numRuns: 200 },
    )
  })

  it("fails on a non-injective deriveId", () => {
    fc.assert(
      fc.property(subject, fc.integer(), fc.integer(), (s, d1, d2) => {
        const findings: Finding[] = [
          { subject: s, detail: d1 },
          { subject: s, detail: d2 },
        ]
        const result = reconcileExceptions({ existing: [], findings, deriveId, createStub })
        expect(result.ok).toBe(false)
      }),
      { numRuns: 200 },
    )
  })
})

describe("serializeExceptionRegistry -- determinism", () => {
  it("is byte-identical regardless of record order, and idempotent through a JSON round-trip", () => {
    fc.assert(
      fc.property(fc.uniqueArray(record, { selector: (r) => r.id, maxLength: 12 }), (records) => {
        const a = serializeExceptionRegistry(records)
        const b = serializeExceptionRegistry([...records].reverse())
        expect(a).toBe(b)
        const reparsed = (JSON.parse(a) as { exceptions: Record[] }).exceptions
        expect(serializeExceptionRegistry(reparsed)).toBe(a)
        expect(a.endsWith("}\n")).toBe(true)
      }),
      { numRuns: 200 },
    )
  })
})
