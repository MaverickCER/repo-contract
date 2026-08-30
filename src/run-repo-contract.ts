import * as os from "node:os"
import { validateRepoContractConfig } from "./config/validate-config.js"
import { buildEvidence } from "./evidence/build-evidence.js"
import { runChecks } from "./execution/run-checks.js"
import { runPolicies } from "./policy/run-policies.js"
import type {
  CheckSchema,
  Evidence,
  RepoContractConfig,
  RunRepoContractOptions,
  Verdict,
} from "./types.js"

/**
 * Executes every configured check, collects its evidence, optionally parses
 * its output, evaluates every check's repository-owned policy against the
 * complete evidence, and aggregates a verdict. Never calls `process.exit()`
 * -- returns data; the caller decides what to do with `verdict.passed`.
 *
 * Structural configuration problems throw synchronously before any process
 * spawns. Anything only discoverable by attempting execution (a missing
 * binary, a bad `cwd`) becomes evidence on that check (`status:
 * "spawn_error"`), never a throw. A policy function throwing or rejecting
 * rejects this function's own returned promise (`PolicyThrewError`, or an
 * `AggregateError` of them if more than one policy failed this way) --
 * distinct from a policy that ran fine and simply returned a failure
 * string. See `src/errors.ts` for the full distinction.
 *
 * Execution and policy evaluation are strictly phased: every check finishes
 * running and every check's evidence is fully assembled before any policy
 * is invoked (see specs/architecture.md) -- a policy can safely read
 * `ctx.evidence` for any sibling check's result.
 *
 * Deliberately not declared `async`: validation runs and can throw before this function returns
 * anything at all, so a config problem is a genuine synchronous exception to the caller (as
 * documented above and on `InvalidRepoContractConfigError`/`InvalidCheckConfigError`/
 * `DependencyDeclaredLaterError`) -- an `async function`'s body runs to its first `await` still
 * inside the caller's own call stack, but any throw before that point is nonetheless converted by
 * the language into a rejected `Promise`, never surfaced as a synchronous exception. Splitting
 * validation out into this synchronous wrapper, with the rest of the work in the `async` function
 * below, keeps the documented synchronous-throw guarantee actually true rather than aspirational.
 * @param config - the repo-contract configuration to run: its checks, concurrency, and their policies
 * @param options - run options; `options.checks` restricts execution to specific check ids, `options.signal` allows cancelling the run
 * @returns the assembled `evidence` for every check together with the aggregated `verdict`
 */
export function runRepoContract<const TChecks extends CheckSchema>(
  config: RepoContractConfig<TChecks>,
  options?: RunRepoContractOptions,
): Promise<{ evidence: Evidence<TChecks>; verdict: Verdict<TChecks> }> {
  validateRepoContractConfig(config)
  return runRepoContractAfterValidation(config, options)
}

/**
 * The rest of `runRepoContract`'s work, once its config has already been validated -- see that
 * function's own doc comment for why validation itself lives in a separate, non-`async` wrapper.
 * @param config - the already-validated repo-contract configuration to run.
 * @param options - run options; see `runRepoContract`.
 * @returns the assembled `evidence` for every check together with the aggregated `verdict`
 */
async function runRepoContractAfterValidation<const TChecks extends CheckSchema>(
  config: RepoContractConfig<TChecks>,
  options: RunRepoContractOptions | undefined,
): Promise<{ evidence: Evidence<TChecks>; verdict: Verdict<TChecks> }> {
  // validateRepoContractConfig above already rejects any config.concurrency that is not a
  // positive integer (>= 1, see validate-config.ts), so by the time this line runs
  // config.concurrency is always either undefined or already truthy -- `??` and `&&` therefore
  // select the identical branch for every value this parameter can actually hold here.
  // Stryker disable next-line LogicalOperator -- validateRepoContractConfig above already rejects any config.concurrency that is not a positive integer (>= 1), so by the time this line runs config.concurrency is always either undefined or already truthy; `??` and `&&` therefore select the identical branch for every value this parameter can actually hold here, making them equivalent at this exact call site.
  const concurrency = config.concurrency ?? os.availableParallelism()
  const startedAt = new Date()

  const results = await runChecks(config.checks, concurrency, options)
  const completedAt = new Date()

  const { evidence, entries } = await buildEvidence(results, startedAt, completedAt)
  const verdict = await runPolicies(entries, evidence)

  return { evidence, verdict } as { evidence: Evidence<TChecks>; verdict: Verdict<TChecks> }
}
