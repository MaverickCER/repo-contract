import { describe, expect, it } from "vitest"
import { buildEvidence } from "../../../src/evidence/build-evidence.js"
import { StandardSchemaValidateThrewError } from "../../../src/errors.js"
import type { CheckExecutionEntry } from "../../../src/execution/run-checks.js"
import type { CheckDefinition, CheckEvidence, PolicyResult } from "../../../src/types.js"
import { throwingSchema } from "../standard-schema/fixtures.js"

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
    stdout: '{"a":1}',
    stderr: "",
    status: "completed",
  }
}

describe("buildEvidence -- schema validate() threw aggregation", () => {
  it("aggregates every affected check's StandardSchemaValidateThrewError into one AggregateError", async () => {
    const check: CheckDefinition = {
      run: "echo",
      output: { format: "json", schema: throwingSchema(new Error("boom")) },
      policy: okPolicy,
    }
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
      expect(aggregate.errors).toHaveLength(2)
      for (const inner of aggregate.errors) {
        expect(inner).toBeInstanceOf(StandardSchemaValidateThrewError)
      }
      expect(
        aggregate.errors.map((e: StandardSchemaValidateThrewError) => e.checkId).sort(),
      ).toEqual(["a", "b"])
    }
  })

  it("propagates a single StandardSchemaValidateThrewError bare, not wrapped in a length-1 AggregateError", async () => {
    const throwing: CheckDefinition = {
      run: "echo",
      output: { format: "json", schema: throwingSchema(new Error("boom")) },
      policy: okPolicy,
    }
    const ok: CheckDefinition = { run: "echo", policy: okPolicy }
    const results: readonly CheckExecutionEntry[] = [
      ["broken", throwing, rawEvidence()],
      ["fine", ok, rawEvidence()],
    ]

    await expect(buildEvidence(results, new Date(0), new Date(1000))).rejects.toBeInstanceOf(
      StandardSchemaValidateThrewError,
    )
  })
})
