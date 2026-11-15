import {
  lstat as lstatFromFs,
  readFile as readFileFromFs,
  rename as renameFromFs,
  writeFile as writeFileFromFs,
} from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { serializeExceptionRegistry } from "./reconcile-exceptions.js"

/**
 * Whether `error` carries `code === "ENOENT"`: a missing file. The symlink probe and the "already
 * up to date" comparison both treat it as "no file yet", never a failure. Reads `.code`
 * defensively: every filesystem capability here is caller-overridable and could reject with
 * something other than an `Error` instance.
 * @param error - the caught value.
 * @returns `true` for an `ENOENT`.
 */
function isEnoent(error: unknown): boolean {
  return (
    // Replacing this `typeof` guard with `true` still yields `false` for every non-object value.
    // A primitive's `.code` is `undefined` (never the string "ENOENT"), and the `!== null` clause
    // catches `null`. It is the same accepted equivalent mutant as load-exception-registry.ts's
    // ENOENT check.
    typeof error === "object" &&
    error !== null &&
    (error as { readonly code?: unknown }).code === "ENOENT"
  )
}

/**
 * Writes one exception registry to disk in its canonical form (`serializeExceptionRegistry`),
 * atomically and idempotently: the sole filesystem-writing primitive in `repo-contract/helpers`.
 *
 * - **Symlinked target** -> `{ ok: false }`: a governance registry is never a symlink, and writing
 *   through one would escape `.repo-contract/exceptions/`.
 * - **No file yet** -> written.
 * - **On-disk bytes already equal the canonical form** -> `{ ok: true, written: false }`, no
 *   write. A reconcile that changed nothing never dirties the working tree.
 * - **Different** -> the canonical bytes go to a sibling temp file (`<path>.<uuid>.tmp`), which is
 *   `rename`d over the target. The target is replaced atomically and never holds partial content.
 *   A `rename` failure (e.g. a Windows lock on the target) returns `{ ok: false }`. The temp file
 *   stays in place: it has a uuid name and the run has already failed. `.gitignore` covers
 *   `.repo-contract/exceptions/*.tmp`.
 *
 * Path containment is the caller's responsibility: repo-contract's checks always pass
 * `.repo-contract/exceptions/<name>.json`. `readFile`/`writeFile`/`rename`/`isSymlink` default to
 * `node:fs/promises` and are overridable for tests or a non-`node:fs` environment, mirroring
 * `loadExceptionRegistry`'s `readFile` parameter.
 * @param input - The target path, the records to persist, and (optional) filesystem-capability overrides.
 * @param input.path - Where to write. Passed verbatim to every capability.
 * @param input.records - The reconciled records; serialized via `serializeExceptionRegistry`.
 * @param input.readFile - Reads the current file. Default: `node:fs/promises` `readFile(path, "utf8")`.
 * @param input.writeFile - Writes the temp file. Default: `node:fs/promises` `writeFile(path, data, "utf8")`.
 * @param input.rename - Replaces the target with the temp file. Default: `node:fs/promises` `rename`.
 * @param input.isSymlink - Whether `path` is a symlink. Default: `lstat(path).isSymbolicLink()`, treating a missing path as not a symlink.
 * @returns `{ ok: true, written }` on success, or `{ ok: false, error }` for a symlink, an unreadable target, or a failed write/rename.
 * @public
 */
export async function writeExceptionRegistry(input: {
  readonly path: string
  readonly records: readonly (Record<string, unknown> & { readonly id: string })[]
  readonly readFile?: (path: string) => Promise<string>
  readonly writeFile?: (path: string, data: string) => Promise<void>
  readonly rename?: (from: string, to: string) => Promise<void>
  readonly isSymlink?: (path: string) => Promise<boolean>
}): Promise<
  { readonly ok: true; readonly written: boolean } | { readonly ok: false; readonly error: string }
> {
  const {
    path,
    records,
    // No explicit encoding on either call. `readFile` returns a Buffer that `.toString()` decodes
    // as utf8 by default, and `writeFile` writes a string as utf8 by default. There is no encoding
    // literal for a mutant to flip.
    readFile = (target: string) => readFileFromFs(target).then((buffer) => buffer.toString()),
    writeFile = (target: string, data: string) => writeFileFromFs(target, data),
    rename = (from: string, to: string) => renameFromFs(from, to),
    isSymlink = defaultIsSymlink,
  } = input

  if (await isSymlink(path)) {
    return {
      ok: false,
      error: `${path} is a symlink; an exception registry must be a regular file inside .repo-contract/exceptions/.`,
    }
  }

  const serialized = serializeExceptionRegistry(records)

  let current: string | undefined
  try {
    current = await readFile(path)
  } catch (error) {
    if (!isEnoent(error)) {
      return { ok: false, error: `Could not read ${path}: ${String(error)}` }
    }
  }
  if (current === serialized) return { ok: true, written: false }

  const tempPath = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(tempPath, serialized)
  } catch (error) {
    return { ok: false, error: `Could not write ${tempPath}: ${String(error)}` }
  }

  try {
    await rename(tempPath, path)
  } catch (error) {
    return {
      ok: false,
      error: `Could not replace ${path} with the reconciled registry (temp file left at ${tempPath}): ${String(error)}`,
    }
  }

  return { ok: true, written: true }
}

/**
 * The default `isSymlink`: `lstat(path).isSymbolicLink()`, with a missing path reported as not a
 * symlink. A non-`ENOENT` `lstat` failure propagates: an unreadable path is not treated as safe.
 * @param target - the path to probe.
 * @returns whether `target` is a symbolic link.
 */
async function defaultIsSymlink(target: string): Promise<boolean> {
  try {
    return (await lstatFromFs(target)).isSymbolicLink()
  } catch (error) {
    // A missing path is "not a symlink". Any other `lstat` failure is rethrown, never treated as a
    // safe non-symlink: a non-directory path component (ENOTDIR) or a permissions fault (EACCES).
    if (isEnoent(error)) return false
    throw error
  }
}
