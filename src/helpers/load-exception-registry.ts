import { lstat as lstatFromFs, readFile as readFileFromFs } from "node:fs/promises"
import type { StandardSchemaV1 } from "../standard-schema/types.js"
import { jsonErrorLocation } from "./registry-file.js"

/**
 * Renders one failed-validation issue as `path: message`, or just `message` when it has no path.
 * It is a smaller copy of the shape `src/parsing/format-schema-issues.ts` produces for
 * `output.schema` failures, kept here rather than imported. `src/helpers/**` is a second
 * published barrel (see `src/presets/index.ts`'s doc comment on the same point). So it never
 * reaches into `src/parsing/`, an internal layer of the root barrel.
 * @param issue - one issue from a failed `StandardSchemaV1.Result`.
 * @returns the rendered issue.
 */
function formatIssue(issue: StandardSchemaV1.Issue): string {
  if (issue.path === undefined || issue.path.length === 0) return issue.message

  const path = issue.path
    // eslint-disable-next-line secure-coding/no-improper-type-validation -- `segment` is declared `PropertyKey | StandardSchemaV1.PathSegment` (never `null` or an array), so `typeof segment === "object"` can only match the `PathSegment` object form here. The null/array-safe rewrite this rule suggests is flagged as an unreachable condition by @typescript-eslint/no-unnecessary-condition given that exact type. So satisfying both rules at once is impossible: the type itself is the guarantee this check would otherwise add at runtime.
    .map((segment) => (typeof segment === "object" ? segment.key : segment))
    .map((key, index) => {
      if (typeof key === "number") return `[${String(key)}]`
      const rendered = String(key)
      return index === 0 ? rendered : `.${rendered}`
    })
    .join("")

  return `${path}: ${issue.message}`
}

/**
 * Whether `value` is a non-`null`, non-array object: the shape an exception registry's on-disk
 * envelope must be before its `exceptions` field is inspected.
 * @param value - the candidate value to check.
 * @returns `true` if `value` is a plain object.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * The default `isSymlink`: whether `target` is a symbolic link, dangling or not. A missing path is
 * not one. Any other `lstat` failure is rethrown, so an unreadable path is never taken as safe.
 * @param target - the path to probe.
 * @returns `true` for a symbolic link.
 */
async function isSymlinkOnDisk(target: string): Promise<boolean> {
  try {
    return (await lstatFromFs(target)).isSymbolicLink()
  } catch (error) {
    if ((error as { readonly code?: unknown }).code === "ENOENT") return false
    throw error
  }
}

/**
 * @param error - a caught value, possibly not an `Error`.
 * @returns its string `message`, or the value as a string.
 */
function messageOf(error: unknown): string {
  return isPlainObject(error) && typeof error.message === "string" ? error.message : String(error)
}

/**
 * Reads and validates one exception registry file from disk: `path -> { "$schema"?: string,
 * "exceptions": T[] }`, in two independently-validated layers. This function owns only the
 * envelope. The file exists or is absent (a normal empty-registry state), parses as JSON, and is
 * an object carrying an `"exceptions"` field. It never inspects what is inside `exceptions`.
 * `schema` (a `StandardSchemaV1`, hand-written or from a library; see
 * `src/standard-schema/types.ts`) owns every field-level concern for the caller's record shape.
 * That is the same "consumer supplies a trusted capability, this package calls it without
 * owning its internals" relationship `RepoContractConfig.spawn`/`env` already establish (see
 * `specs/decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md`).
 *
 * `readFile` defaults to `node:fs/promises`' `readFile`. `src/presets/security-secrets.ts`
 * already uses it, so this introduces no new filesystem-access surface. A missing file is a normal
 * "no exceptions recorded yet" state, not an error (`{ ok: true, records: [] }`). That matches
 * `scripts/suppression-governance/check.ts`'s `loadExistingRegistry` precedent for the same
 * first-run case. Every other failure returns `{ ok: false, errors }` rather than throwing:
 * unreadable for another reason, malformed JSON, a missing/malformed envelope, or a schema
 * validation failure. A bad registry is reported as data for a check's policy to fail on, never an
 * uncaught exception that crashes the run. The one exception is a throwing or rejecting
 * `schema.validate()`. That is a bug in the *caller-supplied schema*, not malformed registry data.
 * It propagates as a rejected `Promise`, as a throwing `output.schema` does in
 * `src/parsing/parse-output.ts`.
 * @param input - Where to read the registry from, the schema that validates its `exceptions` array, and (for tests, or a non-`node:fs` environment) an override for how to read `path`.
 * @param input.path - The registry file's path, passed to `input.readFile` verbatim.
 * @param input.schema - Validates (and may transform) the envelope's `exceptions` array once the envelope checks pass.
 * @param input.readFile - Reads `input.path`'s content. Defaults to `node:fs/promises`' `readFile(path, "utf8")`.
 * @param input.isSymlink - Whether `input.path` is a symbolic link. Defaults to `lstat`, with a missing path not a link. A link is refused, never followed: it could lead out of the registry directory.
 * @returns Every valid record (`ok: true`), or every problem found reading/parsing/validating the file (`ok: false`).
 * @public
 */
export async function loadExceptionRegistry<T>(input: {
  readonly path: string
  readonly schema: StandardSchemaV1<unknown, readonly T[]>
  readonly readFile?: (path: string) => Promise<string>
  readonly isSymlink?: (path: string) => Promise<boolean>
}): Promise<{ ok: true; records: readonly T[] } | { ok: false; errors: readonly string[] }> {
  const {
    path,
    schema,
    readFile = async (target: string) => (await readFileFromFs(target)).toString(),
    isSymlink = isSymlinkOnDisk,
  } = input

  let linked: boolean
  try {
    linked = await isSymlink(path)
  } catch (error) {
    return { ok: false, errors: [`Could not read ${path}: ${messageOf(error)}`] }
  }
  if (linked) {
    return {
      ok: false,
      errors: [
        `${path} is a symbolic link. An exception registry must be a regular file, and a link is never followed.`,
      ],
    }
  }

  let raw: string
  try {
    raw = await readFile(path)
  } catch (error) {
    // `readFile` is a caller-supplied capability (see this function's doc comment). A test
    // override, or an unusual filesystem implementation, could reject with something other than
    // an `Error` instance (`null`, a plain string, ...). Reading `.code`/`.message` off that would
    // throw out of this catch block instead of returning the clean `{ ok: false }` this function
    // promises for every other failure. `isPlainObject` narrows first.
    const code = isPlainObject(error) ? error.code : undefined
    if (code === "ENOENT") return { ok: true, records: [] }
    return { ok: false, errors: [`Could not read ${path}: ${messageOf(error)}`] }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    // Only the location: V8's message quotes the bytes around the fault.
    return { ok: false, errors: [`${path} is not valid JSON${jsonErrorLocation(error)}.`] }
  }

  if (!isPlainObject(parsed)) {
    return {
      ok: false,
      errors: [`${path} must contain a JSON object with an "exceptions" array (got a non-object).`],
    }
  }

  const { exceptions } = parsed
  if (exceptions === undefined) {
    return { ok: false, errors: [`${path} is missing its required "exceptions" field.`] }
  }

  const result = await schema["~standard"].validate(exceptions)
  if (result.issues !== undefined) {
    return { ok: false, errors: result.issues.map((issue) => formatIssue(issue)) }
  }

  return { ok: true, records: result.value }
}
