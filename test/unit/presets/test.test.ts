import { describe, expect, it } from "vitest"
import { test as testPreset } from "../../../src/presets/test.js"
import { enoentEvidence, fakeContext, fakeCheckEvidence } from "./fixtures.js"

describe("test preset", () => {
  it("shells out to vitest run --reporter=json", () => {
    expect(testPreset.run).toEqual(["vitest", "run", "--reporter=json"])
    expect(testPreset.output).toEqual({ format: "json" })
  })

  it("fails with an actionable message when vitest is not installed", async () => {
    const result = await testPreset.policy(fakeContext(enoentEvidence("vitest")))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("`vitest`")
  })

  it("delegates pass/fail interpretation to evaluateVitestJsonPolicy", async () => {
    const result = await testPreset.policy(
      fakeContext(
        fakeCheckEvidence({
          output: {
            format: "json",
            success: true,
            value: {
              numTotalTests: 5,
              numTotalTestSuites: 1,
              numFailedTests: 0,
              numFailedTestSuites: 0,
              testResults: [],
            },
          },
        }),
      ),
    )
    expect(result).toEqual({
      outcome: "pass",
      rationale: "Vitest completed 5 test(s) with 0 failures across 1 suite(s).",
    })
  })
})
