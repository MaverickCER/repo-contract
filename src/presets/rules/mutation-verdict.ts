import { notImplemented } from "../../not-implemented.js"
import type { ResolvedMutant } from "../../affected/mutation-report.js"
import type { ExceptionRegistrySchema, ExceptionV2Fields } from "../../helpers/exception-record.js"
import type { PolicyResult } from "../../types.js"

/** One `mutation.json` record: a mutant a person applied by hand and saw the suite fail on. */
export interface MutationExceptionRecord extends Partial<ExceptionV2Fields> {
  readonly id: string
  readonly version: 1 | 2
  readonly justification: string
  readonly file: string
  readonly mutator: string
  readonly original: string
  readonly replacement: string
}

/** What `repo-contract mutation run --json` prints. */
export interface MutationRunReport {
  readonly schemaVersion: 1
  /** `ran` mutated; `reused` replayed a clean run from the cache; `adopted` judged a supplied report; `nothing-to-mutate` had no target; `error` could not run. */
  readonly state: "ran" | "reused" | "adopted" | "nothing-to-mutate" | "error"
  /** The Stryker JSON report to judge, relative to the working directory. */
  readonly report: string
  /** Stryker's exit code, or `null` when Stryker did not run. */
  readonly exitCode: number | null
  readonly shard: string | null
  /** The files the run was restricted to, or `null` for everything the Stryker config selects. */
  readonly mutate: readonly string[] | null
  /** Timed-out mutants re-run alone, and how many of those were caught. */
  readonly timeouts: { readonly rerun: number; readonly caught: number }
  /** The cache key of the run's inputs, or `null` with the cache off. */
  readonly inputs: string | null
  /** One line for the rationale. */
  readonly message: string
}

/** Validates `mutation:` records. A record's id must match the one derived from its own fields. */
export const MUTATION_EXCEPTION_SCHEMA: ExceptionRegistrySchema<MutationExceptionRecord> = {
  namespace: "mutation:",
  metadataKeys: [],
  validateRecord: () => {
    return notImplemented("R7a")
  },
}

/**
 * @param value - the parsed output of `repo-contract mutation run --json`.
 * @returns the report, or `undefined` when it is not well formed.
 */
export function readMutationRun(value: unknown): MutationRunReport | undefined {
  return notImplemented("R7a", value)
}

/** What the registry did to a run's mutants. */
export interface AppliedMutationExceptions {
  /** Survived and NoCoverage mutants a complete record covers; left out of the score. */
  readonly suppressed: ReadonlySet<ResolvedMutant>
  /** One message per record that matches nothing; empty unless the run was full. */
  readonly stale: readonly string[]
  /** One message per incomplete or expired record. */
  readonly insufficient: readonly string[]
}

/**
 * Matches records to mutants by file, mutator, original text and replacement, never by line. A
 * record never covers a Timeout.
 * @param mutants - the run's mutants.
 * @param records - the registry's records.
 * @param options - how the run was scoped, and the clock.
 * @param options.full - `true` when the run mutated everything, so an unmatched record is stale.
 * @param options.now - the date `expires` is compared with.
 * @returns the suppressed mutants and the registry's problems.
 */
export function applyMutationExceptions(
  mutants: readonly ResolvedMutant[],
  records: readonly MutationExceptionRecord[],
  options: { readonly full: boolean; readonly now: Date },
): AppliedMutationExceptions {
  return notImplemented("R7a", mutants, records, options)
}

/**
 * Scores a run and judges it. The score is detected over detected plus Survived, NoCoverage and
 * Timeout, with Ignored and suppressed mutants left out. Fails below `minScore`, and on any
 * Timeout at all.
 * @param input - what to judge.
 * @param input.mutants - the run's mutants.
 * @param input.applied - what the registry did to them.
 * @param input.minScore - the lowest score that passes, in percent.
 * @param input.shard - the shard, written `<index>/<total>`, or `null`.
 * @returns the verdict.
 */
export function judgeMutation(input: {
  readonly mutants: readonly ResolvedMutant[]
  readonly applied: AppliedMutationExceptions
  readonly minScore: number
  readonly shard: string | null
}): PolicyResult {
  return notImplemented("R7a", input)
}
