import { notImplemented } from "../not-implemented.js"
/** Where a repository keeps its exception registries. */
export const EXCEPTION_REGISTRY_DIRECTORY = ".repo-contract/exceptions"

/** One registry file's records, named by its file name without `.json`. */
export interface ExceptionRegistryContents {
  readonly name: string
  readonly records: readonly unknown[]
}

/** A registry file that could not be read or has no `exceptions` array. */
export interface ExceptionRegistryError {
  readonly name: string
  readonly error: string
}

/** One registry's counts. */
export interface ExceptionRegistrySummary {
  readonly name: string
  readonly total: number
  /** Records per `exceptionType`; a record without one counts as `"(untyped)"`. */
  readonly byType: Readonly<Record<string, number>>
  /** Records still `version: 1`. */
  readonly legacy: number
  /** Records whose `expires` is before today. */
  readonly expired: number
  /** Records with a blank `justification`, or a blank v2 field on a `version: 2` record. */
  readonly incomplete: number
}

/** What `repo-contract exceptions --json` prints. It decides nothing. */
export interface ExceptionInventory {
  readonly schemaVersion: 1
  readonly registries: readonly ExceptionRegistrySummary[]
  readonly total: number
  readonly legacy: number
  readonly expired: number
  readonly incomplete: number
  readonly errors: readonly ExceptionRegistryError[]
}

/**
 * Reads every `*.json` registry in a directory. A file that cannot be read becomes an error row,
 * never a throw: the check that owns the registry fails on it.
 * @param directory - the registry directory, usually {@link EXCEPTION_REGISTRY_DIRECTORY}.
 * @returns the registries in file-name order, and the files that could not be read.
 */
export function readExceptionRegistries(directory: string): Promise<{
  readonly registries: readonly ExceptionRegistryContents[]
  readonly errors: readonly ExceptionRegistryError[]
}> {
  return notImplemented("R4", directory)
}

/**
 * Counts every registry's records by type, legacy, expired and incomplete.
 * @param registries - the registries' records.
 * @param now - the date `expires` is compared with.
 * @param errors - files that could not be read, carried into the inventory.
 * @returns the inventory.
 */
export function summarizeExceptionRegistries(
  registries: readonly ExceptionRegistryContents[],
  now: Date,
  errors: readonly ExceptionRegistryError[] = [],
): ExceptionInventory {
  return notImplemented("R4", registries, now, errors)
}

/**
 * @param inventory - what {@link summarizeExceptionRegistries} returned.
 * @returns one line per registry under a total line, ending in a newline.
 */
export function renderExceptionInventory(inventory: ExceptionInventory): string {
  return notImplemented("R4", inventory)
}
