import { spawn, spawnSync } from "node:child_process"
import { getEventListeners } from "node:events"
import { existsSync, readFileSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { runChecks, SELF_TERMINATE_DELAY_MS } from "../../../src/execution/run-checks.js"
import { SIGKILL_GRACE_PERIOD_MS } from "../../../src/execution/spawn-check.js"
import type { CheckSchema, PolicyResult } from "../../../src/types.js"

const okPolicy = (): PolicyResult => ({ outcome: "pass", rationale: "ok" })
const here = path.dirname(fileURLToPath(import.meta.url))

// The host-process SIGINT/SIGTERM cleanup path can only be exercised by sending
// a real signal to a real child process. Windows has no POSIX signal delivery:
// `child.kill("SIGINT")` there ignores the name and abruptly terminates the
// child (TerminateProcess), so run-checks.ts's cooperative `process.once`
// handler never runs and there is nothing for these tests to observe.
const itSkipOnWindows = it.skipIf(process.platform === "win32")

/** Same technique as abort-signals.test.ts's own helper of the same name (duplicated locally rather than imported, since that one is private to its own test file): temporarily removes the native `AbortSignal.any` so a test can force `composeSignals`'s manual-composition fallback path, where `dispose()` has a real, observable effect (removing a real "abort" listener) instead of being an unconditional no-op. */
async function withoutNativeAbortSignalAny(run: () => Promise<void>): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/unbound-method -- reads and later restores a reference to a static function (not a `this`-using instance method); never called detached from AbortSignal.
  const original: typeof AbortSignal.any = AbortSignal.any
  const mutableAbortSignal = AbortSignal as unknown as Record<string, unknown>
  delete mutableAbortSignal.any
  try {
    await run()
  } finally {
    AbortSignal.any = original
  }
}

describe("runChecks", () => {
  it("returns an empty array for zero checks", async () => {
    const results = await runChecks({}, 4, undefined)
    expect(results).toEqual([])
  })

  it("runs one check", async () => {
    const checks: CheckSchema = {
      a: { run: [process.execPath, "-e", "process.stdout.write('a')"], policy: okPolicy },
    }
    const results = await runChecks(checks, 4, undefined)
    expect(results).toHaveLength(1)
    expect(results[0]?.[0]).toBe("a")
    expect(results[0]?.[2].stdout).toBe("a")
  })

  it("runs many checks and returns every configured check id exactly once", async () => {
    const checks: CheckSchema = Object.fromEntries(
      Array.from({ length: 8 }, (_, i) => [
        `check-${String(i)}`,
        { run: [process.execPath, "-e", `process.stdout.write("${String(i)}")`], policy: okPolicy },
      ]),
    )
    const results = await runChecks(checks, 4, undefined)
    expect(results.map(([checkId]) => checkId).sort()).toEqual(
      Array.from({ length: 8 }, (_, i) => `check-${String(i)}`).sort(),
    )
  })

  it("one failing check does not affect another check's own evidence", async () => {
    const checks: CheckSchema = {
      ok: { run: [process.execPath, "-e", "process.stdout.write('fine')"], policy: okPolicy },
      broken: { run: ["definitely-not-a-real-binary-xyz"], policy: okPolicy },
    }
    const results = await runChecks(checks, 4, undefined)
    const byId = Object.fromEntries(results.map(([checkId, , evidence]) => [checkId, evidence]))
    expect(byId.ok?.status).toBe("completed")
    expect(byId.ok?.stdout).toBe("fine")
    expect(byId.broken?.status).toBe("spawn_error")
  })

  it("respects the configured concurrency limit across the whole fan-out", async () => {
    let inFlight = 0
    let maxInFlight = 0
    const checks: CheckSchema = Object.fromEntries(
      Array.from({ length: 6 }, (_, i) => [
        `c${String(i)}`,
        {
          run: [process.execPath, "-e", "setTimeout(() => {}, 50)"],
          policy: (): PolicyResult => {
            inFlight += 1
            maxInFlight = Math.max(maxInFlight, inFlight)
            inFlight -= 1
            return { outcome: "pass", rationale: "ok" }
          },
        },
      ]),
    )
    // We can't observe cross-process concurrency directly from evidence, so
    // this test checks the fan-out completes correctly under a real
    // concurrency cap rather than re-measuring process-level parallelism
    // (already covered by concurrency-pool.test.ts).
    const results = await runChecks(checks, 2, undefined)
    expect(results).toHaveLength(6)
    expect(results.every(([, , evidence]) => evidence.status === "completed")).toBe(true)
  })

  it("does not start a dependent check's process until its dependency has settled -- real subprocesses, real timestamps", async () => {
    const checks: CheckSchema = {
      a: {
        run: [process.execPath, "-e", "setTimeout(() => { process.stdout.write('a') }, 150)"],
        policy: okPolicy,
      },
      b: {
        run: [process.execPath, "-e", "process.stdout.write('b')"],
        dependsOn: ["a"],
        policy: okPolicy,
      },
    }
    const results = await runChecks(checks, 4, undefined)
    const byId = Object.fromEntries(results.map(([checkId, , evidence]) => [checkId, evidence]))

    expect(byId.a?.stdout).toBe("a")
    expect(byId.b?.stdout).toBe("b")
    // b's own process must not have been spawned until a's had already
    // settled -- proven with a's/b's own real, independently-captured
    // startedAt/completedAt timestamps, not an artificial delay asserted
    // as the only signal.
    expect(new Date(byId.b!.startedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(byId.a!.completedAt).getTime(),
    )
  })

  it("a diamond dependency shape -- D starts only after both B and C have settled", async () => {
    const checks: CheckSchema = {
      a: { run: [process.execPath, "-e", "process.stdout.write('a')"], policy: okPolicy },
      b: {
        run: [process.execPath, "-e", "setTimeout(() => { process.stdout.write('b') }, 50)"],
        dependsOn: ["a"],
        policy: okPolicy,
      },
      c: {
        run: [process.execPath, "-e", "setTimeout(() => { process.stdout.write('c') }, 150)"],
        dependsOn: ["a"],
        policy: okPolicy,
      },
      d: {
        run: [process.execPath, "-e", "process.stdout.write('d')"],
        dependsOn: ["b", "c"],
        policy: okPolicy,
      },
    }
    const results = await runChecks(checks, 4, undefined)
    const byId = Object.fromEntries(results.map(([checkId, , evidence]) => [checkId, evidence]))

    const dStart = new Date(byId.d!.startedAt).getTime()
    expect(dStart).toBeGreaterThanOrEqual(new Date(byId.b!.completedAt).getTime())
    // c is deliberately the slower of the two -- proves d waited for
    // *both*, not just whichever settled first.
    expect(dStart).toBeGreaterThanOrEqual(new Date(byId.c!.completedAt).getTime())
    expect(new Date(byId.b!.startedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(byId.a!.completedAt).getTime(),
    )
    expect(new Date(byId.c!.startedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(byId.a!.completedAt).getTime(),
    )
  })

  it("still respects the concurrency cap once many dependents become ready together", async () => {
    // runChecks itself never invokes a check's policy (that's a separate,
    // later phase -- see run-policies.ts), so concurrency here can't be
    // observed via a policy callback the way it could be at the
    // run-repo-contract.ts level. The dependency-graph scheduler's own
    // concurrency enforcement is already directly proven, with real
    // in-worker tracking, by dependency-scheduler.test.ts's fan-out test;
    // this test's job is narrower: prove a fan-out of dependents (more of
    // them than the concurrency cap) still completes correctly once
    // unblocked together through the real runChecks/spawnCheck path, not a
    // synthetic worker -- matching the existing "respects the configured
    // concurrency limit" test's own approach for the no-dependency case.
    const checks: CheckSchema = {
      root: { run: [process.execPath, "-e", "process.stdout.write('root')"], policy: okPolicy },
      ...Object.fromEntries(
        Array.from({ length: 4 }, (_, i) => [
          `dep-${String(i)}`,
          {
            run: [process.execPath, "-e", "setTimeout(() => {}, 30)"],
            dependsOn: ["root"],
            policy: okPolicy,
          },
        ]),
      ),
    }
    const results = await runChecks(checks, 2, undefined)
    expect(results).toHaveLength(5)
    expect(results.every(([, , evidence]) => evidence.status === "completed")).toBe(true)
  })

  it("an isolated check does not start until every other check in the run has settled, even with no declared dependsOn", async () => {
    const checks: CheckSchema = {
      a: {
        run: [process.execPath, "-e", "setTimeout(() => { process.stdout.write('a') }, 150)"],
        policy: okPolicy,
      },
      b: {
        run: [process.execPath, "-e", "process.stdout.write('b')"],
        policy: okPolicy,
      },
      solo: {
        run: [process.execPath, "-e", "process.stdout.write('solo')"],
        isolated: true,
        policy: okPolicy,
      },
    }
    const results = await runChecks(checks, 4, undefined)
    const byId = Object.fromEntries(results.map(([checkId, , evidence]) => [checkId, evidence]))

    expect(byId.solo?.stdout).toBe("solo")
    const soloStart = new Date(byId.solo!.startedAt).getTime()
    expect(soloStart).toBeGreaterThanOrEqual(new Date(byId.a!.completedAt).getTime())
    expect(soloStart).toBeGreaterThanOrEqual(new Date(byId.b!.completedAt).getTime())
  })

  it("two non-isolated checks are unaffected by a sibling's isolated flag -- neither waits on the other", async () => {
    const checks: CheckSchema = {
      a: {
        run: [process.execPath, "-e", "setTimeout(() => { process.stdout.write('a') }, 100)"],
        policy: okPolicy,
      },
      b: {
        run: [process.execPath, "-e", "setTimeout(() => { process.stdout.write('b') }, 100)"],
        policy: okPolicy,
      },
      solo: {
        run: [process.execPath, "-e", "process.stdout.write('solo')"],
        isolated: true,
        policy: okPolicy,
      },
    }
    const results = await runChecks(checks, 4, undefined)
    const byId = Object.fromEntries(results.map(([checkId, , evidence]) => [checkId, evidence]))

    // b must have started before a completed -- proves the isolated
    // sibling's implicit "depends on everyone else" edges are one-directional
    // and never leak a reverse constraint onto the non-isolated checks
    // themselves.
    expect(new Date(byId.b!.startedAt).getTime()).toBeLessThan(
      new Date(byId.a!.completedAt).getTime(),
    )
  })

  it("two isolated checks in the same run are sequential relative to each other, and both wait for the earlier plain check", async () => {
    const checks: CheckSchema = {
      a: {
        run: [process.execPath, "-e", "setTimeout(() => { process.stdout.write('a') }, 150)"],
        policy: okPolicy,
      },
      slowSolo: {
        run: [process.execPath, "-e", "setTimeout(() => { process.stdout.write('slow') }, 150)"],
        isolated: true,
        policy: okPolicy,
      },
      fastSolo: {
        run: [process.execPath, "-e", "process.stdout.write('fast')"],
        isolated: true,
        policy: okPolicy,
      },
    }
    const results = await runChecks(checks, 4, undefined)
    const byId = Object.fromEntries(results.map(([checkId, , evidence]) => [checkId, evidence]))

    // Both isolated checks wait for the earlier-declared plain check "a".
    expect(new Date(byId.slowSolo!.startedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(byId.a!.completedAt).getTime(),
    )
    expect(new Date(byId.fastSolo!.startedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(byId.a!.completedAt).getTime(),
    )
    // fastSolo, declared after slowSolo, waits for it to fully complete before starting: an
    // isolated check is a full barrier at its own declared position, waiting for *every* check
    // declared earlier -- isolated or not (see ADR 0002). Two isolated checks are therefore always
    // sequential relative to each other now, unlike the old position-independent model where
    // neither waited for the other.
    expect(new Date(byId.fastSolo!.startedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(byId.slowSolo!.completedAt).getTime(),
    )
  })

  it("a plain check declared after an isolated one waits for it to fully complete before starting", async () => {
    const checks: CheckSchema = {
      barrier: {
        run: [process.execPath, "-e", "setTimeout(() => { process.stdout.write('barrier') }, 150)"],
        isolated: true,
        policy: okPolicy,
      },
      reader: {
        run: [process.execPath, "-e", "process.stdout.write('reader')"],
        policy: okPolicy,
      },
    }
    const results = await runChecks(checks, 4, undefined)
    const byId = Object.fromEntries(results.map(([checkId, , evidence]) => [checkId, evidence]))

    // "reader" is a plain (non-isolated) check declared *after* the isolated "barrier" -- it must
    // not start until "barrier" has fully completed, exercising dependencyIndexesFor's
    // isolatedIndexes/earlierIsolated edge for a non-isolated check (distinct from an isolated
    // check's own "everything declared earlier" edge, covered by the sequential-isolated-checks
    // test above).
    expect(new Date(byId.reader!.startedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(byId.barrier!.completedAt).getTime(),
    )
  })

  it("options.checks requesting only the isolated check does not pull in unrelated checks", async () => {
    const checks: CheckSchema = {
      solo: {
        run: [process.execPath, "-e", "process.stdout.write('solo')"],
        isolated: true,
        policy: okPolicy,
      },
      unrelated: {
        run: [process.execPath, "-e", "process.stdout.write('should not run')"],
        policy: okPolicy,
      },
    }
    const results = await runChecks(checks, 4, { checks: ["solo"] })
    expect(results.map(([checkId]) => checkId)).toEqual(["solo"])
  })

  it("a dependent blocked on an in-flight dependency when the run aborts gets well-formed aborted evidence and never spawns", async () => {
    const controller = new AbortController()
    const checks: CheckSchema = {
      a: { run: [process.execPath, "-e", "setTimeout(() => {}, 30000)"], policy: okPolicy },
      b: {
        run: [process.execPath, "-e", "process.stdout.write('should not run')"],
        dependsOn: ["a"],
        policy: okPolicy,
      },
    }
    const promise = runChecks(checks, 4, { signal: controller.signal })
    setTimeout(() => {
      controller.abort("cancelled")
    }, 100)

    const results = await promise
    const byId = Object.fromEntries(results.map(([checkId, , evidence]) => [checkId, evidence]))

    expect(byId.a?.status).toBe("aborted")
    expect(byId.b?.status).toBe("aborted")
    expect(byId.b?.exitCode).toBeNull()
    expect(byId.b?.signal).toBeNull()
    expect(byId.b?.stdout).toBe("")
  })

  it("a global AbortSignal fired mid-run gives every check well-formed evidence -- in-flight checks are aborted, and checks still queued behind the concurrency limit never spawn", async () => {
    const controller = new AbortController()
    const checks: CheckSchema = {
      // Long-running, will be in-flight when we abort.
      inFlight: {
        run: [process.execPath, "-e", "setTimeout(() => {}, 30000)"],
        policy: okPolicy,
      },
      // With concurrency: 1, this one is still queued when we abort and
      // should never spawn at all.
      queued: {
        run: [process.execPath, "-e", "process.stdout.write('should not run')"],
        policy: okPolicy,
      },
    }
    const promise = runChecks(checks, 1, { signal: controller.signal })
    setTimeout(() => {
      controller.abort("cancelled")
    }, 100)

    const results = await promise
    const byId = Object.fromEntries(results.map(([checkId, , evidence]) => [checkId, evidence]))

    expect(byId.inFlight?.status).toBe("aborted")
    expect(byId.queued?.status).toBe("aborted")
    expect(byId.queued?.exitCode).toBeNull()
    expect(byId.queued?.signal).toBeNull()
    expect(byId.queued?.stdout).toBe("")
  })

  it("disposes the composed run signal once the run completes, releasing the fallback listener it attached to a supplied options.signal", async () => {
    // Regression test for the composed runSignal's cleanup: `dispose()` is a genuine no-op on the
    // native AbortSignal.any path (per composeSignals's own doc comment), so this must force the
    // manual-composition fallback for the effect of (not) calling `dispose()` to be observable at
    // all -- otherwise this couldn't distinguish "disposeRunSignal() runs" from "it doesn't".
    await withoutNativeAbortSignalAny(async () => {
      const controller = new AbortController()
      const checks: CheckSchema = {
        a: { run: [process.execPath, "-e", "process.exit(0)"], policy: okPolicy },
      }
      await runChecks(checks, 4, { signal: controller.signal })

      // composeSignals' manual fallback attaches its own "abort" listener to every input signal,
      // including this externally-supplied one -- runChecks must remove it once the run
      // completes, or every run would leak one permanent listener onto a caller-owned,
      // potentially long-lived AbortSignal.
      expect(getEventListeners(controller.signal, "abort")).toHaveLength(0)
    })
  })

  it("installs a SIGINT/SIGTERM handler while a check is in flight and removes it once the run completes", async () => {
    const sigintBefore = process.listenerCount("SIGINT")
    const sigtermBefore = process.listenerCount("SIGTERM")

    const checks: CheckSchema = {
      a: { run: [process.execPath, "-e", "setTimeout(() => {}, 100)"], policy: okPolicy },
    }
    const promise = runChecks(checks, 4, undefined)

    // Poll briefly rather than asserting immediately -- the handler is
    // installed synchronously before the check's process spawns, but we
    // still yield at least one tick to be safe against scheduling.
    const deadline = Date.now() + 2000
    while (process.listenerCount("SIGINT") === sigintBefore && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    expect(process.listenerCount("SIGINT")).toBe(sigintBefore + 1)
    expect(process.listenerCount("SIGTERM")).toBe(sigtermBefore + 1)

    await promise

    expect(process.listenerCount("SIGINT")).toBe(sigintBefore)
    expect(process.listenerCount("SIGTERM")).toBe(sigtermBefore)
  })

  it("selecting a subset via options.checks pulls in only that check's own transitive dependencies, not unrelated checks", async () => {
    const checks: CheckSchema = {
      a: { run: [process.execPath, "-e", "process.stdout.write('a')"], policy: okPolicy },
      b: {
        run: [process.execPath, "-e", "process.stdout.write('b')"],
        dependsOn: ["a"],
        policy: okPolicy,
      },
      unrelated: {
        run: [process.execPath, "-e", "process.stdout.write('should not run')"],
        policy: okPolicy,
      },
    }
    const results = await runChecks(checks, 4, { checks: ["b"] })
    expect(results.map(([checkId]) => checkId).sort()).toEqual(["a", "b"])
  })

  it("a dependency shared by more than one requested check is still only resolved (and run) once", async () => {
    const checks: CheckSchema = {
      shared: {
        run: [process.execPath, "-e", "process.stdout.write('shared')"],
        policy: okPolicy,
      },
      b: { run: [process.execPath, "-e", ""], dependsOn: ["shared"], policy: okPolicy },
      c: { run: [process.execPath, "-e", ""], dependsOn: ["shared"], policy: okPolicy },
    }
    const results = await runChecks(checks, 4, { checks: ["b", "c"] })
    expect(results.map(([checkId]) => checkId).sort()).toEqual(["b", "c", "shared"])
  })

  it("throws for a requested check id that does not exist in the configured checks", async () => {
    const checks: CheckSchema = {
      a: { run: [process.execPath, "-e", ""], policy: okPolicy },
    }
    await expect(runChecks(checks, 4, { checks: ["nonexistent"] })).rejects.toThrow(
      /options\.checks names "nonexistent"/,
    )
  })

  it("throws when a requested subset's dependsOn forms a cycle, for a caller that bypasses validateRepoContractConfig", async () => {
    // runChecks is called directly here, skipping the validateRepoContractConfig pass that
    // normally rejects a forward-referencing (and therefore, structurally, any cyclic) dependsOn
    // before this point -- exercising what happens for a caller (e.g. a future internal refactor,
    // or a test) that reaches runChecks without going through runRepoContract first.
    // resolveCheckDependencies itself no longer guards against a cycle (it's provably unreachable
    // via the normal path, see its own doc comment) -- the underlying graph scheduler's own stall
    // detection is what actually catches it here.
    const checks: CheckSchema = {
      a: { run: [process.execPath, "-e", ""], dependsOn: ["b"], policy: okPolicy },
      b: { run: [process.execPath, "-e", ""], dependsOn: ["a"], policy: okPolicy },
    }
    await expect(runChecks(checks, 4, { checks: ["a"] })).rejects.toThrow(
      /stalled before starting -- the dependency graph passed in is not acyclic/,
    )
  })

  itSkipOnWindows(
    "SIGINT while checks are in flight kills every spawned process tree before the host process exits",
    async () => {
      // Runs run-checks.ts inside a real child Node process (via tsx, so the
      // fixture can import the TypeScript source directly with no build step
      // required), sends that child process a real SIGINT, and asserts the
      // grandchild check process it spawned is also gone -- this is the only
      // way to actually exercise "the *host* process receiving SIGINT" since
      // vitest's own process is the host for every other test here.
      const fixture = path.join(here, "fixtures", "sigint-cleanup.ts")
      const tsxBin = path.join(here, "..", "..", "..", "node_modules", ".bin", "tsx")
      const pidFilePath = path.join(
        os.tmpdir(),
        `repo-contract-sigint-test-${String(process.pid)}-${String(Date.now())}.pid`,
      )
      const child = spawn(tsxBin, [fixture, pidFilePath], { stdio: ["ignore", "pipe", "pipe"] })

      try {
        const grandchildPid = await new Promise<number>((resolve, reject) => {
          const deadline = Date.now() + 10000
          const poll = (): void => {
            if (existsSync(pidFilePath)) {
              resolve(Number(readFileSync(pidFilePath, "utf8")))
              return
            }
            if (Date.now() > deadline) {
              reject(new Error("timed out waiting for the fixture's pid file"))
              return
            }
            setTimeout(poll, 50)
          }
          poll()
        })
        expect(Number.isInteger(grandchildPid)).toBe(true)

        child.kill("SIGINT")

        const exitCode = await new Promise<number | null>((resolve) => {
          child.once("exit", (code) => {
            resolve(code)
          })
        })

        // Cheap probe: does *any* process hold this pid right now.
        const pidResolves = (pid: number): boolean => {
          try {
            process.kill(pid, 0)
            return true
          } catch {
            return false
          }
        }
        // `pidResolves` alone is not enough for the final assertion: under the heavy concurrent
        // load this suite runs at on CI (macOS runners especially) a pid is recycled within
        // seconds, so once the fixture's grandchild is gone its pid can already belong to an
        // unrelated process. Only a *genuine* surviving grandchild -- whose argv still carries the
        // unique per-run `pidFilePath` -- is a killTree failure. `ps -ww` (no command-column
        // truncation, honoured by both BSD/macOS and GNU ps) is POSIX; this test skips on Windows.
        const ourGrandchildIsAlive = (pid: number): boolean => {
          if (!pidResolves(pid)) return false
          const probe = spawnSync("ps", ["-ww", "-p", String(pid), "-o", "args="], {
            encoding: "utf8",
          })
          return probe.status === 0 && probe.stdout.includes(pidFilePath)
        }
        // A generous deadline: under heavy concurrent load (e.g. this whole suite running alongside
        // Stryker's own worker processes as part of the self-hosting `npm run contract`), the
        // host fixture's own SIGKILL-escalation timer (spawn-check.ts's killWithEscalation) may not
        // get scheduled promptly -- that's real contention, not a logic bug in killTree, so the fix
        // is patience here, not a tighter deadline.
        const deadline = Date.now() + 15000
        while (pidResolves(grandchildPid) && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 50))
        }

        expect(ourGrandchildIsAlive(grandchildPid)).toBe(false)
        expect(exitCode).not.toBe(0)
      } finally {
        rmSync(pidFilePath, { force: true })
      }
    },
    30000,
  )

  itSkipOnWindows(
    "does not spawn a check still queued behind the concurrency limit once SIGINT cleanup has begun",
    async () => {
      // Regression test: installTerminationHandlers' handler used to kill only the checks already
      // active at the instant the signal arrived, then immediately remove its own listeners --
      // leaving nothing to supervise a check that the concurrency pool/scheduler launched
      // *afterward*, once the killed check's slot freed. With concurrency: 1 and two checks
      // declared, `second` can only ever be considered once `first`'s slot frees -- exactly the
      // window this test exercises.
      const fixture = path.join(here, "fixtures", "sigint-cleanup-queued.ts")
      const tsxBin = path.join(here, "..", "..", "..", "node_modules", ".bin", "tsx")
      const runId = `${String(process.pid)}-${String(Date.now())}`
      const pidFilePath = path.join(os.tmpdir(), `repo-contract-sigint-queued-pid-${runId}`)
      const queuedMarkerPath = path.join(os.tmpdir(), `repo-contract-sigint-queued-marker-${runId}`)
      const child = spawn(tsxBin, [fixture, pidFilePath, queuedMarkerPath], {
        stdio: ["ignore", "pipe", "pipe"],
      })

      try {
        const firstPid = await new Promise<number>((resolve, reject) => {
          const deadline = Date.now() + 10000
          const poll = (): void => {
            if (existsSync(pidFilePath)) {
              resolve(Number(readFileSync(pidFilePath, "utf8")))
              return
            }
            if (Date.now() > deadline) {
              reject(new Error("timed out waiting for the fixture's pid file"))
              return
            }
            setTimeout(poll, 50)
          }
          poll()
        })
        expect(Number.isInteger(firstPid)).toBe(true)

        child.kill("SIGINT")

        await new Promise<number | null>((resolve) => {
          child.once("exit", (code) => {
            resolve(code)
          })
        })

        // The host process has now fully exited (including its own
        // SELF_TERMINATE_DELAY_MS wait) -- `second` had every opportunity to spawn and write its
        // marker file if the queued-check bug were still present.
        expect(existsSync(queuedMarkerPath)).toBe(false)
      } finally {
        rmSync(pidFilePath, { force: true })
        rmSync(queuedMarkerPath, { force: true })
      }
    },
    30000,
  )
})

describe("SELF_TERMINATE_DELAY_MS", () => {
  it("is SIGKILL_GRACE_PERIOD_MS plus a 250ms margin, not equal to or less than it", () => {
    // Pins the actual numeric relationship the SIGINT/SIGTERM handler's
    // self-terminate timer depends on (installTerminationHandlers, above --
    // real values, not a re-derivation of the same expression, so a
    // regression that shrinks or removes the margin (e.g. `- 250` instead of
    // `+ 250`) fails this assertion. The handler body itself is only
    // testable end-to-end via a real signal sent to a child process (see the
    // "SIGINT while checks are in flight" test above), which can't
    // distinguish this constant's exact value from a nearby one -- this test
    // covers the value directly instead.
    expect(SELF_TERMINATE_DELAY_MS).toBe(2250)
    expect(SIGKILL_GRACE_PERIOD_MS).toBe(2000)
    expect(SELF_TERMINATE_DELAY_MS).toBeGreaterThan(SIGKILL_GRACE_PERIOD_MS)
  })
})
