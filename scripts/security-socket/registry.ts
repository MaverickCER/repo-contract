import { EXCEPTION_TYPES } from "../shared/exception-record.js"
import type { ExceptionVerification } from "../shared/exception-record.js"

/** One hand-maintained waiver for a Socket alert -- `.repo-contract/exceptions/socket.json`'s own `exceptions` array element shape. */
export interface SocketExceptionRecord {
  /** This record's own canonical addressing key -- must equal `deriveSocketExceptionId(record)`; see `validateCanonicalIdentity` (`checks/shared/exception-record.ts`). */
  readonly id: string
  readonly version: 1
  readonly package: string
  readonly packageVersion: string
  readonly alertType: string
  readonly justification: string
  readonly alternatives: string
  readonly remediation: string
  readonly exceptionType: (typeof EXCEPTION_TYPES)[number]
  readonly verification?: ExceptionVerification
}

/**
 * This check's own `deriveId` for `validateCanonicalIdentity` -- deliberately identical in shape
 * to `NormalizedSocketAlert.id` (`scripts/security-socket/evidence-types.ts`'s
 * `` `${package}@${version}:${type}` ``) so a record's stored `id` is also its direct match key
 * against a scan's real alerts.
 * @param record - The record to derive a canonical id for.
 * @returns The record's canonical id, from its own embedded finding-identity fields.
 */
export function deriveSocketExceptionId(record: SocketExceptionRecord): string {
  return `${record.package}@${record.packageVersion}:${record.alertType}`
}

const VERIFICATION_METHODS = new Set(["mechanical-reverification", "independent-human-review"])

/**
 * Validates one candidate `verification` value, if present. `undefined` is always valid (a
 * not-yet-verified record). Enforces the `"validated-false-positive"` + `mechanical-
 * reverification` pairing rule from specs/decisions/0013-reusable-exception-policy-helper.md: a
 * false-positive claim must be backed by re-running the tool that raised it, never opinion alone.
 * @param value - The candidate `verification` value.
 * @param exceptionType - The record's own `exceptionType`, to enforce the pairing rule against.
 * @param index - This record's index in the registry array, for error messages.
 * @param errors - Accumulates every problem found.
 * @returns The validated `ExceptionVerification`, or `undefined` if `value` itself was `undefined` and no error was pushed.
 */
function validateVerification(
  value: unknown,
  exceptionType: string,
  index: number,
  errors: string[],
): ExceptionVerification | undefined {
  if (value === undefined) return undefined

  if (typeof value !== "object" || value === null) {
    errors.push(`exceptions[${String(index)}].verification must be an object.`)
    return undefined
  }

  const { method, verifiedBy, verifiedAt, verifiedContentHash, evidence } = value as Record<
    string,
    unknown
  >

  if (typeof method !== "string" || !VERIFICATION_METHODS.has(method)) {
    errors.push(
      `exceptions[${String(index)}].verification.method must be one of ${[...VERIFICATION_METHODS].map((m) => `"${m}"`).join(", ")} (got ${JSON.stringify(method)}).`,
    )
  } else if (
    exceptionType === "validated-false-positive" &&
    method !== "mechanical-reverification"
  ) {
    errors.push(
      `exceptions[${String(index)}]: exceptionType "validated-false-positive" requires verification.method "mechanical-reverification" (a false-positive claim must be re-checked against the tool that raised it, not approved by opinion alone) -- got ${JSON.stringify(method)}.`,
    )
  }

  if (typeof verifiedBy !== "string" || verifiedBy.length === 0) {
    errors.push(`exceptions[${String(index)}].verification.verifiedBy must be a non-empty string.`)
  }
  if (typeof verifiedAt !== "string" || verifiedAt.length === 0) {
    errors.push(`exceptions[${String(index)}].verification.verifiedAt must be a non-empty string.`)
  }
  if (typeof verifiedContentHash !== "string" || verifiedContentHash.length === 0) {
    errors.push(
      `exceptions[${String(index)}].verification.verifiedContentHash must be a non-empty string.`,
    )
  }
  if (evidence !== undefined && typeof evidence !== "string") {
    errors.push(`exceptions[${String(index)}].verification.evidence must be a string, if present.`)
  }

  return value as ExceptionVerification
}

/**
 * Validates one candidate registry record's shape, and that its own `id` matches what
 * `deriveSocketExceptionId` independently recomputes from its embedded finding-identity fields.
 * @param value - The candidate record.
 * @param index - This record's index in the registry array, for error messages.
 * @param errors - Accumulates every problem found.
 * @returns The validated record, or `undefined` if any field was invalid.
 */
function validateSocketExceptionRecord(
  value: unknown,
  index: number,
  errors: string[],
): SocketExceptionRecord | undefined {
  if (typeof value !== "object" || value === null) {
    errors.push(`exceptions[${String(index)}] must be an object.`)
    return undefined
  }

  const {
    id,
    version,
    package: packageName,
    packageVersion,
    alertType,
    justification,
    alternatives,
    remediation,
    exceptionType,
    verification,
  } = value as Record<string, unknown>

  const stringFields: readonly [string, unknown][] = [
    ["id", id],
    ["package", packageName],
    ["packageVersion", packageVersion],
    ["alertType", alertType],
    ["justification", justification],
    ["alternatives", alternatives],
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

  const exceptionTypeValid =
    typeof exceptionType === "string" &&
    (EXCEPTION_TYPES as readonly string[]).includes(exceptionType)
  if (!exceptionTypeValid) {
    errors.push(
      `exceptions[${String(index)}].exceptionType must be one of ${EXCEPTION_TYPES.map((t) => `"${t}"`).join(", ")} (got ${JSON.stringify(exceptionType)}).`,
    )
  }

  const validatedVerification = validateVerification(
    verification,
    exceptionTypeValid ? exceptionType : "",
    index,
    errors,
  )

  if (!allStringsValid || version !== 1 || !exceptionTypeValid) return undefined

  const record: SocketExceptionRecord = {
    id: id as string,
    version: 1,
    package: packageName as string,
    packageVersion: packageVersion as string,
    alertType: alertType as string,
    justification: justification as string,
    alternatives: alternatives as string,
    remediation: remediation as string,
    exceptionType: exceptionType as (typeof EXCEPTION_TYPES)[number],
    ...(validatedVerification !== undefined ? { verification: validatedVerification } : {}),
  }

  const derivedId = deriveSocketExceptionId(record)
  if (derivedId !== record.id) {
    errors.push(
      `exceptions[${String(index)}].id ${JSON.stringify(record.id)} does not match its own derived identity ${JSON.stringify(derivedId)} (package@packageVersion:alertType).`,
    )
    return undefined
  }

  return record
}

/**
 * Validates an untrusted parsed `exceptions` array against the socket registry's contract.
 * Malformed input always fails the entire registry (every problem found, not just the first) --
 * a bad record is never silently dropped while the rest are kept, matching
 * `scripts/suppression-governance/registry.ts`'s own convention.
 * @param value - The parsed (but otherwise untrusted) `exceptions` array value.
 * @returns Every valid record, or every validation error found.
 */
export function validateSocketExceptionRegistry(
  value: unknown,
):
  | { readonly ok: true; readonly records: readonly SocketExceptionRecord[] }
  | { readonly ok: false; readonly errors: readonly string[] } {
  if (!Array.isArray(value)) {
    return { ok: false, errors: ['socket.json\'s "exceptions" field must be a JSON array.'] }
  }

  const errors: string[] = []
  const records: SocketExceptionRecord[] = []
  const seenIds = new Set<string>()

  for (const [index, entry] of value.entries()) {
    const record = validateSocketExceptionRecord(entry, index, errors)
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
