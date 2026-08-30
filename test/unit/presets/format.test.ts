import { describe, expect, it } from "vitest"
import { format } from "../../../src/presets/format.js"
import { enoentEvidence, fakeContext, fakeCheckEvidence } from "./fixtures.js"

describe("format preset", () => {
  it("shells out to prettier --write .", () => {
    expect(format.run).toEqual(["prettier", "--write", "."])
  })

  it("fails with an actionable message when prettier is not installed", async () => {
    const result = await format.policy(fakeContext(enoentEvidence("prettier")))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("`prettier`")
  })

  it("passes when exitCode is 0", async () => {
    const result = await format.policy(fakeContext(fakeCheckEvidence({ exitCode: 0 })))
    expect(result).toEqual({
      outcome: "pass",
      rationale: "Prettier reported no formatting failures.",
    })
  })

  it("fails with joined stdout/stderr when exitCode is non-zero and output was produced", async () => {
    const result = await format.policy(
      fakeContext(
        fakeCheckEvidence({
          exitCode: 1,
          stdout: "src/a.ts\n",
          stderr: "[warn] Code style issues found in src/b.ts\n",
        }),
      ),
    )
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("src/a.ts")
    expect(result.rationale).toContain("src/b.ts")
  })

  it("falls back to an exit-code-only message when non-zero with no output", async () => {
    const result = await format.policy(
      fakeContext(fakeCheckEvidence({ exitCode: 1, stdout: "", stderr: "" })),
    )
    expect(result).toEqual({
      outcome: "fail",
      rationale: "Prettier reported formatting failures (exit code 1).",
    })
  })
})
