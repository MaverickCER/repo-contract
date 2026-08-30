/**
 * Runs `worker` over `items` with at most `concurrency` invocations in
 * flight at once, preserving each result at its original index regardless
 * of completion order. Has no knowledge of aborting, killing, or check
 * evidence -- a pure, reusable bounded-parallelism primitive; abort-
 * awareness lives entirely in the caller's `worker` function (see
 * spawn-check.ts).
 * @param items - the items to process, each passed to `worker` along with its index
 * @param concurrency - the maximum number of `worker` calls allowed in flight at once
 * @param worker - the async function run per item; its resolved value becomes that item's result
 * @returns the results, one per item, in the same order as `items` regardless of completion order
 */
export async function runWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = []
  const entries = items.map((item, index) => [item, index] as const)
  const iterator = entries[Symbol.iterator]()

  // The first worker rejection is recorded and rethrown after every
  // still-running sibling worker has settled, rather than let `Promise.all`
  // reject eagerly while other `runNext` loops keep awaiting workers whose
  // later rejections would then have no handler -- an `unhandledRejection`
  // (fatal under Node's `--unhandled-rejections=throw`). The error itself is
  // still propagated verbatim, matching how `dependency-scheduler.ts`
  // forwards a worker rejection unwrapped.
  let firstRejection: { readonly error: unknown } | undefined

  /**
   *
   */
  async function runNext(): Promise<void> {
    for (let next = iterator.next(); !next.done; next = iterator.next()) {
      if (firstRejection !== undefined) return
      const [item, index] = next.value
      try {
        results[index] = await worker(item, index)
      } catch (error) {
        firstRejection ??= { error }
        return
      }
    }
  }

  // `Math.max`/`Math.min` both propagate a `NaN` argument straight through
  // (NaN poisons them), so a caller-supplied `concurrency` of `NaN` would
  // otherwise survive as `workerCount`, and `Array.from({ length: NaN }, ...)`
  // spec-clamps a NaN length to zero -- silently returning an empty result
  // array for every item, with no error to explain why. `validateRepoContractConfig`
  // already rejects a non-integer/NaN `concurrency` before it can reach this
  // internal, non-exported function via the public API, but this guard
  // defends the primitive itself rather than relying solely on that upstream promise.
  const effectiveConcurrency = Number.isFinite(concurrency) ? concurrency : 1
  const workerCount = Math.max(1, Math.min(effectiveConcurrency, items.length))
  await Promise.all(Array.from({ length: workerCount }, () => runNext()))
  if (firstRejection !== undefined) {
    // Propagated verbatim, exactly as Promise.all would have surfaced it and
    // as dependency-scheduler.ts forwards a worker rejection unwrapped.
    throw firstRejection.error
  }
  return results
}
