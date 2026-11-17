import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { COVERAGE_VITEST_ARGS, coverage } from "../../../src/presets/coverage.js"
import type { CoverageOptions, CoverageThresholds } from "../../../src/presets/coverage.js"
import type { CheckEvidence, PolicyContext } from "../../../src/types.js"
import { fakeCheckEvidence, fakeContext } from "./fixtures.js"

const work = mkdtempSync(path.join(tmpdir(), "repo-contract-coverage-"))
afterAll(() => {
  rmSync(work, { recursive: true, force: true })
})

const metric = (pct: number | "Unknown") => ({ total: 10, covered: 8, skipped: 0, pct })
const TOTAL = {
  lines: metric(85),
  statements: metric(84),
  functions: metric(40),
  branches: metric(30),
}

/**
 * Runs the preset's own reader script the way the runner would.
 * @param args - the preset's `run`, after `node`.
 * @returns the exit code and parsed stdout.
 */
function runReader(args: readonly string[]): { status: number | null; value: unknown } {
  const result = spawnSync(process.execPath, args, { cwd: work, encoding: "utf8" })
  return { status: result.status, value: JSON.parse(result.stdout) as unknown }
}

function readerEvidence(value: unknown, overrides: Partial<CheckEvidence> = {}): CheckEvidence {
  return fakeCheckEvidence({
    command: "node",
    output: { format: "json", success: true, value },
    ...overrides,
  })
}

function withDependencies(
  result: CheckEvidence,
  dependencies: Record<string, CheckEvidence>,
): PolicyContext {
  return { ...fakeContext(result), dependencies }
}

describe("R7b coverage preset", () => {
  it("defaults to 80 on lines and statements", async () => {
    const check = coverage()
    expect(check.output).toEqual({ format: "json" })
    expect(await check.policy(fakeContext(readerEvidence({ total: TOTAL })))).toEqual({
      outcome: "pass",
      rationale:
        "Coverage met every threshold: lines 85% (80% required), statements 84% (80% required).",
    })
    const low = { total: { ...TOTAL, statements: metric(79) } }
    expect((await check.policy(fakeContext(readerEvidence(low)))).outcome).toBe("fail")
  })

  it("judges the thresholds it is given, and only those", async () => {
    const check = coverage({ thresholds: { branches: 30, functions: 41 } })
    expect(await check.policy(fakeContext(readerEvidence({ total: TOTAL })))).toEqual({
      outcome: "fail",
      rationale: [
        "Coverage is below 1 threshold(s):",
        "- functions: 40% actual, 41% required, 1.00 points short",
      ].join("\n"),
    })
  })

  it("reads the summary option's path", () => {
    expect(coverage().run.slice(3)).toEqual(["coverage/coverage-summary.json"])
    const check = coverage({ summary: "reports/cov/summary.json" })
    const run = check.run as readonly string[]
    expect(run.slice(0, 2)).toEqual(["node", "-e"])
    expect(run.slice(3)).toEqual(["reports/cov/summary.json"])
  })

  it("puts only the summary's total into the evidence, through node -e", () => {
    writeFileSync(
      path.join(work, "summary.json"),
      JSON.stringify({ total: TOTAL, "/abs/src/a.ts": TOTAL }),
    )
    const run = coverage({ summary: "summary.json" }).run as readonly string[]
    expect(runReader(run.slice(1))).toEqual({ status: 0, value: { total: TOTAL } })
  })

  it("fails when the summary file is missing", async () => {
    const run = coverage({ summary: "absent/summary.json" }).run as readonly string[]
    const read = runReader(run.slice(1))
    expect(read.status).toBe(1)
    expect(
      await coverage().policy(fakeContext(readerEvidence(read.value, { exitCode: 1 }))),
    ).toEqual({
      outcome: "fail",
      rationale:
        "Coverage: cannot read absent/summary.json. Run the tests with coverage first. A tier's Tests check passes the coverage flags itself. If Tests runs your own Vitest config, set `coverage.enabled` and add json-summary to `coverage.reporter`, written to that path.",
    })
  })

  it("fails when the summary file is not JSON", async () => {
    writeFileSync(path.join(work, "broken.json"), "{")
    const run = coverage({ summary: "broken.json" }).run as readonly string[]
    const read = runReader(run.slice(1))
    expect(read.status).toBe(1)
    expect(await coverage().policy(fakeContext(readerEvidence(read.value)))).toEqual({
      outcome: "fail",
      rationale: "Coverage: broken.json is not valid JSON.",
    })
  })

  it("warns, not evaluated, when a dependency it waits on failed", async () => {
    const result = await coverage().policy(
      withDependencies(readerEvidence({ total: TOTAL }), {
        Tests: fakeCheckEvidence({ exitCode: 1 }),
        Typecheck: fakeCheckEvidence({ exitCode: 0 }),
      }),
    )
    expect(result).toEqual({
      outcome: "warn",
      rationale:
        "Coverage: not evaluated, because Tests did not pass, and that already fails the run.",
    })
  })

  it("warns, not evaluated, when a dependency did not run to its exit", async () => {
    const result = await coverage().policy(
      withDependencies(readerEvidence({ total: TOTAL }), {
        Tests: fakeCheckEvidence({ exitCode: null, status: "aborted" }),
      }),
    )
    expect(result.outcome).toBe("warn")
  })

  it("names every failed dependency, sorted", async () => {
    const result = await coverage().policy(
      withDependencies(readerEvidence({ total: TOTAL }), {
        Unit: fakeCheckEvidence({ exitCode: 1 }),
        Build: fakeCheckEvidence(),
        Integration: fakeCheckEvidence({ exitCode: 0, status: "timed_out" }),
      }),
    )
    expect(result.rationale).toBe(
      "Coverage: not evaluated, because Integration, Unit did not pass, and that already fails the run.",
    )
  })

  it("evaluates when every dependency passed", async () => {
    const result = await coverage().policy(
      withDependencies(readerEvidence({ total: TOTAL }), { Tests: fakeCheckEvidence() }),
    )
    expect(result.outcome).toBe("pass")
  })

  it.each([
    ["above 100", { lines: 101 }, "thresholds.lines must be a number from 0 to 100, got 101."],
    ["negative", { lines: -5 }, "thresholds.lines must be a number from 0 to 100, got -5."],
    ["a string", { lines: "80" }, 'thresholds.lines must be a number from 0 to 100, got "80".'],
    [
      "NaN",
      { branches: Number.NaN },
      "thresholds.branches must be a number from 0 to 100, got NaN.",
    ],
    [
      "infinite",
      { functions: Number.POSITIVE_INFINITY },
      "thresholds.functions must be a number from 0 to 100, got Infinity.",
    ],
    [
      "an unknown metric",
      { lines: 80, line: 80 },
      'thresholds has no metric "line". The metrics are lines, statements, functions and branches.',
    ],
  ])(
    "throws RangeError when the config loads, on a threshold that is %s",
    (_label, thresholds, message) => {
      expect(() => coverage({ thresholds: thresholds as CoverageThresholds })).toThrow(
        new RangeError(`coverage: ${message}`),
      )
    },
  )

  it.each([
    ["null", null],
    ["a number", 80],
    ["a list", []],
  ])("throws RangeError when the config loads, on thresholds that are %s", (_label, thresholds) => {
    expect(() => coverage({ thresholds: thresholds as unknown as CoverageThresholds })).toThrow(
      new RangeError("coverage: thresholds must be an object keyed by metric."),
    )
  })

  it.each([
    ["null", null, "null"],
    ["a number", 80, "80"],
    ["a list", [], "a list"],
  ])("throws TypeError when the config loads, on options that are %s", (_label, options, shown) => {
    expect(() => coverage(options as unknown as CoverageOptions)).toThrow(
      new TypeError(`coverage: options must be an object, got ${shown}.`),
    )
  })

  it("accepts the bounds 0 and 100 and a metric left undefined", () => {
    expect(() =>
      coverage({ thresholds: { lines: 0, statements: 100, functions: undefined } }),
    ).not.toThrow()
  })

  it("fails when the reader's output could not be parsed", async () => {
    const result = await coverage().policy(
      fakeContext(
        fakeCheckEvidence({
          output: { format: "json", success: false, error: "Unexpected end of JSON input" },
          stderr: "node: bad option",
        }),
      ),
    )
    expect(result).toEqual({
      outcome: "fail",
      rationale: "Coverage: the summary reader printed no readable JSON.\nnode: bad option",
    })
  })

  it("fails, naming the summary, when the reader printed a trailing newline and no JSON", async () => {
    const result = await coverage().policy(
      fakeContext(
        fakeCheckEvidence({
          output: { format: "json", success: false, error: "Unexpected end of JSON input" },
          stderr: "\n  node: bad option\n",
        }),
      ),
    )
    expect(result.rationale).toBe(
      "Coverage: the summary reader printed no readable JSON.\nnode: bad option",
    )
  })

  it("fails on unreadable reader output without a blank line when stderr is empty", async () => {
    const result = await coverage().policy(
      fakeContext(
        fakeCheckEvidence({
          output: { format: "json", success: false, error: "Unexpected end of JSON input" },
        }),
      ),
    )
    expect(result).toEqual({
      outcome: "fail",
      rationale: "Coverage: the summary reader printed no readable JSON.",
    })
  })

  it("judges a null reader value as a summary with no total, not as a reader error", async () => {
    const result = await coverage().policy(fakeContext(readerEvidence(null)))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).not.toContain("cannot read")
  })

  it("names the summary reader when it timed out", async () => {
    const result = await coverage().policy(
      fakeContext(fakeCheckEvidence({ status: "timed_out", exitCode: null })),
    )
    expect(result).toEqual({
      outcome: "fail",
      rationale:
        "The coverage summary reader did not finish: its process exceeded the configured timeout and was terminated.",
    })
  })

  it("COVERAGE_VITEST_ARGS writes json-summary and json reports", () => {
    expect(COVERAGE_VITEST_ARGS).toEqual([
      "--coverage.enabled",
      "--coverage.reporter=json-summary",
      "--coverage.reporter=json",
      "--coverage.reportsDirectory=coverage",
    ])
  })

  it("COVERAGE_VITEST_ARGS names only flags the installed vitest documents", () => {
    const help = execFileSync(
      process.execPath,
      [path.resolve("node_modules/vitest/vitest.mjs"), "--help", "--coverage"],
      { encoding: "utf8" },
    )
    for (const arg of COVERAGE_VITEST_ARGS) {
      expect(help).toContain(`  ${arg.split("=")[0] ?? arg} `)
    }
  })
})
