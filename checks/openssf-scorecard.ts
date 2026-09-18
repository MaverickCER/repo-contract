import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { renderScorecardMarkdown } from "../scripts/openssf-scorecard/render-markdown.js"
import { evaluateVulnerabilities } from "../scripts/openssf-scorecard/vulnerabilities-check.js"
import type { ScorecardCheckResult } from "../scripts/openssf-scorecard/types.js"
import { requireParsedOutput } from "./shared/require-parsed-output.js"
import type { CheckDefinitionConfig } from "../src/types.js"

interface RunOutput {
  readonly repo: string
  readonly results: readonly ScorecardCheckResult[]
}

/**
 * Dogfoods repo-contract's own contract/evidence mechanism to produce
 * `docs/OpenSSF-Scorecard.md` -- an informational document, informed by
 * OpenSSF Scorecard's published methodology, never a certification (see
 * that file's own generated disclaimer and
 * scripts/openssf-scorecard/README.md).
 *
 * `run` computes every sub-check EXCEPT Vulnerabilities, which needs the
 * `security-deps` check's own raw evidence (this run's real `npm audit`
 * result) -- only available here, in-process, via `dependencies` (this is
 * the first check in this repository to read a dependency's evidence rather
 * than only using `dependsOn` for ordering; see PolicyContext's own doc
 * comment in src/types.ts for why that capability exists). Rendering and
 * writing docs/OpenSSF-Scorecard.md happens here, in `policy`, rather than
 * in the spawned script, for that reason alone -- every other side effect
 * this repository's contract run produces (format/lint autofix,
 * suppression-governance stub scaffolding) still happens in a `run` script,
 * not a policy function; this is a deliberate, documented exception, not a
 * new general pattern.
 *
 * This check's own PASS/FAIL is about whether the evidence was
 * successfully gathered and the document successfully regenerated -- never
 * about whether the repository scored well. A low OpenSSF score is
 * information for a human reader, not a reason to fail this repository's
 * own contract; conflating "the report generation succeeded" with "the
 * repository achieved a high compliance score" is exactly the aspirational-
 * vs-verified confusion this whole initiative exists to avoid.
 */
// repo-contract.config.ts's `dependsOn: ["security-deps"]` (not declared
// here -- see that file's own doc comment on why `coverage`/`crap`/`mutation`
// attach `dependsOn` at assembly instead of in their own check file) is a
// genuine evidence dependency: `policy` below actually reads
// `dependencies["security-deps"]`, the same pattern `checks/mutation.ts`
// uses for `suppression-governance`.
export const openssfScorecard: CheckDefinitionConfig = {
  run: ["tsx", "scripts/openssf-scorecard/run.ts"],
  output: { format: "json" },
  policy: async ({ result, dependencies }) => {
    const parsed = requireParsedOutput<RunOutput>(
      result.output,
      "OpenSSF Scorecard evidence-gathering output could not be parsed as JSON.",
    )
    if (!parsed.ok) return parsed.result

    const vulnerabilities = evaluateVulnerabilities(dependencies["security-deps"])
    const results = [...parsed.value.results, vulnerabilities]

    const notApplicable = results.filter((r) => r.score === "not-applicable")
    const evaluated = results.filter(
      (r): r is ScorecardCheckResult & { score: number } => r.score !== "not-applicable",
    )

    const markdown = renderScorecardMarkdown({
      repo: parsed.value.repo,
      generatedAt: new Date().toISOString(),
      results,
    })
    const outputPath = path.join(process.cwd(), "docs/OpenSSF-Scorecard.md")
    await mkdir(path.dirname(outputPath), { recursive: true })
    await writeFile(outputPath, markdown)

    if (evaluated.length === 0) {
      return {
        outcome: "warn",
        rationale: `Every sub-check was "not-applicable" (nothing could be evaluated -- gh CLI may be unavailable). Wrote docs/OpenSSF-Scorecard.md with ${String(notApplicable.length)} not-applicable result(s).`,
      }
    }

    const average = evaluated.reduce((sum, r) => sum + r.score, 0) / evaluated.length
    return {
      outcome: "pass",
      rationale: `Wrote docs/OpenSSF-Scorecard.md: ${String(evaluated.length)} check(s) evaluated (average score ${average.toFixed(1)}/10), ${String(notApplicable.length)} not-applicable. This check passes on successful evidence-gathering and document regeneration, not on the score itself -- see docs/OpenSSF-Scorecard.md for the real results.`,
    }
  },
}
