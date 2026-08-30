import { describe, expect, it } from "vitest"
import { buildEvidence } from "../../../src/evidence/build-evidence.js"
import type { CheckExecutionEntry } from "../../../src/execution/run-checks.js"
import type { CheckDefinition, CheckEvidence, PolicyResult } from "../../../src/types.js"

const okPolicy = (): PolicyResult => ({ outcome: "pass", rationale: "ok" })

function rawEvidence(overrides: Partial<CheckEvidence> = {}): CheckEvidence {
  return {
    command: "echo",
    args: ["hi"],
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:01.000Z",
    durationMs: 1000,
    exitCode: 0,
    signal: null,
    stdout: "hi",
    stderr: "",
    status: "completed",
    ...overrides,
  }
}

describe("buildEvidence", () => {
  it("stamps version: 1 on the assembled Evidence", async () => {
    const { evidence } = await buildEvidence([], new Date(0), new Date(1000))
    expect(evidence.version).toBe(1)
  })

  it("computes startedAt/completedAt/durationMs for the whole run", async () => {
    const startedAt = new Date("2026-01-01T00:00:00.000Z")
    const completedAt = new Date("2026-01-01T00:00:05.000Z")
    const { evidence } = await buildEvidence([], startedAt, completedAt)

    expect(evidence.startedAt).toBe(startedAt.toISOString())
    expect(evidence.completedAt).toBe(completedAt.toISOString())
    expect(evidence.durationMs).toBe(5000)
  })

  it("assembles checks keyed by check id, with no output field for a check that requested none", async () => {
    const check: CheckDefinition = { run: "echo hi", policy: okPolicy }
    const results: readonly CheckExecutionEntry[] = [["tests", check, rawEvidence()]]

    const { evidence } = await buildEvidence(results, new Date(0), new Date(1000))

    expect(evidence.checks.tests?.stdout).toBe("hi")
    expect(evidence.checks.tests?.output).toBeUndefined()
  })

  it("attaches parsed JSON output for a check that requested it", async () => {
    const check: CheckDefinition = {
      run: "echo hi",
      output: { format: "json" },
      policy: okPolicy,
    }
    const results: readonly CheckExecutionEntry[] = [
      ["mutation", check, rawEvidence({ stdout: '{"score":92}' })],
    ]

    const { evidence } = await buildEvidence(results, new Date(0), new Date(1000))

    expect(evidence.checks.mutation?.output).toEqual({
      format: "json",
      success: true,
      value: { score: 92 },
    })
  })

  it("attaches a parse failure (not a throw) for malformed requested output, preserving raw stdout", async () => {
    const check: CheckDefinition = {
      run: "echo hi",
      output: { format: "json" },
      policy: okPolicy,
    }
    const results: readonly CheckExecutionEntry[] = [
      ["mutation", check, rawEvidence({ stdout: "not json" })],
    ]

    const { evidence } = await buildEvidence(results, new Date(0), new Date(1000))

    expect(evidence.checks.mutation?.output?.success).toBe(false)
    expect(evidence.checks.mutation?.stdout).toBe("not json")
  })

  it("still parses stdout for a spawn_error check when a format was requested (empty stdout -> a clean parse failure), and preserves spawnError", async () => {
    const check: CheckDefinition = {
      run: "definitely-not-a-real-binary",
      output: { format: "json" },
      policy: okPolicy,
    }
    const raw = rawEvidence({
      status: "spawn_error",
      exitCode: null,
      stdout: "",
      spawnError: "spawn ENOENT",
    })
    const results: readonly CheckExecutionEntry[] = [["broken", check, raw]]

    const { evidence } = await buildEvidence(results, new Date(0), new Date(1000))

    // buildEvidence parses whenever a `format` was requested -- it never
    // branches on `status`. For a spawn_error the stdout is empty, so the
    // parse is a well-formed failure (`success: false`), not a crash; the
    // pipeline still doesn't throw, and spawnError is carried through
    // untouched alongside the parsed result.
    expect(evidence.checks.broken?.spawnError).toBe("spawn ENOENT")
    expect(evidence.checks.broken?.output?.success).toBe(false)
  })

  it("assembles evidence for many checks independently", async () => {
    const results: readonly CheckExecutionEntry[] = [
      ["a", { run: "echo a", policy: okPolicy }, rawEvidence({ stdout: "a" })],
      [
        "b",
        { run: "echo b", output: { format: "text" }, policy: okPolicy },
        rawEvidence({ stdout: "b" }),
      ],
    ]

    const { evidence } = await buildEvidence(results, new Date(0), new Date(1000))

    expect(evidence.checks.a?.output).toBeUndefined()
    expect(evidence.checks.b?.output).toEqual({ format: "text", success: true, value: "b" })
  })

  it("returns entries in the same order as the input results, paired with check + evidence", async () => {
    const checkC: CheckDefinition = { run: "echo c", policy: okPolicy }
    const checkA: CheckDefinition = { run: "echo a", policy: okPolicy }
    const checkB: CheckDefinition = { run: "echo b", policy: okPolicy }
    // Deliberately not alphabetical, and each with distinguishable evidence, so
    // an accidental re-sort or key-insertion-order dependence would be caught.
    const results: readonly CheckExecutionEntry[] = [
      ["c", checkC, rawEvidence({ stdout: "c-out" })],
      ["a", checkA, rawEvidence({ stdout: "a-out" })],
      ["b", checkB, rawEvidence({ stdout: "b-out" })],
    ]

    const { entries } = await buildEvidence(results, new Date(0), new Date(1000))

    expect(entries).toHaveLength(3)
    expect(entries.map((entry) => entry[0])).toEqual(["c", "a", "b"])
    expect(entries[0]?.[1]).toBe(checkC)
    expect(entries[1]?.[1]).toBe(checkA)
    expect(entries[2]?.[1]).toBe(checkB)
    expect(entries.map((entry) => entry[2].stdout)).toEqual(["c-out", "a-out", "b-out"])
  })

  it("handles zero checks", async () => {
    const { evidence, entries } = await buildEvidence([], new Date(0), new Date(0))
    expect(evidence.checks).toEqual({})
    expect(entries).toEqual([])
  })
})
