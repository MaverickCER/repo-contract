import { afterEach, describe, expect, it, vi } from "vitest"
import type * as ProcessTreeModule from "../../../src/execution/process-tree.js"
import type { ActiveCheckHandle } from "../../../src/execution/spawn-check.js"
import { SIGKILL_GRACE_PERIOD_MS, spawnCheck } from "../../../src/execution/spawn-check.js"
import type { CheckDefinition, PolicyResult } from "../../../src/types.js"

// File-scoped: spies on killTree while preserving its real behavior
// (`vi.fn(actual.killTree)` forwards every call through), isolated here away
// from spawn-check.test.ts's otherwise fully-real-process, unmocked style.
// Needed because this file's two guards -- "a prior pending escalation is
// replaced, not stacked" and "no redundant SIGKILL follow-up when the signal
// sent was already SIGKILL" -- have no externally observable difference
// through `spawnCheck`'s returned evidence alone (a stray extra `killTree`
// call against an already-dead pid is a silent, harmless no-op); counting
// real calls is the only way to prove either guard actually does something.
vi.mock("../../../src/execution/process-tree.js", async (importOriginal) => {
  const actual = await importOriginal<typeof ProcessTreeModule>()
  return { ...actual, killTree: vi.fn(actual.killTree) }
})

const okPolicy = (): PolicyResult => ({ outcome: "pass", rationale: "ok" })

async function waitUntil(predicate: () => boolean, deadlineMs = 5000): Promise<void> {
  const deadline = Date.now() + deadlineMs
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error("waitUntil timed out")
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

const GRACE_PERIOD_MS = SIGKILL_GRACE_PERIOD_MS

describe.skipIf(process.platform === "win32")("spawnCheck -- SIGKILL escalation guards", () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it("replaces a prior pending escalation instead of stacking it", async () => {
    const { killTree } = await import("../../../src/execution/process-tree.js")
    const activeHandles = new Set<ActiveCheckHandle>()
    const check: CheckDefinition = {
      run: [process.execPath, "-e", "setTimeout(() => {}, 30000)"],
      policy: okPolicy,
    }
    const promise = spawnCheck("id", check, undefined, activeHandles)
    await waitUntil(() => activeHandles.size === 1)
    const [handle] = activeHandles
    expect(handle).toBeDefined()

    vi.useFakeTimers()
    // Two SIGTERMs back to back, each of which would schedule its own
    // SIGKILL follow-up at "now + GRACE_PERIOD_MS" if the prior one weren't
    // cancelled first -- if both survive, advancing time once fires both.
    handle?.kill("SIGTERM")
    handle?.kill("SIGTERM")
    await vi.advanceTimersByTimeAsync(GRACE_PERIOD_MS + 100)
    vi.useRealTimers()

    await promise

    const sigkillCalls = vi.mocked(killTree).mock.calls.filter(([, signal]) => signal === "SIGKILL")
    expect(sigkillCalls).toHaveLength(1)
  })

  it("does not schedule a SIGKILL follow-up when the signal sent was already SIGKILL", async () => {
    const { killTree } = await import("../../../src/execution/process-tree.js")
    const activeHandles = new Set<ActiveCheckHandle>()
    const check: CheckDefinition = {
      run: [process.execPath, "-e", "setTimeout(() => {}, 30000)"],
      policy: okPolicy,
    }
    const promise = spawnCheck("id", check, undefined, activeHandles)
    await waitUntil(() => activeHandles.size === 1)
    const [handle] = activeHandles
    expect(handle).toBeDefined()

    vi.useFakeTimers()
    handle?.kill("SIGKILL")
    await vi.advanceTimersByTimeAsync(GRACE_PERIOD_MS + 100)
    vi.useRealTimers()

    await promise

    expect(vi.mocked(killTree).mock.calls).toHaveLength(1)
  })
})
