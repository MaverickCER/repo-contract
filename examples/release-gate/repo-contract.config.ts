/**
 * A policy that reads the evidence of several checks to decide whether a release is permitted.
 *
 * `typecheck`, `format` and `lint` are the same three real, published `repo-contract/presets` entries as
 * in `../demo`, run against the same deliberately imperfect `src/greet.ts`. The new part is `release`:
 * it runs no command of its own. Its policy receives the evidence of every other check
 * (`ctx.evidence.checks`) -- by the time any policy runs, every check has finished -- and decides
 * what the combination means. A script that ran three commands could report three results; this one
 * reports a single decision and says which check caused it.
 *
 * Nothing here is a mockup. Run it with `npm run demo` from this directory.
 */
import { spawn } from "node:child_process"
import { defineRepoContract } from "repo-contract"
import type { CheckEvidence } from "repo-contract"
import { format, lint, typecheck } from "repo-contract/presets"

/** ESLint's JSON report: a warning-and-error count across every file, or `undefined` if unreadable. */
function lintCounts(evidence: CheckEvidence): { errors: number; warnings: number } | undefined {
  try {
    const files = JSON.parse(evidence.stdout) as { errorCount: number; warningCount: number }[]
    return {
      errors: files.reduce((sum, file) => sum + file.errorCount, 0),
      warnings: files.reduce((sum, file) => sum + file.warningCount, 0),
    }
  } catch {
    return undefined
  }
}

/** The checks a release cannot go out without; any of them failing blocks it. */
const REQUIRED = ["typecheck", "format"] as const

export default defineRepoContract({
  spawn,
  env: process.env,
  checks: {
    typecheck,
    format: { ...format, run: ["prettier", "--check", "."] },
    lint: lint(),
    release: {
      // No command of its own: this check exists for its policy.
      run: ["node", "-e", ""],
      policy: ({ evidence }) => {
        const blockers = REQUIRED.filter((id) => evidence.checks[id].exitCode !== 0)
        const counts = lintCounts(evidence.checks.lint)
        const advisory =
          counts === undefined
            ? "lint: could not be read, so it was not counted."
            : `lint: ${String(counts.errors)} error(s), ${String(counts.warnings)} warning(s); warnings do not block a release.`

        if (blockers.length > 0 || (counts !== undefined && counts.errors > 0)) {
          const named = [
            ...blockers,
            ...(counts !== undefined && counts.errors > 0 ? ["lint"] : []),
          ]
          return {
            outcome: "fail",
            rationale: `Release blocked by ${named.join(" and ")}. Passing: ${REQUIRED.filter((id) => !blockers.includes(id)).join(", ") || "none"}. ${advisory}`,
          }
        }
        return {
          outcome: "pass",
          rationale: `Release permitted: ${REQUIRED.join(" and ")} pass. ${advisory}`,
        }
      },
    },
  },
})
