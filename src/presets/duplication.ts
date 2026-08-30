import { readFile } from "node:fs/promises"
import type { CheckDefinitionConfig } from "../types.js"
import { checkDependencyInstalled } from "./shared/missing-dependency.js"
import { readJsonReport } from "./shared/read-json-report.js"
import { checkTerminatedAbnormally } from "./shared/terminal-status.js"

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
interface DuplicationOptions {
  /** Directory to scan for duplicated code, passed straight through to jscpd as its positional target. Defaults to `"."` -- narrow it (e.g. `"src"`) to scope the scan to your own source tree. */
  readonly path?: string
}

const REPORT_PATH = "reports/jscpd/jscpd-report.json"

// jscpd's JSON reporter writes its report to disk -- it never prints JSON to
// stdout, which instead carries decorative progress/summary text -- so the
// report is read from disk directly. jscpd's own `--threshold`/`--exit-code`
// flags are deliberately not used: this preset reads the raw clone count
// from evidence and owns the pass/fail decision itself, exactly as the
// deadCode/securityDeps presets already do for their own tools.
/**
 * Duplicated-code detection via jscpd.
 * @param options - configuration for this check; see {@link DuplicationOptions}.
 * @returns the configured check.
 */
export function duplication(options: DuplicationOptions = {}): CheckDefinitionConfig {
  const { path = "." } = options

  return {
    run: ["jscpd", path, "--reporters", "json", "--output", "reports/jscpd", "--silent"],
    policy: async ({ result }) => {
      const missing = checkDependencyInstalled(result, "jscpd")
      if (missing) return missing

      const terminated = checkTerminatedAbnormally(result, "jscpd")
      if (terminated) return terminated

      const parsed = await readJsonReport<JscpdReport>(
        // Provably equivalent, not a coverage gap: `JSON.parse` coerces
        // whatever `readFile` returns via that value's own `toString()`
        // (confirmed empirically for a Buffer, which is what a mutated/
        // unrecognized encoding argument produces here) -- and `Buffer`'s
        // default `toString()` encoding is itself utf8, so parsing succeeds
        // identically either way. No test can observe a difference through
        // this policy's output.
        // Stryker disable next-line StringLiteral -- JSON.parse coerces via toString(), which defaults to utf8 for a Buffer, so parsing succeeds identically either way
        () => readFile(REPORT_PATH, "utf8"),
        "jscpd did not produce its expected JSON report.",
        "jscpd produced invalid JSON evidence.",
      )
      if (!parsed.ok) return parsed.result
      const report = parsed.value

      const total = report.statistics?.total

      if (!Array.isArray(report.duplicates) || !total) {
        return { outcome: "fail", rationale: "jscpd produced invalid JSON report data." }
      }

      // Re-annotated rather than used directly: `Array.isArray` narrows its
      // argument to `any[]` regardless of the checked value's declared type (a
      // long-standing TypeScript limitation), so `report.duplicates` would
      // otherwise silently lose its `JscpdDuplicate` element type below.
      const duplicates: readonly JscpdDuplicate[] = report.duplicates

      if (duplicates.length === 0) {
        return {
          outcome: "pass",
          rationale: `jscpd found 0 duplicated block(s) across ${String(total.sources)} file(s) (${String(total.lines)} lines).`,
        }
      }

      const details = duplicates.map(
        (duplicate) =>
          `${duplicate.firstFile.name}:${String(duplicate.firstFile.start)} duplicates ${duplicate.secondFile.name}:${String(duplicate.secondFile.start)} -- ${String(duplicate.lines)} lines / ${String(duplicate.tokens)} tokens`,
      )

      return {
        outcome: "fail",
        rationale: [
          `jscpd found ${String(duplicates.length)} duplicated block(s) (${total.percentage.toFixed(2)}% of ${String(total.lines)} lines across ${String(total.sources)} file(s)):`,
          ...details.map((detail) => `- ${detail}`),
        ].join("\n"),
      }
    },
  }
}
