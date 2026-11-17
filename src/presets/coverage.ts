import type { CheckDefinitionConfig, PolicyResult } from "../types.js"
import {
  checkCoverageThresholds,
  evaluateCoverageSummary,
  type CoverageThresholds,
} from "./rules/coverage-summary.js"
import { checkOptionsObject } from "./rules/option-checks.js"
import { failedDependencies } from "./shared/failed-dependencies.js"
import { checkTerminatedAbnormally } from "./shared/terminal-status.js"

// Declared in the rules module, so the two files do not import each other.
export type { CoverageThresholds } from "./rules/coverage-summary.js"

/** Options accepted by {@link coverage}. */
export interface CoverageOptions {
  /** Defaults to 80 on lines and statements. Given, it replaces the default whole. */
  readonly thresholds?: CoverageThresholds
  /** The `json-summary` report a test run wrote. Defaults to `"coverage/coverage-summary.json"`. */
  readonly summary?: string
}

/**
 * The Vitest flags that make a test run write the two reports `coverage` and `crap` read:
 * `coverage-summary.json` and `coverage-final.json`. Tiers append them to the `Tests` check.
 * Not exported from the barrel: it is wiring, not a preset.
 */
export const COVERAGE_VITEST_ARGS: readonly string[] = [
  "--coverage.enabled",
  "--coverage.reporter=json-summary",
  "--coverage.reporter=json",
  // Pinned, as the test preset pins --outputFile: the presets read these paths, not the config's.
  "--coverage.reportsDirectory=coverage",
]

const DEFAULT_THRESHOLDS: CoverageThresholds = { lines: 80, statements: 80 }

/**
 * Executed by `node -e`, so the preset reads no file in-process. It prints the summary's `total`
 * alone, not every file's entry, to keep the evidence small. Exit 1 marks an unreadable summary,
 * so a check that depends on this one sees the failure in its evidence.
 */
const READER_SOURCE = String.raw`
const fs = require("node:fs")
const file = process.argv[1]
let text
try {
  text = fs.readFileSync(file, "utf8")
} catch {
  process.stdout.write(JSON.stringify({ error: "missing", file }))
  process.exit(1)
}
try {
  const parsed = JSON.parse(text)
  const total = typeof parsed === "object" && parsed !== null ? parsed.total : undefined
  process.stdout.write(JSON.stringify({ total: total === undefined ? null : total }))
} catch {
  process.stdout.write(JSON.stringify({ error: "invalid", file }))
  process.exit(1)
}
`

/**
 * Turns the reader's error into a rationale.
 * @param value - the reader's parsed output.
 * @returns the failure, or `undefined` when the reader found a summary.
 */
function readerFailure(value: unknown): PolicyResult | undefined {
  // A summary's `total` object has no `error`; only null and undefined need the `?.`.
  const reader = value as { error?: unknown; file?: unknown } | null | undefined
  if (reader?.error === "missing") {
    return {
      outcome: "fail",
      rationale: `Coverage: cannot read ${String(reader.file)}. Run the tests with coverage first. A tier's Tests check passes the coverage flags itself. If Tests runs your own Vitest config, set \`coverage.enabled\` and add json-summary to \`coverage.reporter\`, written to that path.`,
    }
  }
  if (reader?.error === "invalid") {
    return { outcome: "fail", rationale: `Coverage: ${String(reader.file)} is not valid JSON.` }
  }
  return undefined
}

/**
 * Package-wide test coverage, read from the `json-summary` report a test run wrote. It runs no
 * tests: declare `dependsOn` on the check that does. Fails on any judged metric below its
 * threshold, and when the report is missing or unreadable. Warns, not evaluated, when a check it
 * depends on failed: that check is already red, and its coverage would describe a broken run.
 * @param options - configuration for this check; see {@link CoverageOptions}.
 * @returns the configured check.
 * @throws {TypeError} when `options` is not an object.
 * @throws {RangeError} when `thresholds` is not an object of metrics from 0 to 100.
 * @beta
 */
export function coverage(options: CoverageOptions = {}): CheckDefinitionConfig {
  checkOptionsObject("coverage", options)
  const { thresholds: given = DEFAULT_THRESHOLDS, summary = "coverage/coverage-summary.json" } =
    options
  const thresholds = checkCoverageThresholds(given)

  return {
    run: ["node", "-e", READER_SOURCE, summary],
    output: { format: "json" },
    policy: ({ result, dependencies }): PolicyResult => {
      const terminated = checkTerminatedAbnormally(result, "The coverage summary reader")
      if (terminated) return terminated

      const failed = failedDependencies(dependencies)
      if (failed.length > 0) {
        return {
          outcome: "warn",
          rationale: `Coverage: not evaluated, because ${failed.join(", ")} did not pass, and that already fails the run.`,
        }
      }

      if (!result.output?.success) {
        const stderr = result.stderr.trim()
        return {
          outcome: "fail",
          rationale: `Coverage: the summary reader printed no readable JSON.${stderr ? `\n${stderr}` : ""}`,
        }
      }
      const value: unknown = result.output.value
      return readerFailure(value) ?? evaluateCoverageSummary(value, thresholds)
    },
  }
}
