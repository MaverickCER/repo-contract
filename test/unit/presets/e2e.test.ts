import { describe, expect, it } from "vitest"
import { e2e } from "../../../src/presets/e2e.js"
import { enoentEvidence, fakeContext, fakeCheckEvidence } from "./fixtures.js"

describe("e2e preset", () => {
  it("shells out to playwright test --reporter=json", () => {
    expect(e2e.run).toEqual(["playwright", "test", "--reporter=json"])
    expect(e2e.output).toEqual({ format: "json" })
  })

  it("fails with an actionable message when @playwright/test is not installed", async () => {
    const result = await e2e.policy(fakeContext(enoentEvidence("playwright")))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("`@playwright/test`")
  })

  it("fails when output could not be parsed as JSON", async () => {
    const result = await e2e.policy(
      fakeContext(fakeCheckEvidence({ output: { format: "json", success: false, error: "bad" } })),
    )
    expect(result).toEqual({
      outcome: "fail",
      rationale: "Playwright output could not be parsed as JSON.",
    })
  })

  it("fails when output is entirely absent (not just success: false)", async () => {
    const result = await e2e.policy(fakeContext(fakeCheckEvidence({ output: undefined })))
    expect(result).toEqual({
      outcome: "fail",
      rationale: "Playwright output could not be parsed as JSON.",
    })
  })

  it("fails when stats is missing from an otherwise-parsed report", async () => {
    const result = await e2e.policy(
      fakeContext(fakeCheckEvidence({ output: { format: "json", success: true, value: {} } })),
    )
    expect(result).toEqual({
      outcome: "fail",
      rationale: "Playwright produced invalid JSON report data.",
    })
  })

  it.each([
    ["null", null],
    ["a primitive", 42],
  ])("fails without throwing when the parsed value is %s", async (_label, value) => {
    const result = await e2e.policy(
      fakeContext(fakeCheckEvidence({ output: { format: "json", success: true, value } })),
    )
    expect(result).toEqual({
      outcome: "fail",
      rationale: "Playwright produced invalid JSON report data.",
    })
  })

  it("passes when unexpected and flaky are both 0", async () => {
    const result = await e2e.policy(
      fakeContext(
        fakeCheckEvidence({
          output: {
            format: "json",
            success: true,
            value: { stats: { expected: 8, unexpected: 0, flaky: 0, skipped: 0 }, suites: [] },
          },
        }),
      ),
    )
    expect(result).toEqual({
      outcome: "pass",
      rationale: "Playwright completed 8 test(s) with 0 unexpected failures.",
    })
  })

  it("warns when unexpected is 0 but flaky is greater than 0", async () => {
    const result = await e2e.policy(
      fakeContext(
        fakeCheckEvidence({
          output: {
            format: "json",
            success: true,
            value: { stats: { expected: 8, unexpected: 0, flaky: 2, skipped: 0 }, suites: [] },
          },
        }),
      ),
    )
    expect(result.outcome).toBe("warn")
    expect(result.rationale).toBe(
      "Playwright completed with 2 flaky test(s) that eventually passed on retry.",
    )
  })

  it("fails with exactly the header and no detail lines when unexpected > 0 but no suites carry a failing spec", async () => {
    // A data inconsistency by construction (stats say 1 unexpected, but no
    // spec in the tree is actually !ok) -- proves collectFailingSpecs
    // genuinely starts from an empty list, not a placeholder.
    const result = await e2e.policy(
      fakeContext(
        fakeCheckEvidence({
          output: {
            format: "json",
            success: true,
            value: { stats: { expected: 0, unexpected: 1, flaky: 0, skipped: 0 }, suites: [] },
          },
        }),
      ),
    )
    expect(result).toEqual({
      outcome: "fail",
      rationale: "Playwright reported 1 unexpected failure(s):",
    })
  })

  it("fails and lists failing specs recursively across nested suites, joined by newline, rendering error message when present", async () => {
    const report = {
      stats: { expected: 1, unexpected: 2, flaky: 0, skipped: 0 },
      suites: [
        {
          title: "chromium",
          specs: [],
          suites: [
            {
              title: "login.spec.ts",
              specs: [
                {
                  title: "logs in",
                  file: "login.spec.ts",
                  line: 12,
                  ok: false,
                  tests: [{ results: [{ status: "failed", error: { message: "  timeout  " } }] }],
                },
                { title: "logs out", file: "login.spec.ts", ok: true, tests: [] },
              ],
            },
          ],
        },
        {
          title: "firefox",
          specs: [{ title: "broken elsewhere", ok: false, tests: [] }],
        },
      ],
    }
    const result = await e2e.policy(
      fakeContext(fakeCheckEvidence({ output: { format: "json", success: true, value: report } })),
    )

    expect(result.outcome).toBe("fail")
    expect(result.rationale).toBe(
      [
        "Playwright reported 2 unexpected failure(s):",
        "- login.spec.ts:12 logs in — timeout",
        "- firefox broken elsewhere",
      ].join("\n"),
    )
  })

  it("falls back to suite.title when a failing spec has no file, and omits the message suffix entirely when the last result has no error", async () => {
    const report = {
      stats: { expected: 0, unexpected: 1, flaky: 0, skipped: 0 },
      suites: [
        {
          title: "anonymous suite",
          specs: [
            {
              title: "broken",
              ok: false,
              tests: [{ results: [{ status: "failed" }] }],
            },
          ],
        },
      ],
    }
    const result = await e2e.policy(
      fakeContext(fakeCheckEvidence({ output: { format: "json", success: true, value: report } })),
    )

    expect(result.rationale).toBe(
      ["Playwright reported 1 unexpected failure(s):", "- anonymous suite broken"].join("\n"),
    )
  })

  it("treats a missing suite.specs, spec.tests, and test.results as empty rather than throwing", async () => {
    const report = {
      stats: { expected: 0, unexpected: 1, flaky: 0, skipped: 0 },
      suites: [
        // No `specs` at all on this suite -- only its nested suite carries one.
        {
          title: "outer",
          suites: [
            {
              title: "inner",
              specs: [
                // No `tests` at all on this spec.
                { title: "no tests field", file: "f.spec.ts", ok: false },
                // `tests` present, but its one entry has no `results` field.
                { title: "no results field", file: "f.spec.ts", ok: false, tests: [{}] },
              ],
            },
          ],
        },
      ],
    }
    const result = await e2e.policy(
      fakeContext(fakeCheckEvidence({ output: { format: "json", success: true, value: report } })),
    )

    expect(result.rationale).toBe(
      [
        "Playwright reported 1 unexpected failure(s):",
        "- f.spec.ts no tests field",
        "- f.spec.ts no results field",
      ].join("\n"),
    )
  })

  it("treats a report with no suites field at all as zero failing specs, not a throw", async () => {
    const result = await e2e.policy(
      fakeContext(
        fakeCheckEvidence({
          output: {
            format: "json",
            success: true,
            value: { stats: { expected: 0, unexpected: 1, flaky: 0, skipped: 0 } },
          },
        }),
      ),
    )
    expect(result).toEqual({
      outcome: "fail",
      rationale: "Playwright reported 1 unexpected failure(s):",
    })
  })

  it("does not throw when the last result's error has no message field", async () => {
    const report = {
      stats: { expected: 0, unexpected: 1, flaky: 0, skipped: 0 },
      suites: [
        {
          title: "s",
          specs: [
            {
              title: "broken",
              file: "f.spec.ts",
              ok: false,
              tests: [{ results: [{ status: "failed", error: {} }] }],
            },
          ],
        },
      ],
    }
    const result = await e2e.policy(
      fakeContext(fakeCheckEvidence({ output: { format: "json", success: true, value: report } })),
    )
    expect(result.rationale).toBe(
      ["Playwright reported 1 unexpected failure(s):", "- f.spec.ts broken"].join("\n"),
    )
  })

  it("uses the last result's error, not an earlier retry's, when a spec has multiple results", async () => {
    const report = {
      stats: { expected: 0, unexpected: 1, flaky: 0, skipped: 0 },
      suites: [
        {
          title: "s",
          specs: [
            {
              title: "flaky-then-fails",
              file: "f.spec.ts",
              ok: false,
              tests: [
                {
                  results: [
                    { status: "failed", error: { message: "first attempt error" } },
                    { status: "failed", error: { message: "final attempt error" } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }
    const result = await e2e.policy(
      fakeContext(fakeCheckEvidence({ output: { format: "json", success: true, value: report } })),
    )

    expect(result.rationale).toContain("final attempt error")
    expect(result.rationale).not.toContain("first attempt error")
  })

  it("renders a failing spec with an empty results array without throwing", async () => {
    const report = {
      stats: { expected: 0, unexpected: 1, flaky: 0, skipped: 0 },
      suites: [
        {
          title: "s",
          specs: [{ title: "broken", file: "f.spec.ts", ok: false, tests: [{ results: [] }] }],
        },
      ],
    }
    const result = await e2e.policy(
      fakeContext(fakeCheckEvidence({ output: { format: "json", success: true, value: report } })),
    )

    expect(result.rationale).toBe(
      ["Playwright reported 1 unexpected failure(s):", "- f.spec.ts broken"].join("\n"),
    )
  })
})
