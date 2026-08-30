import { describe, expect, it, vi } from "vitest"
import type { CheckExecutionEntry } from "../../../src/execution/run-checks.js"
import type { CheckDefinition, CheckEvidence, PolicyResult } from "../../../src/types.js"

// File-scoped: mocks parseOutput itself (rather than a real "yaml"
// import-time failure, as in build-evidence-yaml-missing-dependency.test.ts)
// so this test can deterministically make every requested entry fail
// concurrently -- isolating buildEvidence's own aggregation logic from
// exactly which parser or failure mode triggered it.
vi.mock("../../../src/parsing/parse-output.js", () => ({
  parseOutput: vi.fn((_format: string, _stdout: string, checkId: string) =>
    Promise.reject(new Error(`boom-${checkId}`)),
  ),
}))

const okPolicy = (): PolicyResult => ({ outcome: "pass", rationale: "ok" })

function rawEvidence(): CheckEvidence {
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
  }
}

describe("buildEvidence -- output parse failure aggregation", () => {
  it("aggregates every affected check's failure into one AggregateError, instead of only the first", async () => {
    const { buildEvidence } = await import("../../../src/evidence/build-evidence.js")
    const check: CheckDefinition = { run: "echo", output: { format: "json" }, policy: okPolicy }
    const results: readonly CheckExecutionEntry[] = [
      ["a", check, rawEvidence()],
      ["b", check, rawEvidence()],
    ]

    try {
      await buildEvidence(results, new Date(0), new Date(1000))
      expect.unreachable("expected buildEvidence to reject")
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateError)
      const aggregate = error as AggregateError
      expect(aggregate.message).toBe("2 check output(s) failed to parse.")
      expect(aggregate.errors).toHaveLength(2)
      expect(aggregate.errors.map((e: Error) => e.message).sort()).toEqual(["boom-a", "boom-b"])
    }
  })
})
