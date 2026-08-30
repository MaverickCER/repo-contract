import { describe, expect, it } from "vitest"
import { deadCode } from "../../../src/presets/dead-code.js"
import { enoentEvidence, fakeContext, fakeCheckEvidence } from "./fixtures.js"
import type { CheckDefinitionConfig } from "../../../src/types.js"

/**
 * Fixtures model knip's `json` reporter as of knip 6: `{ issues: KnipIssue[] }`, one entry per
 * file, each with an array per issue category. (knip 5 additionally had a top-level
 * `files: string[]`; knip 6 folds unused files into `issues[].files`.)
 */

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

  it.each([
    ["issues is not an array", { issues: "not-an-array" }],
    ["value is null", null],
    ["value is a primitive", 42],
  ])("fails cleanly (does not throw) when %s", async (_label, value) => {
    const check = deadCode()
    const result = await check.policy(
      fakeContext(
        fakeCheckEvidence({
          args: argsFor(check),
          output: { format: "json", success: true, value },
        }),
      ),
    )
    expect(result).toEqual({
      outcome: "fail",
      rationale: "Knip produced invalid JSON report data.",
    })
  })

  it("passes when there are 0 issues", async () => {
    const check = deadCode()
    const result = await check.policy(
      fakeContext(
        fakeCheckEvidence({
          args: argsFor(check),
          output: { format: "json", success: true, value: { issues: [] } },
        }),
      ),
    )
    expect(result).toEqual({ outcome: "pass", rationale: "Knip reported 0 issues." })
  })

  it("passes when an issue entry exists for a file but every category is empty", async () => {
    const check = deadCode()
    const result = await check.policy(
      fakeContext(
        fakeCheckEvidence({
          args: argsFor(check),
          output: {
            format: "json",
            success: true,
            value: { issues: [{ file: "src/a.ts", exports: [], types: [] }] },
          },
        }),
      ),
    )
    expect(result).toEqual({ outcome: "pass", rationale: "Knip reported 0 issues." })
  })

  it("fails and lists every issue category (with location), joined by newline", async () => {
    const check = deadCode()
    const report = {
      issues: [
        {
          file: "src/a.ts",
          dependencies: [{ name: "left-pad", line: 1, col: 1 }],
          optionalPeerDependencies: [{ name: "opt-peer" }],
          unlisted: [{ name: "unlisted-pkg" }],
          unresolved: [{ name: "./missing" }],
          exports: [{ name: "unused", line: 5 }],
          nsExports: [{ name: "ns.unused" }],
          types: [{ name: "UnusedType" }],
          nsTypes: [{ name: "ns.UnusedType" }],
          namespaceMembers: [{ name: "ns.member" }],
          enumMembers: [{ name: "Enum.MEMBER" }],
          binaries: [{ name: "some-bin" }],
          duplicates: [[{ name: "DupA" }, { name: "DupB" }]],
          cycles: [[{ name: "a.ts" }, { name: "b.ts" }]],
          files: [{ name: "src/a.ts" }],
        },
      ],
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
      "src/a.ts — unused optional peer dependency: opt-peer",
      "src/a.ts — unlisted dependency: unlisted-pkg",
      "src/a.ts — unresolved import: ./missing",
      "src/a.ts:5:1 — unused export: unused",
      "src/a.ts — unused export (namespace): ns.unused",
      "src/a.ts — unused type: UnusedType",
      "src/a.ts — unused type (namespace): ns.UnusedType",
      "src/a.ts — unused namespace member: ns.member",
      "src/a.ts — unused enum member: Enum.MEMBER",
      "src/a.ts — unlisted binary: some-bin",
      "src/a.ts — duplicate export: DupA, DupB",
      "src/a.ts — circular dependency: a.ts, b.ts",
      "src/a.ts — unused file: src/a.ts",
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
