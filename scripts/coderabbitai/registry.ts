import {
  EXCEPTION_TYPES,
  isIso8601Timestamp,
  validateCanonicalIdentity,
} from "../shared/exception-record.js"
import type { ExceptionVerification } from "../shared/exception-record.js"

/**
 * `"validated-false-positive"` is excluded from a CodeRabbit exception's own allowed set --
 * unlike a deterministic scanner (secretlint, the network-capability scan, Socket), there is no
 * more-authoritative tool to mechanically re-run against an AI-generated finding to confirm it
 * "doesn't actually apply" the way `mechanical-reverification` requires elsewhere (see
 * specs/decisions/0013-reusable-exception-policy-helper.md's "Verification, not attestation").
 * A CodeRabbit finding judged incorrect is still only ever dismissed via `"accepted-risk"` /
 * `"tooling-limitation"` / etc., backed by `independent-human-review` -- a human's own accountable
 * judgment call, not a claim that no mechanical process exists to substantiate.
 */
/** `EXCEPTION_TYPES` minus `"validated-false-positive"` -- named so `CoderabbitExceptionRecord.exceptionType` below is statically narrowed to it, not just filtered from it at runtime (a hand-constructed record could otherwise still type-check with the excluded member, even though `validateCoderabbitExceptionRecord` would reject it before ever returning one). */
export type CoderabbitExceptionType = Exclude<
  (typeof EXCEPTION_TYPES)[number],
  "validated-false-positive"
>

export const CODERABBIT_EXCEPTION_TYPES: readonly CoderabbitExceptionType[] =
  EXCEPTION_TYPES.filter(
    (type): type is CoderabbitExceptionType => type !== "validated-false-positive",
  )

/** One hand-maintained waiver for a CodeRabbit finding -- `.repo-contract/exceptions/coderabbit.json`'s own `exceptions` array element shape. */
export interface CoderabbitExceptionRecord {
  /** This record's own canonical addressing key -- must equal `deriveCoderabbitExceptionId(record)`. */
  readonly id: string
  readonly version: 1
  readonly file: string
  readonly severity: "critical" | "major" | "minor" | "unknown"
  readonly justification: string
  readonly remediation: string
  readonly exceptionType: CoderabbitExceptionType
  readonly verification?: ExceptionVerification
}

/**
 * This check's own `deriveId` -- deliberately identical in shape to `NormalizedFinding.identity`
 * (`` `${file}:${severity}` ``, see `scripts/coderabbitai/evidence-types.ts`'s own doc comment on
 * why this is deliberately coarse) so a record's stored `id` is also its direct match key against
 * a review's real findings.
 * @param record - The record to derive a canonical id for.
 * @returns The record's canonical id, from its own embedded finding-identity fields.
 */
export function deriveCoderabbitExceptionId(record: CoderabbitExceptionRecord): string {
  return `${record.file}:${record.severity}`
}

const VERIFICATION_METHODS = new Set(["mechanical-reverification", "independent-human-review"])

/**
 * Validates one candidate `verification` value, if present. `undefined` is always valid (a
 * not-yet-verified record). Every CodeRabbit exception's verification must be
 * `"independent-human-review"` -- `"mechanical-reverification"` is rejected outright here (see
 * this module's own doc comment on `CODERABBIT_EXCEPTION_TYPES`): there is no tool this check
 * could re-run to mechanically substantiate dismissing an AI-generated finding.
 * @param value - The candidate `verification` value.
 * @param index - This record's index in the registry array, for error messages.
 * @param errors - Accumulates every problem found.
 * @returns The validated `ExceptionVerification`, or `undefined` when `value` is `undefined` or any field failed validation.
 */
function validateVerification(
  value: unknown,
  index: number,
  errors: string[],
): ExceptionVerification | undefined {
  if (value === undefined) return undefined

  if (typeof value !== "object" || value === null) {
    errors.push(`exceptions[${String(index)}].verification must be an object.`)
    return undefined
  }

  const errorsBefore = errors.length

  const { method, verifiedBy, verifiedAt, verifiedContentHash, evidence } = value as Record<
    string,
    unknown
  >

  if (typeof method !== "string" || !VERIFICATION_METHODS.has(method)) {
    errors.push(
      `exceptions[${String(index)}].verification.method must be one of ${[...VERIFICATION_METHODS].map((m) => `"${m}"`).join(", ")} (got ${JSON.stringify(method)}).`,
    )
  } else if (method !== "independent-human-review") {
    errors.push(
      `exceptions[${String(index)}]: a CodeRabbit exception's verification.method must be "independent-human-review" -- there is no tool this check can mechanically re-run to substantiate dismissing an AI-generated finding (got ${JSON.stringify(method)}).`,
    )
  }

  if (typeof verifiedBy !== "string" || verifiedBy.length === 0) {
    errors.push(`exceptions[${String(index)}].verification.verifiedBy must be a non-empty string.`)
  }
  if (typeof verifiedAt !== "string" || !isIso8601Timestamp(verifiedAt)) {
    errors.push(
      `exceptions[${String(index)}].verification.verifiedAt must be an ISO 8601 date or date-time (got ${JSON.stringify(verifiedAt)}).`,
    )
  }
  if (typeof verifiedContentHash !== "string" || verifiedContentHash.length === 0) {
    errors.push(
      `exceptions[${String(index)}].verification.verifiedContentHash must be a non-empty string.`,
    )
  }
  if (evidence !== undefined && typeof evidence !== "string") {
    errors.push(`exceptions[${String(index)}].verification.evidence must be a string, if present.`)
  }

  // If any check above pushed an error, this block is invalid -- return `undefined` rather than a
  // cast that claims otherwise. (Accumulated errors already fail the whole registry, so no
  // invalid record reaches a consumer either way; this just keeps the return type honest.)
  return errors.length > errorsBefore ? undefined : (value as ExceptionVerification)
}

const SEVERITY_VALUES = new Set(["critical", "major", "minor", "unknown"])

/**
 * Validates one candidate registry record's shape, and that its own `id` matches what
 * `deriveCoderabbitExceptionId` independently recomputes from its embedded finding-identity fields.
 * @param value - The candidate record.
 * @param index - This record's index in the registry array, for error messages.
 * @param errors - Accumulates every problem found.
 * @returns The validated record, or `undefined` if any field was invalid.
 */
function validateCoderabbitExceptionRecord(
  value: unknown,
  index: number,
  errors: string[],
): CoderabbitExceptionRecord | undefined {
  if (typeof value !== "object" || value === null) {
    errors.push(`exceptions[${String(index)}] must be an object.`)
    return undefined
  }

  const { id, version, file, severity, justification, remediation, exceptionType, verification } =
    value as Record<string, unknown>

  const stringFields: readonly [string, unknown][] = [
    ["id", id],
    ["file", file],
    ["justification", justification],
    ["remediation", remediation],
  ]
  let allStringsValid = true
  for (const [field, fieldValue] of stringFields) {
    if (typeof fieldValue !== "string") {
      errors.push(`exceptions[${String(index)}].${field} must be a string.`)
      allStringsValid = false
    }
  }

  if (version !== 1) {
    errors.push(`exceptions[${String(index)}].version must be 1 (got ${JSON.stringify(version)}).`)
  }

  const severityValid = typeof severity === "string" && SEVERITY_VALUES.has(severity)
  if (!severityValid) {
    errors.push(
      `exceptions[${String(index)}].severity must be one of ${[...SEVERITY_VALUES].map((s) => `"${s}"`).join(", ")} (got ${JSON.stringify(severity)}).`,
    )
  }

  const exceptionTypeValid =
    typeof exceptionType === "string" &&
    (CODERABBIT_EXCEPTION_TYPES as readonly string[]).includes(exceptionType)
  if (!exceptionTypeValid) {
    errors.push(
      `exceptions[${String(index)}].exceptionType must be one of ${CODERABBIT_EXCEPTION_TYPES.map((t) => `"${t}"`).join(", ")} (got ${JSON.stringify(exceptionType)}).`,
    )
  }

  const validatedVerification = validateVerification(verification, index, errors)

  if (!allStringsValid || version !== 1 || !severityValid || !exceptionTypeValid) return undefined

  const record: CoderabbitExceptionRecord = {
    id: id as string,
    version: 1,
    file: file as string,
    severity: severity as CoderabbitExceptionRecord["severity"],
    justification: justification as string,
    remediation: remediation as string,
    exceptionType: exceptionType as CoderabbitExceptionType,
    ...(validatedVerification !== undefined ? { verification: validatedVerification } : {}),
  }

  const identity = validateCanonicalIdentity(record, deriveCoderabbitExceptionId)
  if (!identity.ok) {
    errors.push(`exceptions[${String(index)}]: ${identity.error}`)
    return undefined
  }

  return record
}

/**
 * Validates an untrusted parsed `exceptions` array against the coderabbit registry's contract.
 * Malformed input always fails the entire registry (every problem found, not just the first) --
 * a bad record is never silently dropped while the rest are kept, matching
 * `scripts/security-socket/registry.ts`'s (and, before it, `scripts/suppression-governance/
 * registry.ts`'s) own convention.
 * @param value - The parsed (but otherwise untrusted) `exceptions` array value.
 * @returns Every valid record, or every validation error found.
 */
export function validateCoderabbitExceptionRegistry(
  value: unknown,
):
  | { readonly ok: true; readonly records: readonly CoderabbitExceptionRecord[] }
  | { readonly ok: false; readonly errors: readonly string[] } {
  if (!Array.isArray(value)) {
    return { ok: false, errors: ['coderabbit.json\'s "exceptions" field must be a JSON array.'] }
  }

  const errors: string[] = []
  const records: CoderabbitExceptionRecord[] = []
  const seenIds = new Set<string>()

  for (const [index, entry] of value.entries()) {
    const record = validateCoderabbitExceptionRecord(entry, index, errors)
    if (record === undefined) continue
    if (seenIds.has(record.id)) {
      errors.push(
        `exceptions[${String(index)}].id ${JSON.stringify(record.id)} duplicates an earlier record.`,
      )
      continue
    }
    seenIds.add(record.id)
    records.push(record)
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, records }
}
