import { describe, expect, it } from "vitest"
import { renderScorecardMarkdown } from "../../../../scripts/openssf-scorecard/render-markdown.js"

describe("renderScorecardMarkdown", () => {
  it("escapes a literal backslash before escaping a pipe, so a reason containing both never corrupts the table", () => {
    const markdown = renderScorecardMarkdown({
      repo: "owner/repo",
      generatedAt: "2026-01-01T00:00:00.000Z",
      results: [
        {
          name: "Pinned-Dependencies",
          score: 8,
          reason: String.raw`Path C:\deps|other has a pipe`,
          details: [],
        },
      ],
    })
    const row = markdown.split("\n").find((line) => line.includes("Pinned-Dependencies"))
    expect(row).toBe(String.raw`| Pinned-Dependencies | 8/10 | Path C:\\deps\|other has a pipe |`)
  })

  it("still escapes a plain pipe with no backslash present", () => {
    const markdown = renderScorecardMarkdown({
      repo: "owner/repo",
      generatedAt: "2026-01-01T00:00:00.000Z",
      results: [
        { name: "Token-Permissions", score: "not-applicable", reason: "a | b", details: [] },
      ],
    })
    const row = markdown.split("\n").find((line) => line.includes("Token-Permissions"))
    expect(row).toBe("| Token-Permissions | N/A | a \\| b |")
  })
})
