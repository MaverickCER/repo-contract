import path from "node:path"
import { describe, expect, it } from "vitest"
import { METRICS_USAGE, parseMetricsArgs, runMetrics } from "../../../bin/metrics-cli.mjs"
import {
  createRunRecord,
  parseRunLog,
  serializeRunRecord,
  summarizeRuns,
} from "../../../src/metrics/index.js"

/** A path under the pretend working directory, spelled the way this platform spells it. */
const at = (...parts: string[]): string => path.resolve("/work/project", ...parts)

const record = (patch: Record<string, unknown> = {}) =>
  serializeRunRecord(
    createRunRecord({
      startedAt: "2026-11-02T10:00:00.000Z",
      durationMs: 60_000,
      scope: "affected",
      checks: [{ id: "tests", durationMs: 1, verdict: "pass" }],
      ...patch,
    }),
  )

const LOG = at(".repo-contract", "metrics", "runs.jsonl")

async function invoke(argv: string[], files: Record<string, string> = {}) {
  const out: string[] = []
  const err: string[] = []
  const read: string[] = []
  const code = await runMetrics({
    argv,
    cwd: at(),
    version: "9.9.9",
    stdout: (t: string) => out.push(t),
    stderr: (t: string) => err.push(t),
    engine: { parseRunLog, summarizeRuns },
    readFile: async (file: string) => {
      read.push(file)
      return files[file]
    },
    now: () => new Date("2026-11-10T00:00:00.000Z"),
  })
  return { code, stdout: out.join(""), stderr: err.join(""), read }
}

describe("parseMetricsArgs", () => {
  it("defaults to a text summary of every run", () => {
    expect(parseMetricsArgs([])).toEqual({ kind: "run", options: { json: false } })
  })

  it("reads the log, filters and format in either value form", () => {
    expect(
      parseMetricsArgs(["--log", "x.jsonl", "--actor=agent", "--since", "7d", "--json", "-C", "p"]),
    ).toEqual({
      kind: "run",
      options: { json: true, log: "x.jsonl", actor: "agent", since: { days: 7 }, cwd: "p" },
    })
    expect(parseMetricsArgs(["--since=2026-11-01T00:00:00Z"])).toMatchObject({
      options: { since: { at: "2026-11-01T00:00:00.000Z" } },
    })
    expect(parseMetricsArgs(["--since", "12h"])).toMatchObject({
      options: { since: { hours: 12 } },
    })
  })

  it.each([
    [["--help"], { kind: "help" }],
    [["-V"], { kind: "version" }],
    [["--bogus"], { kind: "error", message: "unknown option '--bogus'" }],
    [["x"], { kind: "error", message: "unexpected argument 'x'" }],
    [["--log"], { kind: "error", message: "option '--log' needs a value" }],
    [
      ["--actor", "robot"],
      { kind: "error", message: "option '--actor' must be human or agent, not 'robot'" },
    ],
    [
      ["--since", "soon"],
      {
        kind: "error",
        message: "option '--since' needs a time like 2026-11-01, 7d or 12h, not 'soon'",
      },
    ],
    [["--json=1"], { kind: "error", message: "option '--json' does not take a value" }],
  ])("reads %j", (argv, expected) => {
    expect(parseMetricsArgs(argv)).toEqual(expected)
  })

  it("documents its options", () => {
    for (const name of ["--log", "--since", "--actor", "--json", "-C"])
      expect(METRICS_USAGE).toContain(name)
  })
})

describe("runMetrics", () => {
  it("prints help and the version", async () => {
    expect((await invoke(["-h"])).stdout).toContain("Usage: repo-contract metrics")
    expect((await invoke(["-V"])).stdout).toBe("9.9.9\n")
  })

  it("exits 2 on a usage error", async () => {
    const { code, stderr } = await invoke(["--bogus"])
    expect(code).toBe(2)
    expect(stderr).toContain("repo-contract metrics: unknown option '--bogus'")
  })

  it("reads .repo-contract/metrics/runs.jsonl by default and summarizes it", async () => {
    const { code, stdout, read } = await invoke([], {
      [LOG]: record() + record({ checks: [{ id: "tests", durationMs: 1, verdict: "fail" }] }),
    })
    expect(code).toBe(0)
    expect(read).toEqual([LOG])
    expect(stdout).toContain("runs: 2 (1 passed, 1 failed)")
    expect(stdout).toContain("pass rate: 50.0%")
    expect(stdout).toContain("failures by check:")
    expect(stdout).toContain("  tests: 1")
  })

  it("says there is nothing to summarize when the log is missing or empty", async () => {
    expect((await invoke([])).stdout).toBe("No runs recorded yet.\n")
    expect((await invoke([], { [LOG]: "" })).stdout).toBe("No runs recorded yet.\n")
  })

  it("reads a log given with --log, relative to -C", async () => {
    const { read } = await invoke(["-C", "pkg", "--log", "out/runs.jsonl"], {})
    expect(read).toEqual([at("pkg", "out", "runs.jsonl")])
  })

  it("shows ratios only when they are supported by the data", async () => {
    const { stdout } = await invoke([], {
      [LOG]: record({
        checks: [{ id: "a", durationMs: 1, verdict: "pass", cache: "hit" }],
        affectedTests: 2,
        totalTests: 10,
        mutationScore: 99,
      }),
    })
    expect(stdout).toContain("cache hit ratio: 100.0%")
    expect(stdout).toContain("affected tests: 20.0% of all tests")
    expect(stdout).toContain("mutation score: 99")
    expect(stdout).not.toContain("minutes saved")
    expect(stdout).not.toContain("first-pass rate")
  })

  it("filters by actor and by a relative --since measured from now", async () => {
    const files = {
      [LOG]:
        record({ actor: "agent", startedAt: "2026-11-09T00:00:00.000Z" }) +
        record({ actor: "human", startedAt: "2026-11-09T00:00:00.000Z" }) +
        record({ actor: "agent", startedAt: "2026-10-01T00:00:00.000Z" }),
    }
    expect((await invoke(["--actor", "agent"], files)).stdout).toContain("runs: 2 ")
    expect((await invoke(["--since", "7d"], files)).stdout).toContain("runs: 2 ")
    expect((await invoke(["--since", "12h"], files)).stdout).toBe("No runs recorded yet.\n")
    expect((await invoke(["--since", "2026-10-15"], files)).stdout).toContain("runs: 2 ")
  })

  it("prints a versioned JSON document", async () => {
    const { stdout } = await invoke(["--json"], { [LOG]: record() })
    expect(JSON.parse(stdout)).toMatchObject({
      schemaVersion: 1,
      summary: { runs: 1, passed: 1 },
      skippedLines: 0,
    })
  })

  it("reports unreadable lines on stderr and still summarizes the rest", async () => {
    const { code, stdout, stderr } = await invoke([], { [LOG]: `${record()}nonsense\n` })
    expect(code).toBe(0)
    expect(stdout).toContain("runs: 1")
    expect(stderr).toContain("skipped 1 unreadable line (first: Line 2 is not valid JSON.)")
  })

  it("exits 1 when reading fails", async () => {
    const code = await runMetrics({
      argv: [],
      cwd: "/w",
      version: "1",
      stdout: () => undefined,
      stderr: () => undefined,
      engine: { parseRunLog, summarizeRuns },
      readFile: () => Promise.reject(new Error("EIO")),
      now: () => new Date(),
    })
    expect(code).toBe(1)
  })
})
