import { readFile } from "node:fs/promises"
import type { CheckDefinitionConfig, ParsedOutput } from "../types.js"
import { checkDependencyInstalled } from "./shared/missing-dependency.js"
import { checkTerminatedAbnormally } from "./shared/terminal-status.js"
import { evaluateVitestJsonPolicy } from "./shared/vitest-json-policy.js"

// Fixed relative path `--outputFile` writes to and this preset reads back.
// As of Vitest 5 (confirmed against vitest@5.0.1; vitest@4 did not do this),
// `--reporter=json` alone no longer prints JSON to stdout -- without an
// explicit `--outputFile`, Vitest silently writes the report to its own
// default location instead and prints only a "JSON report written to <path>"
// line to stdout, which `JSON.parse` rejects. Pinning `--outputFile` here
// makes the report's location this preset's own contract rather than an
// internal Vitest default that can move between versions, exactly as the
// `duplication` preset already does for jscpd's report.
const REPORT_PATH = "reports/vitest/vitest-report.json"

/**
 * Unit/integration test execution via Vitest, reading its JSON reporter output.
 * @beta
 */
export const test: CheckDefinitionConfig = {
  run: ["vitest", "run", "--reporter=json", `--outputFile=${REPORT_PATH}`],
  policy: async ({ result }) => {
    const missing = checkDependencyInstalled(result, "vitest")
    if (missing) return missing

    const terminated = checkTerminatedAbnormally(result, "Vitest")
    if (terminated) return terminated

    let output: ParsedOutput<unknown>
    try {
      const raw = await readFile(REPORT_PATH, "utf8")
      output = { format: "json", success: true, value: JSON.parse(raw) as unknown }
    } catch (error) {
      // Same rationale evaluateVitestJsonPolicy already produces for a failed
      // stdout parse -- a missing report file and an unparseable one are both
      // "Vitest didn't hand back a usable JSON report," and a consumer's fix
      // is the same either way: check Vitest's own output above this line.
      output = {
        format: "json",
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }

    return evaluateVitestJsonPolicy(output)
  },
}
