import { describe, expect, it } from "vitest"
import { stylelint } from "../../../src/presets/stylelint.js"
import { enoentEvidence, fakeContext, fakeCheckEvidence } from "./fixtures.js"

describe("stylelint preset", () => {
  it("defaults to glob '**/*.{css,scss}'", () => {
    expect(stylelint().run).toEqual(["stylelint", "**/*.{css,scss}", "--formatter", "json"])
  })

  it("threads a custom glob option into the run command", () => {
    expect(stylelint({ glob: "**/*.less" }).run).toEqual([
      "stylelint",
      "**/*.less",
      "--formatter",
      "json",
    ])
  })

  it("fails with an actionable message when stylelint is not installed", async () => {
    const result = await stylelint().policy(fakeContext(enoentEvidence("stylelint")))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("`stylelint`")
  })

  it("fails when output could not be parsed as JSON", async () => {
    const result = await stylelint().policy(
      fakeContext(fakeCheckEvidence({ output: { format: "json", success: false, error: "bad" } })),
    )
    expect(result).toEqual({
      outcome: "fail",
      rationale: "stylelint output could not be parsed as JSON.",
    })
  })

  it("fails when output is entirely absent (not just success: false)", async () => {
    const result = await stylelint().policy(fakeContext(fakeCheckEvidence({ output: undefined })))
    expect(result).toEqual({
      outcome: "fail",
      rationale: "stylelint output could not be parsed as JSON.",
    })
  })

  it("appends stylelint's printed output to the parse-failure rationale when it wrote to stderr", async () => {
    const result = await stylelint().policy(
      fakeContext(
        fakeCheckEvidence({
          exitCode: 2,
          stderr: "Error: No configuration provided for stylelint\n",
          output: { format: "json", success: false, error: "Unexpected end of JSON input" },
        }),
      ),
    )
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("stylelint printed:")
    expect(result.rationale).toContain("No configuration provided for stylelint")
  })

  it("passes when there are 0 warnings across all files", async () => {
    const result = await stylelint().policy(
      fakeContext(
        fakeCheckEvidence({
          output: {
            format: "json",
            success: true,
            value: [{ source: "a.css", errored: false, warnings: [] }],
          },
        }),
      ),
    )
    expect(result).toEqual({
      outcome: "pass",
      rationale: "stylelint reported 0 errors and 0 warnings.",
    })
  })

  it("fails and lists error-severity warnings only, exact header and newline join, across multiple files", async () => {
    const result = await stylelint().policy(
      fakeContext(
        fakeCheckEvidence({
          output: {
            format: "json",
            success: true,
            value: [
              {
                source: "a.css",
                errored: true,
                warnings: [
                  {
                    line: 3,
                    column: 1,
                    rule: "color-no-invalid-hex",
                    severity: "error",
                    text: "bad hex",
                  },
                  {
                    line: 5,
                    column: 1,
                    rule: "no-empty-source",
                    severity: "warning",
                    text: "empty",
                  },
                ],
              },
              {
                source: "b.css",
                errored: true,
                warnings: [
                  { line: 1, column: 2, rule: "no-dupe", severity: "error", text: "dupe" },
                ],
              },
            ],
          },
        }),
      ),
    )
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toBe(
      [
        "stylelint reported 2 error(s):",
        "- a.css:3:1 [color-no-invalid-hex]: bad hex",
        "- b.css:1:2 [no-dupe]: dupe",
      ].join("\n"),
    )
  })

  it("falls back to '<unknown file>' when a file result carries no source", async () => {
    const result = await stylelint().policy(
      fakeContext(
        fakeCheckEvidence({
          output: {
            format: "json",
            success: true,
            value: [
              {
                errored: true,
                warnings: [{ line: 1, column: 1, rule: "r", severity: "error", text: "t" }],
              },
            ],
          },
        }),
      ),
    )
    expect(result.rationale).toContain("<unknown file>:1:1 [r]: t")
  })

  it("warns (exact header and newline join) when there are 0 errors but multiple warnings, ignoring any other severity value", async () => {
    const result = await stylelint().policy(
      fakeContext(
        fakeCheckEvidence({
          output: {
            format: "json",
            success: true,
            value: [
              {
                source: "a.css",
                errored: false,
                warnings: [
                  {
                    line: 5,
                    column: 1,
                    rule: "no-empty-source",
                    severity: "warning",
                    text: "empty",
                  },
                  { line: 6, column: 1, rule: "other", severity: "warning", text: "other issue" },
                  // A severity value that is neither "error" nor "warning" --
                  // proves the warning branch's own filter runs, not just
                  // that everything present happens to already be a warning.
                  { line: 7, column: 1, rule: "deprecated", severity: "deprecation", text: "old" },
                ],
              },
            ],
          },
        }),
      ),
    )
    expect(result.outcome).toBe("warn")
    expect(result.rationale).toBe(
      [
        "stylelint reported 0 errors but 2 warning(s):",
        "- a.css:5:1 [no-empty-source]: empty",
        "- a.css:6:1 [other]: other issue",
      ].join("\n"),
    )
  })
})
