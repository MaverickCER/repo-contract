import { notImplementedCheck } from "../not-implemented.js"
import type { CheckDefinitionConfig } from "../types.js"

/** Options accepted by {@link crap}. */
export interface CrapOptions {
  /** The source directories to score. Defaults to `"src"`. */
  readonly src?: string | readonly string[]
  /** The Istanbul `coverage-final.json` to score against. Defaults to `"coverage/coverage-final.json"`. */
  readonly coverage?: string
  /** The highest CRAP score a function may have. Defaults to `30`. */
  readonly threshold?: number
  /** The highest cyclomatic complexity a function may have, however well covered. Defaults to `20`. */
  readonly maxComplexity?: number
  /** Globs crap4ts skips. */
  readonly ignore?: readonly string[]
  /** Where crap4ts writes its JSON report. Defaults to `"reports/crap.json"`. */
  readonly report?: string
}

/**
 * No function both complex and poorly covered, via `@danibram/crap4ts`. Fails on a function above
 * the CRAP threshold or the complexity ceiling, and on an unreadable score. Reads the coverage a
 * test run wrote: declare `dependsOn` on that check.
 * @param options - configuration for this check; see {@link CrapOptions}.
 * @returns the configured check.
 * @beta
 */
export function crap(options: CrapOptions = {}): CheckDefinitionConfig {
  return notImplementedCheck("R7b", options)
}
