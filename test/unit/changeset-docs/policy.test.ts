import { describe, expect, it } from "vitest"
import { evaluateChangesetDocsPolicy } from "../../../checks/changeset-docs.js"
import type {
  ChangesetDocsEvidence,
  DocTableRow,
} from "../../../scripts/changeset-docs/evidence-types.js"

function row(overrides: Partial<DocTableRow> = {}): DocTableRow {
  return {
    path: "src/foo.ts",
    changeKind: "modified",
    linesAdded: 1,
    linesRemoved: 1,
    description: "A description.",
    ...overrides,
  }
}

function evidence(overrides: Partial<ChangesetDocsEvidence> = {}): ChangesetDocsEvidence {
  return {
    baseRef: "origin/main",
    rows: [],
    changesetPath: undefined,
    allDescribed: true,
    ...overrides,
  }
}

describe("evaluateChangesetDocsPolicy", () => {
  it("passes with 'nothing to document' when there are no rows", () => {
    const result = evaluateChangesetDocsPolicy({ evidence: evidence() })
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain("nothing to document")
  })

  it("passes when every row has a description", () => {
    const result = evaluateChangesetDocsPolicy({
      evidence: evidence({
        rows: [row(), row({ path: "src/bar.ts" })],
        changesetPath: ".changeset/repo-contract.md",
        allDescribed: true,
      }),
    })
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain("All 2 changed file(s)")
    expect(result.rationale).toContain(".changeset/repo-contract.md")
  })

  it("fails and lists exactly the undescribed paths when some rows lack a description", () => {
    const result = evaluateChangesetDocsPolicy({
      evidence: evidence({
        rows: [
          row(),
          row({ path: "src/bar.ts", description: undefined }),
          row({ path: "src/baz.ts", description: undefined }),
        ],
        changesetPath: ".changeset/repo-contract.md",
        allDescribed: false,
      }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("2 of 3 changed file(s)")
    expect(result.rationale).toContain("- src/bar.ts")
    expect(result.rationale).toContain("- src/baz.ts")
    expect(result.rationale).not.toContain("- src/foo.ts")
  })
})
