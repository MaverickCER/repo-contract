import { describe, expect, it } from "vitest"
import { docsLinkFieldValue, evaluateDocsPolicy, isExternalUrl } from "../../../checks/docs.js"
import type {
  CombinedDocsEvidence,
  DocsLinkExceptionEvidence,
  DocsLinkExceptionRecord,
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

function noExceptions(): DocsLinkExceptionEvidence {
  return { activeExceptions: {}, staleExceptions: [], scaffoldedIds: [] }
}

function exceptionRecord(
  overrides: Partial<DocsLinkExceptionRecord> = {},
): DocsLinkExceptionRecord {
  return {
    id: "docs-links:https://example.com",
    version: 1,
    justification: "Confirmed live via direct curl; linkinator flakes on this host in CI.",
    url: "https://example.com",
    ...overrides,
  }
}

function withActive(...records: readonly DocsLinkExceptionRecord[]): DocsLinkExceptionEvidence {
  const activeExceptions: Record<string, DocsLinkExceptionRecord> = {}
  for (const record of records) activeExceptions[record.id] = record
  return { activeExceptions, staleExceptions: [], scaffoldedIds: [] }
}

describe("evaluateDocsPolicy", () => {
  it("passes with zero issues from either tool", () => {
    const result = evaluateDocsPolicy({ evidence: evidence(), linkExceptions: noExceptions() })
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toBe(
      "markdownlint-cli2 reported 0 issues; linkinator found 0 broken link(s) across 0 checked.",
    )
  })

  it("fails on a markdownlint finding", () => {
    const result = evaluateDocsPolicy({
      evidence: evidence({ markdownlint: { ok: true, value: [markdownlintFinding()] } }),
      linkExceptions: noExceptions(),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("markdownlint-cli2 reported 1 error(s)")
    expect(result.rationale).toContain("README.md:1")
  })

  it("joins two rule names with '/', not blank -- regression guard for the exact separator ruleNames.join depends on", () => {
    const result = evaluateDocsPolicy({
      evidence: evidence({
        markdownlint: {
          ok: true,
          value: [markdownlintFinding({ ruleNames: ["MD013", "MD041"] })],
        },
      }),
      linkExceptions: noExceptions(),
    })
    expect(result.rationale).toContain("[MD013/MD041]")
  })

  it("omits the parenthesized detail entirely when errorDetail is null, not a literal empty suffix", () => {
    const result = evaluateDocsPolicy({
      evidence: evidence({ markdownlint: { ok: true, value: [markdownlintFinding()] } }),
      linkExceptions: noExceptions(),
    })
    expect(result.rationale.split("\n")).toContain("- README.md:1 [MD013]: Line length")
  })

  it("appends the parenthesized detail when errorDetail is set", () => {
    const result = evaluateDocsPolicy({
      evidence: evidence({
        markdownlint: {
          ok: true,
          value: [markdownlintFinding({ errorDetail: "Expected: 80; Actual: 120" })],
        },
      }),
      linkExceptions: noExceptions(),
    })
    expect(result.rationale.split("\n")).toContain(
      "- README.md:1 [MD013]: Line length (Expected: 80; Actual: 120)",
    )
  })

  it("fails on an unwaived BROKEN external link", () => {
    const result = evaluateDocsPolicy({
      evidence: evidence({
        linkinator: { ok: true, value: { links: [link({ state: "BROKEN", status: 404 })] } },
      }),
      linkExceptions: noExceptions(),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale.split("\n")).toEqual([
      "linkinator found 1 broken link(s):",
      "- https://example.com -- HTTP 404 -- no exception record -- add one to " +
        ".repo-contract/exceptions/docs-links.json if this link is known-good but flaky",
    ])
  })

  it("fails on a BROKEN local link, unconditionally -- a local link can never be waived", () => {
    const result = evaluateDocsPolicy({
      evidence: evidence({
        linkinator: {
          ok: true,
          value: { links: [link({ url: "/missing.md", state: "BROKEN", status: 404 })] },
        },
      }),
      linkExceptions: withActive(
        exceptionRecord({ id: "docs-links:/missing.md", url: "/missing.md" }),
      ),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("/missing.md")
    expect(result.rationale).not.toContain("no exception record")
  })

  it("treats a plain http:// URL as external too, not only https://", () => {
    const result = evaluateDocsPolicy({
      evidence: evidence({
        linkinator: {
          ok: true,
          value: { links: [link({ url: "http://example.com", state: "BROKEN", status: 0 })] },
        },
      }),
      linkExceptions: withActive(
        exceptionRecord({ id: "docs-links:http://example.com", url: "http://example.com" }),
      ),
    })
    expect(result.outcome).toBe("pass")
  })

  it("treats a url with 'https://' only as a substring, not a leading scheme, as local -- never waivable", () => {
    const brokenUrl = "/redirects/see-https://example.com"
    const result = evaluateDocsPolicy({
      evidence: evidence({
        linkinator: {
          ok: true,
          value: { links: [link({ url: brokenUrl, state: "BROKEN", status: 404 })] },
        },
      }),
      linkExceptions: withActive(
        exceptionRecord({ id: `docs-links:${brokenUrl}`, url: brokenUrl }),
      ),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).not.toContain("no exception record")
  })

  it("counts a waived-with-an-active-record local link exactly once, not duplicated as an external offender", () => {
    const result = evaluateDocsPolicy({
      evidence: evidence({
        linkinator: {
          ok: true,
          value: { links: [link({ url: "/missing.md", state: "BROKEN", status: 404 })] },
        },
      }),
      linkExceptions: noExceptions(),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("linkinator found 1 broken link(s):")
    expect(result.rationale).not.toContain("no exception record")
  })

  it("passes a BROKEN external link with a matching, justified exception record", () => {
    const result = evaluateDocsPolicy({
      evidence: evidence({
        linkinator: { ok: true, value: { links: [link({ state: "BROKEN", status: 0 })] } },
      }),
      linkExceptions: withActive(exceptionRecord()),
    })
    expect(result.rationale).toBe(
      "markdownlint-cli2 reported 0 issues; linkinator found 0 broken link(s) " +
        "(1 known-flaky external link(s) waived, see .repo-contract/exceptions/docs-links.json) " +
        "across 1 checked.",
    )
  })

  it("fails a BROKEN external link whose matching record has an empty justification", () => {
    const result = evaluateDocsPolicy({
      evidence: evidence({
        linkinator: { ok: true, value: { links: [link({ state: "BROKEN", status: 0 })] } },
      }),
      linkExceptions: withActive(exceptionRecord({ justification: "" })),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("exception incomplete (missing: justification)")
  })

  it("fails on a stale docs-link exception -- a waiver whose url is no longer linked at all", () => {
    const result = evaluateDocsPolicy({
      evidence: evidence(),
      linkExceptions: {
        activeExceptions: {},
        staleExceptions: [exceptionRecord()],
        scaffoldedIds: [],
      },
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("1 stale docs-link exception(s):")
    expect(result.rationale).toContain("Stale exception")
    expect(result.rationale).toContain("docs-links:https://example.com")
  })

  it("does not count an OK link as broken -- regression guard for the exact state string the filter depends on", () => {
    const result = evaluateDocsPolicy({
      evidence: evidence({ linkinator: { ok: true, value: { links: [link({ state: "OK" })] } } }),
      linkExceptions: noExceptions(),
    })
    expect(result.outcome).toBe("pass")
  })

  it("does not count a SKIPPED link as broken", () => {
    const result = evaluateDocsPolicy({
      evidence: evidence({
        linkinator: { ok: true, value: { links: [link({ state: "SKIPPED" })] } },
      }),
      linkExceptions: noExceptions(),
    })
    expect(result.outcome).toBe("pass")
  })

  it("fails with an infrastructure message when markdownlint-cli2 itself could not be evaluated", () => {
    const result = evaluateDocsPolicy({
      evidence: evidence({ markdownlint: { ok: false, error: "markdownlint-cli2 crashed" } }),
      linkExceptions: noExceptions(),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain(
      "markdownlint-cli2 could not be evaluated: markdownlint-cli2 crashed",
    )
  })

  it("fails with an infrastructure message when linkinator itself could not be evaluated", () => {
    const result = evaluateDocsPolicy({
      evidence: evidence({ linkinator: { ok: false, error: "linkinator crashed" } }),
      linkExceptions: noExceptions(),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("linkinator could not be evaluated: linkinator crashed")
  })

  it("warns (never blocks) on a warning-severity markdownlint finding, like lint/accessibility do", () => {
    const result = evaluateDocsPolicy({
      evidence: evidence({
        markdownlint: { ok: true, value: [markdownlintFinding({ severity: "warning" })] },
      }),
      linkExceptions: noExceptions(),
    })
    expect(result.outcome).toBe("warn")
    expect(result.rationale).toBe(
      "markdownlint-cli2 reported 1 warning(s):\n- README.md:1 [MD013]: Line length",
    )
  })

  it("still fails on an error-severity finding even when a warning is also present", () => {
    const result = evaluateDocsPolicy({
      evidence: evidence({
        markdownlint: {
          ok: true,
          value: [markdownlintFinding(), markdownlintFinding({ severity: "warning" })],
        },
      }),
      linkExceptions: noExceptions(),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toBe(
      [
        "markdownlint-cli2 reported 1 error(s):",
        "- README.md:1 [MD013]: Line length",
        "markdownlint-cli2 reported 1 warning(s):",
        "- README.md:1 [MD013]: Line length",
      ].join("\n"),
    )
  })

  it("reports both tools' issues together when both find problems", () => {
    const result = evaluateDocsPolicy({
      evidence: evidence({
        markdownlint: { ok: true, value: [markdownlintFinding()] },
        linkinator: { ok: true, value: { links: [link({ state: "BROKEN" })] } },
      }),
      linkExceptions: noExceptions(),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("markdownlint-cli2 reported 1 error(s)")
    expect(result.rationale).toContain("linkinator found 1 broken link(s)")
  })
})

describe("docsLinkFieldValue", () => {
  it("reads a real string field", () => {
    expect(docsLinkFieldValue(exceptionRecord({ justification: "because" }), "justification")).toBe(
      "because",
    )
  })

  it("falls back to '' for a non-string field (e.g. the numeric version)", () => {
    expect(docsLinkFieldValue(exceptionRecord(), "version")).toBe("")
  })

  it("falls back to '' for a requirement naming a key the record doesn't have at all", () => {
    expect(docsLinkFieldValue(exceptionRecord(), "doesNotExist")).toBe("")
  })
})

describe("isExternalUrl", () => {
  it("accepts https://", () => {
    expect(isExternalUrl("https://example.com")).toBe(true)
  })

  it("accepts http://, not only https://", () => {
    expect(isExternalUrl("http://example.com")).toBe(true)
  })

  it("rejects a non-http(s) scheme with an otherwise well-formed authority", () => {
    expect(isExternalUrl("ftp://example.com")).toBe(false)
  })

  it("rejects a relative local path", () => {
    expect(isExternalUrl("/missing.md")).toBe(false)
  })

  it("rejects a bare anchor", () => {
    expect(isExternalUrl("#section")).toBe(false)
  })

  it("rejects a value that merely contains 'https://' without being an absolute URL", () => {
    expect(isExternalUrl("/redirects/see-https://example.com")).toBe(false)
  })
})
