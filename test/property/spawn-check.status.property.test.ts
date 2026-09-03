import { describe, expect, it } from "vitest"
import type { ExecutionCapability } from "../../src/execution/spawn-check.js"
import { spawnCheck } from "../../src/execution/spawn-check.js"
import type { CheckDefinition, PolicyResult } from "../../src/types.js"
import { testEnv } from "../helpers/test-env.js"
import { testSpawn } from "../helpers/test-spawn.js"

/**
 * Model-based test (an explicit predictive model checked against the real system, rather than a
 * plain example-based assertion): models specs/architecture.md's documented CheckStatus priority
 * ("the run-level AbortSignal ... takes priority over ... the check's own timeoutMs") as an
 * explicit expected outcome per scenario, then verifies the real spawnCheck() -- a real
 * subprocess, real timers, real AbortController -- conforms to it.
 *
 * The scenario set is deliberately small and curated rather than freely generated: each pair's
 * delays are far enough apart (a >=200ms gap) that ordering is unambiguous on any real CI runner,
 * avoiding the flakiness a fully random race would introduce -- see
 * specs/verification-taxonomy.md's property-test resource-boundaries note. Run exhaustively via
 * `it.each`, not sampled via `fc.constantFrom` + `numRuns: SCENARIOS.length`: that combination
 * samples independently with replacement, so a given run is not guaranteed to draw every scenario
 * -- confirmed empirically, roughly 6% of runs drew zero "timed_out" scenarios, leaving the
 * timeout-wins-when-it-fires-first direction (the second and fourth scenarios below) unverified
 * for that run. `it.each` still generalizes over both possible winners (that's the model-based
 * property under test), it just guarantees every one of the four actually runs, every time.
 */

const okPolicy = (): PolicyResult => ({ outcome: "pass", rationale: "ok" })
const execution: ExecutionCapability = { spawn: testSpawn, env: testEnv, shell: false }

const SCENARIOS = [
  { abortDelayMs: 30, timeoutMs: 300, expectedStatus: "aborted" },
  { abortDelayMs: 300, timeoutMs: 30, expectedStatus: "timed_out" },
  { abortDelayMs: 40, timeoutMs: 250, expectedStatus: "aborted" },
  { abortDelayMs: 250, timeoutMs: 40, expectedStatus: "timed_out" },
] as const

describe("spawnCheck -- CheckStatus priority (model-based)", () => {
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
