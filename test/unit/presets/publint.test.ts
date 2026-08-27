import { describe, expect, it } from "vitest"
import { publint } from "../../../src/presets/publint.js"
import { enoentEvidence, fakeContext, fakeCheckEvidence } from "./fixtures.js"

describe("publint preset", () => {
  it("shells out to publint run", () => {
    expect(publint.run).toEqual(["publint", "run"])
  })

  it("fails with an actionable message when publint is not installed", async () => {
    const result = await publint.policy(fakeContext(enoentEvidence("publint")))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("`publint`")
  })

  it("passes when exitCode is 0 with no output", async () => {
    const result = await publint.policy(fakeContext(fakeCheckEvidence({ exitCode: 0 })))
    expect(result).toEqual({ outcome: "pass", rationale: "publint reported no packaging errors." })
  })

  it("warns when exitCode is 0 but output mentions Warnings:", async () => {
    const result = await publint.policy(
      fakeContext(fakeCheckEvidence({ exitCode: 0, stdout: "Warnings:\n  - foo" })),
    )
    expect(result.outcome).toBe("warn")
    expect(result.rationale).toContain("foo")
  })

  it("warns when exitCode is 0 but output mentions Suggestions:", async () => {
    const result = await publint.policy(
      fakeContext(fakeCheckEvidence({ exitCode: 0, stdout: "Suggestions:\n  - bar" })),
    )
    expect(result.outcome).toBe("warn")
  })

  it("fails with captured, trimmed stdout and stderr joined by newline when exitCode is non-zero", async () => {
    const result = await publint.policy(
      fakeContext(
        fakeCheckEvidence({
          exitCode: 1,
          stdout: "  Errors:\n  - missing main  ",
          stderr: "  stderr detail  ",
        }),
      ),
    )
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toBe(
      "publint reported packaging error(s):\nErrors:\n  - missing main\nstderr detail",
    )
  })

  it("falls back to an exit-code-only fail message when non-zero with no output", async () => {
    const result = await publint.policy(
      fakeContext(fakeCheckEvidence({ exitCode: 1, stdout: "", stderr: "" })),
    )
    expect(result).toEqual({
      outcome: "fail",
      rationale: "publint reported packaging error(s) (exit code 1).",
    })
  })
})
