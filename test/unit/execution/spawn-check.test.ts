import { afterEach, describe, expect, it, vi } from "vitest"
import { InvalidCheckConfigError } from "../../../src/errors.js"
import type { ActiveCheckHandle } from "../../../src/execution/spawn-check.js"
import { spawnCheck } from "../../../src/execution/spawn-check.js"
import type { CheckDefinition, PolicyResult } from "../../../src/types.js"

const okPolicy = (): PolicyResult => ({ outcome: "pass", rationale: "ok" })

/** Polls `predicate` until it's true or `deadlineMs` elapses, then throws. Used to observe `activeHandles` mid-flight, before a still-running spawnCheck() promise has settled. */
async function waitUntil(predicate: () => boolean, deadlineMs = 5000): Promise<void> {
  const deadline = Date.now() + deadlineMs
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error("waitUntil timed out")
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

describe("spawnCheck -- command resolution", () => {
  it("array-form run is used as argv verbatim, without tokenization", async () => {
    const check: CheckDefinition = {
      run: [process.execPath, "-e", "process.stdout.write('ok')"],
      policy: okPolicy,
    }
    const evidence = await spawnCheck("id", check, undefined, new Set())
    expect(evidence.command).toBe(process.execPath)
    expect(evidence.args).toEqual(["-e", "process.stdout.write('ok')"])
    expect(evidence.stdout).toBe("ok")
  })

  it("string-form run without shell is tokenized into a multi-character command, not destructured character by character", async () => {
    const check: CheckDefinition = { run: "node --version", policy: okPolicy }
    const evidence = await spawnCheck("id", check, undefined, new Set())
    expect(evidence.command).toBe("node")
    expect(evidence.args).toEqual(["--version"])
  })

  it("rejects an empty run array with InvalidCheckConfigError", async () => {
    const check = { run: [], policy: okPolicy } as unknown as CheckDefinition
    try {
      await spawnCheck("id", check, undefined, new Set())
      expect.unreachable("expected spawnCheck to reject")
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidCheckConfigError)
      expect((error as InvalidCheckConfigError).message).toContain("run array must not be empty.")
    }
  })

  it("shell: true passes the whole run string to a real platform shell, with empty args", async () => {
    const check: CheckDefinition = {
      run: "echo shell-marker-a && echo shell-marker-b",
      shell: true,
      policy: okPolicy,
    }
    const evidence = await spawnCheck("id", check, undefined, new Set())
    expect(evidence.command).toBe("echo shell-marker-a && echo shell-marker-b")
    expect(evidence.args).toEqual([])
    expect(evidence.status).toBe("completed")
    expect(evidence.stdout).toContain("shell-marker-a")
    expect(evidence.stdout).toContain("shell-marker-b")
  })
})

describe("spawnCheck -- environment", () => {
  it("inherits process.env by default", async () => {
    process.env.SPAWN_CHECK_TEST_INHERITED = "inherited-value"
    try {
      const check: CheckDefinition = {
        run: [
          process.execPath,
          "-e",
          "process.stdout.write(process.env.SPAWN_CHECK_TEST_INHERITED ?? '<unset>')",
        ],
        policy: okPolicy,
      }
      const evidence = await spawnCheck("id", check, undefined, new Set())
      expect(evidence.stdout).toBe("inherited-value")
    } finally {
      delete process.env.SPAWN_CHECK_TEST_INHERITED
    }
  })

  it("inheritEnv: false excludes process.env, even though check.env is still applied", async () => {
    process.env.SPAWN_CHECK_TEST_INHERITED = "inherited-value"
    try {
      const check: CheckDefinition = {
        run: [
          process.execPath,
          "-e",
          "process.stdout.write(`${process.env.SPAWN_CHECK_TEST_INHERITED ?? '<unset>'}/${process.env.SPAWN_CHECK_TEST_OWN ?? '<unset>'}`)",
        ],
        inheritEnv: false,
        env: { SPAWN_CHECK_TEST_OWN: "own-value" },
        policy: okPolicy,
      }
      const evidence = await spawnCheck("id", check, undefined, new Set())
      expect(evidence.stdout).toBe("<unset>/own-value")
    } finally {
      delete process.env.SPAWN_CHECK_TEST_INHERITED
    }
  })

  it("check.env overlays and overrides an inherited value of the same name", async () => {
    process.env.SPAWN_CHECK_TEST_OVERLAY = "inherited-value"
    try {
      const check: CheckDefinition = {
        run: [
          process.execPath,
          "-e",
          "process.stdout.write(process.env.SPAWN_CHECK_TEST_OVERLAY ?? '<unset>')",
        ],
        env: { SPAWN_CHECK_TEST_OVERLAY: "overlaid-value" },
        policy: okPolicy,
      }
      const evidence = await spawnCheck("id", check, undefined, new Set())
      expect(evidence.stdout).toBe("overlaid-value")
    } finally {
      delete process.env.SPAWN_CHECK_TEST_OVERLAY
    }
  })
})

describe("spawnCheck -- already-aborted runSignal", () => {
  it("resolves immediately with well-formed, empty 'aborted' evidence, never spawning a process", async () => {
    const controller = new AbortController()
    controller.abort()
    const check: CheckDefinition = {
      run: [process.execPath, "-e", "process.stdout.write('should not run')"],
      policy: okPolicy,
    }
    const evidence = await spawnCheck("id", check, controller.signal, new Set())
    expect(evidence.status).toBe("aborted")
    expect(evidence.exitCode).toBeNull()
    expect(evidence.signal).toBeNull()
    expect(evidence.stdout).toBe("")
    expect(evidence.stderr).toBe("")
  })
})

describe("spawnCheck -- timeoutMs firing with no runSignal at all", () => {
  it("terminates the process and resolves to 'timed_out' when runSignal is undefined", async () => {
    // Regression test: every other "timed_out" coverage in this suite (spawn-check.status.property
    // test) always supplies a real, merely-not-yet-aborted AbortController as runSignal, and every
    // `runSignal: undefined` call in this file uses either no timeout or one far too long to fire
    // (30000ms) -- so this exact combination (a real, short timeoutMs firing while runSignal is
    // undefined, not merely unaborted) was never previously exercised anywhere. onEffectiveAbort's
    // `runSignal?.aborted === true` check specifically needs runSignal to be undefined, not just
    // falsy-aborted, to distinguish `?.` from a bare `.` -- and composeSignals' `[timeoutController
    // .signal]` fallback array (used only when runSignal is undefined) needs a real timeout that
    // actually fires to prove it's still wired in.
    const check: CheckDefinition = {
      run: [process.execPath, "-e", "setTimeout(() => {}, 30000)"],
      timeoutMs: 100,
      policy: okPolicy,
    }
    const evidence = await spawnCheck("id", check, undefined, new Set())
    expect(evidence.status).toBe("timed_out")
  })

  it("does not fire almost immediately for a timeoutMs above setTimeout's 32-bit limit (it is clamped)", async () => {
    // 5e9 > 2^31-1: Node's setTimeout would truncate the delay to ~1ms and
    // the check would be recorded 'timed_out' milliseconds after spawn.
    const check: CheckDefinition = {
      run: [process.execPath, "-e", "process.stdout.write('done')"],
      timeoutMs: 5_000_000_000,
      policy: okPolicy,
    }
    const evidence = await spawnCheck("id", check, undefined, new Set())
    expect(evidence.status).toBe("completed")
    expect(evidence.stdout).toBe("done")
  })
})

describe("spawnCheck -- terminalEvidence timing", () => {
  it("durationMs is the real, small, non-negative elapsed time, not the sum of two timestamps", async () => {
    const check: CheckDefinition = {
      run: [process.execPath, "-e", "process.stdout.write('x')"],
      policy: okPolicy,
    }
    const evidence = await spawnCheck("id", check, undefined, new Set())
    expect(evidence.durationMs).toBeGreaterThanOrEqual(0)
    expect(evidence.durationMs).toBeLessThan(10_000)
  })
})

describe("spawnCheck -- spawn_error evidence", () => {
  it("records spawnError and spawnErrorCode for a nonexistent command", async () => {
    const check: CheckDefinition = {
      run: ["definitely-not-a-real-binary-xyz-spawn-check"],
      policy: okPolicy,
    }
    const evidence = await spawnCheck("id", check, undefined, new Set())
    expect(evidence.status).toBe("spawn_error")
    expect(typeof evidence.spawnError).toBe("string")
    expect(evidence.spawnErrorCode).toBe("ENOENT")
  })

  it("never includes spawnError/spawnErrorCode keys at all for a normal completion", async () => {
    const check: CheckDefinition = {
      run: [process.execPath, "-e", "process.stdout.write('ok')"],
      policy: okPolicy,
    }
    const evidence = await spawnCheck("id", check, undefined, new Set())
    expect("spawnError" in evidence).toBe(false)
    expect("spawnErrorCode" in evidence).toBe(false)
  })
})

describe("spawnCheck -- stderr capture", () => {
  it("captures real stderr output, distinct from stdout", async () => {
    const check: CheckDefinition = {
      run: [process.execPath, "-e", "process.stderr.write('err-output')"],
      policy: okPolicy,
    }
    const evidence = await spawnCheck("id", check, undefined, new Set())
    expect(evidence.stderr).toBe("err-output")
    expect(evidence.stdout).toBe("")
  })
})

describe("spawnCheck -- bounded output capture", () => {
  const CAP_BYTES = 10 * 1024 * 1024
  // Comfortably larger than the cap (so truncation is unambiguous) but
  // still small/fast enough to write and assert on in a unit test; the
  // marker text appended after truncation adds a small, fixed overhead
  // beyond the cap itself, so assertions below allow generous slack rather
  // than asserting an exact byte count.
  const OVERAGE_BYTES = CAP_BYTES * 2

  it("truncates stdout that exceeds the captured-output cap instead of retaining it in full", async () => {
    const check: CheckDefinition = {
      run: [process.execPath, "-e", `process.stdout.write('a'.repeat(${String(OVERAGE_BYTES)}))`],
      policy: okPolicy,
    }
    const evidence = await spawnCheck("id", check, undefined, new Set())
    expect(evidence.stdout.length).toBeGreaterThan(CAP_BYTES)
    expect(evidence.stdout.length).toBeLessThan(CAP_BYTES + 100)
    expect(evidence.stdout).toContain("...[output truncated at")
    // The process still ran to a real, normal completion -- truncation
    // bounds only the retained text, it does not kill the child.
    expect(evidence.status).toBe("completed")
    expect(evidence.exitCode).toBe(0)
  })

  it("does not truncate output whose length lands exactly on the cap", async () => {
    const check: CheckDefinition = {
      run: [process.execPath, "-e", `process.stdout.write('a'.repeat(${String(CAP_BYTES)}))`],
      policy: okPolicy,
    }
    const evidence = await spawnCheck("id", check, undefined, new Set())
    expect(evidence.stdout).toBe("a".repeat(CAP_BYTES))
    expect(evidence.stdout).not.toContain("truncated")
  })

  it("truncates output that is exactly one byte over the cap", async () => {
    const check: CheckDefinition = {
      run: [process.execPath, "-e", `process.stdout.write('a'.repeat(${String(CAP_BYTES + 1)}))`],
      policy: okPolicy,
    }
    const evidence = await spawnCheck("id", check, undefined, new Set())
    expect(evidence.stdout).toContain("...[output truncated at")
  })

  it("truncates stderr independently of stdout", async () => {
    const check: CheckDefinition = {
      run: [
        process.execPath,
        "-e",
        `process.stderr.write('b'.repeat(${String(OVERAGE_BYTES)})); process.stdout.write('short')`,
      ],
      policy: okPolicy,
    }
    const evidence = await spawnCheck("id", check, undefined, new Set())
    expect(evidence.stderr.length).toBeGreaterThan(CAP_BYTES)
    expect(evidence.stderr.length).toBeLessThan(CAP_BYTES + 100)
    expect(evidence.stderr).toContain("...[output truncated at")
    expect(evidence.stdout).toBe("short")
  })
})

describe("spawnCheck -- activeHandles registry and manual kill", () => {
  // POSIX-only: on Windows, cross-spawn routes a bare, non-existent command
  // through `cmd.exe /c ...`, so `child.pid` is the real (transient) cmd.exe
  // pid rather than `undefined`, and the handle is registered before cmd exits
  // with a "not recognized" code. cross-spawn then synthesizes the ENOENT
  // `error` event, and cleanup() still deregisters the handle -- the check's
  // resolved evidence is identical -- but the "never assigned a pid" invariant
  // this test pins simply doesn't hold there.
  it.skipIf(process.platform === "win32")(
    "never registers a handle for a spawn that fails before ever getting a pid",
    async () => {
      const activeHandles = new Set<ActiveCheckHandle>()
      const check: CheckDefinition = {
        run: ["definitely-not-a-real-binary-xyz-spawn-check"],
        policy: okPolicy,
      }
      const promise = spawnCheck("id", check, undefined, activeHandles)

      // Checked synchronously, before any "error"/"close" event has had a
      // chance to fire: a real ENOENT spawn never assigns child.pid at all
      // (confirmed empirically), so activeHandles must still be empty right
      // here -- not just by the time cleanup() eventually runs.
      expect(activeHandles.size).toBe(0)

      await promise
      expect(activeHandles.size).toBe(0)
    },
  )

  it("registers a handle while the process is running and removes it once evidence resolves", async () => {
    const activeHandles = new Set<ActiveCheckHandle>()
    const check: CheckDefinition = {
      run: [process.execPath, "-e", "process.stdout.write('done')"],
      policy: okPolicy,
    }
    const promise = spawnCheck("id", check, undefined, activeHandles)

    await waitUntil(() => activeHandles.size === 1)

    await promise

    expect(activeHandles.size).toBe(0)
  })

  it.skipIf(process.platform === "win32")(
    "calling a registered handle's kill() actually terminates the real process, resolving with status 'host_terminated'",
    async () => {
      const activeHandles = new Set<ActiveCheckHandle>()
      const check: CheckDefinition = {
        run: [process.execPath, "-e", "setTimeout(() => {}, 30000)"],
        policy: okPolicy,
      }
      const promise = spawnCheck("id", check, undefined, activeHandles)

      await waitUntil(() => activeHandles.size === 1)
      const [handle] = activeHandles
      expect(handle).toBeDefined()

      handle?.kill("SIGTERM")

      const evidence = await promise

      // "host_terminated", not "signaled": ActiveCheckHandle.kill is repo-contract itself
      // requesting this signal (via run-checks.ts's host SIGINT/SIGTERM cleanup) -- "signaled" is
      // reserved for a signal repo-contract did NOT request. See CheckStatus's doc comment.
      expect(evidence.status).toBe("host_terminated")
      expect(evidence.exitCode).toBeNull()
      expect(evidence.signal).toBe("SIGTERM")
      expect(activeHandles.size).toBe(0)
    },
    10000,
  )

  it.skipIf(process.platform === "win32")(
    "reports 'host_terminated' (not 'aborted') when runSignal is aborted first and then handle.kill() is called -- the real host-Ctrl+C ordering",
    async () => {
      // run-checks.ts's SIGINT/SIGTERM handler aborts hostAbortController
      // (composed into runSignal) BEFORE calling handle.kill(), so the
      // abort listener fires and sets terminationReason='aborted'. The close
      // status must still come out 'host_terminated', or every Ctrl+C-killed
      // check is indistinguishable from an options.signal cancellation.
      const controller = new AbortController()
      const activeHandles = new Set<ActiveCheckHandle>()
      const check: CheckDefinition = {
        run: [process.execPath, "-e", "setTimeout(() => {}, 30000)"],
        policy: okPolicy,
      }
      const promise = spawnCheck("id", check, controller.signal, activeHandles)

      await waitUntil(() => activeHandles.size === 1)
      const [handle] = activeHandles

      controller.abort()
      handle?.kill("SIGTERM")

      const evidence = await promise
      expect(evidence.status).toBe("host_terminated")
    },
    10000,
  )

  it.skipIf(process.platform === "win32")(
    "escalates to SIGKILL if the process ignores SIGTERM, instead of hanging forever",
    async () => {
      const { existsSync, rmSync } = await import("node:fs")
      const { tmpdir } = await import("node:os")
      const path = await import("node:path")

      // Proves the child's SIGTERM handler is actually registered before
      // this test sends SIGTERM -- without this, `handle.kill("SIGTERM")`
      // can race ahead of the child's startup and hit it while the
      // default (terminating) behavior is still in effect, which would
      // make the test pass without ever exercising escalation at all.
      const readyFile = path.join(tmpdir(), `spawn-check-sigterm-ready-${String(process.pid)}`)
      rmSync(readyFile, { force: true })

      const activeHandles = new Set<ActiveCheckHandle>()
      const check: CheckDefinition = {
        run: [
          process.execPath,
          "-e",
          `require('fs').writeFileSync(${JSON.stringify(readyFile)}, ''); process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)`,
        ],
        policy: okPolicy,
      }
      const promise = spawnCheck("id", check, undefined, activeHandles)

      await waitUntil(() => existsSync(readyFile))
      rmSync(readyFile, { force: true })
      const [handle] = activeHandles
      expect(handle).toBeDefined()

      handle?.kill("SIGTERM")

      // Resolves only once the SIGKILL escalation actually lands -- a
      // SIGTERM-ignoring process would otherwise never emit "close" at all,
      // so this `await` itself is the assertion that escalation happened.
      const evidence = await promise

      expect(evidence.status).toBe("host_terminated")
      expect(evidence.signal).toBe("SIGKILL")
      expect(activeHandles.size).toBe(0)
    },
    10000,
  )

  it.skipIf(process.platform === "win32")(
    "a signal sent by something other than repo-contract itself resolves with status 'signaled', not 'host_terminated'",
    async () => {
      const { existsSync, readFileSync, rmSync } = await import("node:fs")
      const { tmpdir } = await import("node:os")
      const path = await import("node:path")

      // Distinct from the "manual kill()" test above: this signal is sent via a bare
      // process.kill(pid, ...) call, entirely bypassing ActiveCheckHandle/activeHandles --
      // simulating a genuinely external actor (another process, a human running `kill`), not
      // repo-contract's own host-SIGINT/SIGTERM cleanup. The child writes its own pid to a ready
      // file so this test can target it directly, the same readiness-signaling technique the
      // SIGKILL-escalation test above uses for the same "don't race the child's own startup"
      // reason.
      const readyFile = path.join(
        tmpdir(),
        `spawn-check-external-signal-ready-${String(process.pid)}`,
      )
      rmSync(readyFile, { force: true })

      const activeHandles = new Set<ActiveCheckHandle>()
      const check: CheckDefinition = {
        run: [
          process.execPath,
          "-e",
          `require('fs').writeFileSync(${JSON.stringify(readyFile)}, String(process.pid)); setInterval(() => {}, 1000)`,
        ],
        policy: okPolicy,
      }
      const promise = spawnCheck("id", check, undefined, activeHandles)

      await waitUntil(() => existsSync(readyFile))
      const childPid = Number(readFileSync(readyFile, "utf8"))
      rmSync(readyFile, { force: true })
      expect(Number.isInteger(childPid)).toBe(true)

      process.kill(childPid, "SIGKILL")

      const evidence = await promise

      expect(evidence.status).toBe("signaled")
      expect(evidence.signal).toBe("SIGKILL")
      expect(activeHandles.size).toBe(0)
    },
    10000,
  )
})

describe("spawnCheck -- cleanup clears the pending timeout", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("on normal completion", async () => {
    const clearTimeoutSpy = vi.spyOn(global, "clearTimeout")
    const check: CheckDefinition = {
      run: [process.execPath, "-e", "process.stdout.write('ok')"],
      timeoutMs: 30000,
      policy: okPolicy,
    }
    await spawnCheck("id", check, undefined, new Set())
    // Exactly twice, not merely "at least once": cleanup() clears both
    // `timeoutHandle` (real, since timeoutMs is set) and `escalationHandle`
    // (undefined here, since no kill was ever issued) independently. A
    // weaker "was called" assertion can't tell either individual clearTimeout
    // call apart from the other -- removing just one still leaves the other
    // satisfying "was called at least once".
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(2)
  })

  // POSIX-only: on Windows, cross-spawn's non-existent-command emulation drives
  // the child through `cmd.exe`, which produces both a real "close" event and a
  // synthesized ENOENT "error" event, so cleanup() (and with it clearTimeout)
  // runs twice. That double-cleanup is harmless -- clearTimeout no-ops on an
  // already-cleared handle and the resolved evidence is unchanged -- but the
  // exact call count this test pins is a POSIX single-event-path property.
  it.skipIf(process.platform === "win32")("on a spawn error", async () => {
    const clearTimeoutSpy = vi.spyOn(global, "clearTimeout")
    const check: CheckDefinition = {
      run: ["definitely-not-a-real-binary-xyz-spawn-check"],
      timeoutMs: 30000,
      policy: okPolicy,
    }
    await spawnCheck("id", check, undefined, new Set())
    // Same reasoning as "on normal completion" above -- see that test.
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(2)
  })
})

describe("spawnCheck -- disposes its composed abort signal", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("removes the listeners it added to runSignal once the check completes, via composeSignals's manual-fallback dispose", async () => {
    // Forces composeSignals's manual-composition fallback (see
    // src/execution/abort-signals.ts) so its dispose() has an observable
    // effect (removeEventListener) to assert on -- the native AbortSignal.any
    // path's own dispose is a documented no-op. AbortSignal.any is read and
    // deleted synchronously below, before spawnCheck's own synchronous
    // composeSignals(...) call (which happens before its first await), and
    // restored in `finally`; matches
    // test/unit/execution/abort-signals.test.ts's own
    // withoutNativeAbortSignalAny helper.
    // eslint-disable-next-line @typescript-eslint/unbound-method -- reads and later restores a reference to a static function (not a `this`-using instance method); never called detached from AbortSignal.
    const originalAny = AbortSignal.any
    const mutableAbortSignal = AbortSignal as unknown as Record<string, unknown>
    delete mutableAbortSignal.any
    try {
      const controller = new AbortController()
      const removeEventListenerSpy = vi.spyOn(controller.signal, "removeEventListener")
      const check: CheckDefinition = {
        run: [process.execPath, "-e", "process.stdout.write('ok')"],
        policy: okPolicy,
      }
      await spawnCheck("id", check, controller.signal, new Set())
      // The manual fallback's dispose removes exactly the one "abort"
      // listener composeSignals added to runSignal -- if spawn-check.ts's
      // own disposeEffectiveSignal() call were ever deleted, this listener
      // would never be removed and this assertion would fail.
      expect(removeEventListenerSpy).toHaveBeenCalledWith("abort", expect.any(Function))
    } finally {
      AbortSignal.any = originalAny
    }
  })
})
