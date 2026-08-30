// Human-invoked command, run via `npm run api-docs:generate` -- the only normal way
// docs/api-report/*.api.md is ever updated. Regenerates every target's report directly into
// docs/api-report/ for a human to review and commit. check.ts performs the same extraction into a
// scratch directory instead, to detect drift without mutating the committed files.

import path from "node:path"
import { pathToFileURL } from "node:url"

import type { GeneratedApiReport } from "./report-targets.js"
import { generateApiReports } from "./report-targets.js"

/**
 * Factored out of the bottom-of-file CLI invocation so a test can exercise the real regeneration
 * path in-process, without spawning a subprocess -- matching this feature's other scripts' own
 * testing convention.
 * @param root - Absolute path to the repository root; must contain a built `dist/`.
 * @returns Every target's freshly-written report.
 */
export async function runGenerate(root: string): Promise<GeneratedApiReport[]> {
  return generateApiReports(root, path.join(root, "docs/api-report"))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.cwd()
  const reports = await runGenerate(root)

  for (const report of reports) {
    process.stderr.write(`Wrote ${path.relative(root, report.reportPath)}\n`)
  }
}
