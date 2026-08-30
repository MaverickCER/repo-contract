// Reads the already-aggregated coverage-summary.json and reports it against
// scripts/coverage-thresholds.mjs. Never re-aggregates (see
// scripts/aggregate-coverage.mjs) and never executes tests -- it assumes
// coverage/aggregate/coverage-summary.json already exists.
//
// Report-only: prints each metric's actual percentage against the
// threshold, annotated OK/BELOW THRESHOLD, but never fails the process over
// it -- that judgment belongs to repo-contract's own `coverage` check
// (which evaluates the same aggregate through its policy instead -- see
// repo-contract.config.ts). The one thing this script does still fail on is
// a genuine precondition problem: the summary file not existing at all,
// which means there is nothing to report.

import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { COVERAGE_THRESHOLDS } from "./coverage-thresholds.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

export function reportCoverage() {
  const summaryPath = path.join(root, "coverage", "aggregate", "coverage-summary.json")

  // One read in a try/catch rather than existsSync-then-readFileSync: one
  // filesystem call instead of two, and no check-then-read race.
  let summaryText
  try {
    summaryText = readFileSync(summaryPath, "utf8")
  } catch {
    throw new Error(
      `${path.relative(root, summaryPath)} does not exist -- run scripts/aggregate-coverage.mjs first.`,
    )
  }

  const summary = JSON.parse(summaryText)
  const total = summary.total

  const lines = []

  for (const [metric, threshold] of Object.entries(COVERAGE_THRESHOLDS)) {
    const actual = total[metric]?.pct

    if (typeof actual !== "number" || !Number.isFinite(actual)) {
      lines.push(`${metric}: coverage percentage is missing or invalid`)
      continue
    }

    const status = actual >= threshold ? "OK" : "BELOW THRESHOLD"
    lines.push(`${metric.padEnd(11)} ${actual}% (threshold ${threshold}%) ${status}`)
  }

  return { lines }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { lines } = reportCoverage()
  for (const line of lines) {
    console.log(`[report-coverage] ${line}`)
  }
}
