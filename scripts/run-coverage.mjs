// Canonical standalone coverage workflow -- `npm run test:coverage` is
// exactly `node scripts/run-coverage.mjs`, nothing else. Runs the
// coverage-producing categories (unit, integration, property -- see
// scripts/aggregate-coverage.mjs's COVERAGE_SOURCES) each with --coverage
// via the same scripts/run-test-category.mjs every other caller uses, then
// aggregates, then reports thresholds. This is the ONLY place
// coverage-producing tests are executed by name -- repo-contract's own
// test-unit/test-integration/test-property checks separately invoke
// run-test-category.mjs with --coverage themselves (their evidence-producing
// run *is* what creates that category's coverage artifact), and
// repo-contract's `coverage` check only aggregates+reports what those checks
// already produced (scripts/check-coverage.mjs) -- it never runs this file.
//
// Report-only for coverage thresholds (see scripts/report-coverage.mjs) --
// this script still fails on a real test failure (anyTestFailure), never on
// a coverage percentage below threshold; that judgment belongs to
// repo-contract's own `coverage` check.

import spawn from "cross-spawn"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { aggregateCoverage } from "./aggregate-coverage.mjs"
import { reportCoverage } from "./report-coverage.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const COVERAGE_PRODUCING_CATEGORIES = ["unit", "integration", "property"]

function runCategoryWithCoverage(category) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["scripts/run-test-category.mjs", category, "--coverage"], {
      cwd: root,
      stdio: "inherit",
    })
    child.once("error", reject)
    child.once("exit", (code, signal) => resolve(signal ? 1 : (code ?? 1)))
  })
}

let anyTestFailure = false

for (const category of COVERAGE_PRODUCING_CATEGORIES) {
  const exitCode = await runCategoryWithCoverage(category)
  if (exitCode !== 0) anyTestFailure = true
}

const { summaryPath } = aggregateCoverage()
console.log(readFileSync(path.join(path.dirname(summaryPath), "coverage-summary.txt"), "utf8"))

const { lines } = reportCoverage()
for (const line of lines) {
  console.log(`[test:coverage] ${line}`)
}

if (anyTestFailure) {
  console.error("\n[test:coverage] One or more coverage-producing test categories failed.")
}

process.exitCode = anyTestFailure ? 1 : 0
