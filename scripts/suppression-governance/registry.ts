import { SUPPRESSION_CATEGORIES, VERIFICATION_METHODS } from "./evidence-types.js"
import type { DisableCommentRecord, DisableCommentRegistry } from "./evidence-types.js"

interface RegistryValidationSuccess {
  readonly ok: true
  readonly records: DisableCommentRegistry
}

interface RegistryValidationFailure {
  readonly ok: false
  readonly errors: readonly string[]
}

type RegistryValidationResult = RegistryValidationSuccess | RegistryValidationFailure

const WINDOWS_DRIVE_PATH = /^[A-Za-z]:[/\\]/

/**
 * Whether `file` looks like a well-formed repository-relative POSIX path: non-empty, never
 * absolute (POSIX `/...` or a Windows drive path), never backslash-separated (this registry's own
 * writer never produces one -- see find-source-files.ts's `toPosixPath`), and never containing a
 * `..` segment. The last two are defense-in-depth against a hand-edited registry smuggling in a
 * path that escapes the repository root -- independent of find-source-files.ts's own symlink
 * containment, which this validator can't observe.
 * @param file - The candidate `file` value to check.
 * @returns `true` if `file` is a well-formed repository-relative POSIX path.
 */
function isWellFormedRepoRelativePath(file: string): boolean {
  if (file.length === 0) return false
  if (file.startsWith("/") || WINDOWS_DRIVE_PATH.test(file)) return false
  if (file.includes("\\")) return false
  return !file.split("/").includes("..")
}

/**
 * Whether `value` is a non-null, non-array object -- the shape every record/detail field is
 * expected to be before its own fields are inspected.
 * @param value - The candidate value to check.
 * @returns `true` if `value` is a plain object.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Validates one of a record's free-prose string fields (`justification`/`alternatives`/
 * `remediation`/`reason`) -- each must be a `string`, but an *empty* string is valid registry
 * state (a freshly-created record legitimately starts that way; whether an empty value satisfies
 * policy is checks/suppression-governance.ts's concern, not this validator's). For the two
 * closed-enum fields (`category`/`verificationMethod`), see `validateEnumField` below instead.
 * @param value - The candidate field value to validate.
 * @param index - The containing record's index, for error messages.
 * @param field - The field's own name, for error messages.
 * @param errors - Accumulates every validation problem found across the whole registry.
 * @returns The validated string, or `undefined` if `value` was not a string.
 */
function validateStringField(
  value: unknown,
  index: number,
  field: string,
  errors: string[],
): string | undefined {
  if (typeof value !== "string") {
    errors.push(`records[${String(index)}].${field} must be a string.`)
    return undefined
  }
  return value
}

/**
 * Validates one of a record's closed-enum fields (`category`/`verificationMethod`) against
 * `allowed` -- an exact, case-sensitive membership check, deliberately never normalized (no
 * `.trim()`/`.toLowerCase()` of `value` before comparing). This is human-authored governance
 * data: silently coercing `"Equivalent-Mutant"` or `" equivalent-mutant "` to their canonical form
 * would hide a typo instead of surfacing it, and would make classification changes harder to spot
 * in a diff. `""` (the "not yet classified" sentinel) is itself always one of `allowed`'s members
 * (see `SUPPRESSION_CATEGORIES`/`VERIFICATION_METHODS` in evidence-types.ts), so it is accepted
 * here like any other valid member -- whether an empty classification satisfies policy is
 * checks/suppression-governance.ts's concern, not this validator's, exactly mirroring
 * `validateStringField`'s own empty-string handling above.
 * @param value - The candidate field value to validate.
 * @param index - The containing record's index, for error messages.
 * @param field - The field's own name, for error messages.
 * @param allowed - The field's complete set of valid values.
 * @param errors - Accumulates every validation problem found across the whole registry.
 * @returns The validated value, narrowed to `T`, or `undefined` if invalid.
 */
function validateEnumField<T extends string>(
  value: unknown,
  index: number,
  field: string,
  allowed: readonly T[],
  errors: string[],
): T | undefined {
  if (typeof value !== "string") {
    errors.push(`records[${String(index)}].${field} must be a string.`)
    return undefined
  }
  if (!(allowed as readonly string[]).includes(value)) {
    const allowedList = allowed.map((entry) => JSON.stringify(entry)).join(", ")
    errors.push(
      `records[${String(index)}].${field} must be one of ${allowedList} (got ${JSON.stringify(value)}).`,
    )
    return undefined
  }
  return value as T
}

/**
 * Validates one candidate record and, only if every field is well-formed, rebuilds it as a fresh
 * object literal containing exactly the eleven documented fields -- the untrusted parsed value
 * itself is never spread or passed through, so a stray extra/prototype-shaped key on the parsed
 * JSON object can never ride along into a trusted record.
 * @param value - The candidate record to validate.
 * @param index - This record's own index within the registry array, for error messages.
 * @param errors - Accumulates every validation problem found across the whole registry.
 * @returns The validated, freshly-rebuilt record, or `undefined` if any field was invalid.
 */
function validateRecord(
  value: unknown,
  index: number,
  errors: string[],
): DisableCommentRecord | undefined {
  if (!isPlainObject(value)) {
    errors.push(`records[${String(index)}] must be an object.`)
    return undefined
  }

  const {
    file,
    line,
    domain,
    rule,
    content,
    justification,
    alternatives,
    remediation,
    category,
    verificationMethod,
    reason,
  } = value

  const fileValid = typeof file === "string" && isWellFormedRepoRelativePath(file)
  if (!fileValid) {
    errors.push(
      `records[${String(index)}].file must be a non-empty, repository-relative POSIX path with no ".." segments (got ${JSON.stringify(file)}).`,
    )
  }

  const lineValid = typeof line === "number" && Number.isInteger(line) && line >= 1
  if (!lineValid) {
    errors.push(
      `records[${String(index)}].line must be a positive integer (got ${JSON.stringify(line)}).`,
    )
  }

  const domainValid = typeof domain === "string" && domain.length > 0
  if (!domainValid) {
    errors.push(`records[${String(index)}].domain must be a non-empty string.`)
  }

  const ruleValid =
    Array.isArray(rule) &&
    rule.length > 0 &&
    rule.every((entry) => typeof entry === "string" && entry.length > 0)
  if (!ruleValid) {
    errors.push(`records[${String(index)}].rule must be a non-empty array of non-empty strings.`)
  }

  const contentValid = typeof content === "string" && content.length > 0
  if (!contentValid) {
    errors.push(`records[${String(index)}].content must be a non-empty string.`)
  }

  const validatedJustification = validateStringField(justification, index, "justification", errors)
  const validatedAlternatives = validateStringField(alternatives, index, "alternatives", errors)
  const validatedRemediation = validateStringField(remediation, index, "remediation", errors)
  const validatedCategory = validateEnumField(
    category,
    index,
    "category",
    SUPPRESSION_CATEGORIES,
    errors,
  )
  const validatedVerificationMethod = validateEnumField(
    verificationMethod,
    index,
    "verificationMethod",
    VERIFICATION_METHODS,
    errors,
  )
  const validatedReason = validateStringField(reason, index, "reason", errors)

  if (
    !fileValid ||
    !lineValid ||
    !domainValid ||
    !ruleValid ||
    !contentValid ||
    validatedJustification === undefined ||
    validatedAlternatives === undefined ||
    validatedRemediation === undefined ||
    validatedCategory === undefined ||
    validatedVerificationMethod === undefined ||
    validatedReason === undefined
  ) {
    return undefined
  }

  return {
    file,
    line,
    domain,
    rule: [...(rule as string[])],
    content,
    justification: validatedJustification,
    alternatives: validatedAlternatives,
    remediation: validatedRemediation,
    category: validatedCategory,
    verificationMethod: validatedVerificationMethod,
    reason: validatedReason,
  }
}

/**
 * A record's (or a not-yet-a-record suppression's) full identity --
 * `(file, line, domain, rule, content)` -- used to detect duplicates here and, by
 * `synchronize.ts` (which reconciles freshly-discovered suppressions against these same
 * records before they're finalized), for its own exact-match reconciliation pass.
 * @param record - The record (or record-shaped suppression) to identify.
 * @param record.file - The suppression's repository-relative source file path.
 * @param record.line - The suppression comment's 1-indexed source line.
 * @param record.domain - The suppression's governed domain (e.g. "eslint", "stryker").
 * @param record.rule - The specific rule(s) this suppression covers within its domain.
 * @param record.content - The suppression comment's canonicalized text.
 * @returns A string uniquely identifying `record`'s identity.
 */
export function recordIdentity(record: {
  readonly file: string
  readonly line: number
  readonly domain: string
  readonly rule: readonly string[]
  readonly content: string
}): string {
  return JSON.stringify([record.file, record.line, record.domain, record.rule, record.content])
}

/**
 * Finds every record sharing an identity with an earlier one in `records`.
 * @param records - The already-individually-valid records to check for duplicates among.
 * @returns One error message per duplicate found.
 */
function findDuplicates(records: readonly DisableCommentRecord[]): string[] {
  const seen = new Map<string, number>()
  const errors: string[] = []

  for (const [index, record] of records.entries()) {
    const identity = recordIdentity(record)
    const firstIndex = seen.get(identity)
    if (firstIndex !== undefined) {
      errors.push(
        `records[${String(index)}] duplicates records[${String(firstIndex)}] (same file, line, domain, rule, and content).`,
      )
      continue
    }
    seen.set(identity, index)
  }

  return errors
}

/**
 * Validates an untrusted parsed value against disable-comments.json's contract -- rejects
 * everything this check's security requirements list: a non-array top level, a missing/empty/
 * escaping `file`, a non-positive-integer `line`, an empty `domain`, an empty or invalid `rule`
 * list, empty `content`, a non-string `justification`/`alternatives`/`remediation`/`reason`, a
 * `category`/`verificationMethod` that isn't an exact (unnormalized) member of its own closed
 * enum, and duplicate records. Malformed input always fails the entire registry (`ok: false` with
 * every problem found, not just the first) -- a bad record is never silently dropped while the
 * rest are kept.
 * @param value - The parsed (but otherwise untrusted) JSON value to validate.
 * @returns Every valid, freshly-rebuilt record, or every validation error found.
 */
export function validateSuppressionRegistry(value: unknown): RegistryValidationResult {
  if (!Array.isArray(value)) {
    return { ok: false, errors: ["disable-comments.json must contain a JSON array of records."] }
  }

  const errors: string[] = []
  const records: DisableCommentRecord[] = []

  for (const [index, entry] of value.entries()) {
    const record = validateRecord(entry, index, errors)
    if (record) records.push(record)
  }

  if (errors.length === 0) {
    errors.push(...findDuplicates(records))
  }

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  return { ok: true, records }
}

/**
 * Stable sort by `(file, line, domain, rule, content)` -- the registry's deterministic on-disk
 * ordering, independent of discovery order (directory traversal order, JSON key order, etc.).
 * @param records - The records to sort.
 * @returns A new, sorted array; `records` itself is never mutated.
 */
export function sortRecords<T extends DisableCommentRecord>(records: readonly T[]): T[] {
  return [...records].sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      a.line - b.line ||
      a.domain.localeCompare(b.domain) ||
      a.rule.join(",").localeCompare(b.rule.join(",")) ||
      a.content.localeCompare(b.content),
  )
}

/**
 * disable-comments.json's exact on-disk serialization -- always the same formatting for the same
 * records, so a rerun with nothing to change never produces a diff.
 * @param records - The (already-sorted) records to serialize.
 * @returns The file contents to write, including a trailing newline.
 */
export function serializeRegistry(records: DisableCommentRegistry): string {
  return `${JSON.stringify(records, null, 2)}\n`
}
