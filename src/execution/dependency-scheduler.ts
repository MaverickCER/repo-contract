/**
 * Runs `worker` over `items` with at most `concurrency` invocations in
 * flight at once, like `concurrency-pool.ts`'s `runWithConcurrency`, but
 * additionally respecting a dependency graph: an item whose
 * `dependencyIndexes` are non-empty is not started until every one of
 * those indexes has settled. Has no knowledge of checks, evidence, or
 * abort semantics: a pure, reusable bounded-parallelism-plus-ordering
 * primitive, kept in its own file rather than folded into
 * `concurrency-pool.ts` so that file's simpler, more heavily-used flat
 * primitive stays untouched.
 *
 * A reactive, event-driven scheduler (conceptually Kahn's algorithm run
 * incrementally): a completing item immediately re-evaluates and unblocks
 * its own dependents, with no artificial "wave" boundary. A wave/layer
 * design was considered and rejected. It would stall a dependent whose
 * single dependency finished early behind an unrelated slow item sharing
 * its layer, a real regression for a diamond or fan-out shape.
 *
 * The caller is responsible for ensuring `dependencyIndexes` describes an
 * acyclic graph (see `validate-config.ts`'s cycle detection): this
 * function's own stall guard below exists only as defense in depth against
 * that invariant being violated, not as the primary means of catching it.
 * @param items - the items to process, each passed to `worker` and `dependencyIndexes` along with its index
 * @param concurrency - the maximum number of `worker` calls allowed in flight at once
 * @param dependencyIndexes - given an item and its index, returns the indexes into `items` that must settle first
 * @param worker - the async function run per item once its dependencies have settled; its resolved value becomes that item's result
 * @returns the results, one per item, in the same order as `items` regardless of completion order
 */
export async function runWithConcurrencyGraph<T, R>(
  items: readonly T[],
  concurrency: number,
  dependencyIndexes: (item: T, index: number) => readonly number[],
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return []

  // `dependencyIndexes` is called exactly once per item and snapshotted
  // (never invoked again below). So the graph this function schedules
  // against is fixed for the whole run, even if the callback isn't
  // perfectly deterministic or does nontrivial work. Each item's own
  // indexes are deduplicated defensively. A caller-supplied duplicate,
  // e.g. `dependsOn: ["a", "a"]`, would otherwise double-decrement its
  // dependent's `remaining` count. That is harmless by coincidence today,
  // but not a graph shape this primitive should silently rely on.
  const dependencies = items.map((item, index) =>
    // An out-of-range index (`< 0`, `>= items.length`, or non-integer) is
    // dropped here, at the single snapshot point, rather than carried into
    // `remaining` below. It can never be decremented, because nothing pushes
    // the dependent onto a `dependents[outOfRange]` bucket that doesn't exist.
    // Keeping it would leave `remaining[index]` permanently above zero
    // and stall the whole run with a bogus "not acyclic" rejection. Dropping
    // it is what "tolerates an out-of-range caller-supplied dependency
    // index" (see dependency-scheduler.test.ts) actually means.
    [...new Set(dependencyIndexes(item, index))].filter(
      (depIndex) => Number.isInteger(depIndex) && depIndex >= 0 && depIndex < items.length,
    ),
  )
  const remaining = dependencies.map((indexes) => indexes.length)
  // Each entry's own initial value is unobservable regardless of its exact
  // contents. Seeding it with garbage produced identical scheduling results
  // for diamond, fan-out, and no-dependency shapes. A stray non-index entry
  // only creates a harmless, unused `remaining[...]` property when
  // processed, never affecting `ready` or the final results.
  const dependents: number[][] = items.map(() => [])
  dependencies.forEach((indexes, index) => {
    for (const depIndex of indexes) {
      // `depIndex` is already guaranteed in-range: the snapshot above
      // filters every out-of-range caller-supplied index out before this
      // loop. The `?.` only satisfies `noUncheckedIndexedAccess` (`dependents`
      // is built with exactly `items.length` entries, one per valid index).
      // This function's other index guards do the same. See "tolerates an
      // out-of-range caller-supplied dependency index" in
      // dependency-scheduler.test.ts.
      dependents[depIndex]?.push(index)
    }
  })

  const ready: number[] = remaining.flatMap((count, index) => (count === 0 ? [index] : []))
  // `Math.max`/`Math.min` both propagate a `NaN` argument straight through to
  // their result (NaN poisons them). A caller-supplied `concurrency` of
  // `NaN` would otherwise survive `Math.max(1, concurrency)` below as `NaN`.
  // Then `active < effectiveConcurrency` is always false, and the returned
  // promise hangs forever with no worker launched and no error to explain why.
  // `validateRepoContractConfig` already rejects a non-integer/NaN
  // `concurrency` on the public API path. This guard defends the
  // primitive itself rather than relying solely on that upstream promise.
  const concurrencyIsUsable = Number.isFinite(concurrency)
  // Pre-sizing here only matters while the run is in flight (so `results[index]
  // = result` below never needs to extend the array). By the time this promise
  // resolves, `settled === items.length` guarantees every index has already
  // been assigned exactly once (see the property test "every item runs
  // exactly once ..." in dependency-scheduler.property.test.ts). That makes
  // any initially-sparse array just as dense as a pre-sized one, so the two are
  // indistinguishable in the returned result. Confirmed empirically: an
  // unexempted run showed the `ObjectLiteral` replacement (`{}`, i.e. starting
  // from a zero-length array instead) survives.
  const results: R[] = Array.from({ length: items.length })
  const effectiveConcurrency = concurrencyIsUsable ? Math.max(1, concurrency) : 1
  let active = 0
  let settled = 0
  let done = false

  return new Promise<R[]>((resolvePromise, rejectPromise) => {
    // `fail` is a hoisted function declaration, usable below before its
    // textual definition.
    // A graph where *every* item has at least one dependency (the whole
    // graph forms a cycle, not just part of it) never launches a single
    // worker. The post-settlement stall check below runs only after a
    // worker has settled. So this covers the one stall shape that check
    // cannot: a stall from the very start.
    if (ready.length === 0) {
      fail(
        new Error(
          "runWithConcurrencyGraph: stalled before starting. The dependency graph passed " +
            "in is not acyclic.",
        ),
      )
      return
    }

    /**
     *
     * @param error - the error to reject the returned promise with, propagated verbatim (unwrapped)
     */
    function fail(error: unknown): void {
      // A second call after the promise has already settled is harmless
      // even without this guard. Native Promise resolution is idempotent,
      // so a later rejectPromise call has no observable effect.
      // The guard is kept for intent, not because it changes behavior.
      if (done) return
      done = true
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- propagated verbatim, not wrapped. This matches runWithConcurrency, where a worker rejection passes straight through Promise.all unmodified. This function is its drop-in graph-aware replacement.
      rejectPromise(error)
    }

    // `launchNext` is only ever called (its initial call below and its
    // own recursive call inside `.then()`) where `done === false` is already
    // known: every call site checks `done` first. An internal guard here would
    // be equivalent, so it was removed rather than kept only to be marked
    // equivalent.
    /**
     *
     */
    function launchNext(): void {
      // Loosening `ready.length > 0` (e.g. to always-true) is behaviorally
      // invisible. The loop would enter once more with `ready` genuinely
      // empty, and `ready.shift()` would return `undefined` (a safe no-op on
      // an empty array). The next line's `index === undefined` check (itself
      // unmutatable for the same reason) then breaks out, exactly as if the
      // condition had stopped the loop one iteration earlier.
      // `ready.length > 0` also already guarantees `.shift()` returns a real
      // index. Every index this function pushes onto `ready` is valid for
      // `items`/`dependents`/`remaining` (all built with exactly
      // `items.length` entries). These guards exist only because
      // `noUncheckedIndexedAccess` can't express those invariants.
      // Exhaustive differential testing confirmed them equivalent; this is
      // not assumed.
      while (active < effectiveConcurrency && ready.length > 0) {
        const index = ready.shift()
        if (index === undefined) break
        const item = items[index]
        if (item === undefined) continue
        active += 1
        worker(item, index)
          .then((result) => {
            results[index] = result
            active -= 1
            settled += 1
            // `dependents[index]` can never actually be undefined: `dependents`
            // is built above with exactly `items.length` entries, one per valid
            // index, same invariant as `launchNext`'s own guards. Confirmed
            // empirically, not just by analogy: un-exempting this mutant and
            // running Stryker scoped to this file showed the `?? []` fallback's
            // own content (`ArrayDeclaration`) is NoCoverage; the fallback
            // branch never executes at all. The surrounding `BlockStatement`/
            // `LogicalOperator` mutants on this same line are not exempted:
            // confirmed Killed under the same run, so they stay live.
            for (const dependentIndex of dependents[index] ?? []) {
              const nextRemaining = (remaining[dependentIndex] ?? 0) - 1
              remaining[dependentIndex] = nextRemaining
              if (nextRemaining === 0) ready.push(dependentIndex)
            }
            if (done) return
            if (settled === items.length) {
              resolvePromise(results)
              return
            }
            if (active === 0 && ready.length === 0) {
              fail(
                new Error(
                  "runWithConcurrencyGraph: stalled with unsettled items remaining. The " +
                    "dependency graph passed in is not acyclic.",
                ),
              )
              return
            }
            launchNext()
          })
          .catch(fail)
      }
    }

    launchNext()
  })
}
