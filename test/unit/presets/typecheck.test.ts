import { describe, expect, it } from "vitest"
import { typecheck } from "../../../src/presets/typecheck.js"
import { enoentEvidence, fakeContext, fakeCheckEvidence } from "./fixtures.js"

describe("typecheck preset", () => {
  it("shells out to tsc --noEmit -p tsconfig.json", () => {
    expect(typecheck.run).toEqual(["tsc", "--noEmit", "-p", "tsconfig.json"])
  })

  it("fails with an actionable message when typescript is not installed", async () => {
    const result = await typecheck.policy(fakeContext(enoentEvidence("tsc")))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("`typescript`")
  })

  it("passes when exitCode is 0", async () => {
    const result = await typecheck.policy(fakeContext(fakeCheckEvidence({ exitCode: 0 })))
    expect(result).toEqual({ outcome: "pass", rationale: "tsc reported no type errors." })
  })

  it("fails with captured output when exitCode is non-zero", async () => {
    const result = await typecheck.policy(
      fakeContext(fakeCheckEvidence({ exitCode: 2, stdout: "src/a.ts(1,1): error TS2345" })),
    )
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("TS2345")
  })

  it("falls back to an exit-code-only message when non-zero with no output", async () => {
    const result = await typecheck.policy(
      fakeContext(fakeCheckEvidence({ exitCode: 2, stdout: "", stderr: "" })),
    )
    expect(result).toEqual({
      outcome: "fail",
      rationale: "TypeScript reported type errors (exit code 2).",
    })
  })
})
