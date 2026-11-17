/**
 * The v2 exception record every `.repo-contract/exceptions/*.json` registry shares, and its
 * vocabulary: eight exception types and three methods. A check plugs its own record shape in
 * through an {@link ExceptionRegistrySchema}; this module owns the core, the v2 fields and the
 * security fields.
 *
 * A registry fails to load on an unknown key, an id outside its namespace, a duplicate id, a wrong
 * version or a malformed field. A blank field loads: completeness is each check's policy, so a
 * fresh stub loads and then fails as incomplete. A `version: 1` record still loads, so a registry
 * can migrate one record at a time.
 */
import type { StandardSchemaV1 } from "../standard-schema/types.js"
import type {
  ExceptionClassification,
  ExceptionPolicy,
  ExceptionPolicyConfig,
} from "./exception-policy.js"
import { evaluateExceptionRecord } from "./exception-policy.js"
import type { ExceptionRecordCore } from "./reconcile-exceptions.js"

/**
 * A per-registry validator plugged into {@link validateExceptionRegistry}. It owns one registry's
 * record shape beyond the core every `.repo-contract/exceptions/*.json` record shares.
 */
export interface ExceptionRegistrySchema<TRecord extends { readonly id: string }> {
  /** The mandatory `id` prefix, such as `"mutation:"`. A record outside it fails validation; it is never called stale. */
  readonly namespace: string
  /** Every own key a record may carry beyond `id`, `version` and `justification`. Any other key fails validation. */
  readonly metadataKeys: readonly string[]
  /**
   * Validates the registry's own fields and rebuilds the typed record from scratch.
   * @param core - the validated `id`, `version` and `justification`.
   * @param raw - the untrusted parsed object.
   * @param index - the record's index, for messages.
   * @param errors - collects one message per problem.
   * @returns the rebuilt record, or `undefined` when a field is invalid.
   */
  readonly validateRecord: (
    core: ExceptionRecordCore,
    raw: Readonly<Record<string, unknown>>,
    index: number,
    errors: string[],
  ) => TRecord | undefined
}

/** The six text fields a `version: 2` record adds. With `expires`, they make an exception auditable. */
export const EXCEPTION_V2_FIELD_KEYS = [
  "ruleBroken",
  "attempted",
  "constraint",
  "whyPreferable",
  "residualRisk",
  "revisitWhen",
] as const

/** The fields of a `version: 2` record. Each is `""` on a fresh stub until a person writes it. */
export interface ExceptionV2Fields {
  readonly ruleBroken: string
  readonly attempted: string
  readonly constraint: string
  readonly whyPreferable: string
  readonly residualRisk: string
  readonly revisitWhen: string
  /** `YYYY-MM-DD`, or `""` for none. The key must be present. */
  readonly expires: string
}

/** A record of either version. A registry can migrate one record at a time. */
export interface VersionedExceptionRecord {
  readonly id: string
  readonly version: 1 | 2
}

/**
 * Why an exception is legitimate. A check may accept only some of them.
 * `required-for-package-to-exist` and `dev-only-not-shipped` came from internal-package-contract;
 * consumer registries already use them.
 */
export const EXCEPTION_TYPES = [
  "validated-false-positive",
  "accepted-risk",
  "compensating-control",
  "tooling-limitation",
  "scheduled-remediation",
  "platform-or-vendor-constraint",
  "required-for-package-to-exist",
  "dev-only-not-shipped",
] as const

export type ExceptionType = (typeof EXCEPTION_TYPES)[number]

/** How an exception's claim was substantiated. `validated-false-positive` needs `mechanical-reverification`. */
export const EXCEPTION_METHODS = [
  "mechanical-reverification",
  "independent-human-review",
  "policy-rule",
] as const

export type ExceptionMethod = (typeof EXCEPTION_METHODS)[number]

/** The four fields a security-family record adds. Each is `""` on a fresh stub. */
export interface SecurityExceptionFields {
  readonly alternatives: string
  readonly remediation: string
  readonly method: "" | ExceptionMethod
  readonly exceptionType: "" | ExceptionType
}

/** The {@link SecurityExceptionFields} keys, in canonical order, for a schema's `metadataKeys`. */
export const SECURITY_EXCEPTION_FIELD_KEYS = [
  "alternatives",
  "remediation",
  "method",
  "exceptionType",
] as const

/** What a `version: 1` record answers for a v2 field it never had. Non-empty, so the record still passes. */
export const LEGACY_FIELD_VALUE = "(legacy version 1 record)"

/**
 * @returns every v2 field blank: what a new stub starts with.
 */
export function emptyV2Fields(): ExceptionV2Fields {
  return {
    ruleBroken: "",
    attempted: "",
    constraint: "",
    whyPreferable: "",
    residualRisk: "",
    revisitWhen: "",
    expires: "",
  }
}

/**
 * @param record - a record of either version.
 * @param record.version - `1` or `2`.
 * @returns whether it is a legacy `version: 1` record.
 */
export function isLegacyRecord(record: { readonly version: 1 | 2 }): boolean {
  return record.version === 1
}

const EXCEPTION_V2_ALL_KEYS = [...EXCEPTION_V2_FIELD_KEYS, "expires"] as const

/**
 * @param value - an `expires` value, untrusted.
 * @returns whether `value` is a string holding a real calendar date written `YYYY-MM-DD`, so
 * `2027-02-30` is not. Only such a string equals the first ten characters of its own date's ISO
 * form, so that one comparison checks the type, the shape and the date.
 */
function isCalendarDate(value: unknown): value is string {
  const date = new Date(`${String(value)}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/**
 * @param expires - a record's `expires` (`""` never expires), untrusted.
 * @param now - the clock to compare against.
 * @returns `true` only for a valid date strictly before `now`'s date.
 */
export function isExpired(expires: unknown, now: Date = new Date()): boolean {
  // `YYYY-MM-DD` strings sort as dates, so a string comparison is a date comparison.
  return isCalendarDate(expires) && expires < now.toISOString().slice(0, 10)
}

/**
 * @param value - a candidate value.
 * @returns whether it is a non-`null`, non-array object.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * @param entry - the untrusted record.
 * @param index - its position, for messages.
 * @param errors - collects one message per problem.
 * @returns the v2 fields, or `undefined` when one is missing or malformed.
 */
function validateV2Fields(
  entry: Readonly<Record<string, unknown>>,
  index: number,
  errors: string[],
): ExceptionV2Fields | undefined {
  const at = `exceptions[${String(index)}]`
  let ok = true
  for (const key of EXCEPTION_V2_FIELD_KEYS) {
    if (typeof entry[key] !== "string") {
      errors.push(`${at}.${key} must be a string (a version 2 record carries it).`)
      ok = false
    }
  }
  const { expires } = entry
  if (expires !== "" && !isCalendarDate(expires)) {
    errors.push(`${at}.expires must be "" or a YYYY-MM-DD date (got ${JSON.stringify(expires)}).`)
    ok = false
  }
  if (!ok) return undefined
  return Object.fromEntries(
    EXCEPTION_V2_ALL_KEYS.map((key) => [key, entry[key]]),
  ) as unknown as ExceptionV2Fields
}

/**
 * @param entry - the untrusted record.
 * @param index - its position, for messages.
 * @param schema - the registry's schema.
 * @param errors - collects one message per problem.
 * @returns the rebuilt record, or `undefined` when anything is invalid.
 */
function validateOneExceptionRecord<TRecord extends { readonly id: string }>(
  entry: unknown,
  index: number,
  schema: ExceptionRegistrySchema<TRecord>,
  errors: string[],
): TRecord | undefined {
  const at = `exceptions[${String(index)}]`
  if (!isPlainObject(entry)) {
    errors.push(`${at} must be an object.`)
    return undefined
  }

  const allowedKeys = new Set<string>(["id", "version", "justification", ...schema.metadataKeys])
  if (entry.version === 2) for (const key of EXCEPTION_V2_ALL_KEYS) allowedKeys.add(key)
  const unknownKeys = Object.keys(entry).filter((key) => !allowedKeys.has(key))
  if (unknownKeys.length > 0) {
    errors.push(
      `${at} has unrecognized field(s) ${unknownKeys.map((key) => JSON.stringify(key)).join(", ")}: only ${[...allowedKeys].map((key) => JSON.stringify(key)).join(", ")} are permitted.`,
    )
  }

  const { id, version, justification } = entry
  const idValid =
    typeof id === "string" && id.startsWith(schema.namespace) && id.length > schema.namespace.length
  if (!idValid) {
    errors.push(
      `${at}.id must be a non-empty string beginning with ${JSON.stringify(schema.namespace)} (got ${JSON.stringify(id)}).`,
    )
  }
  const versionValid = version === 1 || version === 2
  if (!versionValid) {
    errors.push(
      `${at}.version must be the number 2 (or the legacy 1) (got ${JSON.stringify(version)}).`,
    )
  }
  const justificationValid = typeof justification === "string"
  if (!justificationValid) errors.push(`${at}.justification must be a string.`)

  // The v2 fields are checked before any return, so one pass names every problem in the record.
  const v2 = version === 2 ? validateV2Fields(entry, index, errors) : undefined
  if (!idValid || !versionValid || !justificationValid || unknownKeys.length > 0) return undefined

  // The schema rebuilds at version 1, so a validator written before v2 keeps working unchanged.
  const record = schema.validateRecord({ id, version: 1, justification }, entry, index, errors)
  if (record === undefined || version === 1) return record
  if (v2 === undefined) return undefined
  return { ...record, version: 2, ...v2 }
}

/**
 * Validates an untrusted `exceptions` array: the core, the id namespace, unknown keys, duplicate
 * ids, the v2 fields of a `version: 2` record, then `schema.validateRecord`. Reports every
 * problem. A blank field is valid data; completeness is the check's policy.
 * @param value - the parsed `exceptions` value.
 * @param schema - the registry's schema.
 * @returns every rebuilt record, or every problem found.
 */
export function validateExceptionRegistry<TRecord extends { readonly id: string }>(
  value: unknown,
  schema: ExceptionRegistrySchema<TRecord>,
):
  | { readonly ok: true; readonly records: readonly TRecord[] }
  | { readonly ok: false; readonly errors: readonly string[] } {
  if (!Array.isArray(value)) {
    return {
      ok: false,
      errors: ['An exception registry\'s "exceptions" must be a JSON array of records.'],
    }
  }

  const errors: string[] = []
  const records: TRecord[] = []
  const seenIds = new Map<string, number>()
  for (const [index, entry] of value.entries()) {
    const record = validateOneExceptionRecord(entry, index, schema, errors)
    if (record === undefined) continue
    const firstIndex = seenIds.get(record.id)
    if (firstIndex !== undefined) {
      errors.push(
        `exceptions[${String(index)}] reuses the id ${JSON.stringify(record.id)} already held by exceptions[${String(firstIndex)}].`,
      )
      continue
    }
    seenIds.set(record.id, index)
    records.push(record)
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, records }
}

/**
 * Wraps {@link validateExceptionRegistry} as the Standard Schema `loadExceptionRegistry` takes.
 * @param schema - the registry's schema.
 * @returns a Standard Schema whose output is the validated records.
 */
export function exceptionRegistryStandardSchema<TRecord extends { readonly id: string }>(
  schema: ExceptionRegistrySchema<TRecord>,
): StandardSchemaV1<unknown, readonly TRecord[]> {
  return {
    "~standard": {
      version: 1,
      vendor: "repo-contract",
      validate: (value: unknown) => {
        const result = validateExceptionRegistry(value, schema)
        return result.ok
          ? { value: result.records }
          : { issues: result.errors.map((message) => ({ message })) }
      },
    },
  }
}

/**
 * Validates the four security fields. Each must be a string; `method` and `exceptionType` must be
 * `""` or a known member. A filled `validated-false-positive` needs `mechanical-reverification`.
 * @param raw - the untrusted record.
 * @param index - its index, for messages.
 * @param allowedExceptionTypes - the types this registry accepts.
 * @param errors - collects one message per problem.
 * @returns the four fields, or `undefined` when one is invalid.
 */
export function validateSecurityExceptionFields(
  raw: Readonly<Record<string, unknown>>,
  index: number,
  allowedExceptionTypes: readonly ExceptionType[],
  errors: string[],
): SecurityExceptionFields | undefined {
  const at = `exceptions[${String(index)}]`
  const { alternatives, remediation, method, exceptionType } = raw

  const alternativesValid = typeof alternatives === "string"
  if (!alternativesValid) errors.push(`${at}.alternatives must be a string.`)
  const remediationValid = typeof remediation === "string"
  if (!remediationValid) errors.push(`${at}.remediation must be a string.`)

  // `includes` uses SameValueZero, so a non-string never matches a member and needs no type guard.
  const methodValid = method === "" || (EXCEPTION_METHODS as readonly unknown[]).includes(method)
  if (!methodValid) {
    errors.push(
      `${at}.method must be "" or one of ${EXCEPTION_METHODS.map((m) => JSON.stringify(m)).join(", ")} (got ${JSON.stringify(method)}).`,
    )
  }
  const exceptionTypeValid =
    exceptionType === "" || (allowedExceptionTypes as readonly unknown[]).includes(exceptionType)
  if (!exceptionTypeValid) {
    errors.push(
      `${at}.exceptionType must be "" or one of ${allowedExceptionTypes.map((t) => JSON.stringify(t)).join(", ")} (got ${JSON.stringify(exceptionType)}).`,
    )
  }

  if (!alternativesValid || !remediationValid || !methodValid || !exceptionTypeValid) {
    return undefined
  }

  // A false-positive claim rests on re-running the tool. A blank method is an unfinished stub.
  if (
    exceptionType === "validated-false-positive" &&
    method !== "" &&
    method !== "mechanical-reverification"
  ) {
    errors.push(
      `${at}: exceptionType "validated-false-positive" requires method "mechanical-reverification" (a false-positive claim rests on a re-run, not opinion); got method ${JSON.stringify(method)}.`,
    )
    return undefined
  }

  return {
    alternatives,
    remediation,
    method: method as SecurityExceptionFields["method"],
    exceptionType: exceptionType as SecurityExceptionFields["exceptionType"],
  }
}

/**
 * @param value - a field value.
 * @param at - its path, for the message.
 * @param errors - collects `"<at> must be a non-empty string."`.
 * @returns whether `value` is a non-empty string.
 */
export function isValidNonEmptyStringField(
  value: unknown,
  at: string,
  errors: string[],
): value is string {
  const valid = typeof value === "string" && value.length > 0
  if (!valid) errors.push(`${at} must be a non-empty string.`)
  return valid
}

/**
 * The `fieldValue` accessor `evaluateExceptionRecord` takes. A legacy record answers
 * {@link LEGACY_FIELD_VALUE} for a v2 field.
 * @param record - a flat record.
 * @param requirement - the field name.
 * @returns the field's text, or `""`.
 */
export function recordFieldValue(record: unknown, requirement: string): string {
  if (!isPlainObject(record)) return ""
  const value = record[requirement]
  if (typeof value === "string") return value
  const isV2Field = (EXCEPTION_V2_FIELD_KEYS as readonly string[]).includes(requirement)
  return isV2Field && record.version === 1 ? LEGACY_FIELD_VALUE : ""
}

/**
 * Widens typed records to the flat shape `writeExceptionRegistry` takes.
 * @param records - typed records.
 * @returns the same array, typed as flat records.
 */
export function asFlatExceptionRecords(
  records: readonly { readonly id: string }[],
): readonly (Record<string, unknown> & { readonly id: string })[] {
  return records
}

/**
 * Judges one finding against its reconciled record. A missing record is `"unmatched"`.
 * @param record - the finding's record, or `undefined`.
 * @param classifications - the finding's classifications.
 * @param config - the check's policy config.
 * @param globalDefault - the check's fallback policy.
 * @returns the verdict and the fields still missing.
 */
export function evaluateFindingVerdict(
  record: unknown,
  classifications: readonly [ExceptionClassification, ...ExceptionClassification[]],
  config: ExceptionPolicyConfig,
  globalDefault: ExceptionPolicy,
): {
  readonly verdict: "forbidden" | "insufficient" | "permitted" | "unmatched"
  readonly missing: readonly string[]
} {
  if (record === undefined) return { verdict: "unmatched", missing: [] }
  const { verdict, missing } = evaluateExceptionRecord({
    record,
    classifications,
    config,
    globalDefault,
    fieldValue: recordFieldValue,
  })
  return { verdict, missing }
}
