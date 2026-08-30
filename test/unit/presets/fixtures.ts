import type { CheckEvidence, Evidence, PolicyContext } from "../../../src/types.js"

/** Not published -- shared only by test/unit/presets/**\/*.test.ts. */
export function fakeCheckEvidence(overrides: Partial<CheckEvidence> = {}): CheckEvidence {
  return {
    command: "tool",
    args: [],
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:01.000Z",
    durationMs: 1000,
    exitCode: 0,
    signal: null,
    stdout: "",
    stderr: "",
    status: "completed",
    ...overrides,
  }
}

/** Wraps `result` into a minimal `PolicyContext` -- no preset in this package reads `evidence`/`dependencies`, only `result` (and, for `deadCode`, `result.args`). */
export function fakeContext(result: CheckEvidence): PolicyContext {
  const evidence: Evidence = {
    version: 1,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    durationMs: result.durationMs,
    checks: {},
  }

  return { result, evidence, dependencies: {} }
}

/** A `CheckEvidence` matching what `src/execution/spawn-check.ts` records when the OS can't find the executable at all (ENOENT). */
export function enoentEvidence(command: string): CheckEvidence {
  return fakeCheckEvidence({
    command,
    exitCode: null,
    status: "spawn_error",
    spawnError: `spawn ${command} ENOENT`,
    spawnErrorCode: "ENOENT",
  })
}
