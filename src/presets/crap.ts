import { readFile } from "node:fs/promises"
import type { CheckDefinitionConfig, PolicyResult } from "../types.js"
import { checkCrapLimits, evaluateCrapReport } from "./rules/crap-report.js"
import { checkOptionsObject } from "./rules/option-checks.js"
import { combinedOutput } from "./shared/exit-code-fail-rationale.js"
import { failedDependencies } from "./shared/failed-dependencies.js"
import { checkDependencyInstalled } from "./shared/missing-dependency.js"
import { readJsonReport } from "./shared/read-json-report.js"
import { checkTerminatedAbnormally } from "./shared/terminal-status.js"

/** Options accepted by {@link crap}. */
export interface CrapOptions {
  /** The source directories to score. Defaults to `"src"`. */
  readonly src?: string | readonly string[]
  /** The Istanbul `coverage-final.json` to score against. Defaults to `"coverage/coverage-final.json"`. */
  readonly coverage?: string
  /** The highest CRAP score a function may have. Defaults to `30`. */
  readonly threshold?: number
  /** The highest cyclomatic complexity a function may have, however well covered. Defaults to `20`. */
  readonly maxComplexity?: number
  /** Globs crap4ts skips. */
  readonly ignore?: readonly string[]
  /** Where crap4ts writes its JSON report. Defaults to `"reports/crap.json"`. */
  readonly report?: string
}

/**
 * No function both complex and poorly covered, via `@danibram/crap4ts`. Fails on a function above
 * the CRAP threshold or the complexity ceiling, and on an unreadable score. Reads the coverage a
 * test run wrote: declare `dependsOn` on that check. Warns, not evaluated, when a check it depends
 * on failed.
 *
 * crap4ts writes its report to a file, not stdout: it exits before a large report drains through a
 * pipe, which cuts the JSON at 64 KiB.
 * @param options - configuration for this check; see {@link CrapOptions}.
 * @returns the configured check.
 * @throws {TypeError} when `options` is not an object.
 * @throws {RangeError} when `threshold` or `maxComplexity` is not a finite number above 0.
 * @beta
 */
export function crap(options: CrapOptions = {}): CheckDefinitionConfig {
  checkOptionsObject("crap", options)
  const {
    src = "src",
    coverage = "coverage/coverage-final.json",
    threshold = 30,
    maxComplexity = 20,
    ignore = [],
    report = "reports/crap.json",
  } = options
  const sources = typeof src === "string" ? [src] : [...src]
  const limits = checkCrapLimits({ threshold, maxComplexity })

  return {
    run: [
      "crap4ts",
      ...sources,
      "--coverage",
      coverage,
      // Passed, never left to crap4ts: its own default could change in a dependency bump.
      "--threshold",
      String(threshold),
      "--reporter",
      "json",
      "--output",
      report,
      ...ignore.flatMap((glob) => ["--ignore", glob]),
    ],
    policy: async ({ result, dependencies }): Promise<PolicyResult> => {
      const missing = checkDependencyInstalled(result, "@danibram/crap4ts")
      if (missing) return missing

      const terminated = checkTerminatedAbnormally(result, "crap4ts")
      if (terminated) return terminated

      const failed = failedDependencies(dependencies)
      if (failed.length > 0) {
        return {
          outcome: "warn",
          rationale: `Crap: not evaluated, because ${failed.join(", ")} did not pass, and that already fails the run.`,
        }
      }

      // A failed run leaves the previous run's report in place; reading it would judge stale scores.
      if (result.exitCode !== 0) {
        return {
          outcome: "fail",
          rationale: `crap4ts exited ${String(result.exitCode)} before it scored anything:\n${combinedOutput(result)}`,
        }
      }

      const printed = combinedOutput(result)
      const parsed = await readJsonReport<unknown>(
        () => readFile(report, "utf8"),
        `crap4ts wrote no readable ${report}. Is ${coverage} there? The tests must run with coverage first.${printed ? `\n${printed}` : ""}`,
        `crap4ts wrote ${report}, but it is not valid JSON.`,
      )
      if (!parsed.ok) return parsed.result

      return evaluateCrapReport(parsed.value, limits)
    },
  }
}
