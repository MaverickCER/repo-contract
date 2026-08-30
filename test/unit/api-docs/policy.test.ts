import { describe, expect, it } from "vitest"
import { evaluateApiDocsPolicy } from "../../../checks/api-docs.js"
import type {
  ApiDocsEvidence,
  ApiDocsReportEvidence,
} from "../../../scripts/api-docs/evidence-types.js"

function report(overrides: Partial<ApiDocsReportEvidence> = {}): ApiDocsReportEvidence {
  return {
    reportFileName: "repo-contract",
    committedPath: "docs/api-report/repo-contract.api.md",
    upToDate: true,
    undocumentedMarkers: [],
    ...overrides,
  }
}

function evidence(reports: readonly ApiDocsReportEvidence[]): ApiDocsEvidence {
  return { reports }
}

describe("evaluateApiDocsPolicy", () => {
  it("passes when every report is up to date and fully documented", () => {
    const result = evaluateApiDocsPolicy({
      evidence: evidence([report(), report({ reportFileName: "repo-contract-presets" })]),
    })
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain("2 generated API report(s)")
  })

  it("fails and names the report when it's out of date", () => {
    const result = evaluateApiDocsPolicy({
      evidence: evidence([report({ upToDate: false })]),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("docs/api-report/repo-contract.api.md is out of date")
    expect(result.rationale).toContain("npm run api-docs:generate")
  })

  it("fails and lists exactly the undocumented markers", () => {
    const result = evaluateApiDocsPolicy({
      evidence: evidence([report({ undocumentedMarkers: ["line 14: // (undocumented)"] })]),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("- repo-contract: line 14: // (undocumented)")
  })

  it("reports both staleness and undocumented markers across multiple reports in the same failure", () => {
    const result = evaluateApiDocsPolicy({
      evidence: evidence([
        report({ upToDate: false }),
        report({
          reportFileName: "repo-contract-presets",
          committedPath: "docs/api-report/repo-contract-presets.api.md",
          undocumentedMarkers: ["line 3: // (undocumented)"],
        }),
      ]),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("docs/api-report/repo-contract.api.md is out of date")
    expect(result.rationale).toContain("- repo-contract-presets: line 3: // (undocumented)")
  })
})
