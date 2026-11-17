import { readFile } from "node:fs/promises"
import type { CheckDefinitionConfig } from "../types.js"
import { checkMaxPercentage, evaluateDuplicationBudget } from "./rules/duplication-budget.js"
import { checkDependencyInstalled } from "./shared/missing-dependency.js"
import { readJsonReport } from "./shared/read-json-report.js"
import { checkTerminatedAbnormally } from "./shared/terminal-status.js"
import { checkOptionsObject } from "./rules/option-checks.js"

interface JscpdFileSpan {
  readonly name: string
  readonly start: number
  readonly end: number
}

interface JscpdDuplicate {
  readonly format: string
  readonly lines: number
  readonly tokens: number
  readonly firstFile: JscpdFileSpan
  readonly secondFile: JscpdFileSpan
}

interface JscpdStatisticsTotal {
  readonly clones: number
  readonly duplicatedLines: number
  readonly lines: number
  readonly percentage: number
  readonly sources: number
}

interface JscpdReport {
  readonly duplicates?: readonly JscpdDuplicate[]
  readonly statistics?: {
    readonly total?: JscpdStatisticsTotal
  }
}

/** Options accepted by {@link duplication}. */
export interface DuplicationOptions {
  /** Directory to scan for duplicated code, passed straight through to jscpd as its positional target. Defaults to `"."`: narrow it (e.g. `"src"`) to scope the scan to your source tree. */
  readonly path?: string
  /** The largest share of scanned lines that may be duplicated, in percent. A pass still lists every block. Defaults to `0`: any duplicated block fails. */
  readonly maxPercentage?: number
}

// Kept in lockstep with the `--output reports/jscpd` argument below. Both are
// relative and resolve against the *host* process's cwd, not the check's
// `cwd` option. jscpd writes here and this policy's `readFile` reads from here.
// A check configured with a different `cwd` would look in the wrong place.
// This preset does not expose an output-path option: a consumer needing one
// runs jscpd via a custom `run`/`policy` instead.
const REPORT_PATH = "reports/jscpd/jscpd-report.json"

// jscpd's JSON reporter writes its report to disk. It never prints JSON to
// stdout, which instead carries decorative progress/summary text. So the
// report is read from disk. jscpd's `--threshold`/`--exit-code`
// flags are deliberately not used. This preset reads the raw clone count
// from evidence and owns the pass/fail decision itself, as the
// deadCode/securityDeps presets already do for their tools.
/**
 * Duplicated-code detection via jscpd.
 * @param options - configuration for this check; see {@link DuplicationOptions}.
 * @returns the configured check.
 * @throws {TypeError} when `options` is not an object.
 * @throws {RangeError} when `maxPercentage` is not a number from 0 to 100.
 * @beta
 */
export function duplication(options: DuplicationOptions = {}): CheckDefinitionConfig {
  checkOptionsObject("duplication", options)
  const { path = "." } = options
  const maxPercentage = checkMaxPercentage(options.maxPercentage ?? 0)

  return {
    run: ["jscpd", path, "--reporters", "json", "--output", "reports/jscpd", "--silent"],
    policy: async ({ result }) => {
      const missing = checkDependencyInstalled(result, "jscpd")
      if (missing) return missing

      const terminated = checkTerminatedAbnormally(result, "jscpd")
      if (terminated) return terminated

      const parsed = await readJsonReport<JscpdReport>(
        // Provably equivalent, not a coverage gap. `JSON.parse` coerces
        // whatever `readFile` returns via that value's `toString()`.
        // That is confirmed empirically for a Buffer, which is what a mutated/
        // unrecognized encoding argument produces here. `Buffer`'s default
        // `toString()` encoding is itself utf8, so parsing succeeds
        // identically either way. No test can observe a difference through
        // this policy's output.
        () => readFile(REPORT_PATH, "utf8"),
        "jscpd did not produce its expected JSON report.",
        "jscpd produced invalid JSON evidence.",
      )
      if (!parsed.ok) return parsed.result
      // `readJsonReport<T>` narrows only at the type level: the value is `unknown` at
      // runtime. Guard it is an object before trusting the cast, so `.statistics` /
      // `.duplicates` never throw a TypeError out of the policy (matching markdownlint.ts).
      const value: unknown = parsed.value

      if (typeof value !== "object" || value === null) {
        return { outcome: "fail", rationale: "jscpd produced invalid JSON report data." }
      }

      const report = value as JscpdReport
      const total = report.statistics?.total

      if (
        !Array.isArray(report.duplicates) ||
        !total ||
        typeof total.percentage !== "number" ||
        !Number.isFinite(total.percentage)
      ) {
        // `total.percentage` feeds `.toFixed(2)` in the budget: a missing or non-finite
        // value would throw or render "NaN" instead of failing cleanly.
        return { outcome: "fail", rationale: "jscpd produced invalid JSON report data." }
      }

      // Re-annotated rather than used directly. `Array.isArray` narrows its
      // argument to `any[]` regardless of the checked value's declared type (a
      // long-standing TypeScript limitation). So `report.duplicates` would
      // otherwise silently lose its `JscpdDuplicate` element type.
      const duplicates: readonly JscpdDuplicate[] = report.duplicates

      return evaluateDuplicationBudget(
        {
          duplicates,
          percentage: total.percentage,
          lines: total.lines,
          sources: total.sources,
        },
        maxPercentage,
      )
    },
  }
}
