import { readFile as readFileFromFs } from "node:fs/promises"
import type { StandardSchemaV1 } from "../standard-schema/types.js"

/**
 * Renders one failed-validation issue as `path: message`, or just `message` when it has no path --
 * the same shape `src/parsing/format-schema-issues.ts` produces for `output.schema` failures, kept
 * as an independent, much smaller copy here rather than an import: `src/helpers/**` is a second,
 * independent published barrel (see `src/presets/index.ts`'s own doc comment on the same point) and
 * deliberately never reaches into `src/parsing/`, an internal layer of the root barrel it has no
 * business depending on.
 * @param issue - one issue from a failed `StandardSchemaV1.Result`.
 * @returns the rendered issue.
 */
function formatIssue(issue: StandardSchemaV1.Issue): string {
  if (issue.path === undefined || issue.path.length === 0) return issue.message

  const path = issue.path
    // eslint-disable-next-line secure-coding/no-improper-type-validation -- `segment` is declared `PropertyKey | StandardSchemaV1.PathSegment` (never `null` or an array), so `typeof segment === "object"` can only match the `PathSegment` object form here; the null/array-safe rewrite this rule suggests is flagged as an unreachable condition by @typescript-eslint/no-unnecessary-condition given that exact type, so satisfying both rules at once is impossible -- the type itself is the guarantee this check would otherwise add at runtime.
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
 * Whether `value` is a non-`null`, non-array object -- the shape an exception registry's on-disk
 * envelope must be before its own `exceptions` field is inspected.
 * @param value - the candidate value to check.
 * @returns `true` if `value` is a plain object.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Reads and validates one exception registry file from disk -- `path -> { "$schema"?: string,
 * "exceptions": T[] }`, in two independently-validated layers. This function owns only the
 * envelope: that the file exists (or is absent, a normal empty-registry state), parses as JSON,
 * and is an object carrying an `"exceptions"` field at all. It never inspects what is inside
 * `exceptions` beyond that -- `schema` (a `StandardSchemaV1`, hand-written or from a real library;
 * see `src/standard-schema/types.ts`) owns every field-level concern for the caller's own record
 * shape, exactly the same "consumer supplies a trusted capability, this package calls it without
 * owning its internals" relationship `RepoContractConfig.spawn`/`env` already establish (see
 * `specs/decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md`).
 *
 * `readFile` defaults to `node:fs/promises`' own `readFile` -- already used by
 * `src/presets/security-secrets.ts`, so this introduces no new filesystem-access surface; a
 * missing file is a normal "no exceptions recorded yet" state, not an error (`{ ok: true, records:
 * [] }`), matching `scripts/suppression-governance/check.ts`'s own `loadExistingRegistry`
 * precedent for the same first-run case. Every other failure -- unreadable-for-another-reason,
 * malformed JSON, a missing/malformed envelope, or a schema validation failure -- returns `{ ok:
 * false, errors }` rather than throwing: a bad registry is reported as data for a check's policy to
 * fail on, never an uncaught exception that crashes the run. The one exception is `schema`'s own
 * `validate()` throwing or rejecting -- a bug in the *caller-supplied schema*, not malformed
 * registry data -- which is deliberately left to propagate as a rejected `Promise`, mirroring
 * `src/parsing/parse-output.ts`'s identical treatment of a throwing `output.schema`.
 * @param input - Where to read the registry from, the schema that validates its `exceptions` array, and (for tests, or a non-`node:fs` environment) an override for how to read `path`.
 * @param input.path - The registry file's path, passed to `input.readFile` verbatim.
 * @param input.schema - Validates (and may transform) the envelope's `exceptions` array once this function's own envelope checks pass.
 * @param input.readFile - Reads `input.path`'s content. Defaults to `node:fs/promises`' own `readFile(path, "utf8")`.
 * @returns Every valid record (`ok: true`), or every problem found reading/parsing/validating the file (`ok: false`).
 */
export async function loadExceptionRegistry<T>(input: {
  readonly path: string
  readonly schema: StandardSchemaV1<unknown, readonly T[]>
  readonly readFile?: (path: string) => Promise<string>
}): Promise<{ ok: true; records: readonly T[] } | { ok: false; errors: readonly string[] }> {
  // Equivalent mutant, confirmed empirically: `node:fs/promises`'s `readFile(path, "")` returns
  // a raw `Buffer` rather than a decoded string (unlike `Hash.update`, an empty inputEncoding is
  // not treated the same as "utf8" here) -- but this function's only use of `raw` is
  // `JSON.parse(raw)` immediately below, and `JSON.parse`'s own `ToString` coercion on a `Buffer`
  // calls `Buffer.prototype.toString()` with no arguments, whose own default encoding is "utf8"
  // -- confirmed directly, including with multi-byte UTF-8 content, that
  // `JSON.parse(bufferReadWithEmptyEncoding)` produces byte-identical results to
  // `JSON.parse(stringReadWithUtf8Encoding)` every time. No test could ever observe a difference
  // through this function's own return value.
  // Stryker disable next-line StringLiteral -- equivalent mutant, see comment above.
  const { path, schema, readFile = (target: string) => readFileFromFs(target, "utf8") } = input

  let raw: string
  try {
    raw = await readFile(path)
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException
    if (nodeError.code === "ENOENT") return { ok: true, records: [] }
    return { ok: false, errors: [`Could not read ${path}: ${nodeError.message}`] }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    return { ok: false, errors: [`${path} is not valid JSON: ${(error as Error).message}`] }
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
