import { describe, expect, it, vi } from "vitest"
import { ParserDependencyMissingError } from "../../../src/errors.js"
import type { CheckExecutionEntry } from "../../../src/execution/run-checks.js"
import type { CheckDefinition, CheckEvidence, PolicyResult } from "../../../src/types.js"

// File-scoped, same justification and isolation reasoning as
// test/unit/parsing/parse-yaml-missing-dependency.test.ts: simulating the
// "yaml" optional peer dependency being unavailable requires mocking module
// resolution itself, which isn't practical to do by actually uninstalling a
// devDependency mid-test-run.
vi.mock("yaml", () => {
  throw new Error("Cannot find module 'yaml'")
})

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
    stdout: "a: 1",
    stderr: "",
    status: "completed",
    ...overrides,
  }
}

describe("buildEvidence -- yaml peer dependency unavailable", () => {
  it("rejects with the ParserDependencyMissingError itself for a single affected check, not wrapped", async () => {
    const { buildEvidence } = await import("../../../src/evidence/build-evidence.js")
    const check: CheckDefinition = { run: "echo", output: { format: "yaml" }, policy: okPolicy }
    const results: readonly CheckExecutionEntry[] = [["mutation", check, rawEvidence()]]

    await expect(buildEvidence(results, new Date(0), new Date(1000))).rejects.toBeInstanceOf(
      ParserDependencyMissingError,
    )
  })
})
