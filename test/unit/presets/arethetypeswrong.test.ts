import { describe, expect, it } from "vitest"
import { arethetypeswrong } from "../../../src/presets/arethetypeswrong.js"
import { enoentEvidence, fakeContext, fakeCheckEvidence } from "./fixtures.js"

describe("arethetypeswrong preset", () => {
  it("shells out to attw --pack . --format json with no --exclude-entrypoints", () => {
    expect(arethetypeswrong.run).toEqual(["attw", "--pack", ".", "--format", "json"])
  })

  it("fails with an actionable message when @arethetypeswrong/cli is not installed", async () => {
    const result = await arethetypeswrong.policy(fakeContext(enoentEvidence("attw")))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("`@arethetypeswrong/cli`")
  })

  it("fails when output could not be parsed as JSON", async () => {
    const result = await arethetypeswrong.policy(
      fakeContext(fakeCheckEvidence({ output: { format: "json", success: false, error: "bad" } })),
    )
    expect(result).toEqual({
      outcome: "fail",
      rationale: "@arethetypeswrong/cli output could not be parsed as JSON.",
    })
  })

  it("fails when output is entirely absent (not just success: false)", async () => {
    const result = await arethetypeswrong.policy(
      fakeContext(fakeCheckEvidence({ output: undefined })),
    )
    expect(result).toEqual({
      outcome: "fail",
      rationale: "@arethetypeswrong/cli output could not be parsed as JSON.",
    })
  })

  it("passes when there are 0 problems", async () => {
    const result = await arethetypeswrong.policy(
      fakeContext(
        fakeCheckEvidence({ output: { format: "json", success: true, value: { problems: {} } } }),
      ),
    )
    expect(result).toEqual({
      outcome: "pass",
      rationale: "@arethetypeswrong/cli found 0 packaged type-resolution problem(s).",
    })
  })

  it("fails and renders exactly the header plus one line per problem across multiple kinds, omitting absent context fields entirely", async () => {
    const result = await arethetypeswrong.policy(
      fakeContext(
        fakeCheckEvidence({
          output: {
            format: "json",
            success: true,
            value: {
              problems: {
                FalseCJS: [{ kind: "FalseCJS", entrypoint: ".", resolutionKind: "node16-cjs" }],
                NoResolution: [{ kind: "NoResolution", entrypoint: "./presets" }],
              },
            },
          },
        }),
      ),
    )
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toBe(
      [
        "@arethetypeswrong/cli found 2 packaged type-resolution problem(s):",
        "- FalseCJS: entrypoint=. resolution=node16-cjs",
        "- NoResolution: entrypoint=./presets",
      ].join("\n"),
    )
    expect(result.rationale).not.toContain("undefined")
  })

  it("renders all four context fields, in order, when every one is present", async () => {
    const result = await arethetypeswrong.policy(
      fakeContext(
        fakeCheckEvidence({
          output: {
            format: "json",
            success: true,
            value: {
              problems: {
                X: [
                  {
                    kind: "X",
                    entrypoint: ".",
                    resolutionKind: "node10",
                    typesFileName: "index.d.ts",
                    implementationFileName: "index.js",
                  },
                ],
              },
            },
          },
        }),
      ),
    )
    expect(result.rationale).toContain(
      "X: entrypoint=. resolution=node10 types=index.d.ts impl=index.js",
    )
  })

  it("renders a problem with no context fields as exactly its kind -- no trailing colon or empty context", async () => {
    const result = await arethetypeswrong.policy(
      fakeContext(
        fakeCheckEvidence({
          output: {
            format: "json",
            success: true,
            value: { problems: { Bare: [{ kind: "Bare" }] } },
          },
        }),
      ),
    )
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toBe(
      "@arethetypeswrong/cli found 1 packaged type-resolution problem(s):\n- Bare",
    )
  })
})
