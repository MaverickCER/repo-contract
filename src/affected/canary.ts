/** What the canary compares: the affected-scope answer against a full run's failures. */
export interface CanaryInput {
  /** The tests the affected analysis said to run. */
  readonly affectedTests: readonly string[]
  /** Every test the full run executed. */
  readonly allTests: readonly string[]
  /** The tests that failed in the full run. */
  readonly failedInFullRun: readonly string[]
}

/** The canary's finding. */
export interface CanaryResult {
  /** True when the affected scope would have caught every failure the full run found. */
  readonly clean: boolean
  /** Tests that failed in the full run although the affected scope left them out, sorted. */
  readonly escapes: readonly string[]
  /** How many tests the full run covered. */
  readonly checked: number
}

/**
 * Proves the affected scope sound against evidence: after a full run on the same change, any test
 * that failed there but was not in the affected set is an escape -- a regression the narrow run
 * would have shipped. Run it on merges to the main branch, where both answers exist.
 * @param input - The affected tests, all tests and the full run's failures.
 * @returns Whether the narrow scope was sound, and which tests escaped it.
 */
export function findEscapes(input: CanaryInput): CanaryResult {
  const affected = new Set(input.affectedTests)
  const escapes = [...new Set(input.failedInFullRun)].filter((test) => !affected.has(test)).sort()
  return { clean: escapes.length === 0, escapes, checked: input.allTests.length }
}
