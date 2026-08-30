import { describe, expect, it } from "vitest"
import { evaluateAdrGovernancePolicy } from "../../../checks/adr-governance.js"
import type { AdrGovernanceEvidence } from "../../../scripts/adr-governance/evidence-types.js"

function evidence(overrides: Partial<AdrGovernanceEvidence> = {}): AdrGovernanceEvidence {
  return {
    baseRef: "origin/main",
    governedFilesTouched: [],
    adrFilesTouched: [],
    commitsScanned: 0,
    referencedAdrNumbers: [],
    resolvedAdrNumbers: [],
    satisfied: true,
    ...overrides,
  }
}

describe("evaluateAdrGovernancePolicy", () => {
  it("passes with 'nothing governed by this check' when no governed files changed", () => {
    const result = evaluateAdrGovernancePolicy({ evidence: evidence() })
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain("nothing governed by this check")
    expect(result.rationale).toContain("origin/main")
  })

  it("passes and lists the touched ADR files when specs/decisions/ itself was engaged", () => {
    const result = evaluateAdrGovernancePolicy({
      evidence: evidence({
        governedFilesTouched: ["src/execution/spawn-check.ts"],
        adrFilesTouched: ["specs/decisions/0022-new-decision.md"],
      }),
    })
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain("1 file(s) under specs/decisions/ were touched")
    expect(result.rationale).toContain("- specs/decisions/0022-new-decision.md")
  })

  it("passes when a commit message references an existing ADR", () => {
    const result = evaluateAdrGovernancePolicy({
      evidence: evidence({
        governedFilesTouched: ["src/policy/run-policies.ts"],
        satisfied: true,
        commitsScanned: 2,
        referencedAdrNumbers: ["0003"],
        resolvedAdrNumbers: ["0003"],
      }),
    })
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain("a commit message references existing ADR(s): 0003")
  })

  it("fails and lists the governed files when nothing satisfies the check", () => {
    const result = evaluateAdrGovernancePolicy({
      evidence: evidence({
        governedFilesTouched: ["src/execution/spawn-check.ts", "src/policy/run-policies.ts"],
        satisfied: false,
        commitsScanned: 3,
      }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("2 file(s) under src/execution/ or src/policy/")
    expect(result.rationale).toContain("none of the 3 commit message(s)")
    expect(result.rationale).toContain("- src/execution/spawn-check.ts")
    expect(result.rationale).toContain("- src/policy/run-policies.ts")
  })

  it("fails with commit-message guidance when nothing references an ADR", () => {
    const result = evaluateAdrGovernancePolicy({
      evidence: evidence({
        governedFilesTouched: ["src/policy/run-policies.ts"],
        satisfied: false,
        commitsScanned: 1,
      }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain(
      'Add or amend an ADR under specs/decisions/, or reference one (e.g. "ADR 0003") in a commit message on this branch.',
    )
  })
})
