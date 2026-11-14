import { describe, expect, it, vi, beforeEach } from "vitest"
import { test as testPreset } from "../../../src/presets/test.js"
import { enoentEvidence, fakeContext, fakeCheckEvidence } from "./fixtures.js"

// `test`'s policy reads reports/vitest/vitest-report.json from a hardcoded
// relative path (no injectable cwd). duplication.test.ts documents the same
// constraint for jscpd's report. This repository's `test` check reads and
// writes that path during `npm run contract`, which runs concurrently with
// this test suite. File I/O here would race the check. Mocking
// `node:fs/promises` avoids that collision.
const { readFile } = vi.hoisted(() => ({ readFile: vi.fn() }))
vi.mock("node:fs/promises", () => ({ readFile }))

beforeEach(() => {
  readFile.mockReset()
})

describe("test preset", () => {
  it("shells out to vitest run --reporter=json --outputFile=<report path>", () => {
    expect(testPreset.run).toEqual([
      "vitest",
      "run",
      "--reporter=json",
      "--outputFile=reports/vitest/vitest-report.json",
    ])
  })

  it("fails with an actionable message when vitest is not installed", async () => {
    const result = await testPreset.policy(fakeContext(enoentEvidence("vitest")))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("`vitest`")
  })

  it("reads the report from reports/vitest/vitest-report.json", async () => {
    readFile.mockResolvedValue(
      JSON.stringify({
        numTotalTests: 5,
        numTotalTestSuites: 1,
        numFailedTests: 0,
        numFailedTestSuites: 0,
        numPassedTests: 5,
        testResults: [],
      }),
    )
    const result = await testPreset.policy(fakeContext(fakeCheckEvidence()))
    expect(readFile).toHaveBeenCalledWith("reports/vitest/vitest-report.json", "utf8")
    expect(result).toEqual({
      outcome: "pass",
      rationale: "Vitest completed 5 test(s) with 0 failures across 1 suite(s).",
    })
  })

  it("fails when the report file was never written", async () => {
    readFile.mockRejectedValue(new Error("ENOENT"))
    const result = await testPreset.policy(fakeContext(fakeCheckEvidence()))
    expect(result).toEqual({
      outcome: "fail",
      rationale: "Vitest output could not be parsed as JSON.",
    })
  })

  it("fails when the report file contains invalid JSON", async () => {
    readFile.mockResolvedValue("not json")
    const result = await testPreset.policy(fakeContext(fakeCheckEvidence()))
    expect(result).toEqual({
      outcome: "fail",
      rationale: "Vitest output could not be parsed as JSON.",
    })
  })
})
