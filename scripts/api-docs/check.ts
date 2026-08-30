// Entry point for the "api-docs" self-hosting check, invoked via
// `run: ["tsx", "scripts/api-docs/check.ts"]` in repo-contract.config.ts.
// Prints ONLY the JSON evidence to stdout (for `output: { format: "json" }` to parse) -- mirrors
// scripts/api-contract/check.ts's own stdout contract.

import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

import type { ApiDocsEvidence, ApiDocsReportEvidence } from "./evidence-types.js"
import { generateApiReports } from "./report-targets.js"

const UNDOCUMENTED_MARKER = "(undocumented)"
const MISSING_PACKAGE_DOCUMENTATION_MARKER = "(No @packageDocumentation comment for this package)"

/**
 * @param content - One target's freshly-generated `.api.md` report content.
 * @returns One entry per line carrying an `(undocumented)` or `(No @packageDocumentation comment for this package)` marker, as `line <n>: <trimmed line>`, in file order.
 */
function findUndocumentedMarkers(content: string): string[] {
  const markers: string[] = []

  content.split("\n").forEach((line, index) => {
    const trimmed = line.trim()
    if (
      trimmed.includes(UNDOCUMENTED_MARKER) ||
      trimmed.includes(MISSING_PACKAGE_DOCUMENTATION_MARKER)
    ) {
      markers.push(`line ${String(index + 1)}: ${trimmed}`)
    }
  })

  return markers
}

/**
 * The check's full logic, factored out of the bottom-of-file script invocation so
 * `test/unit/api-docs/check.test.ts` can exercise it in-process against the real repository files,
 * without spawning a subprocess -- matching scripts/api-contract/check.ts's own testing
 * convention.
 * @param root - Absolute path to the repository being checked; must contain a built `dist/`.
 * @returns The evidence for `output: { format: "json" }`: for every public entry point, whether
 *   its committed report is up to date and whether it still contains any undocumented symbol.
 */
export async function runApiDocsCheck(root: string): Promise<ApiDocsEvidence> {
  const scratchDir = await mkdtemp(path.join(os.tmpdir(), "repo-contract-api-docs-check-"))

  try {
    const generated = await generateApiReports(root, scratchDir)
    const reports: ApiDocsReportEvidence[] = []

    for (const report of generated) {
      const committedPath = path.join(root, "docs/api-report", `${report.reportFileName}.api.md`)

      let committedContent: string | undefined
      try {
        committedContent = await readFile(committedPath, "utf8")
      } catch {
        committedContent = undefined
      }

      reports.push({
        reportFileName: report.reportFileName,
        committedPath: path.relative(root, committedPath),
        upToDate: committedContent === report.content,
        undocumentedMarkers: findUndocumentedMarkers(report.content),
      })
    }

    return { reports }
  } finally {
    await rm(scratchDir, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const evidence = await runApiDocsCheck(process.cwd())
  process.stdout.write(JSON.stringify(evidence))
}
