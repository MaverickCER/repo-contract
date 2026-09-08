import type { ExceptionRecordCore } from "../../src/helpers/index.js"

/**
 * The small, closed vocabulary of *why* an exception is legitimate -- deliberately short, and
 * owned here in `scripts/shared/` (unpublished), never in `src/helpers/**` (published): the
 * generic core has no opinion about a consumer's own classification of "why", only about which
 * named fields must be non-empty (see `src/helpers/exception-policy.ts`'s `ExceptionPolicy`). A
 * ~150-term cross-organization taxonomy (privacy, SRE, compliance, cost, etc.) was considered and
 * rejected for this repository's actual scale -- see specs/decisions/0013-reusable-exception-policy-helper.md
 * for the reasoning. Each retrofitted check may narrow which members apply to it (e.g. a
 * dependency-advisory check excluding `"validated-false-positive"`, since an advisory either
 * applies to the installed version or it doesn't -- there is no "false positive" reading of an
 * advisory the way there is for a static-analysis finding).
 *
 * - `"validated-false-positive"`: the finding does not actually apply here. Only satisfiable
 *   alongside `method: "mechanical-reverification"` -- re-running the same tool that raised the
 *   finding, scoped narrowly, and confirming it no longer fires. Never satisfiable by opinion
 *   alone.
 * - `"accepted-risk"`: the finding is real, and is knowingly tolerated.
 * - `"compensating-control"`: a different, already-in-place mitigation covers the same risk.
 * - `"tooling-limitation"`: the finding is an artifact of the scanning tool itself (e.g. a known
 *   upstream false-positive pattern), not of this codebase's own behavior.
 * - `"scheduled-remediation"`: the fix is planned and tracked, not yet landed.
 * - `"platform-or-vendor-constraint"`: the finding cannot be resolved without a change outside
 *   this repository's own control (an upstream dependency, a platform API).
 */
export const EXCEPTION_TYPES = [
  "validated-false-positive",
  "accepted-risk",
  "compensating-control",
  "tooling-limitation",
  "scheduled-remediation",
  "platform-or-vendor-constraint",
] as const

export type ExceptionType = (typeof EXCEPTION_TYPES)[number]

/**
 * How an exception's claim was substantiated -- a required root field on every security-family
 * exception record (security-network, security-socket, coderabbitai).
 *
 * - `"mechanical-reverification"`: real, tool-backed evidence -- the same tool that raised the
 *   finding, re-run narrowly, confirms it no longer applies (or applies differently than claimed).
 *   The only method that can back `exceptionType: "validated-false-positive"`.
 * - `"independent-human-review"`: a human's own accountable judgment call -- covers everything
 *   mechanical re-verification cannot reach (an accepted-risk decision, an AI-authored finding
 *   with no more-authoritative oracle to re-run against). repo-contract enforces that this field
 *   is a recognized value and non-empty; it does not verify that a human actually reviewed
 *   anything -- that is a GitHub branch-protection / CODEOWNERS concern (ADR 0011's
 *   "don't own ambient platform capabilities you don't need" posture), and is why the
 *   deferred `exception-governance` PR-approval gate exists.
 */
export const EXCEPTION_METHODS = ["mechanical-reverification", "independent-human-review"] as const

export type ExceptionMethod = (typeof EXCEPTION_METHODS)[number]

/**
 * The four root fields every security-family exception record carries on top of the shared core
 * (`id`/`version`/`justification`). Each is strictly defined so a reviewer knows exactly what
 * question it answers, and a stub scaffolded for a new finding starts every one of them empty
 * (`""` -- valid registry data, only policy-insufficient).
 *
 * - `alternatives` -- what *other* approaches were considered instead of waiving this finding, and
 *   why each was rejected. Not "there is no alternative"; the specific options weighed.
 * - `remediation` -- what has actually been attempted, or is concretely planned and tracked, to
 *   remove the need for this waiver, and its current status.
 * - `method` -- an `EXCEPTION_METHODS` member: how the waiver's own claim was substantiated.
 * - `exceptionType` -- an `EXCEPTION_TYPES` member: what *kind* of waiver this is.
 */
export interface SecurityExceptionFields {
  readonly alternatives: string
  readonly remediation: string
  readonly method: "" | ExceptionMethod
  readonly exceptionType: "" | ExceptionType
}

/** The four `SecurityExceptionFields` key names, in canonical order -- every security-registry schema lists these among its `metadataKeys`. */
export const SECURITY_EXCEPTION_FIELD_KEYS = [
  "alternatives",
  "remediation",
  "method",
  "exceptionType",
] as const

/**
 * Validates the four `SecurityExceptionFields` on a candidate record: each a string; `method` and
 * `exceptionType` each either `""` or a recognized member (of `EXCEPTION_METHODS` /
 * `allowedExceptionTypes`); and the cross-field refinement that a `"validated-false-positive"`
 * claim, once its `method` is filled in at all, must be `"mechanical-reverification"` (a
 * false-positive claim rests on a re-run, never opinion). An all-empty stub passes -- completeness
 * is the policy's concern, not the validator's.
 * @param raw - The untrusted parsed record object.
 * @param index - The record's index in the registry array, for error messages.
 * @param allowedExceptionTypes - This registry's permitted `exceptionType` values (coderabbit excludes `"validated-false-positive"`).
 * @param errors - Accumulates every validation problem found.
 * @returns The four validated fields, or `undefined` if any was invalid.
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

  const methodValid =
    method === "" ||
    (typeof method === "string" && (EXCEPTION_METHODS as readonly string[]).includes(method))
  if (!methodValid) {
    errors.push(
      `${at}.method must be "" or one of ${EXCEPTION_METHODS.map((m) => JSON.stringify(m)).join(", ")} (got ${JSON.stringify(method)}).`,
    )
  }

  const exceptionTypeValid =
    exceptionType === "" ||
    (typeof exceptionType === "string" &&
      (allowedExceptionTypes as readonly string[]).includes(exceptionType))
  if (!exceptionTypeValid) {
    errors.push(
      `${at}.exceptionType must be "" or one of ${allowedExceptionTypes.map((t) => JSON.stringify(t)).join(", ")} (got ${JSON.stringify(exceptionType)}).`,
    )
  }

  if (!alternativesValid || !remediationValid || !methodValid || !exceptionTypeValid) {
    return undefined
  }

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
 * Whether `value` is a non-null, non-array object.
 * @param value - The candidate value.
 * @returns `true` if `value` is a plain object.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * A per-registry validator plugged into `validateExceptionRegistry` -- it owns everything about
 * one registry's own record shape beyond the three-field core (`id`/`version`/`justification`)
 * every `.repo-contract/exceptions/*.json` record shares. `validateExceptionRegistry` handles the
 * core, the id namespace, unknown-field rejection, and id uniqueness; this fills in the rest.
 */
export interface ExceptionRegistrySchema<TRecord extends { readonly id: string }> {
  /** The mandatory `id` prefix for this registry, e.g. `"suppression:"`. A record whose id does not start with it is a namespace (integrity) failure, never a "stale" record. */
  readonly namespace: string
  /** Every own key a record of this registry may carry *beyond* the core `id`/`version`/`justification`. Any other own key fails validation -- canonical serialization can then never silently drop a hand-added field. */
  readonly metadataKeys: readonly string[]
  /**
   * Validates `raw`'s registry-specific fields on top of the already-validated `core`, and rebuilds
   * the full typed record from scratch (never spreads `raw`). Pushes one message per problem onto
   * `errors` and returns `undefined` when any field is invalid.
   * @param core - The already-validated `id`/`version`/`justification`.
   * @param raw - The untrusted parsed object (all keys already confirmed to be in `metadataKeys` plus the core three).
   * @param index - The record's index in the registry array, for error messages.
   * @param errors - Accumulates every validation problem found across the whole registry.
   * @returns The freshly-rebuilt typed record, or `undefined` if any field was invalid.
   */
  readonly validateRecord: (
    core: ExceptionRecordCore,
    raw: Readonly<Record<string, unknown>>,
    index: number,
    errors: string[],
  ) => TRecord | undefined
}

/**
 * Validates one candidate record's core (`id`/`version`/`justification`) and its id namespace,
 * rejects any unknown own key, then delegates the registry-specific fields to `schema`.
 * @param entry - The untrusted parsed value.
 * @param index - The record's index in the registry array, for error messages.
 * @param schema - The per-registry schema.
 * @param errors - Accumulates every validation problem found.
 * @returns The freshly-rebuilt typed record, or `undefined` if invalid.
 */
function validateOneExceptionRecord<TRecord extends { readonly id: string }>(
  entry: unknown,
  index: number,
  schema: ExceptionRegistrySchema<TRecord>,
  errors: string[],
): TRecord | undefined {
  if (!isPlainObject(entry)) {
    errors.push(`exceptions[${String(index)}] must be an object.`)
    return undefined
  }

  const allowedKeys = new Set<string>(["id", "version", "justification", ...schema.metadataKeys])
  const unknownKeys = Object.keys(entry).filter((key) => !allowedKeys.has(key))
  if (unknownKeys.length > 0) {
    errors.push(
      `exceptions[${String(index)}] has unrecognized field(s) ${unknownKeys.map((key) => JSON.stringify(key)).join(", ")} -- only ${[...allowedKeys].map((key) => JSON.stringify(key)).join(", ")} are permitted.`,
    )
  }

  const { id, version, justification } = entry

  const idValid =
    typeof id === "string" && id.startsWith(schema.namespace) && id.length > schema.namespace.length
  if (!idValid) {
    errors.push(
      `exceptions[${String(index)}].id must be a non-empty string beginning with ${JSON.stringify(schema.namespace)} (got ${JSON.stringify(id)}).`,
    )
  }

  const versionValid = version === 1
  if (!versionValid) {
    errors.push(
      `exceptions[${String(index)}].version must be the number 1 (got ${JSON.stringify(version)}).`,
    )
  }

  const justificationValid = typeof justification === "string"
  if (!justificationValid) {
    errors.push(`exceptions[${String(index)}].justification must be a string.`)
  }

  if (!idValid || !versionValid || !justificationValid || unknownKeys.length > 0) {
    return undefined
  }

  return schema.validateRecord({ id, version: 1, justification }, entry, index, errors)
}

/**
 * Validates an untrusted parsed value as one exception registry's `exceptions` array against
 * `schema` -- the one generic validator every `.repo-contract/exceptions/*.json` registry shares.
 * Owns the three-field core (`id` non-empty and correctly namespaced, `version` the number `1`,
 * `justification` a string -- an *empty* justification is valid registry data, only
 * policy-insufficient), unknown-own-key rejection, and id uniqueness across the whole array;
 * `schema.validateRecord` owns everything registry-specific. Every problem found is reported
 * (`ok: false` with the full list, never just the first); a single bad record fails the whole
 * registry rather than being silently dropped.
 * @param value - The parsed (otherwise untrusted) value -- expected to be an array of record objects.
 * @param schema - The per-registry schema (namespace, permitted metadata keys, field validator).
 * @returns Every valid, freshly-rebuilt record, or every validation error found.
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
 * Widens an array of typed exception records to the flat `Record<string, unknown> & { id }` shape
 * `serializeExceptionRegistry`/`writeExceptionRegistry` (`repo-contract/helpers`) accept. A typed
 * record is structurally exactly that (flat, string `id`); TypeScript will not infer the implicit
 * index signature through an `interface`, so this one narrow assertion lives here rather than being
 * repeated at each check's write call.
 * @param records - The typed records to widen. Each must carry a string `id`.
 * @returns The same array, typed as flat string-keyed records.
 */
export function asFlatExceptionRecords(
  records: readonly { readonly id: string }[],
): readonly (Record<string, unknown> & { readonly id: string })[] {
  return records
}
