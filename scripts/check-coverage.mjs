// Entry point for repo-contract's `coverage` check (see repo-contract.config.ts).
// This is aggregation + reporting ONLY -- it never executes tests and never
// discovers test files. It relies entirely on the `coverage` check's own
// `dependsOn: ["test-unit", "test-integration", "test-property"]` to
// guarantee those categories' coverage-final.json files already exist by the
// time this runs; see scripts/aggregate-coverage.mjs for the merge itself.
//
// Prints the aggregate coverage-summary.json's `total` figures to stdout as
// JSON, for the `coverage` check's `output: { format: "json" }` to parse and
// compare against scripts/coverage-thresholds.mjs.

import { readFileSync } from "node:fs"
import { aggregateCoverage } from "./aggregate-coverage.mjs"

const { summaryPath } = aggregateCoverage()
const summary = JSON.parse(readFileSync(summaryPath, "utf8"))

process.stdout.write(JSON.stringify(summary.total))
