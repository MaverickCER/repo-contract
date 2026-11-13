/**
 * Error hierarchy for repo-contract. Every concrete error carries a stable
 * `code` string for programmatic handling, and never embeds raw
 * stdout/stderr/env values in its message: only check ids and field names
 * (see SECURITY.md).
 *
 * Three distinct failure classes are kept deliberately separate (see
 * specs/architecture.md):
 *   - Structural config problems throw synchronously, before any process
 *     spawns (`InvalidRepoContractConfigError`, `InvalidCheckConfigError`).
 *   - Anything only discoverable by attempting execution becomes evidence,
 *     never a throw (a bad `cwd`, a missing binary: recorded as
 *     `status: "spawn_error"` on that check's `CheckEvidence`).
 *   - A policy function throwing or rejecting is a bug in consumer code, not
 *     a check failing its contract: it propagates as a rejected
 *     `runRepoContract()` promise (`PolicyThrewError`), never silently
 *     turned into a failed verdict entry.
 * @public
 */
export abstract class RepoContractError extends Error {
  /** Stable, machine-readable identifier for this error's specific failure mode. */
  abstract readonly code: string
}

/**
 * The top-level `RepoContractConfig` itself is structurally invalid: e.g. `checks` is not an
 * object, or `concurrency` is not a positive integer. (A `checks` object with zero entries is
 * deliberately valid: the run produces an empty, passing `Verdict`.) Thrown synchronously by
 * `runRepoContract`, before anything spawns; not by `defineRepoContract`, which performs no
 * runtime validation of its own (see its own doc comment).
 * @public
 */
export class InvalidRepoContractConfigError extends RepoContractError {
  /** Always `"REPO_CONTRACT_INVALID_CONFIG"`. */
  readonly code = "REPO_CONTRACT_INVALID_CONFIG"

  constructor(reason: string) {
    super(`Invalid repo-contract config: ${reason}`)
    this.name = "InvalidRepoContractConfigError"
  }
}

/**
 * One check's `CheckDefinition` is structurally invalid: e.g. an empty `run`, a `run` string
 * containing an unquoted shell operator without `shell: true`, or a missing `policy`. Thrown
 * synchronously, before that check (or any other) spawns.
 * @public
 */
export class InvalidCheckConfigError extends RepoContractError {
  /** Always `"REPO_CONTRACT_INVALID_CHECK_CONFIG"`. */
  readonly code = "REPO_CONTRACT_INVALID_CHECK_CONFIG"
  /** The id of the check whose configuration was invalid. */
  readonly checkId: string

  constructor(checkId: string, reason: string) {
    super(`Invalid check config for "${checkId}": ${reason}`)
    this.name = "InvalidCheckConfigError"
    this.checkId = checkId
  }
}

/**
 * `RunRepoContractOptions.checks` (a partial-run request) names a check id that doesn't exist in
 * the configured `checks`. Unlike a `dependsOn` id (already validated to exist by
 * `validateRepoContractConfig` before any run starts), `options.checks` is only ever checked once
 * `runChecks` actually resolves it: there is no earlier structural-validation pass for it.
 * @public
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
 * `dependsOn` may only reference a check declared earlier: see `CheckDefinition.dependsOn`'s own
 * doc comment. Declaration order doubles as the required topological order, so this is the only
 * way an invalid dependency graph can arise; a real cycle is structurally impossible once every
 * edge points backward. Thrown synchronously, before any check spawns.
 * @public
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
      `Invalid check config for "${checkId}": dependsOn names "${dependencyId}", which ` +
        `is declared later in the checks object. dependsOn may only reference a check declared ` +
        `earlier. Reorder the checks object so "${dependencyId}" is declared before "${checkId}".`,
    )
    this.name = "DependencyDeclaredLaterError"
    this.checkId = checkId
    this.dependencyId = dependencyId
  }
}

/**
 * A check's `output.schema["~standard"].validate()` threw synchronously, or returned a `Promise`
 * that rejected, instead of returning a `Result`. This is a bug in the consumer-supplied schema
 * object, not malformed check output. `PolicyThrewError` below draws the same line for a
 * throwing policy. A schema *returning* failure `issues` becomes an ordinary
 * `ParsedOutputFailure`, reported as data like a malformed-JSON parse failure. A
 * schema *throwing* means the validator itself is broken, so it propagates as a rejected
 * `runRepoContract()` promise instead. The original thrown/rejected value is preserved verbatim
 * via the native `Error` `cause` chain.
 * @public
 */
export class StandardSchemaValidateThrewError extends RepoContractError {
  /** Always `"REPO_CONTRACT_STANDARD_SCHEMA_VALIDATE_THREW"`. */
  readonly code = "REPO_CONTRACT_STANDARD_SCHEMA_VALIDATE_THREW"
  /** The id of the check whose `output.schema` threw during validation. */
  readonly checkId: string

  constructor(checkId: string, cause: unknown) {
    super(
      `Check "${checkId}"'s output.schema["~standard"].validate() threw instead of returning a Result`,
      { cause },
    )
    this.name = "StandardSchemaValidateThrewError"
    this.checkId = checkId
  }
}

/**
 * A check's `policy` function threw synchronously, or returned a `Promise`
 * that later rejected. Both failure modes are wrapped identically. The
 * original thrown/rejected value is preserved verbatim via the native
 * `Error` `cause` chain (never stringified, summarized, or discarded)
 * so a consumer catching this can still inspect exactly what their own
 * policy code did wrong.
 *
 * A policy throwing never stops any other check's policy from running:
 * every configured check's policy is invoked exactly once regardless of
 * what any other policy does. If more than one policy fails this way in the
 * same run, `runRepoContract()` rejects with a native `AggregateError`
 * instead of surfacing only the first. Its `errors` array holds one error per
 * failing check. Each is a `PolicyThrewError`, or one of its two narrower
 * siblings below when the failure matches their shape
 * (`PolicyReadUnrequestedOutputError`, `PolicyReadFailedParseValueError`).
 * @public
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
 * A narrower error `runPolicies` throws instead of `PolicyThrewError`. Two
 * conditions must hold. The thrown `TypeError`'s message shows it came from
 * reading a `result.output` property (`.success`, `.value`, `.error`, or
 * `.format`). And this check's `CheckEvidence.output` really is `undefined`,
 * which happens only when its config never requested
 * `output: { format: ... }` (see `CheckEvidence.output` in types.ts).
 *
 * The first condition is read from V8's exact message ("Cannot read
 * properties of undefined (reading '...')"). So this error is thrown only for
 * a policy that plausibly made this mistake. Any other `TypeError`, or a
 * check that did request a format, still becomes a plain `PolicyThrewError`.
 * This is best-effort inference from message text, not a verified trace back
 * to `result.output`. V8's message carries only the property name. So an
 * unrelated bug that reads the same property name off some other `undefined`
 * value can still be misclassified (see `unrequestedOutputProperty` in
 * run-policies.ts). `cause` still holds the original `TypeError` verbatim, as
 * `PolicyThrewError` guarantees for every policy failure, so the true cause
 * stays recoverable.
 * @public
 */
export class PolicyReadUnrequestedOutputError extends RepoContractError {
  /** Always `"REPO_CONTRACT_POLICY_READ_UNREQUESTED_OUTPUT"`. */
  readonly code = "REPO_CONTRACT_POLICY_READ_UNREQUESTED_OUTPUT"
  /** The id of the check whose policy read `result.output` without requesting a format. */
  readonly checkId: string

  constructor(checkId: string, property: string, cause: unknown) {
    super(
      `Policy for check "${checkId}" read \`result.output.${property}\`, but "${checkId}" never ` +
        `requested an output format, so \`result.output\` is undefined. Add ` +
        `\`output: { format: "json" }\` (or "text") to check "${checkId}"'s definition to ` +
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
 * `PolicyReadUnrequestedOutputError`. This check *did* request
 * `output: { format: ... }`, but that parse failed
 * (`result.output.success === false`). `ParsedOutputFailure` in types.ts has
 * no `value` field, only `error`. The policy still read a property off `result.output.value` without
 * checking `.success` first. `runPolicies` detects it as it does the sibling
 * case: a thrown `TypeError` whose message shows a property read off
 * `undefined`. It then confirms this check's evidence has
 * `output.success === false`. So an unrelated `TypeError`, or a check whose
 * parse succeeded, still becomes a plain `PolicyThrewError`. Unlike `PolicyReadUnrequestedOutputError`, the read property
 * isn't restricted to a known list here (`result.output.value`'s shape is whatever
 * the external tool printed, entirely unknown to repo-contract) so this match is
 * necessarily a little broader. `cause` still holds the original `TypeError`
 * verbatim; the message never repeats `result.output.error`'s own text, which may
 * contain raw stdout content (see SECURITY.md).
 * @public
 */
export class PolicyReadFailedParseValueError extends RepoContractError {
  /** Always `"REPO_CONTRACT_POLICY_READ_FAILED_PARSE_VALUE"`. */
  readonly code = "REPO_CONTRACT_POLICY_READ_FAILED_PARSE_VALUE"
  /** The id of the check whose policy read `result.output.value` after a failed parse. */
  readonly checkId: string

  constructor(checkId: string, property: string, cause: unknown) {
    super(
      `Policy for check "${checkId}" read \`result.output.value.${property}\`, but "${checkId}"'s ` +
        `output failed to parse. A failed parse has \`result.output.error\`, never \`.value\`. ` +
        `Check \`result.output.success\` before reading \`.value\`.`,
      { cause },
    )
    this.name = "PolicyReadFailedParseValueError"
    this.checkId = checkId
  }
}
