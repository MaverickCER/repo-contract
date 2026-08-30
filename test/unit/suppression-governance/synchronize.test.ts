import { describe, expect, it } from "vitest"
import type { DiscoveredSuppression } from "../../../scripts/suppression-governance/discover-suppressions.js"
import type { DisableCommentRecord } from "../../../scripts/suppression-governance/evidence-types.js"
import { synchronize } from "../../../scripts/suppression-governance/synchronize.js"

function discovered(overrides: Partial<DiscoveredSuppression> = {}): DiscoveredSuppression {
  return {
    file: "src/example.ts",
    line: 10,
    domain: "eslint",
    rule: ["no-console"],
    content: "eslint-disable-next-line no-console",
    reason: "",
    ...overrides,
  }
}

function existing(overrides: Partial<DisableCommentRecord> = {}): DisableCommentRecord {
  return {
    ...discovered(),
    justification: "",
    alternatives: "",
    remediation: "",
    category: "",
    verificationMethod: "",
    ...overrides,
  }
}

const JUSTIFICATION_A = {
  justification: "A",
  alternatives: "A",
  remediation: "A",
  category: "equivalent-mutant",
  verificationMethod: "mutation-run",
} as const
const JUSTIFICATION_B = {
  justification: "B",
  alternatives: "B",
  remediation: "B",
  category: "unreachable-invariant",
  verificationMethod: "static-reasoning",
} as const

describe("synchronize", () => {
  it("creates a new record (empty justification fields, status: 'new') for a suppression with no prior registry entry", () => {
    const result = synchronize([], [discovered()])

    expect(result.newCount).toBe(1)
    expect(result.records).toEqual([
      {
        ...discovered(),
        justification: "",
        alternatives: "",
        remediation: "",
        category: "",
        verificationMethod: "",
        status: "new",
      },
    ])
  })

  it("preserves an existing suppression's justification fields unchanged when nothing moved", () => {
    const result = synchronize([existing(JUSTIFICATION_A)], [discovered()])

    expect(result.records).toEqual([{ ...discovered(), ...JUSTIFICATION_A, status: "existing" }])
    expect(result.newCount).toBe(0)
    expect(result.movedCount).toBe(0)
  })

  it("preserves a populated category/verificationMethod exactly across an ordinary rerun with no source changes at all", () => {
    const result = synchronize(
      [existing({ category: "tooling-limit", verificationMethod: "mutation-run" })],
      [discovered()],
    )

    expect(result.records[0]?.category).toBe("tooling-limit")
    expect(result.records[0]?.verificationMethod).toBe("mutation-run")
    expect(result.records[0]?.status).toBe("existing")
  })

  it("refreshes 'reason' from the freshly discovered suppression, never the stale registry record, on an otherwise-unchanged match", () => {
    const result = synchronize(
      [existing({ ...JUSTIFICATION_A, reason: "stale reason" })],
      [discovered({ reason: "fresh reason" })],
    )

    expect(result.records).toEqual([
      { ...discovered({ reason: "fresh reason" }), ...JUSTIFICATION_A, status: "existing" },
    ])
  })

  it("removes a registry record whose suppression is no longer found in source", () => {
    const result = synchronize([existing()], [])

    expect(result.records).toEqual([])
    expect(result.removedCount).toBe(1)
  })

  it("preserves justification fields across an unambiguous move (same file/domain/rule/content, different line)", () => {
    const result = synchronize(
      [existing({ line: 10, ...JUSTIFICATION_A })],
      [discovered({ line: 25 })],
    )

    expect(result.movedCount).toBe(1)
    expect(result.records).toEqual([
      { ...discovered({ line: 25 }), ...JUSTIFICATION_A, status: "moved" },
    ])
  })

  it("treats an ambiguous move (two identical suppressions, both relocated) as new + removed, never guessing", () => {
    const result = synchronize(
      [existing({ line: 10, ...JUSTIFICATION_A }), existing({ line: 20, ...JUSTIFICATION_B })],
      [discovered({ line: 15 }), discovered({ line: 30 })],
    )

    expect(result.movedCount).toBe(0)
    expect(result.removedCount).toBe(2)
    expect(result.newCount).toBe(2)
    for (const r of result.records) {
      expect(r.status).toBe("new")
      expect(r.justification).toBe("")
      expect(r.alternatives).toBe("")
      expect(r.remediation).toBe("")
      expect(r.category).toBe("")
      expect(r.verificationMethod).toBe("")
    }
  })

  it("does not confuse duplicate-looking suppressions on different lines when neither moves", () => {
    const result = synchronize(
      [existing({ line: 10, ...JUSTIFICATION_A }), existing({ line: 20, ...JUSTIFICATION_B })],
      [discovered({ line: 10 }), discovered({ line: 20 })],
    )

    expect(result.newCount).toBe(0)
    expect(result.movedCount).toBe(0)
    expect(result.removedCount).toBe(0)
    const byLine = new Map(result.records.map((r) => [r.line, r]))
    expect(byLine.get(10)?.justification).toBe("A")
    expect(byLine.get(20)?.justification).toBe("B")
  })

  it("collapses two discovered suppressions with a byte-identical identity into one record (no duplicate to wedge the next run)", () => {
    // e.g. `/* eslint-disable-line no-console */ /* eslint-disable-line no-console */`
    // on one physical line -> two DiscoveredSuppression with the same
    // (file, line, domain, rule, content).
    const dup = discovered({ line: 10 })
    const result = synchronize([], [dup, dup])
    expect(result.records.filter((r) => r.line === 10)).toHaveLength(1)
    expect(result.newCount).toBe(1)
  })

  it("collapses duplicate-identity discoveries even when a prior registry record exists", () => {
    const dup = discovered({ line: 10 })
    const result = synchronize([existing({ line: 10, ...JUSTIFICATION_A })], [dup, dup])
    const at10 = result.records.filter((r) => r.line === 10)
    expect(at10).toHaveLength(1)
    expect(at10[0]?.justification).toBe("A")
  })

  it("resolves an unambiguous move even when a duplicate suppression stays put", () => {
    // Two identical suppressions at lines 10 and 20; the one at 20 stays, the one at 10 moves to 15.
    const result = synchronize(
      [existing({ line: 10, ...JUSTIFICATION_A }), existing({ line: 20, ...JUSTIFICATION_B })],
      [discovered({ line: 15 }), discovered({ line: 20 })],
    )

    expect(result.movedCount).toBe(1)
    expect(result.newCount).toBe(0)
    expect(result.removedCount).toBe(0)
    const byLine = new Map(result.records.map((r) => [r.line, r]))
    expect(byLine.get(15)?.justification).toBe("A")
    expect(byLine.get(15)?.status).toBe("moved")
    expect(byLine.get(20)?.justification).toBe("B")
    expect(byLine.get(20)?.status).toBe("existing")
  })

  it("produces deterministic output ordering regardless of input array order", () => {
    const a = synchronize(
      [existing({ file: "b.ts" }), existing({ file: "a.ts" })],
      [discovered({ file: "b.ts" }), discovered({ file: "a.ts" })],
    )
    const b = synchronize(
      [existing({ file: "a.ts" }), existing({ file: "b.ts" })],
      [discovered({ file: "a.ts" }), discovered({ file: "b.ts" })],
    )

    expect(a.records).toEqual(b.records)
  })

  it("is idempotent: running synchronize again on its own prior output changes nothing", () => {
    const first = synchronize([], [discovered(), discovered({ line: 20, rule: ["no-alert"] })])
    const asExisting: DisableCommentRecord[] = first.records.map(
      ({
        file,
        line,
        domain,
        rule,
        content,
        justification,
        alternatives,
        remediation,
        category,
        verificationMethod,
        reason,
      }) => ({
        file,
        line,
        domain,
        rule,
        content,
        justification,
        alternatives,
        remediation,
        category,
        verificationMethod,
        reason,
      }),
    )

    const second = synchronize(asExisting, [
      discovered(),
      discovered({ line: 20, rule: ["no-alert"] }),
    ])

    expect(second.newCount).toBe(0)
    expect(second.movedCount).toBe(0)
    expect(second.removedCount).toBe(0)
    expect(second.records.map((r) => ({ ...r, status: undefined }))).toEqual(
      first.records.map((r) => ({ ...r, status: undefined })),
    )
  })
})
