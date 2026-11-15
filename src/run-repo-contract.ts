import * as os from "node:os"
import { validateRepoContractConfig } from "./config/validate-config.js"
import { buildEvidence } from "./evidence/build-evidence.js"
import type { ExecutionCapability } from "./execution/spawn-check.js"
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
 * Runs every configured check, then every check's policy against the complete evidence, and
 * returns the evidence and the aggregated verdict. A check's output is parsed when it asks for
 * that. It never calls `process.exit()`: the caller decides what to do with `verdict.passed`.
 *
 * Structural configuration problems throw synchronously before any process
 * spawns. Anything only discoverable by attempting execution (a missing
 * binary, a bad `cwd`) becomes evidence on that check (`status:
 * "spawn_error"`), never a throw. A policy function throwing or rejecting
 * rejects this function's returned promise (`PolicyThrewError`, or an
 * `AggregateError` of them if more than one policy failed this way). That
 * differs from a policy that ran and returned a failing `PolicyResult`. See
 * `src/errors.ts` for the full distinction.
 *
 * Execution and policy evaluation are strictly phased. Every check finishes
 * running, and every check's evidence is fully assembled, before any policy
 * is invoked (see specs/architecture.md). A policy can safely read
 * `ctx.evidence` for any sibling check's result.
 *
 * Deliberately not declared `async`: validation runs and can throw before this function returns
 * anything at all. So a config problem is a synchronous exception to the caller (as
 * documented above and on `InvalidRepoContractConfigError`/`InvalidCheckConfigError`/
 * `DependencyDeclaredLaterError`). An `async function`'s body runs to its first `await` still
 * inside the caller's call stack. But the language converts any throw before that point into a
 * rejected `Promise`, never a synchronous exception. This synchronous wrapper validates, and the
 * `async` function below does the rest. That split keeps the documented synchronous-throw
 * guarantee true.
 * @param config - the repo-contract configuration to run: its checks, concurrency, and their policies
 * @param options - run options; `options.checks` restricts execution to specific check ids, `options.signal` allows cancelling the run
 * @returns the assembled `evidence` for every check together with the aggregated `verdict`
 * @public
 */
export function runRepoContract<const TChecks extends CheckSchema>(
  config: RepoContractConfig<TChecks>,
  options?: RunRepoContractOptions,
): Promise<{ evidence: Evidence<TChecks>; verdict: Verdict<TChecks> }> {
  validateRepoContractConfig(config)
  return runRepoContractAfterValidation(config, options)
}

/**
 * The rest of `runRepoContract`'s work, once its config has been validated. That function's doc
 * comment says why validation lives in a separate, non-`async` wrapper.
 * @param config - the already-validated repo-contract configuration to run.
 * @param options - run options; see `runRepoContract`.
 * @returns the assembled `evidence` for every check together with the aggregated `verdict`
 */
async function runRepoContractAfterValidation<const TChecks extends CheckSchema>(
  config: RepoContractConfig<TChecks>,
  options: RunRepoContractOptions | undefined,
): Promise<{ evidence: Evidence<TChecks>; verdict: Verdict<TChecks> }> {
  // An explicit `config.concurrency` (a positive integer, already validated) wins; otherwise every
  // available core is used.
  const concurrency = config.concurrency ?? os.availableParallelism()
  const startedAt = new Date()

  // Resolved once, here, and threaded through by reference. `env` must not be
  // copied, because a live `process.env` reference needs to stay live (see
  // ExecutionCapability's doc comment).
  const execution: ExecutionCapability = {
    spawn: config.spawn,
    killProcessTree: config.killProcessTree,
    env: config.env,
    shell: config.shell ?? false,
  }

  const results = await runChecks(config.checks, concurrency, execution, options)
  const completedAt = new Date()

  const { evidence, entries } = await buildEvidence(results, startedAt, completedAt)
  const verdict = await runPolicies(entries, evidence, options?.onVerdict)

  return { evidence, verdict } as { evidence: Evidence<TChecks>; verdict: Verdict<TChecks> }
}
