import { notImplementedCheck } from "../not-implemented.js"
import type { CheckDefinitionConfig } from "../types.js"

/** Options accepted by {@link mutation}. */
export interface MutationOptions {
  /** The lowest mutation score that passes, in percent. `100` demands every mutant detected or recorded. Defaults to `80`. */
  readonly minScore?: number
  /** The registry of hand-verified mutants. Defaults to `".repo-contract/exceptions/mutation.json"`; `false` reads none. */
  readonly registry?: string | false
  /** Mutate one slice, written `<index>/<total>`. A sharded run cannot call a record stale. */
  readonly shard?: string
  /** Mutate only these files. An empty list passes with nothing to mutate. */
  readonly mutate?: readonly string[]
  /** Judge this Stryker report and mutate nothing, such as the merged report of a sharded run. */
  readonly report?: string
  /** Reuse a clean run while nothing it depends on has changed. Defaults to `"off"`; a CI run should keep it off. */
  readonly cache?: "read-write" | "read-only" | "off"
  /** The Stryker config file. Defaults to the first `stryker.config.*` or `stryker.conf.*` found. */
  readonly config?: string
  /** Re-run at most this many timed-out mutants alone before a timeout counts. Defaults to `5`. */
  readonly confirmTimeouts?: number
  /** Time the whole run may take, in milliseconds. */
  readonly timeoutMs?: number
}

/**
 * Mutation testing via Stryker, run through `repo-contract mutation run --json`. Fails below
 * `minScore`, on any Timeout still standing after it is re-run alone, and on an incomplete or
 * stale registry record. Killed, RuntimeError and CompileError count as detected; Ignored mutants
 * are left out of the score.
 * @param options - configuration for this check; see {@link MutationOptions}.
 * @returns the configured check.
 * @beta
 */
export function mutation(options: MutationOptions = {}): CheckDefinitionConfig {
  return { ...notImplementedCheck("R7a", options), isolated: true }
}
