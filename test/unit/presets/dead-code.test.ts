import { describe, expect, it } from "vitest"
import { deadCode } from "../../../src/presets/dead-code.js"
import { enoentEvidence, fakeContext, fakeCheckEvidence } from "./fixtures.js"
import type { CheckDefinitionConfig } from "../../../src/types.js"

/** The args a real spawn would carry for this check -- `run[0]` is the command, the rest is `args`. */
function argsFor(check: CheckDefinitionConfig): readonly string[] {
  const run = check.run
  if (typeof run === "string") throw new Error("expected array-form run")
  return run.slice(1)
}

describe("deadCode preset", () => {
  it("defaults to an empty exempt list, round-tripped through --reporter-options", () => {
    const check = deadCode()
    expect(check.run).toEqual([
      "knip",
      "--reporter",
      "json",
      "--reporter-options",
      JSON.stringify({ exemptUnusedDevDependencies: [] }),
    ])
  })

  it("threads a custom exemptUnusedDevDependencies option into the run command", () => {
    const check = deadCode({ exemptUnusedDevDependencies: ["oxlint", "publint"] })
    expect(check.run).toContain(
      JSON.stringify({ exemptUnusedDevDependencies: ["oxlint", "publint"] }),
    )
  })

  it("fails with an actionable message when knip is not installed", async () => {
    const result = await deadCode().policy(fakeContext(enoentEvidence("knip")))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("`knip`")
  })

  it("fails when output could not be parsed as JSON", async () => {
    const result = await deadCode().policy(
      fakeContext(fakeCheckEvidence({ output: { format: "json", success: false, error: "bad" } })),
    )
    expect(result).toEqual({
      outcome: "fail",
      rationale: "Knip output could not be parsed as JSON.",
    })
  })

  it("fails when output is entirely absent (not just success: false)", async () => {
    const result = await deadCode().policy(fakeContext(fakeCheckEvidence({ output: undefined })))
    expect(result).toEqual({
      outcome: "fail",
      rationale: "Knip output could not be parsed as JSON.",
    })
  })

  it("fails when report.issues is not an array, even if report.files is", async () => {
    const check = deadCode()
    const result = await check.policy(
      fakeContext(
        fakeCheckEvidence({
          args: argsFor(check),
          output: { format: "json", success: true, value: { issues: "not-an-array", files: [] } },
        }),
      ),
    )
    expect(result).toEqual({
      outcome: "fail",
      rationale: "Knip produced invalid JSON report data.",
    })
  })

  it("fails when report.files is not an array, even if report.issues is", async () => {
    const check = deadCode()
    const result = await check.policy(
      fakeContext(
        fakeCheckEvidence({
          args: argsFor(check),
          output: { format: "json", success: true, value: { issues: [], files: "not-an-array" } },
        }),
      ),
    )
    expect(result).toEqual({
      outcome: "fail",
      rationale: "Knip produced invalid JSON report data.",
    })
  })

  it("passes when there are 0 issues and 0 unused files", async () => {
    const check = deadCode()
    const result = await check.policy(
      fakeContext(
        fakeCheckEvidence({
          args: argsFor(check),
          output: { format: "json", success: true, value: { issues: [], files: [] } },
        }),
      ),
    )
    expect(result).toEqual({ outcome: "pass", rationale: "Knip reported 0 issues." })
  })

  it("fails and lists every issue category (including location) plus unused files, joined by newline", async () => {
    const check = deadCode()
    const report = {
      issues: [
        {
          file: "src/a.ts",
          dependencies: [{ name: "left-pad", line: 1, col: 1 }],
          unlisted: [{ name: "unlisted-pkg" }],
          unresolved: [{ name: "./missing" }],
          exports: [{ name: "unused", line: 5 }],
          types: [{ name: "UnusedType" }],
          binaries: [{ name: "unused-bin" }],
          duplicates: [{ name: "dup-export" }],
          cycles: [{ name: "cycle" }],
          files: [{ name: "internally-flagged-file" }],
        },
      ],
      files: ["src/orphan.ts"],
    }
    const result = await check.policy(
      fakeContext(
        fakeCheckEvidence({
          args: argsFor(check),
          output: { format: "json", success: true, value: report },
        }),
      ),
    )

    expect(result.outcome).toBe("fail")
    const lines = [
      "src/a.ts:1:1 — unused dependency: left-pad",
      "src/a.ts — unlisted dependency: unlisted-pkg",
      "src/a.ts — unresolved import: ./missing",
      "src/a.ts:5:1 — unused export: unused",
      "src/a.ts — unused type: UnusedType",
      "src/a.ts — unused binary: unused-bin",
      "src/a.ts — duplicate export: dup-export",
      "src/a.ts — circular dependency: cycle",
      "src/a.ts — unused file: internally-flagged-file",
      "src/orphan.ts — unused file",
    ]
    expect(result.rationale).toBe(
      [`Knip reported ${String(lines.length)} issue(s):`, ...lines.map((line) => `- ${line}`)].join(
        "\n",
      ),
    )
  })

  it("defaults an entry's column to 1 when a line is present but no column is given", async () => {
    const check = deadCode()
    const report = {
      issues: [{ file: "src/a.ts", dependencies: [{ name: "left-pad", line: 7 }] }],
      files: [],
    }
    const result = await check.policy(
      fakeContext(
        fakeCheckEvidence({
          args: argsFor(check),
          output: { format: "json", success: true, value: report },
        }),
      ),
    )
    expect(result.rationale).toContain("src/a.ts:7:1 — unused dependency: left-pad")
  })

  it("ships with no built-in exemptions by default -- a devDependency issue is reported unless the caller explicitly exempts it", async () => {
    const check = deadCode()
    const report = {
      issues: [{ file: "package.json", devDependencies: [{ name: "oxlint" }] }],
      files: [],
    }
    const result = await check.policy(
      fakeContext(
        fakeCheckEvidence({
          args: argsFor(check),
          output: { format: "json", success: true, value: report },
        }),
      ),
    )

    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("unused devDependency: oxlint")
  })

  it("honors exemptUnusedDevDependencies read back from the actual command's args, not a closure", async () => {
    const check = deadCode({ exemptUnusedDevDependencies: ["oxlint"] })
    const report = {
      issues: [{ file: "package.json", devDependencies: [{ name: "oxlint" }] }],
      files: [],
    }
    const result = await check.policy(
      fakeContext(
        fakeCheckEvidence({
          args: argsFor(check),
          output: { format: "json", success: true, value: report },
        }),
      ),
    )

    expect(result).toEqual({ outcome: "pass", rationale: "Knip reported 0 issues." })
  })

  it("ignores the exempt list when --reporter-options is absent from args (falls back to no exemptions)", async () => {
    const check = deadCode({ exemptUnusedDevDependencies: ["oxlint"] })
    const report = {
      issues: [{ file: "package.json", devDependencies: [{ name: "oxlint" }] }],
      files: [],
    }
    const result = await check.policy(
      fakeContext(
        fakeCheckEvidence({ args: [], output: { format: "json", success: true, value: report } }),
      ),
    )

    expect(result.outcome).toBe("fail")
  })

  it("only honors --reporter-options when the flag itself is found, not merely because args[0] happens to parse as JSON", async () => {
    // A deliberately adversarial args array: no literal "--reporter-options"
    // flag anywhere, but args[0] is itself a valid JSON payload naming an
    // exemption. If the flag-index check were broken (e.g. always "not
    // found" treated as "found at -1, so read args[0]"), this would
    // incorrectly exempt "sneaky".
    const check = deadCode()
    const report = {
      issues: [{ file: "package.json", devDependencies: [{ name: "sneaky" }] }],
      files: [],
    }
    const result = await check.policy(
      fakeContext(
        fakeCheckEvidence({
          args: [JSON.stringify({ exemptUnusedDevDependencies: ["sneaky"] })],
          output: { format: "json", success: true, value: report },
        }),
      ),
    )

    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("unused devDependency: sneaky")
  })

  it("finds --reporter-options at any index, not only where the preset's own run array happens to place it", async () => {
    const check = deadCode({ exemptUnusedDevDependencies: ["oxlint"] })
    const report = {
      issues: [{ file: "package.json", devDependencies: [{ name: "oxlint" }] }],
      files: [],
    }
    const result = await check.policy(
      fakeContext(
        fakeCheckEvidence({
          args: [
            "--some-other-flag",
            "--reporter-options",
            JSON.stringify({ exemptUnusedDevDependencies: ["oxlint"] }),
          ],
          output: { format: "json", success: true, value: report },
        }),
      ),
    )

    expect(result).toEqual({ outcome: "pass", rationale: "Knip reported 0 issues." })
  })

  it("falls back to no exemptions when --reporter-options parses but carries no exemptUnusedDevDependencies field", async () => {
    const check = deadCode()
    const report = {
      // Deliberately named after the mutant's own placeholder value: if the
      // `?? []` fallback for a present-but-fieldless options object were
      // ever replaced by a non-empty default, this exact name would start
      // passing as exempt.
      issues: [{ file: "package.json", devDependencies: [{ name: "Stryker was here" }] }],
      files: [],
    }
    const result = await check.policy(
      fakeContext(
        fakeCheckEvidence({
          args: ["--reporter-options", "{}"],
          output: { format: "json", success: true, value: report },
        }),
      ),
    )

    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("unused devDependency: Stryker was here")
  })

  it("falls back to no exemptions when --reporter-options's value is present but not valid JSON", async () => {
    const check = deadCode()
    const report = {
      issues: [{ file: "package.json", devDependencies: [{ name: "oxlint" }] }],
      files: [],
    }
    const result = await check.policy(
      fakeContext(
        fakeCheckEvidence({
          args: ["--reporter-options", "not json"],
          output: { format: "json", success: true, value: report },
        }),
      ),
    )

    expect(result.outcome).toBe("fail")
  })
})
