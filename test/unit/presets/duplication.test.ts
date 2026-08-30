import { describe, expect, it, vi, beforeEach } from "vitest"
import { duplication } from "../../../src/presets/duplication.js"
import { enoentEvidence, fakeContext, fakeCheckEvidence } from "./fixtures.js"

// `duplication`'s policy reads reports/jscpd/jscpd-report.json from a
// hardcoded relative path (no injectable cwd). Two reasons this can't use
// real files the way most of this package's tests do (per CONTRIBUTING.md's
// real-behavior-over-mocking house style): `process.chdir()` throws under
// Stryker's worker-thread vitest test runner ("process.chdir() is not
// supported in workers", confirmed directly), and -- more importantly --
// this repository's own `duplication` check reads/writes that exact same
// real path as part of `npm run contract`, which runs concurrently with
// this test suite (via the `test-unit` check); real file I/O here raced
// against the genuine check and corrupted its evidence, observed directly.
// Mocking `node:fs/promises` is the correct choice here, not just a
// convenience -- it's the only way to avoid a real collision on shared
// process-wide state (the filesystem) between this test suite and the
// contract that runs it.
const { readFile } = vi.hoisted(() => ({ readFile: vi.fn() }))
vi.mock("node:fs/promises", () => ({ readFile }))

beforeEach(() => {
  readFile.mockReset()
})

describe("duplication preset", () => {
  it("defaults to path '.'", () => {
    expect(duplication().run).toEqual([
      "jscpd",
      ".",
      "--reporters",
      "json",
      "--output",
      "reports/jscpd",
      "--silent",
    ])
  })

  it("threads a custom path option into the run command", () => {
    expect(duplication({ path: "src" }).run).toEqual([
      "jscpd",
      "src",
      "--reporters",
      "json",
      "--output",
      "reports/jscpd",
      "--silent",
    ])
  })

  it("fails with an actionable message when jscpd is not installed", async () => {
    const result = await duplication().policy(fakeContext(enoentEvidence("jscpd")))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("`jscpd`")
  })

  it("reads the report from reports/jscpd/jscpd-report.json", async () => {
    readFile.mockResolvedValue(
      JSON.stringify({
        duplicates: [],
        statistics: { total: { sources: 1, lines: 1, percentage: 0 } },
      }),
    )
    await duplication().policy(fakeContext(fakeCheckEvidence()))
    expect(readFile).toHaveBeenCalledWith("reports/jscpd/jscpd-report.json", "utf8")
  })

  it("fails when the report file was never written", async () => {
    readFile.mockRejectedValue(new Error("ENOENT"))
    const result = await duplication().policy(fakeContext(fakeCheckEvidence()))
    expect(result).toEqual({
      outcome: "fail",
      rationale: "jscpd did not produce its expected JSON report.",
    })
  })

  it("fails when the report file contains invalid JSON", async () => {
    readFile.mockResolvedValue("not json")
    const result = await duplication().policy(fakeContext(fakeCheckEvidence()))
    expect(result).toEqual({ outcome: "fail", rationale: "jscpd produced invalid JSON evidence." })
  })

  it("fails when duplicates is not an array, even if statistics.total is present", async () => {
    readFile.mockResolvedValue(
      JSON.stringify({
        duplicates: "not-an-array",
        statistics: { total: { sources: 1, lines: 1 } },
      }),
    )
    const result = await duplication().policy(fakeContext(fakeCheckEvidence()))
    expect(result).toEqual({
      outcome: "fail",
      rationale: "jscpd produced invalid JSON report data.",
    })
  })

  it("fails when statistics.total is missing entirely, even if duplicates is a valid array", async () => {
    readFile.mockResolvedValue(JSON.stringify({ duplicates: [] }))
    const result = await duplication().policy(fakeContext(fakeCheckEvidence()))
    expect(result).toEqual({
      outcome: "fail",
      rationale: "jscpd produced invalid JSON report data.",
    })
  })

  it.each([
    ["null", "null"],
    ["a primitive", "42"],
  ])("fails cleanly (does not throw) when the report parses to %s", async (_label, raw) => {
    readFile.mockResolvedValue(raw)
    const result = await duplication().policy(fakeContext(fakeCheckEvidence()))
    expect(result).toEqual({
      outcome: "fail",
      rationale: "jscpd produced invalid JSON report data.",
    })
  })

  it("passes when there are 0 duplicates", async () => {
    readFile.mockResolvedValue(
      JSON.stringify({
        duplicates: [],
        statistics: {
          total: { clones: 0, duplicatedLines: 0, lines: 42, percentage: 0, sources: 3 },
        },
      }),
    )

    const result = await duplication().policy(fakeContext(fakeCheckEvidence()))
    expect(result).toEqual({
      outcome: "pass",
      rationale: "jscpd found 0 duplicated block(s) across 3 file(s) (42 lines).",
    })
  })

  it("fails and lists each duplicated block, joined by newline, with the exact header", async () => {
    readFile.mockResolvedValue(
      JSON.stringify({
        duplicates: [
          {
            format: "typescript",
            lines: 10,
            tokens: 50,
            firstFile: { name: "src/a.ts", start: 1, end: 10 },
            secondFile: { name: "src/b.ts", start: 20, end: 30 },
          },
          {
            format: "typescript",
            lines: 5,
            tokens: 25,
            firstFile: { name: "src/c.ts", start: 2, end: 6 },
            secondFile: { name: "src/d.ts", start: 40, end: 44 },
          },
        ],
        statistics: {
          total: { clones: 2, duplicatedLines: 15, lines: 100, percentage: 10, sources: 2 },
        },
      }),
    )

    const result = await duplication().policy(fakeContext(fakeCheckEvidence()))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toBe(
      [
        "jscpd found 2 duplicated block(s) (10.00% of 100 lines across 2 file(s)):",
        "- src/a.ts:1 duplicates src/b.ts:20 -- 10 lines / 50 tokens",
        "- src/c.ts:2 duplicates src/d.ts:40 -- 5 lines / 25 tokens",
      ].join("\n"),
    )
  })
})
