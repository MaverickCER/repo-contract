#!/usr/bin/env node
// Root benchmark orchestrator -- runs all three categories' own `run-benchmark.mjs` in sequence.
// Deliberately NOT part of `npm run contract`/CI's `contract`/`verify`/`lint` jobs -- see
// .github/workflows/ci.yml's `benchmark-pr` job for how CI runs these instead. Mirrors data-cap's
// own benchmarks/run-benchmarks.mjs, adapted: repo-contract's three categories each measure its own
// internals directly (imported from `src/` via `tsx`, not a separately-installed consumer package),
// so there is no per-category `npm install`/node_modules existence check here -- every category
// script runs straight from the repo's own `npm ci`.

import { execFileSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const benchmarksRoot = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(benchmarksRoot, "..")

const CATEGORIES = ["performance-checks", "performance-policy-evidence", "performance-api-contract"]

for (const name of CATEGORIES) {
  console.log(`\n[benchmark] ${name}: running...`)
  execFileSync(
    process.execPath,
    [
      path.join(repoRoot, "node_modules", ".bin", "tsx"),
      path.join(benchmarksRoot, name, "scripts", "run-benchmark.mjs"),
    ],
    { cwd: repoRoot, stdio: "inherit" },
  )
}
