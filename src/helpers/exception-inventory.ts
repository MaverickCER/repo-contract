/**
 * The read-only inventory behind `repo-contract exceptions`: per registry, how many records it
 * holds, by `exceptionType`, and how many are legacy, expired or incomplete. It decides nothing;
 * the check that owns a registry judges it.
 */
import {
  lstat as lstatFromFs,
  readdir as readdirFromFs,
  readFile as readFileFromFs,
} from "node:fs/promises"
import path from "node:path"
import { EXCEPTION_V2_FIELD_KEYS, isExpired } from "./exception-record.js"
import { jsonErrorLocation } from "./registry-file.js"

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
 * @param error - a caught file-system error.
 * @returns why the path cannot be read, by its error code alone.
 */
function unreadable(error: unknown): string {
  const code = (error as { readonly code?: unknown }).code
  return `cannot be read (${typeof code === "string" ? code : "no error code"})`
}

/**
 * Reads one registry file. Each reason names an error code or a shape, never the file's bytes.
 * @param file - the registry file.
 * @returns its records, or why there are none.
 */
async function readRegistryFile(
  file: string,
): Promise<{ readonly records: readonly unknown[] } | { readonly error: string }> {
  let text: string
  try {
    const stat = await lstatFromFs(file)
    if (stat.isSymbolicLink()) return { error: "skipped: a symbolic link, which is never followed" }
    if (!stat.isFile()) return { error: "skipped: not a regular file" }
    // A Buffer decodes as UTF-8, as the "utf8" encoding would.
    text = String(await readFileFromFs(file))
  } catch (error) {
    return { error: unreadable(error) }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return { error: `not valid JSON${jsonErrorLocation(error)}` }
  }
  const records = (parsed as { readonly exceptions?: unknown } | null)?.exceptions
  return Array.isArray(records) ? { records } : { error: 'no "exceptions" array' }
}

/**
 * Reads every `*.json` registry in a directory. A file that cannot be read becomes an error row,
 * never a throw: the check that owns the registry fails on it. A symbolic link is listed as
 * skipped and never followed, since it could lead out of the directory.
 * @param directory - the registry directory, usually {@link EXCEPTION_REGISTRY_DIRECTORY}.
 * @returns the registries in file-name order, and the files that could not be read.
 */
export async function readExceptionRegistries(directory: string): Promise<{
  readonly registries: readonly ExceptionRegistryContents[]
  readonly errors: readonly ExceptionRegistryError[]
}> {
  let files: string[]
  try {
    files = await readdirFromFs(directory)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { registries: [], errors: [] }
    return { registries: [], errors: [{ name: directory, error: unreadable(error) }] }
  }

  const registries: ExceptionRegistryContents[] = []
  const errors: ExceptionRegistryError[] = []
  for (const file of files.filter((name) => name.endsWith(".json")).sort()) {
    const name = file.slice(0, -".json".length)
    const read = await readRegistryFile(path.join(directory, file))
    if ("records" in read) registries.push({ name, records: read.records })
    else errors.push({ name, error: read.error })
  }
  return { registries, errors }
}

/**
 * @param value - a field value.
 * @returns whether it holds no text.
 */
function isBlank(value: unknown): boolean {
  return typeof value !== "string" || value.trim() === ""
}

/**
 * @param name - the registry's name.
 * @param records - its records, untrusted.
 * @param now - the date `expires` is compared with.
 * @returns the registry's counts.
 */
function summarizeRegistry(
  name: string,
  records: readonly unknown[],
  now: Date,
): ExceptionRegistrySummary {
  const byType: Record<string, number> = {}
  let legacy = 0
  let expired = 0
  let incomplete = 0
  for (const record of records) {
    // Reading a field of a string or number gives `undefined`, as it does of an empty object.
    const flat = (record ?? {}) as Readonly<Record<string, unknown>>
    // Anything not version 2 lacks the v2 fields, so it counts as legacy.
    const isLegacy = flat.version !== 2
    const type = isBlank(flat.exceptionType) ? "(untyped)" : String(flat.exceptionType)
    byType[type] = (byType[type] ?? 0) + 1
    if (isLegacy) legacy += 1
    if (isExpired(flat.expires, now)) expired += 1
    const missingV2 = !isLegacy && EXCEPTION_V2_FIELD_KEYS.some((key) => isBlank(flat[key]))
    if (isBlank(flat.justification) || missingV2) incomplete += 1
  }
  return { name, total: records.length, byType, legacy, expired, incomplete }
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
  const summaries = registries.map(({ name, records }) => summarizeRegistry(name, records, now))
  const sum = (key: "total" | "legacy" | "expired" | "incomplete"): number =>
    summaries.reduce((total, summary) => total + summary[key], 0)
  return {
    schemaVersion: 1,
    registries: summaries,
    total: sum("total"),
    legacy: sum("legacy"),
    expired: sum("expired"),
    incomplete: sum("incomplete"),
    errors,
  }
}

/**
 * @param inventory - what {@link summarizeExceptionRegistries} returned.
 * @returns one line per registry under a total line, ending in a newline.
 */
export function renderExceptionInventory(inventory: ExceptionInventory): string {
  if (inventory.registries.length === 0 && inventory.errors.length === 0) {
    return "No exceptions recorded: nothing in this repository is breaking a rule on purpose.\n"
  }
  const count = inventory.registries.length
  const lines = [
    `${String(inventory.total)} exception(s) across ${String(count)} ${count === 1 ? "registry" : "registries"}` +
      ` (${String(inventory.legacy)} legacy version 1, ${String(inventory.expired)} expired, ${String(inventory.incomplete)} incomplete).`,
    "",
  ]
  for (const registry of inventory.registries) {
    const types = Object.entries(registry.byType)
      .sort(
        ([typeA, countA], [typeB, countB]) => countB - countA || typeA.localeCompare(typeB, "en"),
      )
      .map(([type, typeCount]) => `${type} ${String(typeCount)}`)
      .join(", ")
    const notes = (["legacy", "expired", "incomplete"] as const)
      .filter((key) => registry[key] > 0)
      .map((key) => `; ${String(registry[key])} ${key}`)
      .join("")
    lines.push(`- ${registry.name}: ${String(registry.total)}${types ? ` (${types})` : ""}${notes}`)
  }
  for (const failure of inventory.errors)
    lines.push(`- ${failure.name}: UNREADABLE: ${failure.error}`)
  return `${lines.join("\n")}\n`
}
