import { describe, expect, it } from "vitest"
import { lint } from "../../../src/presets/lint.js"
import { enoentEvidence, fakeContext, fakeCheckEvidence } from "./fixtures.js"

describe("lint preset", () => {
  it("defaults to path '.'", () => {
    expect(lint().run).toEqual(["eslint", ".", "--format", "json"])
  })

  it("threads a custom path option into the run command", () => {
    expect(lint({ path: "src" }).run).toEqual(["eslint", "src", "--format", "json"])
  })

  it("fails with an actionable message when eslint is not installed", async () => {
    const result = await lint().policy(fakeContext(enoentEvidence("eslint")))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("`eslint`")
  })

  it("fails when output could not be parsed as JSON", async () => {
    const result = await lint().policy(
      fakeContext(fakeCheckEvidence({ output: { format: "json", success: false, error: "bad" } })),
    )
    expect(result).toEqual({
      outcome: "fail",
      rationale: "ESLint output could not be parsed as JSON.",
    })
  })

  it("fails when output is entirely absent (not just success: false)", async () => {
    const result = await lint().policy(fakeContext(fakeCheckEvidence({ output: undefined })))
    expect(result).toEqual({
      outcome: "fail",
      rationale: "ESLint output could not be parsed as JSON.",
    })
  })

  it("passes when there are 0 errors and 0 warnings", async () => {
    const result = await lint().policy(
      fakeContext(
        fakeCheckEvidence({
          output: {
            format: "json",
            success: true,
            value: [{ filePath: "a.ts", messages: [], errorCount: 0, warningCount: 0 }],
          },
        }),
      ),
    )
    expect(result).toEqual({
      outcome: "pass",
      rationale: "ESLint reported 0 errors and 0 warnings.",
    })
  })

  it("fails and lists errors (with exact header, joined by newline), ignoring warnings", async () => {
    const result = await lint().policy(
      fakeContext(
        fakeCheckEvidence({
          output: {
            format: "json",
            success: true,
            value: [
              {
                filePath: "a.ts",
                errorCount: 2,
                warningCount: 1,
                messages: [
                  { ruleId: "no-console", severity: 2, message: "no console", line: 1, column: 1 },
                  { ruleId: "no-unused", severity: 1, message: "unused var", line: 2, column: 1 },
                  { ruleId: "eqeqeq", severity: 2, message: "use ===", line: 3, column: 1 },
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
        "ESLint reported 2 error(s):",
        "- a.ts:1:1 [no-console]: no console",
        "- a.ts:3:1 [eqeqeq]: use ===",
      ].join("\n"),
    )
  })

  it("warns (with exact header, joined by newline) when there are 0 errors but at least one warning", async () => {
    const result = await lint().policy(
      fakeContext(
        fakeCheckEvidence({
          output: {
            format: "json",
            success: true,
            value: [
              {
                filePath: "a.ts",
                errorCount: 0,
                warningCount: 2,
                messages: [
                  { ruleId: null, severity: 1, message: "unused var", line: 2, column: 1 },
                  {
                    ruleId: "no-magic-numbers",
                    severity: 1,
                    message: "magic number",
                    line: 4,
                    column: 3,
                  },
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
        "ESLint reported 0 errors but 2 warning(s):",
        "- a.ts:2:1: unused var",
        "- a.ts:4:3 [no-magic-numbers]: magic number",
      ].join("\n"),
    )
  })
})
