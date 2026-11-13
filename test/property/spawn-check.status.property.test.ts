import { describe, expect, it } from "vitest"
import type { ExecutionCapability } from "../../src/execution/spawn-check.js"
import { spawnCheck } from "../../src/execution/spawn-check.js"
import type { CheckDefinition, PolicyResult } from "../../src/types.js"
import { testEnv } from "../helpers/test-env.js"
import { testSpawn } from "../helpers/test-spawn.js"

/**
 * Model-based test: an explicit predictive model checked against the system, rather than a plain
 * example-based assertion. The model is specs/architecture.md's documented CheckStatus priority
 * ("the run-level AbortSignal ... takes priority over ... the check's own timeoutMs"). It gives an
 * expected outcome per scenario. The test then verifies that spawnCheck() conforms, using a
 * subprocess, timers and an AbortController.
 *
 * The scenario set is deliberately small and curated rather than freely generated. Each pair's
 * delays are at least 200ms apart, so ordering is unambiguous on any CI runner. A fully random race
 * would be flaky. See specs/verification-taxonomy.md's property-test resource-boundaries note.
 *
 * Run exhaustively via `it.each`, not sampled via `fc.constantFrom` + `numRuns: SCENARIOS.length`.
 * That combination samples independently with replacement, so a run may not draw every scenario.
 * Empirically, about 6% of runs drew zero "timed_out" scenarios. Those runs left the
 * timeout-wins-when-it-fires-first direction (the second and fourth scenarios below) unverified.
 * `it.each` still generalizes over both possible winners (the model-based property under test). It
 * guarantees all four scenarios run every time.
 */

const okPolicy = (): PolicyResult => ({ outcome: "pass", rationale: "ok" })
const execution: ExecutionCapability = { spawn: testSpawn, env: testEnv, shell: false }

const SCENARIOS = [
  { abortDelayMs: 30, timeoutMs: 300, expectedStatus: "aborted" },
  { abortDelayMs: 300, timeoutMs: 30, expectedStatus: "timed_out" },
  { abortDelayMs: 40, timeoutMs: 250, expectedStatus: "aborted" },
  { abortDelayMs: 250, timeoutMs: 40, expectedStatus: "timed_out" },
] as const

describe("spawnCheck: CheckStatus priority (model-based)", () => {
  it.each(SCENARIOS)(
    "abort always wins over timeout when it fires first, and vice versa (abortDelayMs=$abortDelayMs, timeoutMs=$timeoutMs -> $expectedStatus)",
    async (scenario) => {
      const controller = new AbortController()
      const abortTimer = setTimeout(() => {
        controller.abort()
      }, scenario.abortDelayMs)

      const check: CheckDefinition = {
        run: [process.execPath, "-e", "setTimeout(() => {}, 5000)"],
        timeoutMs: scenario.timeoutMs,
        policy: okPolicy,
      }

      try {
        const evidence = await spawnCheck("id", check, controller.signal, new Set(), execution)
        expect(evidence.status).toBe(scenario.expectedStatus)
      } finally {
        clearTimeout(abortTimer)
      }
    },
  )
})
