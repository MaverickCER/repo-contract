import { describe, expect, it } from "vitest"
import { commitlint } from "../../../src/presets/commitlint.js"
import { enoentEvidence, fakeContext, fakeCheckEvidence } from "./fixtures.js"

describe("commitlint preset", () => {
  it("defaults to --from origin/main --to HEAD", () => {
    expect(commitlint().run).toEqual(["commitlint", "--from", "origin/main", "--to", "HEAD"])
  })

  it("threads custom from/to options into the run command", () => {
    expect(commitlint({ from: "v1.0.0", to: "release" }).run).toEqual([
      "commitlint",
      "--from",
      "v1.0.0",
      "--to",
      "release",
    ])
  })

  it("fails with an actionable message when @commitlint/cli is not installed", async () => {
    const result = await commitlint().policy(fakeContext(enoentEvidence("commitlint")))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("`@commitlint/cli`")
  })

  it("passes when exitCode is 0, naming the ref range used", async () => {
    const check = commitlint({ from: "v1.0.0", to: "HEAD" })
    const result = await check.policy(fakeContext(fakeCheckEvidence({ exitCode: 0 })))
    expect(result).toEqual({
      outcome: "pass",
      rationale: "commitlint found 0 commit message violations between v1.0.0 and HEAD.",
    })
  })

  it("fails with captured output when exitCode is non-zero", async () => {
    const result = await commitlint().policy(
      fakeContext(fakeCheckEvidence({ exitCode: 1, stdout: "subject may not be empty" })),
    )
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("subject may not be empty")
  })

  it("falls back to an exit-code-only message when non-zero with no output", async () => {
    const result = await commitlint().policy(
      fakeContext(fakeCheckEvidence({ exitCode: 1, stdout: "", stderr: "" })),
    )
    expect(result).toEqual({
      outcome: "fail",
      rationale: "commitlint reported commit message violations (exit code 1).",
    })
  })
})
