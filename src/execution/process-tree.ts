import type { SyncSpawner } from "../types.js"

/**
 * Whether a check's process should be spawned with `detached: true`. On
 * POSIX this makes the spawned process the leader of a new process group,
 * with its pid as the group id. That lets `killTree` target the whole group,
 * not only the immediate child.
 *
 * On Windows, `detached: true` would launch the process in a separate console
 * window instead. Windows cleanup goes through `taskkill /t` (see `killTree`),
 * so it needs no process group.
 * @returns true on POSIX (spawn as its process group leader, killable via `killTree`); false on Windows
 */
export function shouldSpawnDetached(): boolean {
  return process.platform !== "win32"
}

/**
 *
 * @param error - the caught value to narrow
 * @returns true if `error` is an `Error` carrying a `code` property, as Node's errno exceptions do
 */
function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}

/**
 * Best-effort termination of an entire process tree rooted at `pid`, not
 * just the immediate process. A check's command is often itself a wrapper
 * (`npm run test` spawns `npm`, which spawns the test runner). Killing only
 * the wrapper would orphan its descendants. `spawn`'s `timeout`/`signal`
 * options only affect the directly spawned process, never its descendants.
 * That is why this is a separate utility.
 *
 * On POSIX, it sends `signal` to the whole process group via the
 * negative-pid convention. That needs no process spawn, only one
 * `process.kill` syscall. It requires the process to have been spawned with
 * `detached: true` (see `shouldSpawnDetached`). On Windows, process groups
 * don't work the same way, so this shells out to `taskkill /pid <pid> /t
 * /f`. The `tree-kill` package uses the same technique: it walks the system
 * process table for descendants of `pid`, however it was spawned. That
 * requires a synchronous spawn. Like every other process-spawning
 * capability in this package, the caller supplies it (`killProcessTree`,
 * threaded from `RepoContractConfig.killProcessTree`). It is never imported
 * internally (see
 * specs/decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md).
 * When `killProcessTree` is omitted on Windows, this function is a
 * documented no-op. The caller (`spawn-check.ts`) then terminates only the
 * tracked child process handle, which needs no spawn.
 *
 * Swallows the expected best-effort-cleanup failures, but not every failure.
 * A process that has already exited (POSIX `ESRCH`, or `taskkill`'s "not
 * found" case) is a no-op. A POSIX `EPERM` permission error is swallowed
 * the same way. By the time cleanup runs, the process may have exited by
 * itself, and a failed cleanup should not crash the run. Any *other* failure
 * is rethrown. That covers an unexpected POSIX errno, or a Windows spawn
 * failure of `taskkill` itself (`result.error`, e.g. the tool missing from
 * PATH). Swallowing those would silently leave an orphaned process tree behind.
 *
 * On Windows this always runs `taskkill` with `/f`, whatever `signal` was requested.
 * That is not a partial implementation of POSIX's cooperative-SIGTERM-then-SIGKILL escalation.
 * Windows has no signal delivery for an arbitrary process tree by pid. Node's
 * `ChildProcess.kill()` treats every signal identically on Windows for the same reason (per
 * Node's child_process documentation). There is no more-cooperative alternative to fall back to,
 * as there is on POSIX.
 * @param pid - the pid of the tree's root process (the process group id on POSIX, since it was spawned detached)
 * @param signal - the POSIX signal to send (on Windows, ignored: see doc comment above)
 * @param killProcessTree - the consumer-supplied synchronous spawner used only on Windows; a no-op there when omitted (see doc comment above)
 */
export function killTree(pid: number, signal: NodeJS.Signals, killProcessTree?: SyncSpawner): void {
  // `process.kill(-pid, ...)` signals a process *group*. `-0` coerces to
  // `0`, which POSIX interprets as "every process in the caller's group".
  // That would signal the repo-contract host itself. `taskkill /pid 0` is
  // likewise not a valid target. A pid of `0` (or negative, or non-integer)
  // is never a child here. spawn-check.ts guards its kill calls with
  // `child.pid !== undefined`, but that admits `0`. Refuse it rather than
  // turn a best-effort cleanup call into self-harm.
  if (!Number.isInteger(pid) || pid <= 0) {
    return
  }

  /* v8 ignore start -- Windows-only; exercised for real by
   * test/unit/cross-platform/windows-taskkill.test.ts on the CI Windows runner
   * (see vitest.config.ts's coverage thresholds for the rationale: this
   * branch cannot run on the OS any other CI job/local dev uses). Mutation
   * testing only runs in the ubuntu-only `contract` CI job (see
   * .github/workflows/ci.yml), so this branch is never covered there either.
   * It is disabled for the same reason. That keeps it from inflating "no
   * coverage" counts against a branch that is tested, on a different
   * platform than the one that runs Stryker. */
  if (process.platform === "win32") {
    // No consumer-supplied synchronous spawner: taskkill can't run at all, so whole-tree cleanup
    // is skipped here. The caller in spawn-check.ts falls back to killing only the tracked child
    // process handle (no spawn needed for that). A check is still terminated even
    // though its descendants may survive. See killProcessTree's doc comment.
    if (killProcessTree === undefined) return
    const result = killProcessTree("taskkill", ["/pid", String(pid), "/t", "/f"], {
      stdio: "ignore",
    })
    // `result.error` is a JS-level spawn failure (e.g. ENOENT if `taskkill.exe` is missing from
    // PATH, or EPERM from a policy blocking process creation). It is distinct from
    // `result.status`, taskkill's exit code for "pid not found" vs. other failures. That exit code
    // is not documented precisely enough to tell an expected no-op from a bug, as the POSIX
    // branch's ESRCH/EPERM check does. Rethrowing only `result.error` still closes the most likely
    // silent-orphan gap: the tool being unavailable. It avoids a false rethrow on Windows's
    // "already exited" no-op case. `windows-taskkill.test.ts` ("is a no-op, not a throw, for a
    // PID taskkill cannot find") pins that case as passing.
    if (result.error !== undefined) throw result.error
    return
  }
  /* v8 ignore stop */

  try {
    process.kill(-pid, signal)
  } catch (error) {
    if (isErrnoException(error) && (error.code === "ESRCH" || error.code === "EPERM")) return
    throw error
  }
}
