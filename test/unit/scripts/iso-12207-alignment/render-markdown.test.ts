import { describe, expect, it } from "vitest"
import { renderAlignmentMarkdown } from "../../../../scripts/iso-12207-alignment/render-markdown.js"

describe("renderAlignmentMarkdown", () => {
  it("escapes a literal backslash before escaping a pipe, so a summary containing both never corrupts the table", () => {
    const markdown = renderAlignmentMarkdown({
      repo: "owner/repo",
      generatedAt: "2026-01-01T00:00:00.000Z",
      entries: [
        {
          category: "Agreement Processes",
          process: "Acquisition",
          status: "evidence-found",
          summary: String.raw`Path C:\evidence|other has a pipe`,
        },
      ],
    })
    const row = markdown.split("\n").find((line) => line.includes("Acquisition"))
    expect(row).toBe(
      String.raw`| Acquisition | Evidence found | Path C:\\evidence\|other has a pipe |`,
    )
  })

  it("still escapes a plain pipe with no backslash present", () => {
    const markdown = renderAlignmentMarkdown({
      repo: "owner/repo",
      generatedAt: "2026-01-01T00:00:00.000Z",
      entries: [
        {
          category: "Agreement Processes",
          process: "Supply",
          status: "evidence-found",
          summary: "a | b",
        },
      ],
    })
    const row = markdown.split("\n").find((line) => line.includes("| Supply |"))
    expect(row).toBe("| Supply | Evidence found | a \\| b |")
  })
})
