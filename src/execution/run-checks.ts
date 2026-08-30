import { UnknownCheckIdError } from "../errors.js"
import type {
  CheckDefinition,
  CheckEvidence,
  CheckSchema,
  RunRepoContractOptions,
} from "../types.js"
import { composeSignals } from "./abort-signals.js"
import { runWithConcurrency } from "./concurrency-pool.js"
import { runWithConcurrencyGraph } from "./dependency-scheduler.js"
import type { ActiveCheckHandle } from "./spawn-check.js"
import { SIGKILL_GRACE_PERIOD_MS, spawnCheck } from "./spawn-check.js"

/**
 * One check's id, its original definition, and its raw execution evidence,
 * threaded together as a triple rather than three separately-keyed maps --
 * every later stage (parsing, policy evaluation) consumes this directly
 * instead of re-looking a check up by id, which under `noUncheckedIndexedAccess`
 * would otherwise force handling an "undefined" case that can't actually
 * happen (every checkId here comes from the same `Object.entries(checks)`
 * that produced it).
 */
export type CheckExecutionEntry = readonly [string, CheckDefinition, CheckEvidence]

const TERMINATION_SIGNALS: readonly NodeJS.Signals[] = ["SIGINT", "SIGTERM"]

// Extra headroom over SIGKILL_GRACE_PERIOD_MS itself: killWithEscalation arms its own SIGKILL
// follow-up timer with that exact delay, in the same synchronous pass as the self-terminate timer
// below -- waiting only that same delay would race Node's timer ordering rather than reliably
// outlasting it. This margin ensures every active check's scheduled SIGKILL follow-up has already
// had the chance to run and observe the process exit before this process re-signals itself.
// Exported so a unit test can pin its exact value against SIGKILL_GRACE_PERIOD_MS without needing
// to trigger the real, only-testable-in-a-child-process SIGINT handler this constant feeds (see
// installTerminationHandlers below).
export const SELF_TERMINATE_DELAY_MS = SIGKILL_GRACE_PERIOD_MS + 250

/**
 * While any check is in flight, installs a handler for SIGINT/SIGTERM that
 * kills every currently-active check's process tree before the host process
 * itself terminates -- otherwise a Ctrl+C during `runRepoContract()` would
 * leave every spawned check (and their own descendants) running as orphans.
 * After cleanup, removes its own handler and re-sends the signal to this
 * process so default termination behavior (or any other listener the host
 * application registered) still applies -- this never itself decides to
 * keep the process alive or call `process.exit()`, it only ensures cleanup
 * happens first.
 *
 * Also aborts `hostAbortController` before killing anything: `activeHandles` only ever contains
 * checks that have *already* spawned, so killing every current member does nothing to stop the
 * concurrency pool/scheduler from immediately launching the *next* queued check the instant a
 * killed one's promise settles -- by then this handler has already returned and `uninstall()` has
 * already removed these very listeners, so nothing would be left to kill that newly-spawned
 * process. Aborting `hostAbortController` first means `runChecks`' composed `runSignal` is already
 * `aborted` by the time any such check is considered, so `spawnCheck` takes its documented
 * already-aborted path (see spawn-check.ts's own doc comment) and resolves without spawning at
 * all, instead of racing this cleanup.
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
     * necessarily in a separate child process (sending SIGINT to this test
     * worker's own process would kill the test runner) -- v8 coverage is
     * per-process, so that real exercise is invisible here. Same reasoning
     * applies to Stryker's mutation testing, which only observes this
     * process's own test run. */
    // Stryker disable BlockStatement,CallExpression,ConditionalExpression,EqualityOperator,BooleanLiteral -- this handler body only executes when the host process receives a real SIGINT/SIGTERM; the test exercising it necessarily runs in a separate child process (v8 coverage and Stryker's own instrumentation are both per-process), so mutating this body -- including the hadActiveChecks/!hadActiveChecks branch below -- always reports an uncoverable-looking survivor rather than a real gap.
    const handler = (): void => {
      // Must run before killing anything currently active (see this
      // function's own doc comment): synchronous, so every check the
      // scheduler considers launching from this point forward -- including
      // one whose turn comes only after a check killed below actually exits
      // -- already observes `aborted === true`.
      hostAbortController.abort()
      // Captured before killing anything: `activeHandles` only loses entries
      // once each check's own process actually exits (asynchronously, via
      // spawn-check.ts's cleanup), so it still reads non-empty immediately
      // after calling kill() on every one of them below -- this check must
      // run first to know whether there's anything worth waiting on.
      const hadActiveChecks = activeHandles.size > 0
      for (const handle of activeHandles) handle.kill(signal)
      uninstall()
      if (!hadActiveChecks) {
        process.kill(process.pid, signal)
        return
      }
      // Previously this re-signaled (and thereby terminated, via Node's
      // default disposition once uninstall() removed this process's own
      // listener) the host process immediately after arming the kills above
      // -- starving every check's own SIGKILL-escalation timer
      // (spawn-check.ts's killWithEscalation) of the time it needs to fire,
      // orphaning any check whose command traps or ignores the initial
      // signal. Waiting SELF_TERMINATE_DELAY_MS first gives every one of
      // those timers a real chance to run before this process exits. This
      // delay is sized against `SIGKILL_GRACE_PERIOD_MS` alone -- it is
      // deliberately not tied to whether `runChecks()`'s own promise (or any
      // work a caller does with its result, e.g. persisting evidence) has
      // resolved by then: a real Ctrl+C is a request to stop now, and this
      // process is going to re-terminate itself via the signal re-sent below
      // regardless of what the caller is doing, the same as if this handler
      // did not exist at all -- the only thing this delay buys is letting
      // already-spawned child processes actually die first.
      setTimeout(() => {
        process.kill(process.pid, signal)
      }, SELF_TERMINATE_DELAY_MS)
    }
    // Stryker restore all
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
 * Resolves `requestedChecks` plus every check transitively required to satisfy their own
 * `dependsOn` -- never `isolated`, whose implied positional edges (see `dependencyIndexesFor`
 * below) are scheduling-only and must not pull unrelated checks into a partial run just because
 * one happens to sit after an isolated barrier (see `CheckDefinitionConfig.isolated`'s own doc
 * comment). No cycle guard is needed: `validateRepoContractConfig` already guarantees, before
 * `runChecks` is ever reached, that every `dependsOn` id names a check declared *earlier* than the
 * check declaring it -- a cycle is structurally impossible once every edge points backward.
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
    // Real, tested logic -- "throws when a requested subset's dependsOn forms a cycle" in
    // run-checks.test.ts proves this guard fires correctly for the one caller shape that can still
    // reach a cycle here (runChecks invoked directly, bypassing validateRepoContractConfig's own
    // backward-reference check). In a plain, uninstrumented process, disabling it and reproducing
    // the resulting unbounded recursion throws a stack-overflow RangeError in single-digit
    // milliseconds (confirmed empirically, not assumed). Mutation-tested here it is not: disabling
    // this condition turns a would-be 2-node cycle into unbounded mutual recursion between `visit`
    // calls, and Stryker's own per-statement coverage instrumentation adds enough overhead per
    // recursive frame that reaching V8's actual stack limit -- still the only thing that stops it --
    // takes long enough to exceed stryker.config.mjs's timeoutMS. A "Timeout" verdict under
    // instrumentation here reflects that mismatch between wall-clock budget and V8's stack limit,
    // not a gap in test coverage -- a known limitation of mutation testing for recursion/loop-guard
    // code generally, not specific to this function.
    // Stryker disable next-line ConditionalExpression -- disabling this in an uninstrumented process empirically produces unbounded mutual recursion that hits V8's stack limit in single-digit milliseconds, but under Stryker's own per-statement instrumentation overhead reaching that same stack limit takes long enough to exceed stryker.config.mjs's timeoutMS, surfacing as a "Timeout" verdict rather than a real test gap.
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
 * (`options.checks` omitted), every configured check id is resolved and
 * therefore appears in the result exactly once, regardless of whether it
 * ever actually spawned (see spawnCheck's documentation for the pre-aborted
 * case). When `options.checks` restricts execution to a subset, only the
 * requested ids and their transitive `dependsOn` are resolved (see
 * `resolveCheckDependencies` above) -- every other configured check id is
 * simply absent from the result, not present with some placeholder value.
 * @param checks - the full set of configured checks, keyed by id
 * @param concurrency - the maximum number of checks to run in parallel at once
 * @param options - run options; `options.checks` restricts execution to those ids (plus their dependencies), `options.signal` cancels the whole run
 * @returns each executed check's id, definition, and raw evidence, one entry per resolved check regardless of whether it actually spawned
 */
export async function runChecks(
  checks: CheckSchema,
  concurrency: number,
  options?: RunRepoContractOptions,
): Promise<readonly CheckExecutionEntry[]> {
  const entries = options?.checks
    ? resolveCheckDependencies(checks, options.checks)
    : Object.entries(checks)

  const activeHandles = new Set<ActiveCheckHandle>()
  const hostAbortController = new AbortController()
  const uninstall = installTerminationHandlers(activeHandles, hostAbortController)
  // Composed rather than passing `options?.signal` straight through: a host-process
  // SIGINT/SIGTERM must abort every not-yet-spawned check exactly like an
  // explicit `options.signal` cancellation already does, or a check queued behind the
  // concurrency limit would spawn unsupervised after installTerminationHandlers' own
  // listeners are already removed (see that function's doc comment). The `if` branch below
  // remains fully covered without further exemption: removing `options.signal` from that array
  // breaks "a global AbortSignal fired mid-run..." (run-checks.test.ts), which supplies
  // `options.signal` and asserts on its effect directly, in-process.
  const { signal: runSignal, dispose: disposeRunSignal } = composeSignals(
    options?.signal !== undefined
      ? [options.signal, hostAbortController.signal]
      : // The `else` branch's inclusion of `hostAbortController.signal` is only observably
        // meaningful once `hostAbortController.abort()` is actually called, which happens
        // exclusively inside installTerminationHandlers' real-OS-signal handler above -- and per
        // that handler's own doc comment, that handler body only executes when the host
        // *process* actually receives a real SIGINT/SIGTERM, which cannot be triggered from this
        // same in-process test worker without killing it (v8/Stryker coverage is per-process, so
        // the real exercise -- run-checks.test.ts's "does not spawn a check still queued behind
        // the concurrency limit..." test, run in a separate child process -- is invisible here
        // for the identical reason already documented on that handler).
        // Stryker disable next-line ArrayDeclaration -- see comment immediately above: only provable via a real signal delivered to a separate child process, invisible to this process's own Stryker instrumentation, the same per-process-invisible situation already documented on installTerminationHandlers' handler.
        [hostAbortController.signal],
  )

  const worker = async ([checkId, check]: readonly [
    string,
    CheckDefinition,
  ]): Promise<CheckExecutionEntry> => {
    const evidence = await spawnCheck(checkId, check, runSignal, activeHandles)
    return [checkId, check, evidence]
  }

  try {
    // A fully-disconnected graph (no check declares dependsOn or isolated --
    // the default) takes the exact same runWithConcurrency path as before
    // this feature existed, not a "generalized but behaviorally equivalent"
    // one -- zero risk to the common case. This choice of code path is
    // provably unobservable either way: dependency-scheduler.test.ts's own
    // "zero-edges equivalence" suite confirms runWithConcurrencyGraph
    // behaves identically to runWithConcurrency for a graph with no real
    // edges (order, concurrency clamping, rejection propagation, all
    // matching) -- routing every call through the graph-aware scheduler
    // regardless of hasDependencies would produce the same observable
    // results for every existing no-dependsOn/no-isolated test, making that
    // decision a pure performance optimization, not a behavioral one (an
    // isolated check alone in `entries`, with nothing else to wait on,
    // resolves to zero effective edges too -- the same proven-equivalent
    // case).
    // Stryker disable CallExpression,ArrowFunction,OptionalChaining,LogicalOperator,EqualityOperator,UnaryOperator,ConditionalExpression,BlockStatement -- dependency-scheduler.test.ts's own "zero-edges equivalence" suite already proves runWithConcurrencyGraph behaves identically to runWithConcurrency for a graph with no real edges, so this fast path is a pure performance optimization: every existing no-dependsOn/no-isolated test would pass identically either way, making this branch provably unobservable rather than undertested.
    const hasDependencies = entries.some(
      ([, check]) => (check.dependsOn?.length ?? 0) > 0 || check.isolated === true,
    )
    if (!hasDependencies) {
      return await runWithConcurrency(entries, concurrency, worker)
    }
    // Stryker restore all

    const indexById = new Map(entries.map(([checkId], index) => [checkId, index]))
    // Precomputed once per run rather than re-scanned inside
    // dependencyIndexesFor's own per-check closure below: every plain
    // (non-isolated) check needs this same list to find which isolated
    // checks it must wait for (see that edge's own comment below).
    //
    // This array's own initial contents are unobservable regardless of what they are: every real
    // isolated index is still pushed on below, and dependencyIndexesFor's own `earlierIsolated`
    // filter (further down) compares each entry against a numeric `index` with `<` -- a stray
    // non-numeric seed value fails that numeric comparison (JavaScript's `<` coerces a non-numeric
    // operand to NaN, and every comparison against NaN is false) and is silently filtered out,
    // never appearing in any real edge list. Confirmed empirically, not assumed: `["Stryker was
    // here", 2, 5].filter((i) => i < 10)` evaluates to `[2, 5]`, dropping the bogus entry with no
    // trace.
    // Stryker disable next-line ArrayDeclaration -- this array's own initial contents are unobservable regardless of what they are: every real isolated index is still pushed on below, and dependencyIndexesFor's own earlierIsolated filter compares each entry against a numeric index with `<`, which coerces a non-numeric seed value to NaN and silently filters it out (every comparison against NaN is false) -- confirmed empirically that a bogus seed entry never appears in any real edge list.
    const isolatedIndexes: number[] = []
    for (const [entryIndex, [, entryCheck]] of entries.entries()) {
      if (entryCheck.isolated === true) isolatedIndexes.push(entryIndex)
    }
    // Declaration order in `entries` doubles as the required scheduling order (see
    // CheckDefinitionConfig.isolated and CheckDefinition.dependsOn's own doc comments,
    // specs/architecture.md, and validate-config.ts's backward-reference validation, which
    // guarantees every declared `dependsOn` id resolves to an index strictly less than this
    // check's own before this function is ever reached): a check runs concurrently with whatever's
    // declared around it, launched in declaration order and bounded by `concurrency`, EXCEPT that
    // (a) an explicit `dependsOn` id must have already reached a terminal status, and (b) an
    // `isolated` check is a full barrier at its own declared position -- it waits for every check
    // declared earlier (nothing "currently in flight" when its turn comes can be anything other
    // than an earlier-declared check, since nothing later has been reached in the walk yet), and
    // every check declared *after* it waits for it in turn, so nothing overlaps it either
    // direction. Two isolated checks are therefore always sequential relative to each other (the
    // later one's "everything declared earlier" already includes the earlier one).
    const dependencyIndexesFor = (
      [, check]: readonly [string, CheckDefinition],
      index: number,
    ): number[] => {
      const declared = (check.dependsOn ?? []).map((depId) => {
        const depIndex = indexById.get(depId)
        // validate-config.ts has already guaranteed, before runChecks is
        // ever invoked, that every dependsOn id names a check that exists
        // in this same `checks` record -- reaching this would be a bug in
        // that guarantee, not a user-input problem, so it fails loudly
        // rather than silently miscounting the dependency graph. Provably
        // unreachable given that guarantee, same as this file's other
        // upstream-validated invariants.
        /* v8 ignore start */
        // Stryker disable EqualityOperator,ConditionalExpression,BlockStatement,StringLiteral,CallExpression -- validate-config.ts has already guaranteed, before runChecks is ever invoked, that every dependsOn id names a check that exists in this same checks record; reaching this would be a bug in that guarantee, not a user-input problem.
        if (depIndex === undefined) {
          throw new Error(`internal: dependsOn references unknown check id "${depId}".`)
        }
        // Stryker restore all
        /* v8 ignore stop */
        return depIndex
      })

      if (check.isolated === true) {
        // Every index declared earlier than this one -- see this function's own doc comment above.
        const earlierIndexes = Array.from({ length: index }, (_, earlierIndex) => earlierIndex)
        return [...new Set([...declared, ...earlierIndexes])]
      }

      // A plain check waits for every isolated check declared earlier than it (so it never starts
      // while that barrier is still draining or running), but not for every plain check earlier
      // than it -- those remain free to run concurrently, unchanged from the disconnected-graph
      // default.
      //
      // `<` vs `<=` here is provably equivalent, not a coverage gap: this branch only ever runs for
      // a check whose own `isolated !== true` (the `if (check.isolated === true)` branch above
      // already returned otherwise), and `isolatedIndexes` contains only indexes of checks whose
      // `isolated === true` -- so `index` (this check's own) can never itself be a member of
      // `isolatedIndexes`, making `isolatedIndex === index` unconditionally false for every value
      // this filter is ever called with. `<` and `<=` therefore select the identical subset here.
      // Stryker disable next-line EqualityOperator -- provably equivalent: this branch only runs when check.isolated !== true, and isolatedIndexes contains only indexes of checks where isolated === true, so this check's own `index` can never be a member of isolatedIndexes -- isolatedIndex === index is unconditionally false, making `<` and `<=` select the identical subset for every value this filter is ever called with.
      const earlierIsolated = isolatedIndexes.filter((isolatedIndex) => isolatedIndex < index)
      return [...new Set([...declared, ...earlierIsolated])]
    }
    return await runWithConcurrencyGraph(entries, concurrency, dependencyIndexesFor, worker)
  } finally {
    uninstall()
    disposeRunSignal()
  }
}
