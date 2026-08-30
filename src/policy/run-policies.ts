import type { ParsedCheckEntry } from "../evidence/build-evidence.js"
import {
  PolicyReadFailedParseValueError,
  PolicyReadUnrequestedOutputError,
  PolicyThrewError,
} from "../errors.js"
import type {
  CheckEvidence,
  Evidence,
  ParsedOutput,
  PolicyOutcome,
  PolicyResult,
  Verdict,
} from "../types.js"

const POLICY_OUTCOMES: readonly PolicyOutcome[] = ["pass", "fail", "warn"]

/** `ParsedOutput`'s own field names -- the only properties reading `result.output` when it's `undefined` can throw on, so only these can trigger `PolicyReadUnrequestedOutputError` below. */
const OUTPUT_PROPERTIES: ReadonlySet<string> = new Set(["success", "value", "error", "format"])

/**
 * Recognizes the one `TypeError` message shape Node/V8 produces for reading a
 * property off `undefined` ("Cannot read properties of undefined (reading
 * 'x')"), and returns `x`. Returns `undefined` for any other error -- a
 * `TypeError` with a different message, or anything that isn't a `TypeError`
 * at all.
 * @param error - the value caught from invoking (or awaiting) a check's `policy`
 * @returns the read property name, or `undefined` if `error` doesn't match this exact shape
 */
function readPropertyOfUndefined(error: unknown): string | undefined {
  if (!(error instanceof TypeError)) return undefined
  const match = /^Cannot read properties of undefined \(reading '([^']+)'\)$/.exec(error.message)
  return match?.[1]
}

/**
 * Narrows `readPropertyOfUndefined` to the specific shape
 * `PolicyReadUnrequestedOutputError` covers: the read property must also be
 * one of `ParsedOutput`'s own fields. This meaningfully narrows false
 * positives -- an unrelated `TypeError` reading some other property name
 * never matches -- but is not proof the read actually came from
 * `result.output` itself: V8's own error message carries only the property
 * name, never the object expression it was read from, so a policy's own
 * unrelated bug that happens to read `.success`/`.value`/`.error`/`.format`
 * off some other `undefined` value (a `Result`-shaped helper's own return
 * value, for instance) can still be misclassified as this specific mistake.
 * The residual risk from that is a misleading message, never a lost error --
 * `cause` always preserves the original `TypeError` verbatim regardless of
 * which class wraps it, so the true cause is still recoverable by a consumer
 * that inspects it.
 * @param error - the value caught from invoking (or awaiting) a check's `policy`
 * @returns the read property name, or `undefined` if `error` doesn't match this exact shape
 */
function unrequestedOutputProperty(error: unknown): string | undefined {
  const property = readPropertyOfUndefined(error)
  // Provably equivalent, not a coverage gap: OUTPUT_PROPERTIES is a
  // ReadonlySet<string>, so `.has(undefined)` is always false regardless of
  // its argument's runtime value -- the `property !== undefined` guard is
  // therefore redundant with the `.has()` call it short-circuits into, and
  // no test can observe a difference between keeping and removing it. Kept
  // anyway for readability (it documents "must be a recognized property
  // name" without requiring the reader to already know Set.has's behavior
  // on undefined), not because it changes behavior.
  // Stryker disable next-line ConditionalExpression -- OUTPUT_PROPERTIES is a ReadonlySet<string>, so .has(undefined) is always false regardless of argument, making the property !== undefined guard redundant with the .has() call it short-circuits into; removing it changes no observable behavior.
  return property !== undefined && OUTPUT_PROPERTIES.has(property) ? property : undefined
}

/**
 * Chooses which error wraps one check's caught policy failure. Defaults to a
 * plain `PolicyThrewError`, upgrading to a more specific, more actionable
 * class for two known mistakes, each recognized by cross-checking the
 * failure's own `TypeError` message shape against this check's own `output`
 * evidence:
 *  - `output === undefined` (this check never requested a format) and the
 *    read property is one of `ParsedOutput`'s own fields --
 *    `PolicyReadUnrequestedOutputError`.
 *  - `output.success === false` (this check requested a format, but that
 *    parse failed, so `result.output` has no `value` field) and *any*
 *    property was read off the resulting `undefined` -- `PolicyReadFailedParseValueError`.
 * A `TypeError` that doesn't match either shape, or a check whose `output`
 * matches neither state, always falls back to the plain `PolicyThrewError`
 * every other policy failure already gets. Both upgrades are best-effort
 * inference from the failure's own message text, not a verified trace back
 * to `result.output` -- see `unrequestedOutputProperty`'s own doc comment
 * for the specific, known false-positive channel this leaves open.
 * @param checkId - the failing check's id
 * @param output - that check's own `CheckEvidence.output`, tested against the two shapes above
 * @param error - the value caught from invoking (or awaiting) the check's `policy`
 * @returns the error to record for this check
 */
function wrapPolicyFailure(
  checkId: string,
  output: ParsedOutput<unknown> | undefined,
  error: unknown,
): PolicyThrewError | PolicyReadUnrequestedOutputError | PolicyReadFailedParseValueError {
  if (output === undefined) {
    const property = unrequestedOutputProperty(error)
    if (property !== undefined) {
      return new PolicyReadUnrequestedOutputError(checkId, property, error)
    }
  } else if (!output.success) {
    const property = readPropertyOfUndefined(error)
    if (property !== undefined) {
      return new PolicyReadFailedParseValueError(checkId, property, error)
    }
  }
  return new PolicyThrewError(checkId, error)
}

/**
 * Describes why `value` is not a valid `PolicyResult`, or `undefined` if it
 * is one. A TypeScript-authored policy can never fail this (the type
 * checker already guarantees it), but nothing stops a JavaScript consumer,
 * or a typo'd literal (`"failed"` instead of `"fail"`), from returning
 * something else at runtime -- and `passed` below is computed by comparing
 * `outcome` against `"fail"`, so an unvalidated garbage value would
 * otherwise be silently treated as non-failing.
 * @param value - the raw, `await`-ed return value of a check's `policy` call
 * @returns a human-readable reason `value` is invalid, or `undefined` if it is a valid `PolicyResult`
 */
function invalidPolicyResultReason(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) {
    // `typeof null === "object"` in JavaScript, so falling back to `typeof value`
    // here would nonsensically report "got object" for a null result.
    return `expected an object with "outcome" and "rationale", got ${value === null ? "null" : typeof value}`
  }
  const outcome = (value as { outcome?: unknown }).outcome
  if (!POLICY_OUTCOMES.includes(outcome as PolicyOutcome)) {
    return `"outcome" must be "pass", "fail", or "warn", got ${typeof outcome === "string" ? `"${outcome}"` : typeof outcome}`
  }
  const rationale = (value as { rationale?: unknown }).rationale
  if (typeof rationale !== "string") {
    return `"rationale" must be a string, got ${typeof rationale}`
  }
  return undefined
}

/**
 * Invokes every check's `policy` against the complete, already-assembled
 * `evidence` and aggregates the results into a `Verdict`. Each check's
 * `PolicyResult` is stored verbatim under `checks[checkId]`; `passed` is
 * `true` only if every check's `outcome` is `"pass"` or `"warn"` -- no
 * check's failure is ever collapsed into another's or into one generic
 * message.
 *
 * Every `policy` call is isolated: the call itself is wrapped in `try/catch`
 * (a policy doesn't have to be `async` to misbehave), and its returned
 * value is `await`-ed inside that same `try`, so a promise that rejects
 * later is caught identically to a synchronous throw. The resolved value is
 * then validated against the `PolicyResult` contract itself (`outcome` is
 * exactly `"pass"`, `"fail"`, or `"warn"`; `rationale` is a string) before
 * it is trusted -- a malformed result is treated exactly like a throw
 * rather than silently coerced into a pass. Every one of these failure
 * modes is wrapped in `PolicyThrewError`, with the original thrown value
 * (or a descriptive validation error, for a malformed result) preserved via
 * `cause` -- never stringified or discarded. Two specific, common mistakes
 * get a more actionable error instead, chosen by `wrapPolicyFailure` (see
 * its own doc comment): reading a `result.output` property on a check that
 * never requested a format (`PolicyReadUnrequestedOutputError`), and reading
 * `result.output.value` on a check whose requested parse actually failed
 * (`PolicyReadFailedParseValueError`) -- both still preserve the original
 * `TypeError` via `cause`, exactly like the plain `PolicyThrewError` case.
 * One policy failing this way never stops any other check's policy from
 * running. If more than one policy fails this way in the same run, this
 * function throws a native `AggregateError` whose `errors` holds one such
 * error per failing check, rather than surfacing only the first one found;
 * if exactly one policy fails, it throws that single error directly.
 * @param entries - each check's id, definition, and final (possibly parsed-output) evidence to invoke its policy against
 * @param evidence - the complete, already-assembled evidence for the whole run, passed to every policy call
 * @returns the aggregated `Verdict` (throws instead if one or more policies failed to produce a valid `PolicyResult`)
 */
export async function runPolicies(
  entries: readonly ParsedCheckEntry[],
  evidence: Evidence,
): Promise<Verdict> {
  const thrown: (
    PolicyThrewError | PolicyReadUnrequestedOutputError | PolicyReadFailedParseValueError
  )[] = []
  // Indexed by each entry's position, not appended on promise resolution: the
  // policies run concurrently and settle in arbitrary order, but `Verdict.checks`
  // must follow declaration order, consistently with `Evidence.checks`.
  const checkResults: (readonly [string, PolicyResult] | undefined)[] = []

  await Promise.all(
    entries.map(async ([checkId, check, checkEvidence], entryIndex) => {
      // Derived on the fly from data that already exists (this check's own
      // dependsOn plus the already-fully-assembled evidence.checks) --
      // never persisted, so Evidence's own shape/schema doesn't grow. `{}`
      // for a check with no dependsOn, never undefined.
      const dependencies: Record<string, CheckEvidence> = {}
      // `check.dependsOn` is `undefined` exactly for a check with no
      // declared dependencies, in which case this fallback's own contents
      // are unobservable regardless of what they are: any id it iterated
      // would look up `evidence.checks[depId]`, find nothing (no real
      // check has that id), and be filtered out by the guard below anyway
      // -- confirmed by "a policy with no dependsOn sees ctx.dependencies
      // as an empty object" in run-policies.test.ts, which passes
      // regardless of this fallback's specific value.
      // Stryker disable next-line ArrayDeclaration -- check.dependsOn is undefined exactly when a check has no declared dependencies, in which case this fallback's contents are unobservable regardless of value: any id iterated would look up evidence.checks[depId], find nothing, and get filtered out by the guard below anyway, confirmed by the "sees ctx.dependencies as an empty object" test in run-policies.test.ts, which passes regardless of the fallback's specific value.
      for (const depId of check.dependsOn ?? []) {
        const depEvidence = evidence.checks[depId]
        // validate-config.ts already guarantees every dependsOn id names a
        // check that exists in this run, and the phasing invariant
        // guarantees its evidence is already assembled by the time any
        // policy runs -- this guard exists only to satisfy
        // noUncheckedIndexedAccess.
        // Stryker disable next-line ConditionalExpression -- validate-config.ts already guarantees every dependsOn id names a check that exists in this run, and the phasing invariant guarantees its evidence is already assembled by the time any policy runs; this guard exists only to satisfy noUncheckedIndexedAccess.
        if (depEvidence !== undefined) dependencies[depId] = depEvidence
      }

      let outcome: PolicyResult
      try {
        const rawResult: unknown = await check.policy({
          result: checkEvidence,
          evidence,
          dependencies,
        })
        const invalidReason = invalidPolicyResultReason(rawResult)
        if (invalidReason !== undefined) {
          throw new Error(
            `Policy for check "${checkId}" returned an invalid PolicyResult: ${invalidReason}.`,
          )
        }
        outcome = rawResult as PolicyResult
      } catch (error) {
        thrown.push(wrapPolicyFailure(checkId, checkEvidence.output, error))
        return
      }
      checkResults[entryIndex] = [checkId, outcome]
    }),
  )

  if (thrown.length === 1) {
    const [only] = thrown as [
      PolicyThrewError | PolicyReadUnrequestedOutputError | PolicyReadFailedParseValueError,
    ]
    throw only
  }
  // `> 1` vs `>= 1` are equivalent here given the early return just above --
  // by the time this line can even run, thrown.length is never 1 (either 0,
  // falling through to the success path below either way, or >= 2, taking
  // this branch either way). Documented rather than silently accepted so a
  // future refactor that removes the early return doesn't quietly widen it.
  // Stryker disable next-line EqualityOperator -- "> 1" vs. ">= 1" are equivalent here given the early return just above: by the time this line runs, thrown.length is never exactly 1 (either 0 or >= 2 either way), documented so a future refactor that removes the early return doesn't quietly widen this silently.
  if (thrown.length > 1) {
    throw new AggregateError(
      thrown,
      `${String(thrown.length)} check policies threw instead of returning a PolicyResult.`,
    )
  }

  // Every slot is filled and in declaration order by now: a policy that threw
  // took the early-return path above, so `thrown.length === 0` here means every
  // `entries.map` callback assigned its `checkResults[entryIndex]`. The cast
  // just drops the `| undefined` the sparse-write type carries.
  const orderedResults = checkResults as readonly (readonly [string, PolicyResult])[]
  const checks = Object.fromEntries(orderedResults)
  const passed = orderedResults.every(([, result]) => result.outcome !== "fail")

  return { version: 2, passed, checks }
}
