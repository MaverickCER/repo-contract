import { UnknownCheckIdError } from "../errors.js"
import { notify } from "../notify.js"
import type {
  CheckDefinition,
  CheckEvidence,
  CheckSchema,
  RunRepoContractOptions,
} from "../types.js"
import { composeSignals } from "./abort-signals.js"
import { runWithConcurrency } from "./concurrency-pool.js"
import { runWithConcurrencyGraph } from "./dependency-scheduler.js"
import type { ActiveCheckHandle, ExecutionCapability } from "./spawn-check.js"
import { SIGKILL_GRACE_PERIOD_MS, spawnCheck } from "./spawn-check.js"

/**
 * One check's id, its original definition, and its raw execution evidence,
 * threaded together as a triple rather than three separately-keyed maps.
 * Every later stage (parsing, policy evaluation) consumes this
 * instead of re-looking a check up by id. Under `noUncheckedIndexedAccess`,
 * a lookup would force handling an "undefined" case that can't
 * happen: every checkId here comes from the same `Object.entries(checks)`
 * that produced it.
 */
export type CheckExecutionEntry = readonly [string, CheckDefinition, CheckEvidence]

const TERMINATION_SIGNALS: readonly NodeJS.Signals[] = ["SIGINT", "SIGTERM"]

// Extra headroom over SIGKILL_GRACE_PERIOD_MS itself. killWithEscalation arms its SIGKILL
// follow-up timer with that exact delay, in the same synchronous pass as the self-terminate timer
// below. Waiting only that same delay would race Node's timer ordering rather than reliably
// outlasting it. With this margin, every active check's SIGKILL follow-up has had the chance to
// run and observe the process exit before this process re-signals itself.
// Exported so a unit test can pin its exact value against SIGKILL_GRACE_PERIOD_MS. That avoids
// triggering the SIGINT handler this constant feeds, which is only testable in a child
// process (see installTerminationHandlers below).
export const SELF_TERMINATE_DELAY_MS = SIGKILL_GRACE_PERIOD_MS + 250

/**
 * While any check is in flight, installs a handler for SIGINT/SIGTERM that
 * kills every currently-active check's process tree before the host process
 * itself terminates. Otherwise a Ctrl+C during `runRepoContract()` would
 * leave every spawned check (and their descendants) running as orphans.
 * After cleanup, removes its handler and re-sends the signal to this
 * process. Default termination behavior (or any other listener the host
 * application registered) then still applies. This never itself decides to
 * keep the process alive or call `process.exit()`; it only ensures cleanup
 * happens first.
 *
 * Also aborts `hostAbortController` before killing anything. `activeHandles` only ever contains
 * checks that have *already* spawned. Killing every current member does nothing to stop the
 * concurrency pool/scheduler from launching the *next* queued check the instant a killed one's
 * promise settles. By then this handler has returned and `uninstall()` has removed these very
 * listeners, so nothing would be left to kill that newly-spawned process. Aborting
 * `hostAbortController` first means `runChecks`' composed `runSignal` is already `aborted` by the
 * time any such check is considered. `spawnCheck` then takes its documented already-aborted path
 * (see spawn-check.ts's doc comment) and resolves without spawning at all, instead of racing
 * this cleanup.
 * @param activeHandles - the currently-running checks' kill handles, killed with the received signal on termination
 * @param hostAbortController - aborted before any active check is killed, so a check still queued behind the concurrency limit never spawns instead of racing this cleanup
 * @returns a function that removes the installed signal handlers without killing anything, for cleanup once no check is in flight
 */
function installTerminationHandlers(
  activeHandles: Set<ActiveCheckHandle>,
  hostAbortController: AbortController,
): () => void {
  const handlers = new Map<NodeJS.Signals, () => void>()

  for (const signal of TERMINATION_SIGNALS) {
    /* v8 ignore start -- this body only runs when the host *process* actually
     * receives a real SIGINT/SIGTERM. test/unit/execution/run-checks.test.ts's
     * "SIGINT while checks are in flight..." test exercises it for real, but
     * necessarily in a separate child process. Sending SIGINT to this test
     * worker's own process would kill the test runner. v8 coverage is
     * per-process, so that real exercise is invisible here. Same reasoning
     * applies to Stryker's mutation testing, which only observes this
     * process's own test run. */
    const handler = (): void => {
      // Must run before killing anything currently active (see this
      // function's doc comment). It is synchronous, so every check the
      // scheduler considers launching from this point forward already
      // observes `aborted === true`. That includes one whose turn comes only
      // after a check killed below exits.
      hostAbortController.abort()
      // Captured before killing anything. `activeHandles` only loses entries once each
      // check's process exits (asynchronously, via spawn-check.ts's cleanup). So it
      // still reads non-empty immediately after calling kill() on every one of them
      // below. This check must run first to know whether there's anything worth waiting
      // on.
      const hadActiveChecks = activeHandles.size > 0
      for (const handle of activeHandles) handle.kill(signal)
      uninstall()
      if (!hadActiveChecks) {
        process.kill(process.pid, signal)
        return
      }
      // Re-signaling the host right after arming the kills above would terminate
      // it at once (via Node's default disposition, since uninstall() removed
      // this process's listener). That would starve every check's
      // SIGKILL-escalation timer (spawn-check.ts's killWithEscalation) of the
      // time it needs to fire. Any check whose command traps or ignores the
      // initial signal would be orphaned. Waiting SELF_TERMINATE_DELAY_MS first
      // gives every one of those timers a chance to run before this process
      // exits.
      // This delay is sized against `SIGKILL_GRACE_PERIOD_MS` alone. It does not
      // depend on whether `runChecks()`'s promise has resolved by then, or on any
      // work a caller does with its result (e.g. persisting evidence). A Ctrl+C
      // is a request to stop now. This process re-terminates itself via the
      // signal re-sent below, whatever the caller is doing, as if this handler
      // did not exist. The delay only lets already-spawned child processes die
      // first.
      setTimeout(() => {
        process.kill(process.pid, signal)
      }, SELF_TERMINATE_DELAY_MS)
    }
    /* v8 ignore stop */
    handlers.set(signal, handler)
    process.once(signal, handler)
  }

  /**
   *
   */
  function uninstall(): void {
    for (const [signal, handler] of handlers) process.removeListener(signal, handler)
  }

  return uninstall
}

/**
 * Resolves `requestedChecks` plus every check transitively required to satisfy their
 * `dependsOn`. It never follows `isolated`: its implied positional edges (see
 * `dependencyIndexesFor` below) are scheduling-only. They must not pull unrelated checks into a
 * partial run just because one happens to sit after an isolated barrier (see
 * `CheckDefinitionConfig.isolated`'s doc comment). No cycle guard is needed.
 * `validateRepoContractConfig` runs before `runChecks` and guarantees that every `dependsOn` id
 * names a check declared *earlier* than the check declaring it. A cycle is structurally
 * impossible once every edge points backward.
 * @param checks - the full set of configured checks, keyed by id, in declaration order
 * @param requestedChecks - the check ids explicitly requested for this run
 * @returns the requested checks plus every transitive `dependsOn` dependency, in declaration order
 */
function resolveCheckDependencies(
  checks: Record<string, CheckDefinition>,
  requestedChecks: readonly string[],
): [string, CheckDefinition][] {
  const required = new Set<string>()

  const visit = (checkId: string): void => {
    // Tested logic: "throws when a requested subset's dependsOn forms a cycle" in
    // run-checks.test.ts proves this guard fires. Only one caller shape can still reach a
    // cycle here: runChecks invoked directly, bypassing validateRepoContractConfig's
    // backward-reference check. In a plain, uninstrumented process, disabling this guard
    // yields unbounded recursion. That throws a stack-overflow RangeError within
    // milliseconds. Mutation testing behaves differently here. Disabling this condition
    // turns a would-be 2-node cycle into unbounded mutual recursion between `visit`
    // calls. Stryker's per-statement coverage instrumentation adds overhead to each
    // recursive frame. Reaching V8's stack limit (still the only thing that stops it)
    // then takes longer than stryker.config.mjs's timeoutMS. A "Timeout" verdict here
    // reflects that mismatch between wall-clock budget and V8's stack limit, not a gap in
    // test coverage. Mutation testing has this limitation for recursion and loop-guard
    // code generally.
    if (required.has(checkId)) return

    const check = checks[checkId]
    if (!check) {
      throw new UnknownCheckIdError(checkId)
    }

    required.add(checkId)
    for (const dependency of check.dependsOn ?? []) {
      visit(dependency)
    }
  }

  for (const checkId of requestedChecks) visit(checkId)

  return Object.entries(checks).filter(([checkId]) => required.has(checkId))
}

/**
 * Executes every resolved check with at most `concurrency` running at once,
 * returning each check's raw evidence keyed by check id. For a full run
 * (`options.checks` omitted), every configured check id is resolved. Each
 * appears in the result exactly once, whether or not it ever spawned (see
 * spawnCheck's documentation for the pre-aborted case). When `options.checks`
 * restricts execution to a subset, only the requested ids and their transitive
 * `dependsOn` are resolved (see `resolveCheckDependencies` above). Every other
 * configured check id is absent from the result, not present with a placeholder
 * value.
 * @param checks - the full set of configured checks, keyed by id
 * @param concurrency - the maximum number of checks to run in parallel at once
 * @param execution - the run's trusted execution capabilities (`spawn`, `env`, resolved global `shell` default), forwarded to every `spawnCheck` call
 * @param options - run options; `options.checks` restricts execution to those ids (plus their dependencies), `options.signal` cancels the whole run
 * @returns each executed check's id, definition, and raw evidence, one entry per resolved check regardless of whether it spawned
 */
export async function runChecks(
  checks: CheckSchema,
  concurrency: number,
  execution: ExecutionCapability,
  options?: RunRepoContractOptions,
): Promise<readonly CheckExecutionEntry[]> {
  const entries = options?.checks
    ? resolveCheckDependencies(checks, options.checks)
    : Object.entries(checks)

  const activeHandles = new Set<ActiveCheckHandle>()
  const hostAbortController = new AbortController()
  const uninstall = installTerminationHandlers(activeHandles, hostAbortController)
  // Composed rather than passing `options?.signal` straight through. A host-process
  // SIGINT/SIGTERM must abort every not-yet-spawned check, as an explicit `options.signal`
  // cancellation does. Otherwise a check queued behind the concurrency limit would spawn
  // unsupervised after installTerminationHandlers' listeners are removed (see that function's doc
  // comment). The `if` branch below stays fully covered without further exemption. Removing
  // `options.signal` from that array breaks "a global AbortSignal fired mid-run..."
  // (run-checks.test.ts). That test supplies `options.signal` and asserts on its effect
  // in-process.
  const { signal: runSignal, dispose: disposeRunSignal } = composeSignals(
    options?.signal !== undefined
      ? [options.signal, hostAbortController.signal]
      : // The `else` branch's inclusion of `hostAbortController.signal` only matters once
        // `hostAbortController.abort()` is called. That happens only inside
        // installTerminationHandlers' OS-signal handler above. Its body
        // runs only when the host *process* receives a SIGINT/SIGTERM (see
        // that handler's doc comment). An in-process test worker cannot
        // trigger that without killing itself. The test "does not spawn a
        // check still queued behind the concurrency limit..." in
        // run-checks.test.ts exercises it in a separate child process.
        // Coverage from v8 and Stryker is per-process, so that run is
        // invisible here.
        [hostAbortController.signal],
  )

  // Set once a check that is not `expensive` has failed; read only when failFast is on.
  let cheapCheckFailed = false

  const worker = async ([checkId, check]: readonly [
    string,
    CheckDefinition,
  ]): Promise<CheckExecutionEntry> => {
    const expensive = check.expensive === true
    const skip = options?.failFast === true && expensive && cheapCheckFailed
    const evidence = await spawnCheck(checkId, check, runSignal, activeHandles, execution, skip)
    if (!expensive && (evidence.status !== "completed" || evidence.exitCode !== 0)) {
      cheapCheckFailed = true
    }
    // The hook gets its own top-level copy, so nothing it assigns reaches the evidence the run goes
    // on to use. The nested values are shared and, like the whole record, are read-only.
    notify(options?.onEvidence, checkId, { ...evidence })
    return [checkId, check, evidence]
  }

  try {
    // A fully-disconnected graph (no check declares dependsOn or
    // isolated, the default) takes the plain runWithConcurrency
    // path. That keeps the common case on the simpler, flat
    // primitive. The choice of path is unobservable either way.
    // dependency-scheduler.test.ts's "zero-edges equivalence" suite
    // shows runWithConcurrencyGraph behaves like runWithConcurrency
    // for a graph with no edges. Order, concurrency clamping and
    // rejection propagation all match. Routing every call through
    // the graph-aware scheduler would give the same results for
    // every no-dependsOn/no-isolated test. So the decision is a
    // performance optimization, not a behavioral one. An isolated
    // check alone in `entries`, with nothing else to wait on, also
    // resolves to zero effective edges: the same proven-equivalent
    // case.
    const hasDependencies = entries.some(
      ([, check]) => (check.dependsOn?.length ?? 0) > 0 || check.isolated === true,
    )
    if (!hasDependencies) {
      return await runWithConcurrency(entries, concurrency, worker)
    }

    const indexById = new Map(entries.map(([checkId], index) => [checkId, index]))
    // Precomputed once per run rather than re-scanned inside
    // `dependencyIndexesFor`'s per-check closure below. Every plain (non-isolated)
    // check needs this same list to find which isolated checks it must wait for (see
    // that edge's comment below).
    //
    // This array's initial contents are unobservable, whatever they are. Every
    // isolated index is still pushed on below. dependencyIndexesFor's
    // `earlierIsolated` filter (further down) compares each entry against a numeric
    // `index` with `<`. A stray non-numeric seed value fails that comparison and is
    // filtered out. It never appears in any edge list. JavaScript's `<` coerces a
    // non-numeric operand to NaN, and every comparison against NaN is false. For
    // example, `["Stryker was here", 2, 5].filter((i) => i < 10)` evaluates to `[2,
    // 5]`.
    const isolatedIndexes: number[] = []
    for (const [entryIndex, [, entryCheck]] of entries.entries()) {
      if (entryCheck.isolated === true) isolatedIndexes.push(entryIndex)
    }
    // Declaration order in `entries` doubles as the required scheduling order. See
    // CheckDefinitionConfig.isolated and CheckDefinition.dependsOn's doc comments, and
    // specs/architecture.md. validate-config.ts's backward-reference validation runs before this
    // function. It guarantees every declared `dependsOn` id resolves to an index strictly less
    // than this check's. A check runs concurrently with whatever's declared around it, launched
    // in declaration order and bounded by `concurrency`. There are two exceptions. First, an
    // explicit `dependsOn` id must have already reached a terminal status. Second, an `isolated`
    // check is a full barrier at its declared position. It waits for every check declared
    // earlier. When its turn comes, only earlier-declared checks can be in flight, because the
    // walk has not reached any later one yet. Every check declared *after* it waits for it in
    // turn, so nothing overlaps it in either direction. Two isolated checks are always
    // sequential (the later one's "everything declared earlier" already includes the earlier
    // one).
    const dependencyIndexesFor = (
      [, check]: readonly [string, CheckDefinition],
      index: number,
    ): number[] => {
      const declared = (check.dependsOn ?? []).map((depId) => {
        const depIndex = indexById.get(depId)
        // `validateRepoContractConfig` has already guaranteed, before runChecks is
        // ever invoked, that every dependsOn id names a check that exists
        // in this same `checks` record. Reaching this would be a bug in
        // that guarantee, not a user-input problem. So it fails loudly
        // rather than silently miscounting the dependency graph. Provably
        // unreachable given that guarantee, same as this file's other
        // upstream-validated invariants.
        /* v8 ignore start */
        if (depIndex === undefined) {
          throw new Error(`internal: dependsOn references unknown check id "${depId}".`)
        }
        /* v8 ignore stop */
        return depIndex
      })

      if (check.isolated === true) {
        // Every index declared earlier than this one: see this function's doc comment above.
        const earlierIndexes = Array.from({ length: index }, (_, earlierIndex) => earlierIndex)
        return [...new Set([...declared, ...earlierIndexes])]
      }

      // A plain check waits for every isolated check declared earlier than it, so it never starts
      // while that barrier is still draining or running. It does not wait for earlier plain
      // checks: those remain free to run concurrently, unchanged from the disconnected-graph
      // default.
      //
      // `<` vs `<=` here is provably equivalent, not a coverage gap. This branch only runs for a
      // check whose `isolated !== true` (the `if (check.isolated === true)` branch above already
      // returned otherwise). `isolatedIndexes` contains only indexes of checks whose `isolated ===
      // true`. So `index` (this check's own) can never be a member of `isolatedIndexes`.
      // `isolatedIndex === index` is false for every value this filter is ever called with. `<` and
      // `<=` select the identical subset here.
      const earlierIsolated = isolatedIndexes.filter((isolatedIndex) => isolatedIndex < index)
      return [...new Set([...declared, ...earlierIsolated])]
    }
    return await runWithConcurrencyGraph(entries, concurrency, dependencyIndexesFor, worker)
  } finally {
    uninstall()
    disposeRunSignal()
  }
}
