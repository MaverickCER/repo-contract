import type { NetworkCapabilityKind } from "./evidence-types.js"
import {
  EXCEPTION_TYPES,
  isIso8601Timestamp,
  validateCanonicalIdentity,
} from "../shared/exception-record.js"
import type { ExceptionVerification } from "../shared/exception-record.js"

// Keyed by `NetworkCapabilityKind` so `evidence-types.ts` adding a new kind is a compile error
// here until this map is updated too -- a plain `readonly NetworkCapabilityKind[]` would still
// type-check while silently rejecting every waiver for the new kind.
const CAPABILITY_KIND_SET: Readonly<Record<NetworkCapabilityKind, true>> = {
  "restricted-module-import": true,
  "restricted-named-import": true,
  "restricted-global-usage": true,
  "dynamic-import-non-literal-specifier": true,
  "non-literal-preset-command": true,
  "unreviewed-preset-command": true,
}
const CAPABILITY_KINDS = Object.keys(CAPABILITY_KIND_SET) as readonly NetworkCapabilityKind[]

/**
 * One hand-maintained waiver for a single network-capability finding --
 * `.repo-contract/exceptions/security-network.json`'s own `exceptions` array element shape. A
 * bare `{ capability }` waiver is deliberately not expressible: `file` and `line` are required,
 * so a waiver can only ever suppress the one specific finding it was written for, never every
 * finding of that capability kind across `src/**` (see
 * specs/decisions/0007-no-network-surface.md's "default policy vs. reviewed waiver" amendment).
 */
export interface NetworkExceptionRecord {
  /** This record's own canonical addressing key -- must equal `deriveNetworkExceptionId(record)`; see `validateCanonicalIdentity` (`scripts/shared/exception-record.ts`). */
  readonly id: string
  readonly version: 1
  readonly capability: NetworkCapabilityKind
  readonly file: string
  readonly line: number
  readonly justification: string
  readonly alternatives: string
  readonly remediation: string
  readonly exceptionType: (typeof EXCEPTION_TYPES)[number]
  readonly verification?: ExceptionVerification
}

/**
 * This check's own `deriveId` for `validateCanonicalIdentity` -- deliberately identical in shape
 * to `checks/security-network.ts`'s own finding-match key (`` `${capability}:${file}:${line}` ``)
 * so a record's stored `id` is also its direct match key against a scan's real findings.
 * @param record - The record to derive a canonical id for.
 * @returns The record's canonical id, from its own embedded finding-identity fields.
 */
export function deriveNetworkExceptionId(record: NetworkExceptionRecord): string {
  return `${record.capability}:${record.file}:${String(record.line)}`
}

const VERIFICATION_METHODS = new Set(["mechanical-reverification", "independent-human-review"])

/**
 * Validates one candidate `verification` value, if present. `undefined` is always valid (a
 * not-yet-verified record). Both methods are accepted for a network-capability waiver:
 * `"mechanical-reverification"` re-runs the scanner scoped to the one file/line and confirms the
 * capability is genuinely unreachable/static-only; `"independent-human-review"` covers a
 * genuinely-reachable-but-tolerated capability. The `"validated-false-positive"` +
 * `"mechanical-reverification"` pairing rule from
 * specs/decisions/0013-reusable-exception-policy-helper.md is enforced here too.
 * @param value - The candidate `verification` value.
 * @param exceptionType - The record's own `exceptionType`, to enforce the pairing rule against.
 * @param index - This record's index in the registry array, for error messages.
 * @param errors - Accumulates every problem found.
 * @returns The validated `ExceptionVerification`, or `undefined` when `value` is `undefined` or any field failed validation.
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

  const errorsBefore = errors.length

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
  // cast that claims otherwise. (Accumulated errors already fail the whole registry either way.)
  return errors.length > errorsBefore ? undefined : (value as ExceptionVerification)
}

/**
 * Validates one candidate registry record's shape, and that its own `id` matches what
 * `deriveNetworkExceptionId` independently recomputes from its embedded finding-identity fields.
 * @param value - The candidate record.
 * @param index - This record's index in the registry array, for error messages.
 * @param errors - Accumulates every problem found.
 * @returns The validated record, or `undefined` if any field was invalid.
 */
function validateNetworkExceptionRecord(
  value: unknown,
  index: number,
  errors: string[],
): NetworkExceptionRecord | undefined {
  if (typeof value !== "object" || value === null) {
    errors.push(`exceptions[${String(index)}] must be an object.`)
    return undefined
  }

  const {
    id,
    version,
    capability,
    file,
    line,
    justification,
    alternatives,
    remediation,
    exceptionType,
    verification,
  } = value as Record<string, unknown>

  const stringFields: readonly [string, unknown][] = [
    ["id", id],
    ["file", file],
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

  const capabilityValid =
    typeof capability === "string" && (CAPABILITY_KINDS as readonly string[]).includes(capability)
  if (!capabilityValid) {
    errors.push(
      `exceptions[${String(index)}].capability must be one of ${CAPABILITY_KINDS.map((c) => `"${c}"`).join(", ")} (got ${JSON.stringify(capability)}).`,
    )
  }

  const lineValid = typeof line === "number" && Number.isInteger(line) && line > 0
  if (!lineValid) {
    errors.push(
      `exceptions[${String(index)}].line must be a positive integer (got ${JSON.stringify(line)}).`,
    )
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

  if (!allStringsValid || version !== 1 || !capabilityValid || !lineValid || !exceptionTypeValid) {
    return undefined
  }

  const record: NetworkExceptionRecord = {
    id: id as string,
    version: 1,
    capability: capability as NetworkCapabilityKind,
    file: file as string,
    line,
    justification: justification as string,
    alternatives: alternatives as string,
    remediation: remediation as string,
    exceptionType: exceptionType as (typeof EXCEPTION_TYPES)[number],
    ...(validatedVerification !== undefined ? { verification: validatedVerification } : {}),
  }

  const identity = validateCanonicalIdentity(record, deriveNetworkExceptionId)
  if (!identity.ok) {
    errors.push(`exceptions[${String(index)}]: ${identity.error}`)
    return undefined
  }

  return record
}

/**
 * Validates an untrusted parsed `exceptions` array against the security-network registry's
 * contract. Malformed input always fails the entire registry (every problem found, not just the
 * first) -- a bad record is never silently dropped while the rest are kept, matching
 * `scripts/security-socket/registry.ts`'s own convention.
 * @param value - The parsed (but otherwise untrusted) `exceptions` array value.
 * @returns Every valid record, or every validation error found.
 */
export function validateNetworkExceptionRegistry(
  value: unknown,
):
  | { readonly ok: true; readonly records: readonly NetworkExceptionRecord[] }
  | { readonly ok: false; readonly errors: readonly string[] } {
  if (!Array.isArray(value)) {
    return {
      ok: false,
      errors: ['security-network.json\'s "exceptions" field must be a JSON array.'],
    }
  }

  const errors: string[] = []
  const records: NetworkExceptionRecord[] = []
  const seenIds = new Set<string>()

  for (const [index, entry] of value.entries()) {
    const record = validateNetworkExceptionRecord(entry, index, errors)
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
