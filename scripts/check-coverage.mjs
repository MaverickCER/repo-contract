// The `run` of repo-contract's `coverage` check (see repo-contract.config.ts). The published
// `coverage` preset reads one coverage-summary.json; this repository's coverage is the union of
// three categories, so this script merges them first (scripts/aggregate-coverage.mjs). It never
// runs tests: the check's `dependsOn` on test-unit, test-integration and test-property makes
// their coverage-final.json files exist first.
//
// It prints `{ "total": ... }`, the shape the preset's own summary reader prints, so the preset's
// policy judges it unchanged. A missing category throws, and the preset reports stderr.

import { readFileSync } from "node:fs"
import { aggregateCoverage } from "./aggregate-coverage.mjs"

const { summaryPath } = aggregateCoverage()
const summary = JSON.parse(readFileSync(summaryPath, "utf8"))

process.stdout.write(JSON.stringify({ total: summary.total ?? null }))
