import { describe, expect, it } from "vitest"
import { toPersistedRecord } from "../../../scripts/suppression-governance/check.js"
import type { SynchronizedRecord } from "../../../scripts/suppression-governance/synchronize.js"

/**
 * Focused, isolated unit test for `toPersistedRecord` -- the function whose own object literal
 * independently enumerates every field written to disk (see check.ts's doc comment on why this
 * exact function was the one drop site that a required-field type change alone couldn't catch).
 * The integration test (test/integration/suppression-governance/check.integration.test.ts) proves
 * the whole pipeline works end-to-end through a real disk round-trip; this test exists so a future
 * regression here fails with a precise, fast, isolated signal instead of a confusing
 * several-layers-away disk-round-trip failure.
 */
function synchronizedRecord(overrides: Partial<SynchronizedRecord> = {}): SynchronizedRecord {
  return {
    file: "src/example.ts",
    line: 42,
    domain: "eslint",
    rule: ["no-console"],
    content: "eslint-disable-next-line no-console",
    justification: "Because.",
    alternatives: "Considered X.",
    remediation: "Tried Y.",
    category: "equivalent-mutant",
    verificationMethod: "mutation-run",
    reason: "",
    status: "existing",
    ...overrides,
  }
}

describe("toPersistedRecord", () => {
  it("carries every hand-authored and discovered field through to the persisted shape, dropping only status", () => {
    const persisted = toPersistedRecord(synchronizedRecord())

    expect(persisted).toEqual({
      file: "src/example.ts",
      line: 42,
      domain: "eslint",
      rule: ["no-console"],
      content: "eslint-disable-next-line no-console",
      justification: "Because.",
      alternatives: "Considered X.",
      remediation: "Tried Y.",
      category: "equivalent-mutant",
      verificationMethod: "mutation-run",
      reason: "",
    })
    expect(Object.keys(persisted)).not.toContain("status")
  })

  it("carries a not-yet-classified ('' category/verificationMethod) record through unchanged", () => {
    const persisted = toPersistedRecord(
      synchronizedRecord({ category: "", verificationMethod: "", status: "new" }),
    )

    expect(persisted.category).toBe("")
    expect(persisted.verificationMethod).toBe("")
  })
})
