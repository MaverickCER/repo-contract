import { beforeEach, describe, expect, it, vi } from "vitest"
import { markdownlint } from "../../../../src/presets/markdownlint.js"
import { judgeMarkdownlintExit } from "../../../../src/presets/rules/markdownlint-exit.js"
import { enoentEvidence, fakeCheckEvidence, fakeContext } from "../fixtures.js"

// The JSON verdict reads a fixed report path. markdownlint.test.ts explains why the read is mocked.
const { readFile } = vi.hoisted(() => ({ readFile: vi.fn() }))
vi.mock("node:fs/promises", () => ({ readFile }))

beforeEach(() => {
  readFile.mockReset()
})

const findings = [
  "markdownlint-cli2 v0.24.0 (markdownlint v0.42.1)",
  "Finding: bad.md",
  "Linting: 1 file",
  "Summary: 1 issue in 1 file",
  'bad.md:2:1 error MD018/no-missing-space-atx No space after hash on atx style heading [Context: "#b"]',
].join("\n")

describe("R2 markdownlint exit-code verdict", () => {
  it("exit 0 passes", () => {
    expect(judgeMarkdownlintExit({ exitCode: 0, output: "Linting: 3 files" })).toEqual({
      outcome: "pass",
      rationale: "markdownlint-cli2 reported 0 issues.",
    })
  })

  it.each([
    ["Linting: 0 files", "Finding: nothing/*.md\nLinting: 0 files\nSummary: 0 issues"],
    ["Linting: 0 file(s)", "Linting: 0 file(s)"],
    ["no files", "Error: No files found"],
  ])("a non-zero exit that printed %s passes as nothing to lint", (_label, output) => {
    expect(judgeMarkdownlintExit({ exitCode: 1, output })).toEqual({
      outcome: "pass",
      rationale: "markdownlint-cli2 found no Markdown files to lint.",
    })
  })

  it("a non-zero exit that linted 10 files is not read as 0 files", () => {
    const result = judgeMarkdownlintExit({ exitCode: 1, output: "Linting: 10 files\nx.md:1 error" })
    expect(result.outcome).toBe("fail")
  })

  it("a non-zero exit with findings fails and carries the printed tail", () => {
    expect(judgeMarkdownlintExit({ exitCode: 1, output: findings })).toEqual({
      outcome: "fail",
      rationale: `markdownlint-cli2 reported issues (exit code 1):\n${findings}`,
    })
  })

  it("keeps only the last 4000 characters of long output", () => {
    const output = `${"a".repeat(10)}${"b".repeat(4000)}`
    const result = judgeMarkdownlintExit({ exitCode: 1, output })
    expect(result.rationale).toBe(
      `markdownlint-cli2 reported issues (exit code 1):\n${"b".repeat(4000)}`,
    )
  })

  it("a non-zero exit with no output fails and names the exit code", () => {
    expect(judgeMarkdownlintExit({ exitCode: 2, output: "" })).toEqual({
      outcome: "fail",
      rationale: "markdownlint-cli2 reported issues (exit code 2).",
    })
  })

  it("a null exit code fails as a run that did not finish", () => {
    expect(judgeMarkdownlintExit({ exitCode: null, output: "Linting: 0 files" })).toEqual({
      outcome: "fail",
      rationale: "markdownlint-cli2 did not finish: it left no exit code.",
    })
  })

  it("markdownlint passes globs in place of glob and --config when set", () => {
    expect(
      markdownlint({
        glob: "ignored/**/*.md",
        globs: ["*.md", "docs/**/*.md"],
        config: "config/markdownlint.jsonc",
      }).run,
    ).toEqual([
      "markdownlint-cli2",
      "--config",
      "config/markdownlint.jsonc",
      "*.md",
      "docs/**/*.md",
    ])
    expect(markdownlint({ config: ".markdownlint.jsonc" }).run).toEqual([
      "markdownlint-cli2",
      "--config",
      ".markdownlint.jsonc",
      "**/*.md",
    ])
  })

  it("markdownlint rejects an empty globs list when the preset is built", () => {
    expect(() => markdownlint({ globs: [] })).toThrow(
      new RangeError("markdownlint: globs must name at least one glob."),
    )
  })

  it("markdownlint with verdict json keeps today's report-file behaviour", async () => {
    expect(markdownlint({ verdict: "json" }).run).toEqual(markdownlint().run)
    readFile.mockResolvedValue("[]")
    const result = await markdownlint({ verdict: "json" }).policy(
      fakeContext(fakeCheckEvidence({ exitCode: 1, stdout: findings })),
    )
    expect(readFile).toHaveBeenCalledWith("reports/markdownlint.json", "utf8")
    expect(result).toEqual({ outcome: "pass", rationale: "markdownlint-cli2 reported 0 issues." })
  })

  it("markdownlint with verdict exit-code judges the exit code and output, not a report file", async () => {
    const check = markdownlint({ verdict: "exit-code" })
    const failed = await check.policy(
      fakeContext(fakeCheckEvidence({ exitCode: 1, stdout: findings, stderr: "  warn  " })),
    )
    expect(failed).toEqual({
      outcome: "fail",
      rationale: `markdownlint-cli2 reported issues (exit code 1):\n${findings}\nwarn`,
    })

    const passed = await check.policy(fakeContext(fakeCheckEvidence({ exitCode: 0 })))
    expect(passed.outcome).toBe("pass")
    expect(readFile).not.toHaveBeenCalled()
  })

  it("markdownlint with verdict exit-code still reports a missing tool and a killed run", async () => {
    const check = markdownlint({ verdict: "exit-code" })
    const missing = await check.policy(fakeContext(enoentEvidence("markdownlint-cli2")))
    expect(missing.rationale).toContain("`markdownlint-cli2`")

    const killed = await check.policy(
      fakeContext(fakeCheckEvidence({ exitCode: null, status: "timed_out" })),
    )
    expect(killed.outcome).toBe("fail")
    expect(killed.rationale).toContain("markdownlint-cli2 did not finish")
  })
})
