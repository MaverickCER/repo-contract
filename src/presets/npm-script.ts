import type { CheckDefinitionConfig, PolicyResult } from "../types.js"
import { checkNpmScriptOptions, evaluateNpmScriptReport } from "./rules/npm-script-report.js"
import { checkOptionsObject } from "./rules/option-checks.js"
import { checkDependencyInstalled } from "./shared/missing-dependency.js"
import { checkTerminatedAbnormally } from "./shared/terminal-status.js"

/** Options accepted by {@link npmScript}. */
export interface NpmScriptOptions {
  /** The npm script to run. */
  readonly script: string
  /** The name rationales use. Defaults to the script name. */
  readonly label?: string
  /** When package.json has no such script: `"skip"` (the default) passes as not applicable; `"fail"` fails. */
  readonly whenMissing?: "skip" | "fail"
  /** Paths the script must leave byte-identical. Set them for a script that regenerates committed files: a change means the committed copy is stale. */
  readonly mustNotChange?: readonly string[]
  /** Time the script may take, in milliseconds. */
  readonly timeoutMs?: number
}

/**
 * Time `repo-contract npm-script` may take beyond the script's own budget: reading package.json
 * and hashing the watched paths. The command stops the script itself, so its report says why.
 */
const HASHING_ALLOWANCE_MS = 60_000

/**
 * Runs one of the package's own npm scripts as a check, through `repo-contract npm-script --json`.
 * Fails when the script exits non-zero, runs out of time, or changes a `mustNotChange` path. The
 * paths are hashed before and after, so the verdict does not depend on git state.
 * @param options - configuration for this check; see {@link NpmScriptOptions}.
 * @returns the configured check.
 * @throws {TypeError} when `options` is not an object.
 * @throws {RangeError} when `script` is blank or starts with `-`, a `mustNotChange` entry is not a
 * non-empty path that does not start with `-`, or `timeoutMs` is not a whole number above 0.
 * @beta
 */
export function npmScript(options: NpmScriptOptions): CheckDefinitionConfig {
  checkOptionsObject("npmScript", options)
  checkNpmScriptOptions(options)
  const { script, label = script, whenMissing, mustNotChange = [], timeoutMs } = options

  return {
    run: [
      "repo-contract",
      "npm-script",
      script,
      "--json",
      ...mustNotChange.flatMap((watched) => ["--must-not-change", watched]),
      ...(timeoutMs === undefined ? [] : ["--timeout", String(timeoutMs)]),
    ],
    output: { format: "json" },
    ...(timeoutMs === undefined ? {} : { timeoutMs: timeoutMs + HASHING_ALLOWANCE_MS }),
    policy: ({ result }): PolicyResult => {
      const missing = checkDependencyInstalled(result, "repo-contract")
      if (missing) return missing

      const terminated = checkTerminatedAbnormally(result, `${label}: \`npm run ${script}\``)
      if (terminated) return terminated

      if (!result.output?.success) {
        const stderr = result.stderr.trim()
        return {
          outcome: "fail",
          rationale: `${label}: \`repo-contract npm-script\` printed no readable report.${stderr ? `\n${stderr}` : ""}`,
        }
      }
      return evaluateNpmScriptReport(result.output.value, { label, whenMissing })
    },
  }
}
