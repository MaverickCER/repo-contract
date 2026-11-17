import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { readFile } from "node:fs/promises"
import type * as FsPromises from "node:fs/promises"
import { afterAll, describe, expect, it, vi } from "vitest"
import { mutationExceptionId } from "../../../src/affected/mutation-report.js"
import { mutation } from "../../../src/presets/mutation.js"
import type { MutationOptions } from "../../../src/presets/mutation.js"
import type { MutationRunReport } from "../../../src/presets/rules/mutation-verdict.js"
import type { CheckEvidence } from "../../../src/types.js"
import { enoentEvidence, fakeCheckEvidence, fakeContext } from "./fixtures.js"

// The real readFile, watched, so a test can see how the preset reads the report.
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>()
  return { ...actual, readFile: vi.fn(actual.readFile) }
})

const dir = mkdtempSync(path.join(tmpdir(), "rc-mutation-preset-"))
afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

let files = 0
/**
 * @param name - a file name inside the temp directory.
 * @param value - JSON to write, or text as is.
 * @returns the absolute path.
 */
function write(name: string, value: unknown): string {
  files += 1
  const file = path.join(dir, `${String(files)}-${name}`)
  writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value))
  return file
}

const SOURCE = "export const f = (a) => a + 1\n"
const SURVIVOR = {
  file: "src/f.ts",
  mutator: "ArithmeticOperator",
  original: "a + 1",
  replacement: "a - 1",
}

/**
 * @param statuses - one status per mutant, all on the `a + 1` span.
 * @returns a Stryker report.
 */
function strykerReport(statuses: readonly string[]) {
  return {
    schemaVersion: "2",
    files: {
      "src/f.ts": {
        language: "typescript",
        source: SOURCE,
        mutants: statuses.map((status, index) => ({
          id: String(index),
          mutatorName: "ArithmeticOperator",
          replacement: "a - 1",
          status,
          testsCompleted: status === "NoCoverage" ? 0 : 1,
          location: { start: { line: 1, column: 25 }, end: { line: 1, column: 30 } },
        })),
      },
    },
  }
}

function runReport(overrides: Partial<MutationRunReport> = {}): MutationRunReport {
  return {
    schemaVersion: 1,
    state: "ran",
    report: "reports/mutation/mutation.json",
    exitCode: 0,
    shard: null,
    mutate: null,
    timeouts: { rerun: 0, caught: 0 },
    inputs: null,
    message: "Stryker ran every mutant.",
    ...overrides,
  }
}

const evidenceOf = (value: unknown, overrides: Partial<CheckEvidence> = {}): CheckEvidence =>
  fakeCheckEvidence({ output: { format: "json", success: true, value }, ...overrides })

const verdict = async (options: MutationOptions, value: unknown) =>
  mutation(options).policy(fakeContext(evidenceOf(value)))

const RECORD = {
  id: mutationExceptionId(SURVIVOR),
  version: 2,
  justification: "Applying it by hand fails the suite.",
  ...SURVIVOR,
  ruleBroken: "Every mutant is detected.",
  attempted: "A second test.",
  constraint: "Per-test coverage misses it.",
  whyPreferable: "The test exists.",
  residualRisk: "None.",
  revisitWhen: "Stryker is upgraded.",
  expires: "",
}

describe("mutation preset", () => {
  it("runs repo-contract mutation run --json with its defaults as flags", () => {
    const check = mutation()
    expect(check.run).toEqual([
      "repo-contract",
      "mutation",
      "run",
      "--json",
      "--cache",
      "off",
      "--confirm-timeouts",
      "5",
    ])
    expect(check.output).toEqual({ format: "json" })
    expect(check.timeoutMs).toBeUndefined()
  })

  it("passes every option as a flag", () => {
    // `shard` and `report` cannot be combined, so `shard` is checked on its own below.
    expect(mutation({ shard: "2/8" }).run).toEqual([
      "repo-contract",
      "mutation",
      "run",
      "--json",
      "--cache",
      "off",
      "--confirm-timeouts",
      "5",
      "--shard",
      "2/8",
    ])
    const check = mutation({
      mutate: ["src/a.ts", "src/b.ts"],
      report: "merged.json",
      cache: "read-write",
      config: "stryker.conf.mjs",
      confirmTimeouts: 0,
      timeoutMs: 3_600_000,
    })
    expect(check.run).toEqual([
      "repo-contract",
      "mutation",
      "run",
      "--json",
      "--cache",
      "read-write",
      "--confirm-timeouts",
      "0",
      "--mutate=src/a.ts,src/b.ts",
      "--report",
      "merged.json",
      "--config",
      "stryker.conf.mjs",
    ])
    expect(check.timeoutMs).toBe(3_600_000)
  })

  it("passes patchVitestRunner: false as --no-patch-vitest-runner, and true as nothing", () => {
    expect(mutation({ patchVitestRunner: false }).run.at(-1)).toBe("--no-patch-vitest-runner")
    expect(mutation({ patchVitestRunner: true }).run).toEqual(mutation().run)
    expect(mutation().run).not.toContain("--no-patch-vitest-runner")
  })

  it("passes an empty mutate list as an empty flag value", () => {
    expect(mutation({ mutate: [] }).run).toContain("--mutate=")
  })

  it("accepts the edges of each numeric option", () => {
    for (const options of [
      { minScore: 0 },
      { minScore: 100 },
      { confirmTimeouts: 0 },
      { timeoutMs: 1 },
    ]) {
      expect(mutation(options).run.slice(0, 3)).toEqual(["repo-contract", "mutation", "run"])
    }
  })

  it("is isolated", () => {
    expect(mutation().isolated).toBe(true)
    expect(mutation({ minScore: 100 }).isolated).toBe(true)
  })

  it.each<[MutationOptions, string]>([
    [{ minScore: 101 }, "minScore must be a number from 0 to 100, not 101."],
    [{ minScore: Number.NaN }, "minScore must be a number from 0 to 100, not NaN."],
    [{ minScore: -1 }, "minScore must be a number from 0 to 100, not -1."],
    [{ confirmTimeouts: 1.5 }, "confirmTimeouts must be a whole number of 0 or more, not 1.5."],
    [{ confirmTimeouts: -1 }, "confirmTimeouts must be a whole number of 0 or more, not -1."],
    [{ timeoutMs: 0 }, "timeoutMs must be a positive whole number of milliseconds, not 0."],
    [
      { shard: "9/8" },
      'shard: A shard must be written <index>/<total> with 1 <= index <= total, not "9/8".',
    ],
    [{ mutate: ["a,b.ts"] }, 'mutate: a file name cannot be empty or hold a comma: "a,b.ts".'],
    [{ mutate: [""] }, 'mutate: a file name cannot be empty or hold a comma: "".'],
    [
      { cache: "sometimes" as "off" },
      'cache must be "read-write", "read-only" or "off", not "sometimes".',
    ],
    [{ registry: "" }, "registry must be a path or false, not an empty string."],
    [
      { patchVitestRunner: "no" as unknown as boolean },
      'patchVitestRunner must be true or false, not "no".',
    ],
    [
      { report: "reports/mutation/mutation.json", shard: "1/2" },
      "report and shard cannot be used together: a report is judged whole, so there is nothing to shard.",
    ],
  ])("fails without running Stryker on a bad option %j", async (options, reason) => {
    const check = mutation(options)
    expect(check.run).toEqual(["node", "-e", ""])
    expect(check.isolated).toBe(true)
    expect(await check.policy(fakeContext(fakeCheckEvidence()))).toEqual({
      outcome: "fail",
      rationale: `Mutation: the preset's options are invalid: ${reason}`,
    })
  })

  it("fails with an actionable message when repo-contract is not on PATH", async () => {
    const result = await mutation().policy(fakeContext(enoentEvidence("repo-contract")))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("`repo-contract` is required by this preset")
  })

  it("fails when the command was stopped by a signal", async () => {
    const result = await mutation().policy(
      fakeContext(fakeCheckEvidence({ exitCode: null, signal: "SIGTERM", status: "completed" })),
    )
    expect(result.outcome).toBe("fail")
  })

  it("fails when the run output is not JSON, and shows the end of stderr", async () => {
    const result = await mutation().policy(
      fakeContext(
        fakeCheckEvidence({
          exitCode: 2,
          stderr: "repo-contract mutation: unknown option '--x'\n",
          output: { format: "json", success: false, error: "Unexpected end" },
        }),
      ),
    )
    expect(result).toEqual({
      outcome: "fail",
      rationale:
        "Mutation: `repo-contract mutation run --json` printed no JSON report.\nrepo-contract mutation: unknown option '--x'",
    })
  })

  it("keeps only the last 3000 characters of stderr, and adds no line for an empty one", async () => {
    const unreadable = (stderr: string) =>
      mutation().policy(
        fakeContext(
          fakeCheckEvidence({
            exitCode: 2,
            stderr,
            output: { format: "json", success: false, error: "Unexpected end" },
          }),
        ),
      )
    const tail = "y".repeat(3000)
    expect((await unreadable(`${"x".repeat(50)}${tail}\n`)).rationale).toBe(
      `Mutation: \`repo-contract mutation run --json\` printed no JSON report.\n${tail}`,
    )
    expect(await unreadable("")).toEqual({
      outcome: "fail",
      rationale: "Mutation: `repo-contract mutation run --json` printed no JSON report.",
    })
  })

  it("names the mutation command when it timed out", async () => {
    expect(
      await mutation().policy(
        fakeContext(fakeCheckEvidence({ status: "timed_out", exitCode: null })),
      ),
    ).toEqual({
      outcome: "fail",
      rationale:
        "The mutation command did not finish: its process exceeded the configured timeout and was terminated.",
    })
  })

  it("fails when the run output is not a mutation run report", async () => {
    expect(await verdict({}, { schemaVersion: 1, state: "ran" })).toEqual({
      outcome: "fail",
      rationale: "Mutation: `repo-contract mutation run --json` printed an invalid report.",
    })
  })

  it("passes nothing-to-mutate with a rationale", async () => {
    expect(
      await verdict(
        { mutate: [] },
        runReport({
          state: "nothing-to-mutate",
          exitCode: null,
          mutate: [],
          message: "Nothing to mutate: the mutate list is empty.",
        }),
      ),
    ).toEqual({
      outcome: "pass",
      rationale: "Mutation: Nothing to mutate: the mutate list is empty.",
    })
  })

  it("fails on state error with the run's message", async () => {
    expect(
      await verdict(
        {},
        runReport({ state: "error", exitCode: null, report: "", message: "No Stryker config." }),
      ),
    ).toEqual({ outcome: "fail", rationale: "Mutation: No Stryker config." })
  })

  it("fails when the report it names is missing or not JSON", async () => {
    const missing = path.join(dir, "absent.json")
    expect(await verdict({ registry: false }, runReport({ report: missing }))).toEqual({
      outcome: "fail",
      rationale: `Mutation: cannot read the Stryker report ${missing}.`,
    })
    const broken = write("broken.json", "{")
    expect(await verdict({ registry: false }, runReport({ report: broken }))).toEqual({
      outcome: "fail",
      rationale: `Mutation: the Stryker report ${broken} is not JSON.`,
    })
  })

  it("fails when the report is not a mutation report", async () => {
    const report = write("shape.json", { files: { "a.ts": {} } })
    expect(await verdict({ registry: false }, runReport({ report }))).toEqual({
      outcome: "fail",
      rationale: 'Mutation: The mutation report\'s entry for "a.ts" has no "mutants" array.',
    })
  })

  it("judges the report at the default floor of 80, with the run's message last", async () => {
    const report = write(
      "ran.json",
      strykerReport(["Killed", "Killed", "Killed", "Killed", "Survived"]),
    )
    const result = await verdict({ registry: false }, runReport({ report }))
    expect(result.outcome).toBe("pass")
    expect(result.rationale.split("\n")[0]).toBe(
      "Mutation: score 80.00% of 5 scored mutants (minimum 80%): 4 detected (4 killed), 1 survived, 0 no coverage, 0 timed out.",
    )
    expect(result.rationale.split("\n").at(-1)).toBe("Stryker ran every mutant.")
  })

  it("fails the same report at minScore 100", async () => {
    const report = write("strict.json", strykerReport(["Killed", "Survived"]))
    const result = await verdict({ registry: false, minScore: 100 }, runReport({ report }))
    expect(result.outcome).toBe("fail")
  })

  it("loads the registry, applies it and judges the report", async () => {
    const report = write("covered.json", strykerReport(["Killed", "Survived"]))
    const registry = write("mutation.json", { exceptions: [RECORD] })
    const result = await verdict({ registry, minScore: 100 }, runReport({ report }))
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain("Left out of the score: 1 covered by a registry record.")
  })

  it("calls an unmatched record stale on a full run only", async () => {
    const report = write("killed.json", strykerReport(["Killed"]))
    const registry = write("stale.json", { exceptions: [{ ...RECORD }] })
    const other = {
      ...RECORD,
      original: "b",
      id: mutationExceptionId({ ...SURVIVOR, original: "b" }),
    }
    const staleRegistry = write("stale2.json", { exceptions: [other] })
    expect((await verdict({ registry }, runReport({ report }))).outcome).toBe("pass")
    const full = await verdict({ registry: staleRegistry }, runReport({ report }))
    expect(full.outcome).toBe("fail")
    expect(full.rationale).toContain("matches no mutant in the report")
    expect(
      (await verdict({ registry: staleRegistry }, runReport({ report, shard: "1/2" }))).outcome,
    ).toBe("pass")
    expect(
      (await verdict({ registry: staleRegistry }, runReport({ report, mutate: ["src/f.ts"] })))
        .outcome,
    ).toBe("pass")
  })

  it("passes a missing registry as an empty one", async () => {
    const report = write("all.json", strykerReport(["Killed"]))
    const result = await verdict({ registry: path.join(dir, "none.json") }, runReport({ report }))
    expect(result.outcome).toBe("pass")
  })

  it("fails when the registry cannot be loaded", async () => {
    const report = write("r.json", strykerReport(["Killed"]))
    const registry = write("bad-registry.json", { exceptions: [{ ...RECORD, id: "mutation:x" }] })
    const result = await verdict({ registry }, runReport({ report }))
    expect(result.outcome).toBe("fail")
    expect(result.rationale.split("\n")[0]).toBe(`Mutation: ${registry} failed to load:`)
    expect(result.rationale).toContain("does not match the id derived")
  })

  it("registry false reads no registry", async () => {
    const report = write("nofile.json", strykerReport(["Killed", "Survived"]))
    const registry = write("ignored.json", "not json")
    expect((await verdict({ registry: false, minScore: 50 }, runReport({ report }))).outcome).toBe(
      "pass",
    )
    expect((await verdict({ registry, minScore: 50 }, runReport({ report }))).outcome).toBe("fail")
  })

  it("names the shard and the run's timeouts and exit code", async () => {
    const report = write("shard.json", strykerReport(["Killed"]))
    const result = await verdict(
      { registry: false },
      runReport({
        report,
        shard: "3/8",
        exitCode: 1,
        timeouts: { rerun: 2, caught: 2 },
        message: "Stryker ran shard 3/8.",
      }),
    )
    expect(result.outcome).toBe("pass")
    expect(result.rationale.split("\n")).toEqual([
      "Mutation, shard 3/8: score 100.00% of 1 scored mutants (minimum 80%): 1 detected (1 killed), 0 survived, 0 no coverage, 0 timed out.",
      "Stryker ran shard 3/8. 2 timed-out mutant(s) re-run alone: 2 caught. Stryker exited 1.",
    ])
  })

  it("reads the Stryker report as UTF-8 text, and adds no exit note for a run with no exit code", async () => {
    const report = write("adopted-killed.json", strykerReport(["Killed"]))
    const result = await verdict(
      { registry: false },
      runReport({ report, state: "adopted", exitCode: null, message: "Adopted the report." }),
    )
    expect(readFile).toHaveBeenCalledWith(report, "utf8")
    expect(result.rationale.split("\n").at(-1)).toBe("Adopted the report.")
  })

  it("judges an adopted or reused report the same way", async () => {
    const report = write("adopted.json", strykerReport(["Killed", "Timeout"]))
    for (const state of ["adopted", "reused"] as const) {
      const result = await verdict(
        { registry: false },
        runReport({ report, state, exitCode: null }),
      )
      expect(result.outcome).toBe("fail")
      expect(result.rationale).toContain("Timed out even when re-run alone (1)")
    }
  })
})
