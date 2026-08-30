/**
 * Error hierarchy for repo-contract. Every concrete error carries a stable
 * `code` string for programmatic handling, and never embeds raw
 * stdout/stderr/env values in its message -- only check ids and field names
 * (see SECURITY.md).
 *
 * Three distinct failure classes are kept deliberately separate (see
 * specs/architecture.md):
 *   - Structural config problems throw synchronously, before any process
 *     spawns (`InvalidRepoContractConfigError`, `InvalidCheckConfigError`).
 *   - Anything only discoverable by attempting execution becomes evidence,
 *     never a throw (a bad `cwd`, a missing binary -- recorded as
 *     `status: "spawn_error"` on that check's `CheckEvidence`).
 *   - A policy function throwing or rejecting is a bug in consumer code, not
 *     a check failing its contract -- it propagates as a rejected
 *     `runRepoContract()` promise (`PolicyThrewError`), never silently
 *     turned into a failed verdict entry.
 */
export abstract class RepoContractError extends Error {
  /** Stable, machine-readable identifier for this error's specific failure mode. */
  abstract readonly code: string
}

/** The top-level `RepoContractConfig` itself is structurally invalid -- e.g. `checks` is not an object, or `concurrency` is not a positive integer. (A `checks` object with zero entries is deliberately valid: the run produces an empty, passing `Verdict`.) Thrown synchronously by `runRepoContract`, before anything spawns -- not by `defineRepoContract`, which performs no runtime validation of its own (see its own doc comment). */
export class InvalidRepoContractConfigError extends RepoContractError {
  /** Always `"REPO_CONTRACT_INVALID_CONFIG"`. */
  readonly code = "REPO_CONTRACT_INVALID_CONFIG"

  constructor(reason: string) {
    super(`Invalid repo-contract config -- ${reason}`)
    this.name = "InvalidRepoContractConfigError"
  }
}

/** One check's `CheckDefinition` is structurally invalid -- e.g. an empty `run`, a `run` string containing an unquoted shell operator without `shell: true`, or a missing `policy`. Thrown synchronously, before that check (or any other) spawns. */
export class InvalidCheckConfigError extends RepoContractError {
  /** Always `"REPO_CONTRACT_INVALID_CHECK_CONFIG"`. */
  readonly code = "REPO_CONTRACT_INVALID_CHECK_CONFIG"
  /** The id of the check whose configuration was invalid. */
  readonly checkId: string

  constructor(checkId: string, reason: string) {
    super(`Invalid check config for "${checkId}" -- ${reason}`)
    this.name = "InvalidCheckConfigError"
    this.checkId = checkId
  }
}

/**
 * `RunRepoContractOptions.checks` (a partial-run request) names a check id that doesn't exist in
 * the configured `checks`. Unlike a `dependsOn` id (already validated to exist by
 * `validateRepoContractConfig` before any run starts), `options.checks` is only ever checked once
 * `runChecks` actually resolves it -- there is no earlier structural-validation pass for it.
 */
export class UnknownCheckIdError extends RepoContractError {
  /** Always `"REPO_CONTRACT_UNKNOWN_CHECK_ID"`. */
  readonly code = "REPO_CONTRACT_UNKNOWN_CHECK_ID"
  /** The unrecognized check id named in `options.checks`. */
  readonly checkId: string

  constructor(checkId: string) {
    super(
      `options.checks names "${checkId}", which is not a check id in this config's checks object.`,
    )
    this.name = "UnknownCheckIdError"
    this.checkId = checkId
  }
}

/**
 * A check's `dependsOn` names a check declared *later* in the same `checks` object.
 * `dependsOn` may only reference a check declared earlier -- see `CheckDefinition.dependsOn`'s own
 * doc comment. Declaration order doubles as the required topological order, so this is the only
 * way an invalid dependency graph can arise; a real cycle is structurally impossible once every
 * edge points backward. Thrown synchronously, before any check spawns.
 */
export class DependencyDeclaredLaterError extends RepoContractError {
  /** Always `"REPO_CONTRACT_DEPENDENCY_DECLARED_LATER"`. */
  readonly code = "REPO_CONTRACT_DEPENDENCY_DECLARED_LATER"
  /** The id of the check whose `dependsOn` names a later-declared check. */
  readonly checkId: string
  /** The later-declared check id named in `checkId`'s `dependsOn`. */
  readonly dependencyId: string

  constructor(checkId: string, dependencyId: string) {
    super(
      `Invalid check config for "${checkId}" -- dependsOn: ["${dependencyId}"], but "${dependencyId}" ` +
        `is declared later in the checks object. dependsOn may only reference a check declared ` +
        `earlier -- reorder the checks object so "${dependencyId}" is declared before "${checkId}".`,
    )
    this.name = "DependencyDeclaredLaterError"
    this.checkId = checkId
    this.dependencyId = dependencyId
  }
}

/** A check requested `output: { format: "yaml" }` but the optional `yaml` peer dependency is not installed. Thrown when that check's output is parsed, not at config-validation time (parsing only happens after the process has already run). */
export class ParserDependencyMissingError extends RepoContractError {
  /** Always `"REPO_CONTRACT_PARSER_DEPENDENCY_MISSING"`. */
  readonly code = "REPO_CONTRACT_PARSER_DEPENDENCY_MISSING"
  /** The id of the check whose output could not be parsed. */
  readonly checkId: string
  /** The output format that was requested but whose optional peer dependency is missing. */
  readonly format: OutputFormatForError

  constructor(checkId: string, format: OutputFormatForError, cause: unknown) {
    super(
      `Check "${checkId}" requested output.format: "${format}", but the optional "${format}" ` +
        `peer dependency is not installed -- run \`npm install ${format}\` to enable it.`,
      { cause },
    )
    this.name = "ParserDependencyMissingError"
    this.checkId = checkId
    this.format = format
  }
}

// Kept narrow and local rather than importing OutputFormat from types.ts --
// only "yaml" can ever produce this error today (json/text have no external
// dependency to be missing), but the field stays named/typed generically in
// case a future optional format needs the same treatment.
type OutputFormatForError = "yaml"

/**
 * A check's `policy` function threw synchronously, or returned a `Promise`
 * that later rejected. Both failure modes are wrapped identically. The
 * original thrown/rejected value is preserved verbatim via the native
 * `Error` `cause` chain -- never stringified, summarized, or discarded --
 * so a consumer catching this can still inspect exactly what their own
 * policy code did wrong.
 *
 * A policy throwing never stops any other check's policy from running --
 * every configured check's policy is invoked exactly once regardless of
 * what any other policy does. If more than one policy fails this way in the
 * same run, `runRepoContract()` rejects with a native `AggregateError` whose
 * `errors` array holds one error per failing check -- `PolicyThrewError`,
 * or one of its two narrower siblings below (`PolicyReadUnrequestedOutputError`,
 * `PolicyReadFailedParseValueError`) when the failure matches one of their
 * more specific shapes -- rather than surfacing only the first one found.
 */
export class PolicyThrewError extends RepoContractError {
  /** Always `"REPO_CONTRACT_POLICY_THREW"`. */
  readonly code = "REPO_CONTRACT_POLICY_THREW"
  /** The id of the check whose policy threw or rejected. */
  readonly checkId: string

  constructor(checkId: string, cause: unknown) {
    super(`Policy for check "${checkId}" threw instead of returning a PolicyResult`, { cause })
    this.name = "PolicyThrewError"
    this.checkId = checkId
  }
}

/**
 * A narrower `runPolicies` throws instead of `PolicyThrewError` when the
 * thrown `TypeError`'s own message shows it came from reading a
 * `result.output` property (`.success`, `.value`, `.error`, or `.format`),
 * and this check's `CheckEvidence.output` really is `undefined` -- which
 * happens only when its config never requested `output: { format: ... }` in
 * the first place (see `CheckEvidence.output` in types.ts). Detected from
 * the `TypeError`'s exact V8-produced message ("Cannot read properties of
 * undefined (reading '...')") cross-checked against that `undefined` fact,
 * so it is thrown only for a policy that plausibly hit this exact mistake --
 * any other `TypeError`, or a check that did request a format, still becomes
 * a plain `PolicyThrewError`. This is best-effort inference from the
 * `TypeError`'s message text, not a verified trace back to `result.output`
 * itself -- V8's message carries only the property name, so an unrelated
 * bug that happens to read the same property name off some other
 * `undefined` value can still be misclassified this way (see
 * `unrequestedOutputProperty` in run-policies.ts). `cause` still holds the
 * original `TypeError` verbatim, exactly as `PolicyThrewError` guarantees
 * for every other policy failure, so the true cause remains recoverable
 * either way.
 */
export class PolicyReadUnrequestedOutputError extends RepoContractError {
  /** Always `"REPO_CONTRACT_POLICY_READ_UNREQUESTED_OUTPUT"`. */
  readonly code = "REPO_CONTRACT_POLICY_READ_UNREQUESTED_OUTPUT"
  /** The id of the check whose policy read `result.output` without requesting a format. */
  readonly checkId: string

  constructor(checkId: string, property: string, cause: unknown) {
    super(
      `Policy for check "${checkId}" read \`result.output.${property}\`, but "${checkId}" never ` +
        `requested an output format, so \`result.output\` is undefined -- add ` +
        `\`output: { format: "json" }\` (or "yaml"/"text") to check "${checkId}"'s definition to ` +
        `parse its stdout, then narrow with \`result.output?.success\` before reading ` +
        `\`.value\`/\`.error\`.`,
      { cause },
    )
    this.name = "PolicyReadUnrequestedOutputError"
    this.checkId = checkId
  }
}

/**
 * `PolicyThrewError`'s other special case, alongside
 * `PolicyReadUnrequestedOutputError`: this check *did* request
 * `output: { format: ... }`, but that parse itself failed
 * (`result.output.success === false` -- see `ParsedOutputFailure` in types.ts, which
 * has no `value` field, only `error`), and the policy read a property off
 * `result.output.value` anyway without checking `.success` first. Detected the same
 * way `runPolicies` detects the sibling case -- a thrown `TypeError` whose own
 * message shows a property read off `undefined` -- cross-checked against this
 * check's own evidence having `output.success === false`, so a genuinely unrelated
 * `TypeError`, or a check whose parse actually succeeded, still becomes a plain
 * `PolicyThrewError`. Unlike `PolicyReadUnrequestedOutputError`, the read property
 * isn't restricted to a known list here -- `result.output.value`'s shape is whatever
 * the external tool printed, entirely unknown to repo-contract -- so this match is
 * necessarily a little broader. `cause` still holds the original `TypeError`
 * verbatim; the message never repeats `result.output.error`'s own text, which may
 * contain raw stdout content (see SECURITY.md).
 */
export class PolicyReadFailedParseValueError extends RepoContractError {
  /** Always `"REPO_CONTRACT_POLICY_READ_FAILED_PARSE_VALUE"`. */
  readonly code = "REPO_CONTRACT_POLICY_READ_FAILED_PARSE_VALUE"
  /** The id of the check whose policy read `result.output.value` after a failed parse. */
  readonly checkId: string

  constructor(checkId: string, property: string, cause: unknown) {
    super(
      `Policy for check "${checkId}" read \`result.output.value.${property}\`, but "${checkId}"'s ` +
        `output failed to parse -- a failed parse has \`result.output.error\`, never \`.value\` -- ` +
        `check \`result.output.success\` before reading \`.value\`.`,
      { cause },
    )
    this.name = "PolicyReadFailedParseValueError"
    this.checkId = checkId
  }
}
