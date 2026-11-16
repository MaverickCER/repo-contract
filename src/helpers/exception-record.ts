import { notImplemented } from "../not-implemented.js"
import type { StandardSchemaV1 } from "../standard-schema/types.js"
import type {
  ExceptionClassification,
  ExceptionPolicy,
  ExceptionPolicyConfig,
} from "./exception-policy.js"
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
  return notImplemented("R2x")
}

/**
 * @param record - a record of either version.
 * @param record.version - `1` or `2`.
 * @returns whether it is a legacy `version: 1` record.
 */
export function isLegacyRecord(record: { readonly version: 1 | 2 }): boolean {
  return notImplemented("R2x", record)
}

/**
 * @param expires - a record's `expires` (`""` never expires).
 * @param now - the clock to compare against.
 * @returns `true` only for a valid date strictly before `now`'s date.
 */
export function isExpired(expires: string, now: Date = new Date()): boolean {
  return notImplemented("R2x", expires, now)
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
  return notImplemented("R2x", value, schema)
}

/**
 * Wraps {@link validateExceptionRegistry} as the Standard Schema `loadExceptionRegistry` takes.
 * @param schema - the registry's schema.
 * @returns a Standard Schema whose output is the validated records.
 */
export function exceptionRegistryStandardSchema<TRecord extends { readonly id: string }>(
  schema: ExceptionRegistrySchema<TRecord>,
): StandardSchemaV1<unknown, readonly TRecord[]> {
  return notImplemented("R2x", schema)
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
  return notImplemented("R2x", raw, index, allowedExceptionTypes, errors)
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
  return notImplemented("R2x", value, at, errors)
}

/**
 * The `fieldValue` accessor `evaluateExceptionRecord` takes. A legacy record answers
 * {@link LEGACY_FIELD_VALUE} for a v2 field.
 * @param record - a flat record.
 * @param requirement - the field name.
 * @returns the field's text, or `""`.
 */
export function recordFieldValue(record: unknown, requirement: string): string {
  return notImplemented("R2x", record, requirement)
}

/**
 * Widens typed records to the flat shape `writeExceptionRegistry` takes.
 * @param records - typed records.
 * @returns the same array, typed as flat records.
 */
export function asFlatExceptionRecords(
  records: readonly { readonly id: string }[],
): readonly (Record<string, unknown> & { readonly id: string })[] {
  return notImplemented("R2x", records)
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
  return notImplemented("R2x", record, classifications, config, globalDefault)
}
