import { spawnSync } from "node:child_process"

/**
 * Whether a check's process should be spawned with `detached: true`. On
 * POSIX this makes the spawned process the leader of a new process group
 * (sharing its own pid as the group id), which is what lets `killTree`
 * target the whole group rather than just the immediate child. On Windows,
 * process groups work differently and `detached: true` would instead launch
 * the process in its own console window -- not what's wanted here, since
 * Windows cleanup goes through `taskkill /t` instead (see `killTree`).
 * @returns true on POSIX (spawn as its own process group leader, killable via `killTree`); false on Windows
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
 * just the immediate process -- necessary because a check's command is
 * often itself a wrapper (`npm run test` spawns `npm`, which spawns the
 * actual test runner), and killing only the wrapper would orphan its
 * descendants. `spawn`'s own `timeout`/`signal` options only ever affect the
 * directly spawned process, never its descendants, which is why this exists
 * as a separate utility rather than relying on those.
 *
 * On POSIX, sends `signal` to the whole process group via the negative-pid
 * convention (requires the process to have been spawned with
 * `detached: true`, see `shouldSpawnDetached`). On Windows, process groups
 * don't work the same way, so this shells out to `taskkill /pid <pid> /t
 * /f` -- the same technique the `tree-kill` package uses internally -- which
 * walks the system process table for descendants of `pid` regardless of how
 * it was spawned.
 *
 * Swallows the expected best-effort-cleanup failures, but not every failure: a
 * process that has already exited (POSIX `ESRCH`, or `taskkill`'s "not found"
 * case) is a no-op, and a POSIX `EPERM` permission error is swallowed the same
 * way -- by the time cleanup runs the process may well have exited on its own,
 * and a failed cleanup should not crash the run. Any *other* failure is
 * rethrown: an unexpected POSIX errno, or (on Windows) a JS-level spawn failure
 * of `taskkill` itself (`result.error`, e.g. the tool missing from PATH), which
 * would otherwise silently leave an orphaned process tree behind.
 *
 * On Windows this always runs `taskkill` with `/f` regardless of which `signal` was requested --
 * not a partial implementation of POSIX's cooperative-SIGTERM-then-SIGKILL escalation, but a
 * reflection of a real platform difference: Windows has no signal-delivery mechanism for an
 * arbitrary process tree by pid at all (this is also why Node's own `ChildProcess.kill()` treats
 * every signal identically on Windows, per Node's own child_process documentation), so there is no
 * more-cooperative alternative to fall back to here the way there is on POSIX.
 * @param pid - the pid of the tree's root process (the process group id on POSIX, since it was spawned detached)
 * @param signal - the POSIX signal to send (on Windows, ignored -- see doc comment above)
 */
export function killTree(pid: number, signal: NodeJS.Signals): void {
  // `process.kill(-pid, ...)` signals a process *group*, and `-0` coerces to
  // `0`, which POSIX interprets as "every process in the caller's own group"
  // -- i.e. this would signal the repo-contract host itself. `taskkill /pid
  // 0` is likewise not a real target. A pid of `0` (or negative, or
  // non-integer) is never a real child here; spawn-check.ts guards its own
  // kill calls with `child.pid !== undefined`, but that admits `0`. Refuse
  // it rather than turn a best-effort cleanup call into self-harm.
  if (!Number.isInteger(pid) || pid <= 0) {
    return
  }

  /* v8 ignore start -- Windows-only; exercised for real by
   * test/unit/cross-platform/windows-taskkill.test.ts on the CI Windows runner
   * (see vitest.config.ts's coverage thresholds for the rationale -- this
   * branch cannot run on the OS any other CI job/local dev uses). Mutation
   * testing only runs in the ubuntu-only `contract` CI job (see
   * .github/workflows/ci.yml), so this branch is never covered there either
   * -- disabled for the same reason, not left to inflate "no coverage"
   * counts against a branch that genuinely is tested, just on a different
   * platform than the one that runs Stryker. */
  // Stryker disable ConditionalExpression,EqualityOperator,StringLiteral,ArrayDeclaration,ObjectLiteral,BlockStatement,CallExpression -- this whole branch only runs on Windows, and mutation testing only runs in the ubuntu-only CI job (see the v8-ignore comment above), so every mutator that could apply to it would surface as an unreachable "no coverage" survivor rather than a real test gap.
  if (process.platform === "win32") {
    // eslint-disable-next-line n/no-sync -- `killTree` is itself synchronous best-effort cleanup, callable from error/signal-handling paths that don't await anything else; an async `spawn` here would need every caller threaded through `await` for what's already a fire-and-forget `taskkill`.
    const result = spawnSync("taskkill", ["/pid", String(pid), "/t", "/f"], { stdio: "ignore" })
    // `result.error` is a JS-level spawn failure (e.g. ENOENT if `taskkill.exe` itself is
    // missing from PATH, or EPERM from a policy blocking process creation) -- distinct from
    // `result.status`, taskkill's own process-table-dependent exit code for "pid not found" vs.
    // other in-process failures, which isn't documented precisely enough to safely distinguish
    // an expected no-op from a genuine bug the same way the POSIX branch's ESRCH/EPERM check
    // does. Rethrowing only `result.error` still closes the most likely silent-orphan gap (the
    // tool being unavailable at all) without risking a false rethrow on Windows's legitimate
    // "already exited" no-op case, which this file's own test (`windows-taskkill.test.ts`, "is a
    // no-op, not a throw, for a PID taskkill cannot find") pins as a passing case.
    if (result.error !== undefined) throw result.error
    return
  }
  // Stryker restore all
  /* v8 ignore stop */

  try {
    process.kill(-pid, signal)
  } catch (error) {
    if (isErrnoException(error) && (error.code === "ESRCH" || error.code === "EPERM")) return
    throw error
  }
}
