import { createHash } from "node:crypto"
import { minimatch } from "minimatch"

/**
 * A resolved decision for one `{ group, category }` classification. `"forbidden"`: never
 * permitted, regardless of any field's content. `"allowed"`: permitted unconditionally -- no
 * field is required. `"exception"`: permitted only once every field named in `requirements` is a
 * non-empty (post-`.trim()`) string on the record being evaluated (see `evaluateExceptionRecord`).
 *
 * Deliberately not a numeric "how many details are required" threshold -- a plain count is
 * trivially satisfied by generating that many generic-sounding filler entries without doing any of
 * the underlying work the count was meant to prove happened. Naming exactly which fields must be
 * filled in makes each one individually reviewable against a specific question instead. This is
 * the same design `scripts/suppression-governance/policy-config.ts`'s `SuppressionPolicy`
 * establishes for the disable-comment domain this type generalizes.
 */
export type ExceptionPolicy =
  | { readonly mode: "forbidden" }
  | { readonly mode: "allowed" }
  | { readonly mode: "exception"; readonly requirements: readonly string[] }

/**
 * One classification group's own policy -- `default` is this group's fallback for any `category`
 * with no exact or glob match in `rules` (see `resolveExceptionPolicy` for the full exact > glob >
 * group-default > global-default precedence). Omit `default` to fall through to the caller-supplied
 * `globalDefault` instead. Each key of `rules` is either an exact `category` string or a
 * `minimatch` glob pattern -- `resolveExceptionPolicy` tries an exact match first and only
 * consults glob matching once no exact key exists, so a glob can never shadow a more specific
 * exact entry.
 */
export interface ExceptionCategoryGroup {
  /** This group's fallback policy when `category` matches neither an exact nor a glob key in `rules`. Falls through to the caller's `globalDefault` when omitted. */
  readonly default?: ExceptionPolicy
  /** Keyed by exact `category` string or `minimatch` glob pattern. A literal `"*"` key is rejected by `validateExceptionPolicyConfig` -- see that function's own doc comment for why. */
  readonly rules?: Readonly<Record<string, ExceptionPolicy>>
}

/**
 * A full exception-policy configuration, keyed by classification `group` (e.g. a tool name, or a
 * suppression domain). The core never invents the names "domain"/"rule"/"severity"/
 * "exceptionType" -- those are every consumer's own vocabulary, expressed here purely as
 * `{ group, category }` (see `ExceptionClassification`).
 */
export type ExceptionPolicyConfig = Readonly<Record<string, ExceptionCategoryGroup>>

/**
 * One classification a record is evaluated against -- deliberately just `{ group, category }`,
 * never `domain`/`rule`/`severity`/`exceptionType` or any other consumer-specific vocabulary. A
 * consumer maps its own domain concepts onto this shape at the call site (e.g.
 * `suppression-governance`'s `{ group: record.domain, category: rule }` per suppressed rule;
 * `security-socket`'s `{ group: "socket", category: normalizedSeverity }`) -- the core itself
 * never interprets `group`/`category` beyond using them as lookup keys into an
 * `ExceptionPolicyConfig`.
 */
export interface ExceptionClassification {
  /** The top-level key this classification resolves against in an `ExceptionPolicyConfig`. */
  readonly group: string
  /** The `rules` key (exact or glob-matched) this classification resolves against within `group`. */
  readonly category: string
}

/** A resolved judgment about one record, once its `ExceptionPolicy` has been checked against its own field values. See `ExceptionDeterminant`. */
export type ExceptionVerdict = "forbidden" | "insufficient" | "permitted"

/** One record's resolved policy verdict, and (for `"insufficient"`) which required fields are still empty. Never published as a batch/matched-vs-unmatched shape -- matching a record to a finding stays entirely check-owned (see `checks/shared/evaluate-exception-findings.ts`). */
export interface ExceptionDeterminant<TRecord> {
  /** The record this determinant was computed for, returned verbatim. */
  readonly record: TRecord
  /** `"forbidden"`: never permitted. `"insufficient"`: exception-eligible, but `missing` is non-empty. `"permitted"`: every required field is filled in (or the resolved policy was `"allowed"`). */
  readonly verdict: ExceptionVerdict
  /** Every required field (by name) still empty on `record`, in the resolved policy's own `requirements` order. Always `[]` for `"forbidden"`/`"permitted"`. */
  readonly missing: readonly string[]
}

/**
 * The stricter of two policies: `"forbidden"` always wins outright; between two non-forbidding
 * policies, the union of their required fields wins (an `"allowed"` policy contributes no
 * requirements, so merging it with an `"exception"` policy just yields that same exception
 * unchanged) -- satisfying the union trivially satisfies each individual input policy too. Reused
 * for two distinct combinations: multiple glob patterns matching the same category, and multiple
 * classifications resolved for the same record (see `evaluateExceptionRecord`). The union preserves
 * `a`'s own field order first, then appends any of `b`'s fields not already present -- deterministic
 * given deterministic inputs, without needing a fixed, closed field-name enum the way
 * `resolve-policy.ts`'s own `REQUIREMENT_ORDER` does (this core never owns a closed vocabulary of
 * field names; see `checks/shared/exception-record.ts` for where a consumer's own closed
 * `EXCEPTION_TYPES`-style enum lives instead).
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
 * Resolves the policy one `{ group, category }` classification is subject to, in strict precedence
 * order -- documented here as this function's one authoritative source of truth for that order
 * (generalized from `scripts/suppression-governance/resolve-policy.ts`'s own `resolveRequirement`,
 * which this function's future retrofit replaces):
 *
 * 0. **No entry for `group`** -- `config[group] === undefined` -- resolves to `globalDefault`
 *    immediately, before `category` is even inspected (so a blanket `category === "*"` against an
 *    unconfigured group still just returns `globalDefault`, never an empty-array reduce).
 * 1. **Blanket category** -- `category === "*"` means every category this group could ever apply
 *    to was matched at once, not one specific category literally named `"*"`. It resolves as the
 *    strictest (`stricterOf`) policy across every entry in `group.rules` plus the group's own
 *    default (or `globalDefault`) -- never via `minimatch`: `minimatch("*", pattern)` tests the
 *    literal one-character string `"*"` as a path against `pattern`, which does not glob-match a
 *    pattern like `"security/*"` (that would require the *pattern*, not the *target*, to be `"*"`),
 *    so treating this case as an ordinary pattern match would silently let a blanket match fall
 *    through a group's `forbidden` rules into its far more lenient default.
 * 2. **Exact match** -- `group.rules[category]`, if present. A glob is never even consulted once an
 *    exact entry exists for `category`.
 * 3. **Glob match** -- the strictest (`stricterOf`) policy among every key in `group.rules` that is
 *    not itself an exact match for `category` but does match it as a `minimatch` glob (e.g.
 *    `"security/*"` matching `"security/detect-object-injection"`).
 * 4. **Group default** -- `group.default`, if `group` itself has an entry in `config` (whether or
 *    not that entry defines its own `default`).
 * 5. **Global default** -- `globalDefault`, used only when `group` itself has no entry in `config`
 *    at all, or when neither an exact/glob match nor a `group.default` applies.
 *
 * Assumes `config` has already passed `validateExceptionPolicyConfig`.
 * @param classification - The `{ group, category }` pair to resolve a policy for.
 * @param config - The exception policy configuration to resolve against.
 * @param globalDefault - The policy to fall back to when `classification.group` has no entry in `config` at all.
 * @returns The resolved policy for `classification`.
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
    .filter(([pattern]) => {
      // Equivalent mutant: by the time this line runs, `exactMatch` above has already returned
      // for any entry whose `pattern` literally equals `category`, so no remaining entry in
      // `rules` can ever have `pattern === category` here -- `pattern !== category` is therefore
      // always `true` at this point, and no test could ever distinguish it from the literal
      // `true` a mutant substitutes for it.
      // Stryker disable next-line ConditionalExpression -- equivalent mutant, see comment above.
      return pattern !== category && minimatch(category, pattern)
    })
    .map(([, policy]) => policy)
  if (globMatches.length > 0) {
    return globMatches.reduce(stricterOf)
  }

  return groupPolicy.default ?? globalDefault
}

/**
 * Evaluates one record against every one of its own classifications, taking the strictest
 * (`stricterOf`) of each classification's resolved policy -- a record matching both a forbidden
 * classification and an otherwise-fine one is forbidden overall. `classifications` is a non-empty
 * tuple by type: zero classifications would be a caller bug (which classification would silently
 * fall back to `globalDefault`?), never a case this function has to guess about at runtime. A
 * required field only counts as satisfied once `fieldValue(record, requirement).trim()` is
 * non-empty -- an empty field is valid *data*, but policy-insufficient, exactly as `"exception"`
 * mode's name implies. `fieldValue` may resolve a dotted path (e.g. `"verification.verifiedBy"`)
 * or anything else a consumer's own record shape needs -- this function never interprets
 * `requirement` itself, it only ever calls `fieldValue(record, requirement)` and trims the result.
 * @param input - The record to evaluate, its classifications, the policy configuration and global default to resolve them against, and the field-value accessor.
 * @param input.record - The record to evaluate.
 * @param input.classifications - Every classification this record is subject to; the strictest resolved policy across all of them wins.
 * @param input.config - The exception policy configuration to resolve `input.classifications` against.
 * @param input.globalDefault - The policy to fall back to for any classification whose `group` has no entry in `input.config` at all.
 * @param input.fieldValue - Resolves one named required field's current string value on `input.record`.
 * @returns The record's verdict, and which required fields (if any) are still missing.
 */
export function evaluateExceptionRecord<TRecord>(input: {
  readonly record: TRecord
  readonly classifications: readonly [ExceptionClassification, ...ExceptionClassification[]]
  readonly config: ExceptionPolicyConfig
  readonly globalDefault: ExceptionPolicy
  readonly fieldValue: (record: TRecord, requirement: string) => string
}): ExceptionDeterminant<TRecord> {
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
 * A thin batch over already-matched `(record, classifications)` pairs -- exactly
 * `inputs.map(evaluateExceptionRecord)`, provided so a caller evaluating many records against the
 * same `config`/`globalDefault`/`fieldValue` doesn't have to write that `.map` itself. Matching a
 * record to a finding in the first place stays entirely check-owned (see
 * `checks/shared/evaluate-exception-findings.ts`) -- this function takes already-paired inputs, it
 * never does any matching of its own.
 * @param inputs - Each already-matched record to evaluate, in the same shape `evaluateExceptionRecord` itself takes.
 * @returns Each input's own determinant, in the same order as `inputs`.
 */
export function evaluateExceptionRecords<TRecord>(
  inputs: readonly {
    readonly record: TRecord
    readonly classifications: readonly [ExceptionClassification, ...ExceptionClassification[]]
    readonly config: ExceptionPolicyConfig
    readonly globalDefault: ExceptionPolicy
    readonly fieldValue: (record: TRecord, requirement: string) => string
  }[],
): readonly ExceptionDeterminant<TRecord>[] {
  return inputs.map((input) => evaluateExceptionRecord(input))
}

const VALID_MODES = ["forbidden", "allowed", "exception"] as const

/**
 * Validates one `ExceptionPolicy` value's shape -- `mode` must be one of the three recognized
 * modes, and an `"exception"` mode's `requirements` must be a non-empty array (an empty array is
 * rejected rather than silently treated as equivalent to `"allowed"` -- if nothing is required,
 * `"allowed"` is the correct, unambiguous way to say so). When `validRequirements` is supplied,
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

  if (validRequirements === undefined) return

  for (const requirement of requirements) {
    if (!validRequirements.includes(requirement as string)) {
      errors.push(
        `${location}.requirements contains an invalid entry (got ${JSON.stringify(requirement)}); ` +
          `expected one of ${validRequirements.map((r) => `"${r}"`).join(", ")}.`,
      )
    }
  }
}

/**
 * Validates an entire `ExceptionPolicyConfig`'s shape -- every group's `default` and every entry
 * in its `rules` must be a well-formed `ExceptionPolicy` (see `validateExceptionPolicyValue`), and
 * no group's `rules` may use the literal `"*"` as a key. A literal `"*"` key is always a mistake,
 * never an intentional blanket policy: `resolveExceptionPolicy`'s own blanket-category handling is
 * triggered by the *input* `category` being `"*"`, not by a `"*"` entry in `rules` -- a `"*"` rules
 * key would instead be consulted only as an ordinary `minimatch` glob, which matches the literal
 * one-character string `"*"` as a *target*, not as a wildcard pattern matching every real category
 * name (`minimatch("*", pattern)` truthiness depends on `pattern`, not the other way around) --
 * see `resolveExceptionPolicy`'s own doc comment, case 1, for the failure mode this prevents.
 * @param config - The exception policy configuration to validate.
 * @param validRequirements - The complete set of field names this consumer's policy may require, if the consumer wants that checked. Omit to skip that check entirely.
 * @returns Every configuration problem found; empty if `config` is valid.
 */
export function validateExceptionPolicyConfig(
  config: ExceptionPolicyConfig,
  validRequirements?: readonly string[],
): readonly string[] {
  const errors: string[] = []

  for (const [group, groupPolicy] of Object.entries(config)) {
    if (groupPolicy.default !== undefined) {
      validateExceptionPolicyValue(
        groupPolicy.default,
        `config.${group}.default`,
        validRequirements,
        errors,
      )
    }
    for (const [pattern, policy] of Object.entries(groupPolicy.rules ?? {})) {
      if (pattern === "*") {
        errors.push(
          `config.${group}.rules must not use the literal "*" as a key -- it would be consulted ` +
            'only as an ordinary minimatch glob (matching the literal one-character category "*", ' +
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
 * A deterministic digest of a set of fields' current values on `record`, via `node:crypto` --
 * pure, synchronous, no ambient state (Socket.dev has no alert on `node:crypto`; it is not
 * `child_process`/`process.env`, the two capabilities `src/helpers/**` must never touch -- see
 * `scripts/verify-no-ambient-capabilities.mjs`). This is what makes a "verification" *content-bound*
 * rather than merely attested: a consumer records this hash (see `ExceptionVerification` in
 * `checks/shared/exception-record.ts`) at the moment a human or a mechanical re-check approved a
 * record's current prose; recomputing it later and comparing is how staleness is detected with no
 * separate tracking logic -- edit any field named in `fields` and the hash silently stops matching.
 * Each field's name is bound into the digest alongside its value, both serialized via
 * `JSON.stringify` as a `[name, value]` pair -- JSON's own escaping makes the digest unambiguous
 * regardless of what characters a field's name or value contains, so two different field sets
 * whose values happen to concatenate identically as plain text can never collide here.
 * @param record - The record to hash fields from.
 * @param fields - Which fields (by name, in this exact order) to include in the digest -- the same names `fieldValue` would be called with by `evaluateExceptionRecord`.
 * @param fieldValue - Resolves one named field's current string value on `record`, exactly like `evaluateExceptionRecord`'s own `fieldValue` parameter.
 * @returns A hex-encoded SHA-256 digest of `fields`' current values.
 */
export function hashRequirementFields<TRecord>(
  record: TRecord,
  fields: readonly string[],
  fieldValue: (record: TRecord, requirement: string) => string,
): string {
  const canonical = JSON.stringify(fields.map((field) => [field, fieldValue(record, field)]))
  // Equivalent mutant: Node's Hash.update(data, inputEncoding) treats a falsy/empty
  // inputEncoding identically to "utf8" for a string `data` argument -- confirmed directly:
  // createHash("sha256").update(x, "utf8").digest("hex") === createHash("sha256").update(x,
  // "").digest("hex") for every input tried. No test could ever distinguish "utf8" from "" at
  // this exact call site.
  // Stryker disable next-line StringLiteral -- equivalent mutant, see comment above.
  return createHash("sha256").update(canonical, "utf8").digest("hex")
}
