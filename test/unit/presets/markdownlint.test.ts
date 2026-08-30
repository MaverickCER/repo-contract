import { describe, expect, it, vi, beforeEach } from "vitest"
import { markdownlint } from "../../../src/presets/markdownlint.js"
import { enoentEvidence, fakeContext, fakeCheckEvidence } from "./fixtures.js"

// Same real-fs-collision rationale as duplication.test.ts -- see that
// file's comment. `markdownlint`'s policy reads a fixed relative path with
// no injectable cwd, and this repository's own `docs` check touches the
// adjacent `reports/` tree concurrently during `npm run contract`.
const { readFile } = vi.hoisted(() => ({ readFile: vi.fn() }))
vi.mock("node:fs/promises", () => ({ readFile }))

beforeEach(() => {
  readFile.mockReset()
})

describe("markdownlint preset", () => {
  it("defaults to glob '**/*.md'", () => {
    expect(markdownlint().run).toEqual(["markdownlint-cli2", "**/*.md"])
  })

  it("threads a custom glob option into the run command", () => {
    expect(markdownlint({ glob: "docs/**/*.md" }).run).toEqual([
      "markdownlint-cli2",
      "docs/**/*.md",
    ])
  })

  it("fails with an actionable message when markdownlint-cli2 is not installed", async () => {
    const result = await markdownlint().policy(fakeContext(enoentEvidence("markdownlint-cli2")))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("`markdownlint-cli2`")
  })

  it("reads the report from reports/markdownlint.json", async () => {
    readFile.mockResolvedValue("[]")
    await markdownlint().policy(fakeContext(fakeCheckEvidence()))
    expect(readFile).toHaveBeenCalledWith("reports/markdownlint.json", "utf8")
  })

  it("fails with the exact setup guidance when the report file was never written", async () => {
    readFile.mockRejectedValue(new Error("ENOENT"))
    const result = await markdownlint().policy(fakeContext(fakeCheckEvidence()))
    expect(result).toEqual({
      outcome: "fail",
      rationale:
        "markdownlint-cli2 did not produce its expected JSON report -- confirm your " +
        ".markdownlint-cli2.jsonc configures outputFormatters to write " +
        '"reports/markdownlint.json" (requires the markdownlint-cli2-formatter-json package).',
    })
  })

  it("fails when the report file contains invalid JSON", async () => {
    readFile.mockResolvedValue("not json")
    const result = await markdownlint().policy(fakeContext(fakeCheckEvidence()))
    expect(result).toEqual({
      outcome: "fail",
      rationale: "markdownlint-cli2 produced invalid JSON evidence.",
    })
  })

  it("passes when the report is an empty array", async () => {
    readFile.mockResolvedValue("[]")
    const result = await markdownlint().policy(fakeContext(fakeCheckEvidence()))
    expect(result).toEqual({ outcome: "pass", rationale: "markdownlint-cli2 reported 0 issues." })
  })

  it("fails cleanly (does not throw) when the report JSON is valid but not an array", async () => {
    readFile.mockResolvedValue("{}")
    const result = await markdownlint().policy(fakeContext(fakeCheckEvidence()))
    expect(result).toEqual({
      outcome: "fail",
      rationale: "markdownlint-cli2 produced invalid JSON report data.",
    })
  })

  it("fails, naming the timeout, when markdownlint-cli2 itself was killed before writing a report", async () => {
    const result = await markdownlint().policy(
      fakeContext(fakeCheckEvidence({ status: "timed_out", exitCode: null })),
    )
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("did not finish")
    expect(readFile).not.toHaveBeenCalled()
  })

  it("fails and lists each finding, joined by newline, omitting the parenthetical entirely when errorDetail is absent", async () => {
    readFile.mockResolvedValue(
      JSON.stringify([
        {
          fileName: "README.md",
          lineNumber: 3,
          ruleNames: ["MD013", "line-length"],
          ruleDescription: "Line length",
          errorDetail: "Expected: 80; Actual: 120",
          severity: "error",
        },
        {
          fileName: "docs/guide.md",
          lineNumber: 1,
          ruleNames: ["MD041"],
          ruleDescription: "First line in a file should be a heading",
          errorDetail: null,
          severity: "error",
        },
      ]),
    )

    const result = await markdownlint().policy(fakeContext(fakeCheckEvidence()))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toBe(
      [
        "markdownlint-cli2 reported 2 issue(s):",
        "- README.md:3 [MD013/line-length]: Line length (Expected: 80; Actual: 120)",
        "- docs/guide.md:1 [MD041]: First line in a file should be a heading",
      ].join("\n"),
    )
  })
})
