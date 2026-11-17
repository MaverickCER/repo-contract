import { hashRequirementFields } from "../helpers/exception-policy.js"

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
  /** How many tests ran against the mutant, or `undefined` when the report does not say. */
  readonly testsCompleted: number | undefined
}

/** The fields a mutation exception id is derived from. Never the line: a record survives code moving. */
export type MutantIdentity = Pick<ResolvedMutant, "file" | "mutator" | "original" | "replacement">

interface Position {
  readonly line: number
  readonly column: number
}

interface Location {
  readonly start: Position
  readonly end: Position
}

/**
 * @param value - a candidate value.
 * @returns whether it is a non-`null`, non-array object.
 */
function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * @param value - a candidate position.
 * @returns whether it has a numeric line and column.
 */
function isPosition(value: unknown): value is Position {
  return isPlainObject(value) && typeof value.line === "number" && typeof value.column === "number"
}

/**
 * @param value - a mutant's `location`.
 * @returns the location, or `undefined` when it is missing or malformed.
 */
function locationOf(value: unknown): Location | undefined {
  return isPlainObject(value) && isPosition(value.start) && isPosition(value.end)
    ? { start: value.start, end: value.end }
    : undefined
}

/**
 * The span a location covers. Lines and columns are 1-indexed and the end column is exclusive, as
 * in Stryker's own diffs. A line past the end of the source reads as empty.
 * @param source - the file's text as the report recorded it.
 * @param location - the mutant's location.
 * @returns the replaced text, or `""` without a source or a location.
 */
function spanOf(source: string | undefined, location: Location | undefined): string {
  if (source === undefined || location === undefined) return ""
  const lines = source.split("\n")
  const { start, end } = location
  if (start.line === end.line) {
    return (lines[start.line - 1] ?? "").slice(start.column - 1, end.column - 1)
  }
  return [
    (lines[start.line - 1] ?? "").slice(start.column - 1),
    ...lines.slice(start.line, end.line - 1),
    (lines[end.line - 1] ?? "").slice(0, end.column - 1),
  ].join("\n")
}

/**
 * @param value - a candidate string.
 * @returns the string, or `undefined` for anything else.
 */
function stringOr(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

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
  if (!isPlainObject(report) || !isPlainObject(report.files)) {
    return { ok: false, error: 'The mutation report is not an object with a "files" object.' }
  }
  const mutants: ResolvedMutant[] = []
  for (const [file, entry] of Object.entries(report.files)) {
    if (!isPlainObject(entry) || !Array.isArray(entry.mutants)) {
      return {
        ok: false,
        error: `The mutation report's entry for ${JSON.stringify(file)} has no "mutants" array.`,
      }
    }
    const source = stringOr(entry.source)
    for (const mutant of entry.mutants as readonly unknown[]) {
      if (!isPlainObject(mutant) || typeof mutant.status !== "string") {
        return {
          ok: false,
          error: `The mutation report's entry for ${JSON.stringify(file)} has a mutant with no status.`,
        }
      }
      const location = locationOf(mutant.location)
      const tests = mutant.testsCompleted
      mutants.push({
        file,
        status: mutant.status,
        mutator: stringOr(mutant.mutatorName) ?? "",
        original: spanOf(source, location),
        replacement: stringOr(mutant.replacement) ?? "",
        line: location?.start.line ?? 0,
        column: location?.start.column ?? 0,
        statusReason: stringOr(mutant.statusReason),
        testsCompleted: Number.isInteger(tests) ? (tests as number) : undefined,
      })
    }
  }
  return { ok: true, mutants }
}

/**
 * `mutation:<file>:<mutator>:<first 12 hex of the hash of original and replacement>`. The format
 * matches internal-package-contract's, so existing `mutation.json` records keep their ids.
 * @param mutant - the identity fields.
 * @returns the id.
 */
export function mutationExceptionId(mutant: MutantIdentity): string {
  const digest = hashRequirementFields(mutant, ["original", "replacement"], (identity, field) =>
    field === "original" ? identity.original : identity.replacement,
  )
  return `mutation:${mutant.file}:${mutant.mutator}:${digest.slice(0, 12)}`
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
  return mutants.find((mutant) => mutationExceptionId(mutant) === id)
}
