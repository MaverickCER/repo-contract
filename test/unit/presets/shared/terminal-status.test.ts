import { describe, expect, it } from "vitest"
import { checkTerminatedAbnormally } from "../../../../src/presets/shared/terminal-status.js"
import { fakeCheckEvidence } from "../fixtures.js"

describe("checkTerminatedAbnormally", () => {
  it("returns undefined for a process that ran to its own exit (any exit code)", () => {
    expect(
      checkTerminatedAbnormally(fakeCheckEvidence({ status: "completed", exitCode: 0 }), "X"),
    ).toBeUndefined()
    expect(
      checkTerminatedAbnormally(fakeCheckEvidence({ status: "completed", exitCode: 2 }), "X"),
    ).toBeUndefined()
  })

  it("reports a timeout as a fail that names the timeout, not a tool verdict", () => {
    const result = checkTerminatedAbnormally(
      fakeCheckEvidence({ status: "timed_out", exitCode: null }),
      "TypeScript",
    )
    expect(result?.outcome).toBe("fail")
    expect(result?.rationale).toContain("TypeScript did not finish")
    expect(result?.rationale).toContain("timeout")
  })

  it("reports an aborted run distinctly from a host termination and an external signal", () => {
    expect(
      checkTerminatedAbnormally(fakeCheckEvidence({ status: "aborted" }), "T")?.rationale,
    ).toContain("the run was aborted")
    expect(
      checkTerminatedAbnormally(fakeCheckEvidence({ status: "host_terminated" }), "T")?.rationale,
    ).toContain("host process received a termination signal")
    expect(
      checkTerminatedAbnormally(fakeCheckEvidence({ status: "signaled", signal: "SIGKILL" }), "T")
        ?.rationale,
    ).toContain("SIGKILL")
  })

  it("falls back to 'unknown' when a signaled result carries no signal", () => {
    const result = checkTerminatedAbnormally(
      fakeCheckEvidence({ status: "signaled", signal: null }),
      "T",
    )
    expect(result?.outcome).toBe("fail")
    expect(result?.rationale).toContain("signal unknown")
  })

  it("reports a non-ENOENT spawn failure (e.g. EACCES) with the underlying error", () => {
    const result = checkTerminatedAbnormally(
      fakeCheckEvidence({
        status: "spawn_error",
        exitCode: null,
        spawnError: "spawn tool EACCES",
        spawnErrorCode: "EACCES",
      }),
      "tool",
    )
    expect(result?.outcome).toBe("fail")
    expect(result?.rationale).toContain("EACCES")
  })

  it("uses the default spawn-failure message when a spawn_error carries no spawnError text", () => {
    const result = checkTerminatedAbnormally(
      fakeCheckEvidence({ status: "spawn_error", exitCode: null }),
      "tool",
    )
    expect(result?.outcome).toBe("fail")
    expect(result?.rationale).toContain("the process failed to spawn")
  })

  it("appends whatever partial output the tool produced before termination", () => {
    const result = checkTerminatedAbnormally(
      fakeCheckEvidence({ status: "timed_out", stderr: "partial diagnostic" }),
      "T",
    )
    expect(result?.rationale).toContain("partial diagnostic")
  })
})
