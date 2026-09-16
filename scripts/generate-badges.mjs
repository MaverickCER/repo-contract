// Lightweight, dependency-free (Node builtins only) badge-data generator --
// reads coverage/aggregate/coverage-summary.json (scripts/aggregate-coverage.mjs's
// own output) and reports/mutation/mutation.json (stryker.config.mjs's own
// jsonReporter output), writes shields.io "endpoint badge" JSON into docs/,
// which a CI job on push to main commits alongside the rest of the
// GitHub-Pages-served site (this repo's Pages deployment is "legacy"
// branch-deploy from docs/ on main -- see `gh api repos/.../pages` --
// unlike env-cap/data-cap's actions/deploy-pages job, so the generated file
// has to actually be committed, not just uploaded as a build artifact).
// Never run against stale/missing inputs silently -- both sections fail
// loudly (non-zero exit) rather than writing a badge from nothing.

import { readFileSync, writeFileSync, existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function coverageColor(pct) {
  return pct >= 85 ? "brightgreen" : pct >= 70 ? "yellow" : "red"
}
function mutationColor(pct) {
  return pct >= 95 ? "brightgreen" : pct >= 80 ? "yellow" : "red"
}

const summaryPath = path.join(root, "coverage/aggregate/coverage-summary.json")
if (!existsSync(summaryPath)) {
  console.error(
    "[badges] coverage/aggregate/coverage-summary.json missing -- run `npm run test:coverage` first.",
  )
  process.exitCode = 1
} else {
  const { total } = JSON.parse(readFileSync(summaryPath, "utf8"))
  // Headline number is the MINIMUM of the four metrics -- one low number
  // should never be masked by three higher ones, matching the same
  // "floor, not average" philosophy env-cap/data-cap's own badge generator
  // and coverage-thresholds config already use.
  const pct = Math.min(
    total.lines.pct,
    total.statements.pct,
    total.functions.pct,
    total.branches.pct,
  )
  writeFileSync(
    path.join(root, "docs/coverage-badge.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        label: "coverage",
        message: `${pct.toFixed(1)}%`,
        color: coverageColor(pct),
      },
      null,
      2,
    ),
  )
  console.log(`[badges] wrote docs/coverage-badge.json (${pct.toFixed(1)}%)`)
}

const mutationPath = path.join(root, "reports/mutation/mutation.json")
if (!existsSync(mutationPath)) {
  console.error("[badges] reports/mutation/mutation.json missing -- run `npm run mutation` first.")
  process.exitCode = 1
} else {
  const report = JSON.parse(readFileSync(mutationPath, "utf8"))
  const mutants = Object.values(report.files ?? {}).flatMap((f) => f.mutants ?? [])
  // Same detected/valid split this repo's own checks/mutation.ts uses:
  // Timeout counts as detected; Ignored (and RuntimeError/CompileError) are
  // excluded from the denominator entirely, never counted as either killed
  // or survived.
  const killed = mutants.filter((m) => m.status === "Killed").length
  const timeout = mutants.filter((m) => m.status === "Timeout").length
  const survived = mutants.filter((m) => m.status === "Survived").length
  const noCoverage = mutants.filter((m) => m.status === "NoCoverage").length
  const detected = killed + timeout
  const valid = detected + survived + noCoverage
  if (valid === 0) {
    console.error("[badges] mutation.json has 0 valid (non-ignored) mutants -- nothing to score.")
    process.exitCode = 1
  } else {
    const pct = (detected / valid) * 100
    writeFileSync(
      path.join(root, "docs/mutation-badge.json"),
      JSON.stringify(
        {
          schemaVersion: 1,
          label: "mutation",
          message: `${pct.toFixed(1)}%`,
          color: mutationColor(pct),
        },
        null,
        2,
      ),
    )
    console.log(`[badges] wrote docs/mutation-badge.json (${pct.toFixed(1)}%)`)
  }
}
