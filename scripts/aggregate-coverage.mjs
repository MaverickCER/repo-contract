// Pure aggregation of coverage produced by independently-run, coverage-producing
// verification categories: unit, integration and property. The
// coverage-contribution matrix in specs/verification-taxonomy.md explains why
// e2e and architecture are absent from this list.
//
// Never executes tests and never discovers test files. That is
// scripts/run-test-category.mjs's job. Never reports or enforces thresholds
// either. Reporting is scripts/report-coverage.mjs's job, and threshold
// enforcement itself lives only in repo-contract's `coverage` check policy.
//
// The merge is a UNION of covered source locations across the contributing
// runs, not a summed/averaged percentage. It is computed via
// istanbul-lib-coverage's CoverageMap#merge (the same mechanism `nyc merge`
// uses). Adding a
// future coverage-producing category means adding one entry to
// COVERAGE_SOURCES below; nothing else in this file changes.

import libCoverage from "istanbul-lib-coverage"
import libReport from "istanbul-lib-report"
import reports from "istanbul-reports"
import { mkdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { AGGREGATE_COVERAGE_DIR } from "./aggregate-coverage-paths.mjs"

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

// One entry per coverage-producing verification category. Each must already
// have written coverage/<name>/coverage-final.json (via that category's own
// `vitest run --config vitest.<name>.config.ts --coverage`, e.g. through
// scripts/run-test-category.mjs) before this runs.
const COVERAGE_SOURCES = ["unit", "integration", "property"]

export function aggregateCoverage(root = DEFAULT_ROOT) {
  const map = libCoverage.createCoverageMap({})
  const missing = []

  for (const source of COVERAGE_SOURCES) {
    const filePath = path.join(root, "coverage", source, "coverage-final.json")
    // One read in a try/catch rather than existsSync-then-readFileSync. The
    // "missing artifact" handling is the same, with one filesystem call
    // instead of two and no time-of-check/time-of-use gap between them.
    let contents
    try {
      contents = readFileSync(filePath, "utf8")
    } catch {
      missing.push(filePath)
      continue
    }
    map.merge(JSON.parse(contents))
  }

  if (missing.length > 0) {
    throw new Error(
      `[aggregate-coverage] missing coverage artifact(s), run each category with --coverage first:\n${missing.map((p) => `  - ${path.relative(root, p)}`).join("\n")}`,
    )
  }

  const outDir = path.join(root, AGGREGATE_COVERAGE_DIR)
  mkdirSync(outDir, { recursive: true })

  const context = libReport.createContext({ dir: outDir, coverageMap: map })
  // "text" is given an explicit `file` so it writes coverage-summary.txt
  // instead of its default (stdout). Callers of aggregateCoverage() need
  // their own stdout to stay clean JSON, the `coverage` check's
  // scripts/check-coverage.mjs in particular. A human wanting the console
  // table gets it via `npm run test:coverage`'s own separate reporting.
  reports.create("text", { file: "coverage-summary.txt" }).execute(context)
  for (const reporterName of ["html", "lcov", "json", "json-summary"]) {
    reports.create(reporterName).execute(context)
  }

  return {
    outDir,
    summaryPath: path.join(outDir, "coverage-summary.json"),
    finalPath: path.join(outDir, "coverage-final.json"),
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { summaryPath } = aggregateCoverage()
  console.log(`[aggregate-coverage] wrote ${path.relative(DEFAULT_ROOT, summaryPath)}`)
}
