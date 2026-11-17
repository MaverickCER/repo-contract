import { describe, expect, it } from "vitest"
import { arethetypeswrong } from "../../../../src/presets/arethetypeswrong.js"
import { dropResolutionProblems } from "../../../../src/presets/rules/attw-resolutions.js"
import { fakeCheckEvidence, fakeContext } from "../fixtures.js"

const node10 = { kind: "NoResolution", entrypoint: "./tiers", resolutionKind: "node10" }
const node16 = { kind: "NoResolution", entrypoint: "./tiers", resolutionKind: "node16-cjs" }
const bundler = { kind: "FalseCJS", entrypoint: ".", resolutionKind: "bundler" }
const noResolution = { kind: "InternalResolutionError", entrypoint: "." }

describe("R2 attw resolution filter", () => {
  it("drops every problem whose resolutionKind is listed", () => {
    const report = { problems: { NoResolution: [node10, node16], FalseCJS: [bundler] } }
    expect(dropResolutionProblems(report, ["node10", "bundler"])).toEqual({
      problems: { NoResolution: [node16] },
    })
  })

  it("keeps problems under other resolutions and problems with no resolution", () => {
    const report = {
      analysis: { packageName: "x" },
      problems: { NoResolution: [node16], InternalResolutionError: [noResolution] },
    }
    expect(dropResolutionProblems(report, ["node10"])).toEqual(report)
  })

  it("does not change the report it was given", () => {
    const report = { problems: { NoResolution: [node10, node16] } }
    dropResolutionProblems(report, ["node10"])
    expect(report).toEqual({ problems: { NoResolution: [node10, node16] } })
  })

  it("returns the same report when no resolution is listed", () => {
    const report = { problems: { NoResolution: [node10] } }
    expect(dropResolutionProblems(report, [])).toBe(report)
  })

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", "text"],
    ["an array", [node10]],
    ["no problems key", { analysis: {} }],
    ["a non-object problems value", { problems: 3 }],
    ["a null problems value", { problems: null }],
  ])("returns a report of an unexpected shape unchanged: %s", (_label, report) => {
    expect(dropResolutionProblems(report, ["node10"])).toBe(report)
  })

  it("keeps a non-array group and non-object entries for the evaluator to judge", () => {
    const report = { problems: { Odd: "x", NoResolution: [null, 7, undefined, node10] } }
    expect(dropResolutionProblems(report, ["node10"])).toEqual({
      problems: { Odd: "x", NoResolution: [null, 7, undefined] },
    })
  })

  it("arethetypeswrong({ ignoreResolutions: ['node10'] }) passes when only node10 problems exist", async () => {
    const check = arethetypeswrong({ ignoreResolutions: ["node10"] })
    expect(check.run).toEqual(["attw", "--pack", ".", "--format", "json"])
    const result = await check.policy(
      fakeContext(
        fakeCheckEvidence({
          output: {
            format: "json",
            success: true,
            value: { problems: { NoResolution: [node10] } },
          },
        }),
      ),
    )
    expect(result).toEqual({
      outcome: "pass",
      rationale: "@arethetypeswrong/cli found 0 packaged type-resolution problem(s).",
    })
  })

  it("arethetypeswrong({ ignoreResolutions: ['node10'] }) still fails on other resolutions", async () => {
    const result = await arethetypeswrong({ ignoreResolutions: ["node10"] }).policy(
      fakeContext(
        fakeCheckEvidence({
          output: {
            format: "json",
            success: true,
            value: { problems: { NoResolution: [node10, node16] } },
          },
        }),
      ),
    )
    expect(result).toEqual({
      outcome: "fail",
      rationale: [
        "@arethetypeswrong/cli found 1 packaged type-resolution problem(s):",
        "- NoResolution: entrypoint=./tiers resolution=node16-cjs",
      ].join("\n"),
    })
  })

  it("arethetypeswrong() with no options judges every resolution, as before", async () => {
    const result = await arethetypeswrong().policy(
      fakeContext(
        fakeCheckEvidence({
          output: {
            format: "json",
            success: true,
            value: { problems: { NoResolution: [node10] } },
          },
        }),
      ),
    )
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("resolution=node10")
  })

  it("arethetypeswrong rejects an unknown resolution when the preset is built", () => {
    expect(() =>
      arethetypeswrong({ ignoreResolutions: ["node12" as unknown as "node10"] }),
    ).toThrow(
      new RangeError(
        'arethetypeswrong: ignoreResolutions accepts "node10", "node16-cjs", "node16-esm" and "bundler", got "node12".',
      ),
    )
  })
})
