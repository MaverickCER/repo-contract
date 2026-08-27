import { describe, expect, it } from "vitest"
import { evaluateAdrGovernancePolicy } from "../../../checks/adr-governance.js"
import type { AdrGovernanceEvidence } from "../../../scripts/adr-governance/evidence-types.js"

function evidence(overrides: Partial<AdrGovernanceEvidence> = {}): AdrGovernanceEvidence {
  return {
    baseRef: "origin/main",
    governedFilesTouched: [],
    adrFilesTouched: [],
    changesetPath: undefined,
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

  it("passes when a changeset entry references an existing ADR", () => {
    const result = evaluateAdrGovernancePolicy({
      evidence: evidence({
        governedFilesTouched: ["src/policy/run-policies.ts"],
        satisfied: true,
        changesetPath: ".changeset/repo-contract.md",
        resolvedAdrNumbers: ["0003"],
      }),
    })
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain(
      ".changeset/repo-contract.md references existing ADR(s): 0003",
    )
  })

  it("fails and lists the governed files when nothing satisfies the check", () => {
    const result = evaluateAdrGovernancePolicy({
      evidence: evidence({
        governedFilesTouched: ["src/execution/spawn-check.ts", "src/policy/run-policies.ts"],
        satisfied: false,
        changesetPath: ".changeset/repo-contract.md",
      }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("2 file(s) under src/execution/ or src/policy/")
    expect(result.rationale).toContain("in .changeset/repo-contract.md")
    expect(result.rationale).toContain("- src/execution/spawn-check.ts")
    expect(result.rationale).toContain("- src/policy/run-policies.ts")
  })

  it("fails without naming a changeset file when none was found", () => {
    const result = evaluateAdrGovernancePolicy({
      evidence: evidence({
        governedFilesTouched: ["src/policy/run-policies.ts"],
        satisfied: false,
        changesetPath: undefined,
      }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).not.toContain(" in undefined")
    expect(result.rationale).toContain(
      'Add or amend an ADR under specs/decisions/, or reference one (e.g. "ADR 0003") in your changeset file.',
    )
  })
})
