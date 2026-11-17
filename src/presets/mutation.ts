import { readFile } from "node:fs/promises"
import { resolveMutants } from "../affected/mutation-report.js"
import { parseShardSpec } from "../affected/shard.js"
import { exceptionRegistryStandardSchema } from "../helpers/exception-record.js"
import { loadExceptionRegistry } from "../helpers/load-exception-registry.js"
import type { CheckDefinitionConfig, PolicyResult } from "../types.js"
import {
  applyMutationExceptions,
  judgeMutation,
  MUTATION_EXCEPTION_SCHEMA,
  readMutationRun,
} from "./rules/mutation-verdict.js"
import type { MutationExceptionRecord, MutationRunReport } from "./rules/mutation-verdict.js"
import { checkDependencyInstalled } from "./shared/missing-dependency.js"
import { readJsonReport } from "./shared/read-json-report.js"
import { checkTerminatedAbnormally } from "./shared/terminal-status.js"
import { checkOptionsObject } from "./rules/option-checks.js"

/** Options accepted by {@link mutation}. */
export interface MutationOptions {
  /** The lowest mutation score that passes, in percent. `100` demands every mutant detected or recorded. Defaults to `80`. */
  readonly minScore?: number
  /** The registry of hand-verified mutants. Defaults to `".repo-contract/exceptions/mutation.json"`; `false` reads none. */
  readonly registry?: string | false
  /** Mutate one slice, written `<index>/<total>`. A sharded run cannot call a record stale. */
  readonly shard?: string
  /** Mutate only these files. An empty list passes with nothing to mutate. */
  readonly mutate?: readonly string[]
  /** Judge this Stryker report and mutate nothing, such as the merged report of a sharded run. */
  readonly report?: string
  /** Reuse a clean run while nothing it depends on has changed. Defaults to `"off"`; a CI run should keep it off. */
  readonly cache?: "read-write" | "read-only" | "off"
  /** The Stryker config file. Defaults to the first `stryker.config.*` or `stryker.conf.*` found. */
  readonly config?: string
  /** Re-run at most this many timed-out mutants alone before a timeout counts. Defaults to `5`. */
  readonly confirmTimeouts?: number
  /** Time the whole run may take, in milliseconds. */
  readonly timeoutMs?: number
  /**
   * Patch `@stryker-mutator/vitest-runner` when Vitest 5 needs it. Defaults to `true`. The patch
   * changes the runner's test-name separator to Vitest 5's (stryker-js#6210). Without it, every
   * mutant runs 0 tests. Only an install inside the project is patched. `false` passes
   * `--no-patch-vitest-runner`.
   */
  readonly patchVitestRunner?: boolean
}

const DEFAULT_REGISTRY = ".repo-contract/exceptions/mutation.json"
const CACHE_MODES: ReadonlySet<unknown> = new Set(["read-write", "read-only", "off"])

/** The end of stderr a failing rationale shows: Stryker's last words, without flooding the summary. */
const STDERR_TAIL = 3000

/**
 * @param options - the factory's options.
 * @returns what is wrong with them, or `undefined`.
 */
function optionProblem(options: MutationOptions): string | undefined {
  const { minScore, confirmTimeouts, timeoutMs, shard, mutate, cache, registry, report } = options
  const { patchVitestRunner } = options
  // The CLI refuses the pair with exit 2; caught here, the config fails before Stryker is asked.
  if (report !== undefined && shard !== undefined) {
    return "report and shard cannot be used together: a report is judged whole, so there is nothing to shard."
  }
  if (minScore !== undefined && !(minScore >= 0 && minScore <= 100)) {
    return `minScore must be a number from 0 to 100, not ${String(minScore)}.`
  }
  if (
    confirmTimeouts !== undefined &&
    !(Number.isInteger(confirmTimeouts) && confirmTimeouts >= 0)
  ) {
    return `confirmTimeouts must be a whole number of 0 or more, not ${String(confirmTimeouts)}.`
  }
  if (timeoutMs !== undefined && !(Number.isInteger(timeoutMs) && timeoutMs > 0)) {
    return `timeoutMs must be a positive whole number of milliseconds, not ${String(timeoutMs)}.`
  }
  if (shard !== undefined) {
    const parsed = parseShardSpec(shard)
    if (!parsed.ok) return `shard: ${parsed.error}`
  }
  // The list travels as one comma-joined flag value.
  const badFile = mutate?.find((file) => file === "" || file.includes(","))
  if (badFile !== undefined) {
    return `mutate: a file name cannot be empty or hold a comma: ${JSON.stringify(badFile)}.`
  }
  if (cache !== undefined && !CACHE_MODES.has(cache)) {
    return `cache must be "read-write", "read-only" or "off", not ${JSON.stringify(cache)}.`
  }
  if (patchVitestRunner !== undefined && typeof patchVitestRunner !== "boolean") {
    return `patchVitestRunner must be true or false, not ${JSON.stringify(patchVitestRunner)}.`
  }
  return registry === "" ? "registry must be a path or false, not an empty string." : undefined
}

/**
 * @param run - the run report.
 * @returns the run's message, with its timeouts and a non-zero Stryker exit added.
 */
function runNote(run: MutationRunReport): string {
  const { rerun, caught } = run.timeouts
  return [
    run.message,
    ...(rerun > 0
      ? [`${String(rerun)} timed-out mutant(s) re-run alone: ${String(caught)} caught.`]
      : []),
    ...(run.exitCode !== null && run.exitCode !== 0
      ? [`Stryker exited ${String(run.exitCode)}.`]
      : []),
  ].join(" ")
}

/**
 * @param registry - the registry option.
 * @returns its records, or the failing verdict.
 */
async function loadRecords(
  registry: string | false,
): Promise<
  | { readonly ok: true; readonly records: readonly MutationExceptionRecord[] }
  | { readonly ok: false; readonly result: PolicyResult }
> {
  if (registry === false) return { ok: true, records: [] }
  const loaded = await loadExceptionRegistry({
    path: registry,
    schema: exceptionRegistryStandardSchema(MUTATION_EXCEPTION_SCHEMA),
  })
  if (loaded.ok) return loaded
  return {
    ok: false,
    result: {
      outcome: "fail",
      rationale: [
        `Mutation: ${registry} failed to load:`,
        ...loaded.errors.map((error) => `- ${error}`),
      ].join("\n"),
    },
  }
}

/**
 * Judges a run report that names a Stryker report.
 * @param run - the run report.
 * @param minScore - the floor.
 * @param registry - the registry option.
 * @returns the verdict.
 */
async function judgeRun(
  run: MutationRunReport,
  minScore: number,
  registry: string | false,
): Promise<PolicyResult> {
  const { report: reportPath } = run
  const parsed = await readJsonReport<unknown>(
    () => readFile(reportPath, "utf8"),
    `Mutation: cannot read the Stryker report ${reportPath}.`,
    `Mutation: the Stryker report ${reportPath} is not JSON.`,
  )
  if (!parsed.ok) return parsed.result
  const report = parsed.value
  const resolved = resolveMutants(report)
  if (!resolved.ok) return { outcome: "fail", rationale: `Mutation: ${resolved.error}` }

  const loaded = await loadRecords(registry)
  if (!loaded.ok) return loaded.result

  const applied = applyMutationExceptions(resolved.mutants, loaded.records, {
    full: run.shard === null && run.mutate === null,
    now: new Date(),
  })
  const judged = judgeMutation({ mutants: resolved.mutants, applied, minScore, shard: run.shard })
  return { ...judged, rationale: `${judged.rationale}\n${runNote(run)}` }
}

/**
 * Mutation testing via Stryker, run through `repo-contract mutation run --json`. Fails below
 * `minScore`, on any Timeout still standing after it is re-run alone, and on an incomplete or
 * stale registry record. Killed, RuntimeError and CompileError count as detected; Ignored mutants
 * are left out of the score. A run in which a Survived mutant ran 0 tests fails: it proves nothing.
 *
 * The command always runs Stryker cold: it deletes the incremental file and passes `--force`.
 * @param options - configuration for this check; see {@link MutationOptions}.
 * @returns the configured check.
 * @throws {TypeError} when `options` is not an object.
 * @beta
 */
export function mutation(options: MutationOptions = {}): CheckDefinitionConfig {
  checkOptionsObject("mutation", options)
  const problem = optionProblem(options)
  if (problem !== undefined) {
    return {
      run: ["node", "-e", ""],
      isolated: true,
      policy: () => ({
        outcome: "fail",
        rationale: `Mutation: the preset's options are invalid: ${problem}`,
      }),
    }
  }
  const {
    minScore = 80,
    registry = DEFAULT_REGISTRY,
    shard,
    mutate,
    report,
    cache = "off",
    config,
    confirmTimeouts = 5,
    timeoutMs,
    patchVitestRunner = true,
  } = options

  return {
    run: [
      "repo-contract",
      "mutation",
      "run",
      "--json",
      "--cache",
      cache,
      "--confirm-timeouts",
      String(confirmTimeouts),
      ...(shard === undefined ? [] : ["--shard", shard]),
      ...(mutate === undefined ? [] : [`--mutate=${mutate.join(",")}`]),
      ...(report === undefined ? [] : ["--report", report]),
      ...(config === undefined ? [] : ["--config", config]),
      ...(patchVitestRunner ? [] : ["--no-patch-vitest-runner"]),
    ],
    output: { format: "json" },
    isolated: true,
    // An undefined timeoutMs is the same as none: the runner ignores it.
    timeoutMs,
    policy: async ({ result }): Promise<PolicyResult> => {
      const missing = checkDependencyInstalled(result, "repo-contract")
      if (missing) return missing
      const terminated = checkTerminatedAbnormally(result, "The mutation command")
      if (terminated) return terminated

      if (!result.output?.success) {
        const tail = result.stderr.trim().slice(-STDERR_TAIL)
        return {
          outcome: "fail",
          rationale: [
            "Mutation: `repo-contract mutation run --json` printed no JSON report.",
            ...(tail === "" ? [] : [tail]),
          ].join("\n"),
        }
      }
      const run = readMutationRun(result.output.value)
      if (run === undefined) {
        return {
          outcome: "fail",
          rationale: "Mutation: `repo-contract mutation run --json` printed an invalid report.",
        }
      }
      if (run.state === "error") return { outcome: "fail", rationale: `Mutation: ${run.message}` }
      if (run.state === "nothing-to-mutate") {
        return { outcome: "pass", rationale: `Mutation: ${run.message}` }
      }
      return judgeRun(run, minScore, registry)
    },
  }
}
