#!/usr/bin/env node
// Root benchmark orchestrator: runs each suite through the shared internal-package-contract benchmark
// contract (under tsx, because the suites import repo-contract's own TypeScript source). Deliberately
// NOT part of `npm run contract`; CI runs these in its `benchmark-pr` job instead.

import { execFileSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const benchmarksRoot = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(benchmarksRoot, "..")
const runSuite = path.join(
  repoRoot,
  "node_modules",
  "internal-package-contract",
  "scripts",
  "benchmark",
  "run-suite.mjs",
)
const SUITES = ["performance-checks", "performance-policy-evidence", "performance-api-contract"]
const extra = process.argv.slice(2)

for (const name of SUITES) {
  console.log(`\n[benchmark] ${name}: running...`)
  execFileSync(
    process.execPath,
    [
      path.join(repoRoot, "node_modules", ".bin", "tsx"),
      runSuite,
      path.join(benchmarksRoot, name, "suite.mjs"),
      ...extra,
    ],
    { cwd: repoRoot, stdio: "inherit" },
  )
}
