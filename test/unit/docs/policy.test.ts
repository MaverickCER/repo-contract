import { describe, expect, it } from "vitest"
import { evaluateDocsPolicy } from "../../../checks/docs.js"
import type {
  CombinedDocsEvidence,
  LinkinatorLink,
  MarkdownlintFinding,
} from "../../../checks/docs.js"

function markdownlintFinding(overrides: Partial<MarkdownlintFinding> = {}): MarkdownlintFinding {
  return {
    fileName: "README.md",
    lineNumber: 1,
    ruleNames: ["MD013"],
    ruleDescription: "Line length",
    errorDetail: null,
    severity: "error",
    ...overrides,
  }
}

function link(overrides: Partial<LinkinatorLink> = {}): LinkinatorLink {
  return { url: "https://example.com", status: 200, state: "OK", ...overrides }
}

function evidence(overrides: Partial<CombinedDocsEvidence> = {}): CombinedDocsEvidence {
  return {
    markdownlint: { ok: true, value: [] },
    linkinator: { ok: true, value: { links: [] } },
    ...overrides,
  }
}

describe("evaluateDocsPolicy", () => {
  it("passes with zero issues from either tool", () => {
    const result = evaluateDocsPolicy({ evidence: evidence() })
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain("markdownlint-cli2 reported 0 issues")
    expect(result.rationale).toContain("linkinator found 0 broken link(s)")
  })

  it("fails on a markdownlint finding", () => {
    const result = evaluateDocsPolicy({
      evidence: evidence({ markdownlint: { ok: true, value: [markdownlintFinding()] } }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("markdownlint-cli2 reported 1 error(s)")
    expect(result.rationale).toContain("README.md:1")
  })

  it("fails on a BROKEN link", () => {
    const result = evaluateDocsPolicy({
      evidence: evidence({
        linkinator: { ok: true, value: { links: [link({ state: "BROKEN", status: 404 })] } },
      }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("linkinator found 1 broken link(s)")
    expect(result.rationale).toContain("HTTP 404")
  })

  it("does not count an OK link as broken -- regression guard for the exact state string the filter depends on", () => {
    const result = evaluateDocsPolicy({
      evidence: evidence({ linkinator: { ok: true, value: { links: [link({ state: "OK" })] } } }),
    })
    expect(result.outcome).toBe("pass")
  })

  it("does not count a SKIPPED link as broken", () => {
    const result = evaluateDocsPolicy({
      evidence: evidence({
        linkinator: { ok: true, value: { links: [link({ state: "SKIPPED" })] } },
      }),
    })
    expect(result.outcome).toBe("pass")
  })

  it("fails with an infrastructure message when markdownlint-cli2 itself could not be evaluated", () => {
    const result = evaluateDocsPolicy({
      evidence: evidence({ markdownlint: { ok: false, error: "markdownlint-cli2 crashed" } }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain(
      "markdownlint-cli2 could not be evaluated: markdownlint-cli2 crashed",
    )
  })

  it("fails with an infrastructure message when linkinator itself could not be evaluated", () => {
    const result = evaluateDocsPolicy({
      evidence: evidence({ linkinator: { ok: false, error: "linkinator crashed" } }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("linkinator could not be evaluated: linkinator crashed")
  })

  it("warns (never blocks) on a warning-severity markdownlint finding, like lint/accessibility do", () => {
    const result = evaluateDocsPolicy({
      evidence: evidence({
        markdownlint: { ok: true, value: [markdownlintFinding({ severity: "warning" })] },
      }),
    })
    expect(result.outcome).toBe("warn")
    expect(result.rationale).toContain("markdownlint-cli2 reported 1 warning(s)")
  })

  it("still fails on an error-severity finding even when a warning is also present", () => {
    const result = evaluateDocsPolicy({
      evidence: evidence({
        markdownlint: {
          ok: true,
          value: [markdownlintFinding(), markdownlintFinding({ severity: "warning" })],
        },
      }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("markdownlint-cli2 reported 1 error(s)")
    expect(result.rationale).toContain("markdownlint-cli2 reported 1 warning(s)")
  })

  it("reports both tools' issues together when both find problems", () => {
    const result = evaluateDocsPolicy({
      evidence: evidence({
        markdownlint: { ok: true, value: [markdownlintFinding()] },
        linkinator: { ok: true, value: { links: [link({ state: "BROKEN" })] } },
      }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("markdownlint-cli2 reported 1 error(s)")
    expect(result.rationale).toContain("linkinator found 1 broken link(s)")
  })
})
