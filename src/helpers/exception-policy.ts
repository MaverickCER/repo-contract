import { createHash } from "node:crypto"
import { globMatch } from "./glob-match.js"

/**
 * A resolved decision for one `{ group, category }` classification. `"forbidden"`: never
 * permitted, whatever the fields hold. `"allowed"`: permitted unconditionally; no field is
 * required. `"exception"`: permitted once every field named in `requirements` is a non-empty
 * (post-`.trim()`) string on the record (see `evaluateExceptionRecord`).
 *
 * It names fields instead of setting a numeric threshold. Generic filler entries satisfy a plain
 * count without the work the count was meant to prove. A named field can be reviewed against a
 * specific question. `scripts/suppression-governance/policy-config.ts`'s `SuppressionPolicy` uses
 * the same design for the disable-comment domain this type generalizes.
 * @public
 */
export type ExceptionPolicy =
  | { readonly mode: "forbidden" }
  | { readonly mode: "allowed" }
  | { readonly mode: "exception"; readonly requirements: readonly string[] }

/**
 * One classification group's policy. `default` is the group's fallback for any `category` with
 * no exact or glob match in `rules`. Omit `default` to fall through to the caller's
 * `globalDefault`. `resolveExceptionPolicy` documents the full precedence: exact, glob, group
 * default, global default. Each key of `rules` is an exact `category` string or a glob pattern.
 * An exact match always wins, so a glob never shadows a more specific exact entry.
 * @public
 */
export interface ExceptionCategoryGroup {
  /** This group's fallback policy when `category` matches neither an exact nor a glob key in `rules`. Falls through to the caller's `globalDefault` when omitted. */
  readonly default?: ExceptionPolicy
  /** Keyed by exact `category` string or glob pattern. A literal `"*"` key is rejected by `validateExceptionPolicyConfig`: see that function's doc comment for why. */
  readonly rules?: Readonly<Record<string, ExceptionPolicy>>
}

/**
 * A full exception-policy configuration, keyed by classification `group` (e.g. a tool name, or a
 * suppression domain). Names such as "domain", "rule", "severity" and "exceptionType" belong to
 * each consumer. The core sees them only as `{ group, category }` (see `ExceptionClassification`).
 * @public
 */
export type ExceptionPolicyConfig = Readonly<Record<string, ExceptionCategoryGroup>>

/**
 * One classification a record is evaluated against: only `{ group, category }`, with no
 * consumer vocabulary such as `domain`, `rule`, `severity` or `exceptionType`. A consumer maps its
 * concepts onto this shape at the call site. For example, `suppression-governance` passes
 * `{ group: record.domain, category: rule }` per suppressed rule. `security-socket` passes
 * `{ group: "socket", category: normalizedSeverity }`. The core uses `group` and `category` only
 * as lookup keys into an `ExceptionPolicyConfig`.
 * @public
 */
export interface ExceptionClassification {
  /** The top-level key this classification resolves against in an `ExceptionPolicyConfig`. */
  readonly group: string
  /** The `rules` key (exact or glob-matched) this classification resolves against within `group`. */
  readonly category: string
}

/**
 * A resolved judgment about one record, once its `ExceptionPolicy` has been checked against its
 * field values. See `ExceptionDeterminant`.
 * @public
 */
export type ExceptionVerdict = "forbidden" | "insufficient" | "permitted"

/**
 * One record's resolved policy verdict, and (for `"insufficient"`) which required fields are
 * still empty. There is no batch or matched-vs-unmatched shape. Matching a finding to a record
 * stays with each check, which reconciles its findings against its registry via
 * `reconcileExceptions`.
 * @public
 */
export interface ExceptionDeterminant<TRecord> {
  /** The record this determinant was computed for, returned verbatim. */
  readonly record: TRecord
  /** `"forbidden"`: never permitted. `"insufficient"`: exception-eligible, but `missing` is non-empty. `"permitted"`: every required field is filled in (or the resolved policy was `"allowed"`). */
  readonly verdict: ExceptionVerdict
  /** Every required field (by name) still empty on `record`, in the resolved policy's `requirements` order. Always `[]` for `"forbidden"`/`"permitted"`. */
  readonly missing: readonly string[]
}

/**
 * The stricter of two policies. `"forbidden"` always wins. Between two non-forbidding policies,
 * the union of their required fields wins. An `"allowed"` policy adds no requirements, so merging
 * it with an `"exception"` policy returns that exception unchanged. Satisfying the union also
 * satisfies each input policy. Two cases use it: several glob patterns matching one category, and
 * several classifications resolved for one record (see `evaluateExceptionRecord`). The union keeps
 * `a`'s field order, then appends `b`'s fields not already present. That keeps the result
 * deterministic without a closed field-name enum like `resolve-policy.ts`'s `REQUIREMENT_ORDER`.
 * This core owns no closed vocabulary of field names: each check's `requirements` name them.
 * @param a - One resolved policy.
 * @param b - The other resolved policy.
 * @returns The stricter of `a` and `b`.
 */
export function stricterOf(a: ExceptionPolicy, b: ExceptionPolicy): ExceptionPolicy {
  if (a.mode === "forbidden" || b.mode === "forbidden") return { mode: "forbidden" }

  const aRequirements = a.mode === "exception" ? a.requirements : []
  const bRequirements = b.mode === "exception" ? b.requirements : []

  if (aRequirements.length === 0 && bRequirements.length === 0) return { mode: "allowed" }

  const requirements = [...aRequirements]
  for (const requirement of bRequirements) {
    if (!requirements.includes(requirement)) requirements.push(requirement)
  }

  return { mode: "exception", requirements }
}

/**
 * Resolves the policy one `{ group, category }` classification is subject to. This comment is the
 * single source of truth for the precedence order. The function generalizes
 * `scripts/suppression-governance/resolve-policy.ts`'s `resolveRequirement`, which it is meant to
 * replace:
 *
 * 0. **No entry for `group`** (`config[group] === undefined`) resolves to `globalDefault` before
 *    `category` is inspected. A blanket `category === "*"` against an unconfigured group also
 *    returns `globalDefault`, never an empty-array reduce.
 * 1. **Blanket category**: `category === "*"` means every category this group could apply to was
 *    matched at once. It is not one category literally named `"*"`. It resolves to the strictest
 *    (`stricterOf`) policy across every entry in `group.rules` plus the group's default (or
 *    `globalDefault`). It skips the glob matcher. `globMatch("*", pattern)` tests the literal
 *    string `"*"` against `pattern`, so it does not match a pattern like `"security/*"`. As an
 *    ordinary pattern match, a blanket match would skip a group's `forbidden` rules and land on
 *    its more lenient default.
 * 2. **Exact match**: `group.rules[category]`, if present. No glob is consulted once an exact entry
 *    exists for `category`.
 * 3. **Glob match**: the strictest (`stricterOf`) policy among the `group.rules` keys that match
 *    `category` as a glob (e.g. `"security/*"` matching `"security/detect-object-injection"`).
 * 4. **Group default**: `group.default`, when `group` has an entry in `config` (whether or not
 *    that entry defines `default`).
 * 5. **Global default**: `globalDefault`, when `group` has no entry in `config`, or when no exact
 *    match, glob match or `group.default` applies.
 *
 * Assumes `config` has already passed `validateExceptionPolicyConfig`.
 * @param classification - The `{ group, category }` pair to resolve a policy for.
 * @param config - The exception policy configuration to resolve against.
 * @param globalDefault - The policy to fall back to when `classification.group` has no entry in `config` at all.
 * @returns The resolved policy for `classification`.
 * @public
 */
export function resolveExceptionPolicy(
  classification: ExceptionClassification,
  config: ExceptionPolicyConfig,
  globalDefault: ExceptionPolicy,
): ExceptionPolicy {
  const { group, category } = classification
  const groupPolicy = config[group]
  if (groupPolicy === undefined) return globalDefault

  const rules = Object.entries(groupPolicy.rules ?? {})

  if (category === "*") {
    const everyPolicy = [...rules.map(([, policy]) => policy), groupPolicy.default ?? globalDefault]
    return everyPolicy.reduce(stricterOf)
  }

  const exactMatch = rules.find(([pattern]) => pattern === category)
  if (exactMatch) return exactMatch[1]

  const globMatches = rules
    // An entry whose pattern equals `category` literally was already returned as `exactMatch` above.
    .filter(([pattern]) => globMatch(category, pattern))
    .map(([, policy]) => policy)
  if (globMatches.length > 0) {
    return globMatches.reduce(stricterOf)
  }

  return groupPolicy.default ?? globalDefault
}

/**
 * One record to evaluate, with everything `evaluateExceptionRecord` needs to judge it.
 * `evaluateExceptionRecord` and `evaluateExceptionRecords` share it, so the five-field shape is
 * declared once.
 * @public
 */
export interface ExceptionRecordEvaluation<TRecord> {
  /** The record to evaluate. */
  readonly record: TRecord
  /** Every classification this record is subject to; the strictest resolved policy across all of them wins. */
  readonly classifications: readonly [ExceptionClassification, ...ExceptionClassification[]]
  /** The exception policy configuration to resolve `classifications` against. */
  readonly config: ExceptionPolicyConfig
  /** The policy to fall back to for any classification whose `group` has no entry in `config` at all. */
  readonly globalDefault: ExceptionPolicy
  /** Resolves one named required field's current string value on `record`. */
  readonly fieldValue: (record: TRecord, requirement: string) => string
}

/**
 * Evaluates one record against each of its classifications and takes the strictest
 * (`stricterOf`) resolved policy. A record matching a forbidden classification and an
 * otherwise-fine one is forbidden overall. `classifications` is a non-empty tuple by type. Zero
 * classifications would be a caller bug, not a case to guess about at runtime. A required field
 * counts as satisfied once `fieldValue(record, requirement).trim()` is non-empty. An empty field
 * is valid *data* but insufficient for policy, as the `"exception"` mode name implies.
 * `fieldValue` may resolve a dotted path (e.g. `"verification.verifiedBy"`) or anything else a
 * record shape needs. This function never interprets `requirement`; it calls `fieldValue` and
 * trims the result.
 * @param input - The record, its classifications, the policy configuration, the global default and the field-value accessor. See `ExceptionRecordEvaluation` for each field.
 * @returns The record's verdict, and which required fields (if any) are still missing.
 * @public
 */
export function evaluateExceptionRecord<TRecord>(
  input: ExceptionRecordEvaluation<TRecord>,
): ExceptionDeterminant<TRecord> {
  const { record, classifications, config, globalDefault, fieldValue } = input

  const resolvedPolicy = classifications
    .map((classification) => resolveExceptionPolicy(classification, config, globalDefault))
    .reduce(stricterOf)

  if (resolvedPolicy.mode === "forbidden") {
    return { record, verdict: "forbidden", missing: [] }
  }

  const requirements = resolvedPolicy.mode === "exception" ? resolvedPolicy.requirements : []
  const missing = requirements.filter(
    (requirement) => fieldValue(record, requirement).trim().length === 0,
  )

  return { record, verdict: missing.length === 0 ? "permitted" : "insufficient", missing }
}

/**
 * A thin batch over already-matched `(record, classifications)` pairs:
 * `inputs.map(evaluateExceptionRecord)`. It saves a caller that evaluates many records against one
 * `config`, `globalDefault` and `fieldValue` from writing the `.map`. Matching a record to a
 * finding stays with each check, which reconciles its findings against its registry. This
 * function takes already-paired inputs and does no matching.
 * @param inputs - Each already-matched record to evaluate, in the shape `evaluateExceptionRecord` takes.
 * @returns Each input's determinant, in the same order as `inputs`.
 * @public
 */
export function evaluateExceptionRecords<TRecord>(
  inputs: readonly ExceptionRecordEvaluation<TRecord>[],
): readonly ExceptionDeterminant<TRecord>[] {
  return inputs.map((input) => evaluateExceptionRecord(input))
}

const VALID_MODES = ["forbidden", "allowed", "exception"] as const

/**
 * Validates one `ExceptionPolicy` value's shape. `mode` must be one of the three recognized
 * modes, and an `"exception"` mode's `requirements` must be a non-empty array. An empty array is
 * rejected, not treated as `"allowed"`. When nothing is required, `"allowed"` says so without
 * ambiguity. When `validRequirements` is supplied,
 * every named requirement must also be a member of it.
 * @param value - The candidate policy value to validate.
 * @param location - Where this value lives in the configuration, for error messages.
 * @param validRequirements - The complete set of field names this consumer's policy may require, if the consumer wants that checked. Omit to skip this check entirely (any string is accepted as a requirement name).
 * @param errors - Accumulates every configuration problem found.
 */
function validateExceptionPolicyValue(
  value: unknown,
  location: string,
  validRequirements: readonly string[] | undefined,
  errors: string[],
): void {
  if (typeof value !== "object" || value === null) {
    errors.push(`${location} must be an object.`)
    return
  }

  const { mode, requirements } = value as Record<string, unknown>

  if (mode === "forbidden" || mode === "allowed") return

  if (mode !== "exception") {
    errors.push(
      `${location}.mode must be one of ${VALID_MODES.map((m) => `"${m}"`).join(", ")} (got ${JSON.stringify(mode)}).`,
    )
    return
  }

  if (!Array.isArray(requirements) || requirements.length === 0) {
    errors.push(`${location}.requirements must be a non-empty array when mode is "exception".`)
    return
  }

  // Every requirement name must be a string, whether or not `validRequirements` was supplied.
  // `evaluateExceptionRecord` calls `fieldValue(record, requirement)` with a string key. A policy
  // decoded from untrusted JSON could otherwise carry a number, object or null entry to that call.
  // `validRequirements`, when supplied, also narrows the names to an allowed set.
  for (const requirement of requirements) {
    if (typeof requirement !== "string") {
      errors.push(
        `${location}.requirements contains a non-string entry (got ${JSON.stringify(requirement)}).`,
      )
      continue
    }
    if (validRequirements !== undefined && !validRequirements.includes(requirement)) {
      errors.push(
        `${location}.requirements contains an invalid entry (got ${JSON.stringify(requirement)}); ` +
          `expected one of ${validRequirements.map((r) => `"${r}"`).join(", ")}.`,
      )
    }
  }
}

/**
 * Whether `value` is a non-null, non-array object. Every group's entry in an
 * `ExceptionPolicyConfig`, and every group's `rules` container, must have this shape before its
 * fields are inspected. The declared type does not guarantee it at runtime. A config decoded from
 * untrusted JSON may be cast to that type without having its shape.
 * @param value - The candidate value to check.
 * @returns `true` if `value` is a plain object.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Validates an `ExceptionPolicyConfig`'s shape. Every group's `default` and every entry in its
 * `rules` must be a well-formed `ExceptionPolicy` (see `validateExceptionPolicyValue`). No group's
 * `rules` may use the literal `"*"` as a key, because that key is never a blanket policy.
 * `resolveExceptionPolicy` applies the blanket policy when the *input* `category` is `"*"`. A
 * `"*"` rules key is consulted only as an ordinary glob, which matches no category containing a
 * `/`. See `resolveExceptionPolicy`'s doc comment, case 1, for the failure mode this prevents.
 * @param config - The exception policy configuration to validate.
 * @param validRequirements - The complete set of field names this consumer's policy may require, if the consumer wants that checked. Omit to skip that check entirely.
 * @returns Every configuration problem found; empty if `config` is valid.
 * @public
 */
export function validateExceptionPolicyConfig(
  config: ExceptionPolicyConfig,
  validRequirements?: readonly string[],
): readonly string[] {
  const errors: string[] = []

  for (const [group, groupPolicy] of Object.entries(config)) {
    // The declared type does not guarantee this shape at runtime. A config decoded from untrusted
    // JSON and cast to `ExceptionPolicyConfig` could carry `null`, a string, or an array here.
    // Rejecting it first avoids a throw on `null.default`. It also avoids treating a non-object as
    // an empty group.
    if (!isPlainObject(groupPolicy)) {
      errors.push(`config.${group} must be an object.`)
      continue
    }

    if (groupPolicy.default !== undefined) {
      validateExceptionPolicyValue(
        groupPolicy.default,
        `config.${group}.default`,
        validRequirements,
        errors,
      )
    }

    if (groupPolicy.rules !== undefined && !isPlainObject(groupPolicy.rules)) {
      errors.push(`config.${group}.rules must be an object.`)
      continue
    }

    // No cast needed here: the guard above has already narrowed `groupPolicy.rules` to
    // `Record<string, unknown> | undefined` via `isPlainObject`'s type predicate.
    for (const [pattern, policy] of Object.entries(groupPolicy.rules ?? {})) {
      if (pattern === "*") {
        errors.push(
          `config.${group}.rules must not use the literal "*" as a key. It would be consulted ` +
            'only as an ordinary glob (matching the literal one-character category "*", ' +
            "never every category in the group) rather than as the blanket policy " +
            "`resolveExceptionPolicy` already applies whenever the classification's own `category` " +
            'is "*". Omit this key, or use a more specific pattern.',
        )
      }
      validateExceptionPolicyValue(
        policy,
        `config.${group}.rules["${pattern}"]`,
        validRequirements,
        errors,
      )
    }
  }

  return errors
}

/**
 * A deterministic digest of some fields' current values on `record`, via `node:crypto`. It is
 * pure and synchronous, with no ambient state. Socket.dev has no alert on `node:crypto`. It is
 * neither `child_process` nor `process.env`, the two capabilities `src/helpers/**` must never
 * touch (see the `AmbientCapabilities` check). The digest makes a verification *content-bound*
 * rather than merely attested. A consumer records this hash when a human or a mechanical re-check
 * approves a record's current prose. Recomputing and comparing it later detects staleness with no
 * separate tracking: edit any field named in `fields` and the hash stops matching. Each field's
 * name is bound into the digest with its value, as a `JSON.stringify`'d `[name, value]` pair.
 * JSON escaping keeps the digest unambiguous whatever characters a name or value holds. Two field
 * sets whose values concatenate to the same plain text cannot collide.
 * @param record - The record to hash fields from.
 * @param fields - Which fields (by name, in this order) to include in the digest: the names `evaluateExceptionRecord` passes to `fieldValue`.
 * @param fieldValue - Resolves one named field's current string value on `record`, like `evaluateExceptionRecord`'s `fieldValue` parameter.
 * @returns A hex-encoded SHA-256 digest of `fields`' current values.
 * @public
 */
export function hashRequirementFields<TRecord>(
  record: TRecord,
  fields: readonly string[],
  fieldValue: (record: TRecord, requirement: string) => string,
): string {
  const canonical = JSON.stringify(fields.map((field) => [field, fieldValue(record, field)]))
  return createHash("sha256").update(canonical).digest("hex")
}
