/** One queued fact: the key it is known by, how far it is from the change, and what it is. */
export interface WorkItem<Value> {
  readonly key: string
  readonly hops: number
  readonly value: Value
}

/**
 * The queue the affected analysis spreads a change through. A fact is queued only if its key is
 * not already known at an equal or smaller distance from the change; that single rule is what
 * makes spreading through an import cycle stop, and what keeps the nearest explanation.
 *
 * Kept in a file of its own, and left out of mutation testing (see `stryker.config.mjs`): a
 * mutant that loosens the rule turns every cyclic import into an endless loop, which a test
 * runner can only report as a timeout. `worklist.test.ts` covers the rule directly, cycles included.
 */
export class Worklist<Value> {
  private readonly nearest = new Map<string, number>()
  private readonly queue: WorkItem<Value>[] = []

  /**
   * Queues a fact unless its key is already known at an equal or smaller distance.
   * @param key - What the fact is known by.
   * @param hops - How many module boundaries it is from the change.
   * @param value - The fact.
   * @returns Whether it was queued.
   */
  offer(key: string, hops: number, value: Value): boolean {
    const known = this.nearest.get(key)
    if (known !== undefined && known <= hops) {
      return false
    }
    this.nearest.set(key, hops)
    this.queue.push({ key, hops, value })
    return true
  }

  /** @returns The oldest queued fact, removed from the queue, or `undefined` when none is left. */
  take(): WorkItem<Value> | undefined {
    return this.queue.shift()
  }
}
