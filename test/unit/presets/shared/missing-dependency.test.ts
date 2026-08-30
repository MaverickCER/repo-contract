import { describe, expect, it } from "vitest"
import { checkDependencyInstalled } from "../../../../src/presets/shared/missing-dependency.js"
import type { CheckEvidence } from "../../../../src/types.js"

function evidence(overrides: Partial<CheckEvidence> = {}): CheckEvidence {
  return {
    command: "sometool",
    args: [],
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:01.000Z",
    durationMs: 1000,
    exitCode: null,
    signal: null,
    stdout: "",
    stderr: "",
    status: "spawn_error",
    spawnErrorCode: "ENOENT",
    ...overrides,
  }
}

describe("checkDependencyInstalled", () => {
  it("fails with an actionable, package-manager-neutral message when the spawn failed with ENOENT", () => {
    const result = checkDependencyInstalled(evidence(), "sometool")
    expect(result).toEqual({
      outcome: "fail",
      rationale:
        "`sometool` is required by this preset but was not found. Install `sometool` as a development dependency and run the contract again.",
    })
  })

  it("names the exact package a caller passes, not the binary name, when they differ", () => {
    const result = checkDependencyInstalled(evidence(), "typescript")
    expect(result?.rationale).toContain("`typescript`")
  })

  it("returns undefined (defers to the caller) when status is spawn_error but the code is not ENOENT", () => {
    const result = checkDependencyInstalled(evidence({ spawnErrorCode: "EACCES" }), "sometool")
    expect(result).toBeUndefined()
  })

  it("returns undefined when status is spawn_error but spawnErrorCode is absent entirely", () => {
    const result = checkDependencyInstalled(evidence({ spawnErrorCode: undefined }), "sometool")
    expect(result).toBeUndefined()
  })

  it("returns undefined when the process completed normally (not a spawn error at all), even if spawnErrorCode happened to be ENOENT", () => {
    const result = checkDependencyInstalled(
      evidence({ status: "completed", exitCode: 1, spawnErrorCode: "ENOENT" }),
      "sometool",
    )
    expect(result).toBeUndefined()
  })

  it("returns undefined for every other non-spawn_error status", () => {
    for (const status of ["timed_out", "signaled", "host_terminated", "aborted"] as const) {
      const result = checkDependencyInstalled(evidence({ status, spawnErrorCode: "ENOENT" }), "x")
      expect(result, status).toBeUndefined()
    }
  })
})
