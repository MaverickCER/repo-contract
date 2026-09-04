import {
  DependencyDeclaredLaterError,
  InvalidCheckConfigError,
  InvalidRepoContractConfigError,
} from "../errors.js"
import type { OutputFormat, RepoContractConfig } from "../types.js"
import { tokenizeRunString } from "./tokenize-command.js"

const OUTPUT_FORMATS: readonly OutputFormat[] = ["json", "yaml", "text"]

/**
 * Validates a `RepoContractConfig` structurally and throws before any
 * process spawns. A config with zero checks is valid (an empty `checks`
 * object vacuously satisfies "every check passed"); everything else here is
 * a genuine structural problem. Runtime checks are deliberately defensive
 * about field types rather than trusting the compile-time type, since a
 * config can arrive from plain JavaScript or a widened/cast value.
 * @param config - the config to validate; throws if structurally invalid.
 */
export function validateRepoContractConfig(config: RepoContractConfig): void {
  // Typed as `unknown` at this internal boundary (not the declared
  // `RepoContractConfig` parameter type) deliberately -- this function's
  // whole purpose is verifying something whose actual runtime shape isn't
  // trusted (plain JavaScript callers, a widened or cast value), so
  // narrowing from `unknown` keeps every check below genuinely meaningful
  // rather than flagged as redundant against a type that's assumed valid.
  const untrusted: unknown = config

  if (untrusted === null || typeof untrusted !== "object") {
    throw new InvalidRepoContractConfigError("config must be an object.")
  }

  const { checks, concurrency, spawn, env, shell, killProcessTree } = untrusted as Record<
    string,
    unknown
  >

  if (checks === null || typeof checks !== "object" || Array.isArray(checks)) {
    throw new InvalidRepoContractConfigError(
      "checks must be an object mapping check id to check definition.",
    )
  }

  if (concurrency !== undefined) {
    // `typeof concurrency !== "number"` is behaviorally redundant with the
    // clause after it: `Number.isInteger` returns `false` (never throws or
    // coerces) for every non-number value, so `!Number.isInteger(...)`
    // alone already rejects every case the typeof check would -- kept for
    // readability at the call site, not because it changes behavior.
    // Stryker disable next-line ConditionalExpression -- the typeof check is redundant with Number.isInteger, which returns false (never throws) for every non-number value, so it's kept only for readability at the call site.
    if (typeof concurrency !== "number" || !Number.isInteger(concurrency) || concurrency < 1) {
      throw new InvalidRepoContractConfigError(
        "concurrency must be a positive integer when provided.",
      )
    }
  }

  // repo-contract never imports a process-spawning implementation itself (see
  // specs/decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md)
  // -- `spawn` is a required, consumer-supplied capability, not an optional
  // field with an internal fallback, so its absence is a config error same
  // as any other missing required field.
  if (typeof spawn !== "function") {
    throw new InvalidRepoContractConfigError("spawn must be a function.")
  }

  // Same rationale as `spawn` above, for `process.env` -- `env` is required, not defaulted to
  // `{}` internally, since a silent empty environment would break `PATH` resolution for most
  // real check commands. Delegated to its own function, mirroring validateEnv's per-check
  // counterpart below, so this function's own complexity stays flat regardless of how much a
  // single field's validation requires.
  validateConfigEnv(env)

  if (shell !== undefined && typeof shell !== "boolean") {
    throw new InvalidRepoContractConfigError("shell must be a boolean when provided.")
  }
  const globalShell = shell === true

  // Optional, unlike spawn/env: omitting it is a documented, valid choice (Windows falls back to
  // killing only a timed-out/aborted check's immediate process, not its full descendant tree) --
  // see killProcessTree's own doc comment on RepoContractConfig.
  if (killProcessTree !== undefined && typeof killProcessTree !== "function") {
    throw new InvalidRepoContractConfigError("killProcessTree must be a function when provided.")
  }

  for (const [checkId, check] of Object.entries(checks)) {
    validateCheckDefinition(checkId, check, globalShell)
  }

  validateDependencyGraph(checks as Record<string, { dependsOn?: readonly string[] }>)
}

/**
 * Validates that `env` (`RepoContractConfig.env`, required) is an object whose every value is a
 * string or `undefined` -- `NodeJS.ProcessEnv`'s own contract, distinct from `validateEnv` below,
 * which validates the per-check `env` field against a stricter string-only `Record<string, string>`.
 * `undefined` is accepted here (not just tolerated) because it's a legitimate value `buildEnv`
 * itself filters out, not a type escape hatch.
 * @param env - the config's raw `env` field to validate.
 */
function validateConfigEnv(env: unknown): void {
  if (env === null || typeof env !== "object" || Array.isArray(env)) {
    throw new InvalidRepoContractConfigError(
      "env must be an object mapping variable name to value.",
    )
  }
  for (const [key, value] of Object.entries(env as Record<string, unknown>)) {
    if (typeof value !== "string" && value !== undefined) {
      throw new InvalidRepoContractConfigError(`env["${key}"] must be a string or undefined.`)
    }
  }
}

/**
 * Orchestrates one check's field-level validators. Deliberately just a flat
 * sequence of calls with no branching of its own -- each field's validation
 * logic (and its own complexity) lives in its own small function below, so
 * this function's own cyclomatic complexity (and CRAP score) stays low
 * regardless of how many fields exist to check.
 * @param checkId - identifies which check is being validated, used in thrown error messages.
 * @param check - the check definition to validate.
 * @param globalShell - the run-wide `shell` default (`config.shell ?? false`, already validated), used when this check doesn't set its own `shell`.
 */
function validateCheckDefinition(checkId: string, check: unknown, globalShell: boolean): void {
  // An integer-like key ("0", "42", ...) is enumerated by `Object.keys` in
  // ascending numeric order ahead of every other key, regardless of insertion
  // order -- so `validateDependencyGraph`'s `ids`/`indexById` (and the runtime
  // scheduler) would see a different order than the source declares, silently
  // breaking the "declaration order is the required topological order" contract.
  if (/^(?:0|[1-9]\d*)$/.test(checkId)) {
    throw new InvalidCheckConfigError(
      checkId,
      "check id must not be an integer-like string -- JavaScript would reorder it ahead of every " +
        "other key and break the declaration-order-is-topological-order contract.",
    )
  }

  if (check === null || typeof check !== "object") {
    throw new InvalidCheckConfigError(checkId, "check definition must be an object.")
  }

  const fields = check as Record<string, unknown>
  const usesShell = validateShell(checkId, fields.shell, globalShell)
  validateRun(checkId, fields.run, usesShell)
  validateCwd(checkId, fields.cwd)
  validateEnv(checkId, fields.env)
  validateInheritEnv(checkId, fields.inheritEnv)
  validateTimeoutMs(checkId, fields.timeoutMs)
  validateOutput(checkId, fields.output)
  validateDependsOn(checkId, fields.dependsOn)
  validateIsolated(checkId, fields.isolated)
  validatePolicy(checkId, fields.policy)
}

/**
 * Returns this check's effective shell mode (`check.shell ?? globalShell`), having already
 * validated `shell`'s own type.
 * @param checkId - identifies which check is being validated, used in thrown error messages.
 * @param shell - the check's raw `shell` field to validate.
 * @param globalShell - the run-wide `shell` default, used when this check's own `shell` is omitted.
 * @returns this check's effective shell mode -- `shell` itself when set, `globalShell` otherwise.
 */
function validateShell(checkId: string, shell: unknown, globalShell: boolean): boolean {
  if (shell !== undefined && typeof shell !== "boolean") {
    throw new InvalidCheckConfigError(checkId, "shell must be a boolean when provided.")
  }
  return typeof shell === "boolean" ? shell : globalShell
}

/**
 * Validates that `run` is a string or an array of strings, then delegates to the matching shape-specific validator.
 * @param checkId - identifies which check is being validated, used in thrown error messages.
 * @param run - the check's raw `run` field to validate.
 * @param usesShell - whether `shell: true` was set, from `validateShell`.
 */
function validateRun(checkId: string, run: unknown, usesShell: boolean): void {
  if (typeof run !== "string" && !Array.isArray(run)) {
    throw new InvalidCheckConfigError(checkId, "run must be a string or an array of strings.")
  }
  if (typeof run === "string") {
    validateStringRun(checkId, run, usesShell)
  } else {
    validateArrayRun(checkId, run as unknown[], usesShell)
  }
}

/**
 * Validates a string-form `run`: tokenizes it (for its side effect of rejecting unquoted shell operators) when no shell is used, or rejects an empty/whitespace-only string when a shell is used.
 * @param checkId - identifies which check is being validated, used in thrown error messages.
 * @param run - the check's raw `run` string to validate.
 * @param usesShell - whether `shell: true` was set, from `validateShell`.
 */
function validateStringRun(checkId: string, run: string, usesShell: boolean): void {
  if (!usesShell) {
    // Tokenized here for its side effect (throws on an empty string or an
    // unquoted shell operator); the result is recomputed at spawn time,
    // since tokenization is cheap and pure. The first token is additionally
    // checked for emptiness: `run: "''"` / `run: "'  ' build"` tokenizes to
    // a non-empty array whose executable is `""`, which would otherwise fail
    // only later as an opaque spawn error rather than a synchronous config
    // error like every other structurally-broken `run`.
    const [executable] = tokenizeRunString(run, checkId)
    // `noUncheckedIndexedAccess` types the destructured `executable` as
    // `string | undefined`, but `tokenizeRunString` throws on any input that
    // would produce an empty token array (it rejects an empty or
    // whitespace-only string outright), so `executable` is always a real
    // string by the time control reaches here. The `?.` exists only to
    // satisfy the compiler; removing it is behaviourally equivalent, so the
    // OptionalChaining mutant here is an equivalent mutant with no test that
    // could ever distinguish it.
    // Stryker disable next-line OptionalChaining -- equivalent mutant: `executable` is provably always a string here (see comment above), so `executable?.trim()` and `executable.trim()` are identical.
    if (executable?.trim().length === 0) {
      throw new InvalidCheckConfigError(
        checkId,
        "run string's first token (the executable) is empty or contains only whitespace.",
      )
    }
    return
  }
  if (run.trim().length === 0) {
    throw new InvalidCheckConfigError(checkId, "run string is empty or contains only whitespace.")
  }
}

/**
 * Validates an array-form `run`: rejects it outright when a shell is used (array args can't express shell operators), and otherwise requires a non-empty array of strings.
 * @param checkId - identifies which check is being validated, used in thrown error messages.
 * @param items - the check's raw `run` array to validate.
 * @param usesShell - whether `shell: true` was set, from `validateShell`.
 */
function validateArrayRun(checkId: string, items: readonly unknown[], usesShell: boolean): void {
  if (usesShell) {
    throw new InvalidCheckConfigError(
      checkId,
      "shell: true requires run to be a string -- an array of arguments is individually " +
        "escaped for the shell and cannot express shell operators like pipes or redirects, " +
        "so combining the two forms would silently do nothing useful.",
    )
  }
  if (items.length === 0) {
    throw new InvalidCheckConfigError(checkId, "run array must not be empty.")
  }
  if (items.some((item) => typeof item !== "string")) {
    throw new InvalidCheckConfigError(checkId, "run array must contain only strings.")
  }
  // The first element is the executable; an empty or whitespace-only value
  // there fails only later as an opaque spawn error, so reject it here like
  // every other structurally-broken `run`.
  if ((items[0] as string).trim().length === 0) {
    throw new InvalidCheckConfigError(
      checkId,
      "run array's first element (the executable) is empty or contains only whitespace.",
    )
  }
}

/**
 * Validates that `cwd`, if provided, is a string.
 * @param checkId - identifies which check is being validated, used in thrown error messages.
 * @param cwd - the check's raw `cwd` field to validate.
 */
function validateCwd(checkId: string, cwd: unknown): void {
  if (cwd !== undefined && typeof cwd !== "string") {
    throw new InvalidCheckConfigError(checkId, "cwd must be a string when provided.")
  }
}

/**
 * Validates that `env`, if provided, is an object mapping names to string values.
 * @param checkId - identifies which check is being validated, used in thrown error messages.
 * @param env - the check's raw `env` field to validate.
 */
function validateEnv(checkId: string, env: unknown): void {
  if (env === undefined) return
  if (env === null || typeof env !== "object" || Array.isArray(env)) {
    throw new InvalidCheckConfigError(
      checkId,
      "env must be an object mapping name to value when provided.",
    )
  }
  for (const [key, value] of Object.entries(env)) {
    if (typeof value !== "string") {
      throw new InvalidCheckConfigError(checkId, `env["${key}"] must be a string.`)
    }
  }
}

/**
 * Validates that `inheritEnv`, if provided, is a boolean.
 * @param checkId - identifies which check is being validated, used in thrown error messages.
 * @param inheritEnv - the check's raw `inheritEnv` field to validate.
 */
function validateInheritEnv(checkId: string, inheritEnv: unknown): void {
  if (inheritEnv !== undefined && typeof inheritEnv !== "boolean") {
    throw new InvalidCheckConfigError(checkId, "inheritEnv must be a boolean when provided.")
  }
}

/**
 * Validates that `timeoutMs`, if provided, is a positive finite number.
 * @param checkId - identifies which check is being validated, used in thrown error messages.
 * @param timeoutMs - the check's raw `timeoutMs` field to validate.
 */
function validateTimeoutMs(checkId: string, timeoutMs: unknown): void {
  if (timeoutMs === undefined) return
  // Same redundancy as concurrency's typeof check above: `Number.isFinite`
  // returns `false` (never throws or coerces) for every non-number value.
  // Stryker disable next-line ConditionalExpression -- same redundancy as the concurrency check above: the typeof check is redundant with Number.isFinite, which returns false for every non-number value.
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new InvalidCheckConfigError(checkId, "timeoutMs must be a positive number when provided.")
  }
}

/**
 * Validates that `output`, if provided, is an object whose `format` is one of the supported `OUTPUT_FORMATS`.
 * @param checkId - identifies which check is being validated, used in thrown error messages.
 * @param output - the check's raw `output` field to validate.
 */
function validateOutput(checkId: string, output: unknown): void {
  if (output === undefined) return
  if (output === null || typeof output !== "object") {
    throw new InvalidCheckConfigError(checkId, "output must be an object when provided.")
  }
  const { format, schema } = output as Record<string, unknown>
  // `typeof format !== "string"` is behaviorally redundant with the clause
  // after it: `Array#includes` uses strict equality, so a non-string
  // `format` can never match an entry of `OUTPUT_FORMATS` (all strings),
  // meaning `!OUTPUT_FORMATS.includes(...)` alone already rejects every
  // case the typeof check would.
  // Stryker disable next-line ConditionalExpression -- the typeof check is redundant with Array#includes' strict equality against OUTPUT_FORMATS (all strings), so a non-string format can never match regardless of the typeof check.
  if (typeof format !== "string" || !OUTPUT_FORMATS.includes(format as OutputFormat)) {
    throw new InvalidCheckConfigError(
      checkId,
      `output.format must be one of ${OUTPUT_FORMATS.map((f) => `"${f}"`).join(", ")}.`,
    )
  }
  validateOutputSchema(checkId, schema)
}

/**
 * Validates that `schema`, when provided, is at least *plausibly* a `StandardSchemaV1`-compliant
 * object (https://standardschema.dev) -- checks only the three fields every
 * `StandardSchemaV1.Props` object must have (`version`, `vendor`, `validate`), since `schema` is
 * an opaque, consumer-supplied object and anything else in its shape (e.g. the optional `types`
 * field) is not part of the contract this function can or should enforce. Never calls `validate`
 * itself -- that only happens once a check's stdout actually parses (see `parseOutput`); this
 * function's whole job is structural, not behavioral.
 *
 * Accepts a callable `schema` (`typeof schema === "function"`), not just a plain object -- ArkType's
 * `Type` values are themselves callable functions with `"~standard"` attached as a property, exactly
 * as valid a Standard Schema-compliant value as a plain object one (e.g. Zod's), since `["~standard"]`
 * property access works identically on either. Rejecting callable schemas outright would incorrectly
 * reject a real, popular Standard Schema implementation.
 * @param checkId - identifies which check is being validated, used in thrown error messages.
 * @param schema - the check's raw `output.schema` field to validate.
 */
function validateOutputSchema(checkId: string, schema: unknown): void {
  if (schema === undefined) return
  // eslint-disable-next-line secure-coding/no-improper-type-validation -- `null` is already excluded by the preceding `schema === null` short-circuit, and an array slipping past this check (typeof [] === "object") is still correctly rejected by the "~standard" property check just below, since no array has one -- the class of bug this rule guards against (silently treating null/an array as a valid object) can't actually happen here.
  if (schema === null || (typeof schema !== "object" && typeof schema !== "function")) {
    throw new InvalidCheckConfigError(
      checkId,
      "output.schema must be a Standard Schema-compliant object or function when provided (see https://standardschema.dev).",
    )
  }

  const standard = (schema as Record<PropertyKey, unknown>)["~standard"]
  if (standard === null || typeof standard !== "object") {
    throw new InvalidCheckConfigError(
      checkId,
      'output.schema must have a "~standard" property (see https://standardschema.dev).',
    )
  }

  const { version, vendor, validate } = standard as Record<string, unknown>
  if (version !== 1) {
    throw new InvalidCheckConfigError(checkId, 'output.schema["~standard"].version must be 1.')
  }
  if (typeof vendor !== "string") {
    throw new InvalidCheckConfigError(
      checkId,
      'output.schema["~standard"].vendor must be a string.',
    )
  }
  if (typeof validate !== "function") {
    throw new InvalidCheckConfigError(
      checkId,
      'output.schema["~standard"].validate must be a function.',
    )
  }
}

/**
 * Validates that `policy` is a function.
 * @param checkId - identifies which check is being validated, used in thrown error messages.
 * @param policy - the check's raw `policy` field to validate.
 */
function validatePolicy(checkId: string, policy: unknown): void {
  if (typeof policy !== "function") {
    throw new InvalidCheckConfigError(checkId, "policy must be a function.")
  }
}

/**
 * Only this check's own shape (array of strings) and self-dependency --
 * both need nothing beyond this one check's own id/field. Self-dependency
 * is a degenerate one-node cycle, but is deliberately caught here rather
 * than deferred to `validateDependencyGraph`'s cycle detector below: it
 * needs no other check's data, gives a clearer message, and fails in this
 * same per-check pass instead of waiting for a second one.
 * @param checkId - identifies which check is being validated, used in thrown error messages and to detect self-dependency.
 * @param dependsOn - the check's raw `dependsOn` field to validate.
 */
function validateDependsOn(checkId: string, dependsOn: unknown): void {
  if (dependsOn === undefined) return
  if (!Array.isArray(dependsOn) || dependsOn.some((id) => typeof id !== "string")) {
    throw new InvalidCheckConfigError(
      checkId,
      "dependsOn must be an array of check ids (strings) when provided.",
    )
  }
  if (dependsOn.includes(checkId)) {
    throw new InvalidCheckConfigError(checkId, "dependsOn must not include the check's own id.")
  }
}

/**
 * Validates that `isolated`, if provided, is a boolean.
 * @param checkId - identifies which check is being validated, used in thrown error messages.
 * @param isolated - the check's raw `isolated` field to validate.
 */
function validateIsolated(checkId: string, isolated: unknown): void {
  if (isolated !== undefined && typeof isolated !== "boolean") {
    throw new InvalidCheckConfigError(checkId, "isolated must be a boolean when provided.")
  }
}

/**
 * Whole-graph properties that can't be checked per-check in isolation --
 * run once, after every check's own `dependsOn` shape has already been
 * validated by `validateDependsOn` above, so this can walk every
 * `dependsOn` array without re-checking its shape.
 *
 * Declaration order in the `checks` object doubles as the required topological order (see
 * `CheckDefinition.dependsOn`'s own doc comment): every `dependsOn` id must name a check declared
 * earlier* than the check declaring it. This single backward-reference check subsumes what used
 * to be two separate passes (an unknown-id check, then a DFS cycle detector) -- a cycle is no
 * longer expressible at all once every edge is required to point backward, so there is nothing
 * left for a separate cycle detector to catch. `isolated` needs no validation-time edge computation
 * here: its own implied positional edges (see `run-checks.ts`'s `dependencyIndexesFor`) always
 * point backward (to earlier-declared checks) or are pointed at by later-declared checks, by
 * construction, so they can never introduce a cycle either.
 * @param checks - the full check map, keyed by check id, in declaration order.
 */
export function validateDependencyGraph(
  checks: Record<string, { dependsOn?: readonly string[] }>,
): void {
  const ids = Object.keys(checks)
  const indexById = new Map(ids.map((id, index) => [id, index]))

  for (const [index, id] of ids.entries()) {
    const check = checks[id]
    // `id` always comes from `Object.keys(checks)`, so `checks[id]` can
    // never actually be undefined -- kept only because
    // `noUncheckedIndexedAccess` can't itself express that invariant.
    // Stryker disable next-line OptionalChaining -- id always comes from Object.keys(checks), so check can never be undefined here; the optional chaining exists only to satisfy noUncheckedIndexedAccess.
    for (const depId of check?.dependsOn ?? []) {
      const depIndex = indexById.get(depId)
      if (depIndex === undefined) {
        throw new InvalidCheckConfigError(id, `dependsOn references unknown check id "${depId}".`)
      }
      if (depIndex >= index) {
        throw new DependencyDeclaredLaterError(id, depId)
      }
    }
  }
}
