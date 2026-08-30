import { describe, expect, it } from "vitest"
import { evaluateGitHubActionsPolicy } from "../../../checks/github-actions.js"
import type {
  ActionlintFinding,
  GitHubActionsEvidence,
} from "../../../scripts/github-actions/evidence-types.js"

function okEvidence(
  overrides: Partial<Extract<GitHubActionsEvidence, { ok: true }>> = {},
): GitHubActionsEvidence {
  return { ok: true, filesScanned: 3, findings: [], ...overrides }
}

function finding(overrides: Partial<ActionlintFinding> = {}): ActionlintFinding {
  return {
    message: "something is wrong",
    file: ".github/workflows/ci.yml",
    line: 7,
    column: 9,
    kind: "syntax-check",
    ...overrides,
  }
}

describe("evaluateGitHubActionsPolicy", () => {
  it("passes and reports the file count when actionlint found nothing", () => {
    const result = evaluateGitHubActionsPolicy({ evidence: okEvidence() })
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain("0 issue(s) across 3 workflow file(s)")
  })

  it("passes when there are no workflow files to lint", () => {
    const result = evaluateGitHubActionsPolicy({
      evidence: okEvidence({ filesScanned: 0 }),
    })
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain("No .github/workflows")
  })

  it("fails and lists every finding by file, location, and kind", () => {
    const result = evaluateGitHubActionsPolicy({
      evidence: okEvidence({
        findings: [
          finding({ line: 7, column: 9, kind: "expression", message: "untrusted input in run:" }),
          finding({
            file: ".github/workflows/release.yml",
            line: 2,
            column: 1,
            kind: "syntax-check",
            message: "could not parse",
          }),
        ],
      }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("2 issue(s)")
    expect(result.rationale).toContain(
      ".github/workflows/ci.yml:7:9 [expression] untrusted input in run:",
    )
    expect(result.rationale).toContain(
      ".github/workflows/release.yml:2:1 [syntax-check] could not parse",
    )
  })

  it("fails with a tool-infrastructure message when actionlint could not run", () => {
    const result = evaluateGitHubActionsPolicy({
      evidence: { ok: false, error: "actionlint could not be started: spawn ENOENT" },
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("actionlint could not be evaluated")
    expect(result.rationale).toContain("spawn ENOENT")
  })
})
