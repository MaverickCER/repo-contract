import { notImplemented } from "../not-implemented.js"
/** One mutant of a Stryker JSON report, with the source text it replaces. */
export interface ResolvedMutant {
  readonly file: string
  readonly status: string
  readonly mutator: string
  /** The exact source span the mutant replaces, read from the report's `source`. */
  readonly original: string
  readonly replacement: string
  /** 1-indexed start line, or `0` when the report has no location. */
  readonly line: number
  readonly column: number
  readonly statusReason: string | undefined
}

/** The fields a mutation exception id is derived from. Never the line: a record survives code moving. */
export type MutantIdentity = Pick<ResolvedMutant, "file" | "mutator" | "original" | "replacement">

/**
 * Reads every mutant of a Stryker JSON report (schema version 1 or 2).
 * @param report - the parsed report.
 * @returns the mutants in file then report order, or why the report cannot be read.
 */
export function resolveMutants(
  report: unknown,
):
  | { readonly ok: true; readonly mutants: readonly ResolvedMutant[] }
  | { readonly ok: false; readonly error: string } {
  return notImplemented("R7a", report)
}

/**
 * `mutation:<file>:<mutator>:<first 12 hex of the hash of original and replacement>`. The format
 * matches internal-package-contract's, so existing `mutation.json` records keep their ids.
 * @param mutant - the identity fields.
 * @returns the id.
 */
export function mutationExceptionId(mutant: MutantIdentity): string {
  return notImplemented("R7a", mutant)
}

/**
 * Finds the mutant a mutation exception id names, for `repo-contract except`.
 * @param mutants - a report's mutants.
 * @param id - a `mutation:` id.
 * @returns the first mutant with that id, or `undefined`.
 */
export function findMutantById(
  mutants: readonly ResolvedMutant[],
  id: string,
): ResolvedMutant | undefined {
  return notImplemented("R7a", mutants, id)
}
