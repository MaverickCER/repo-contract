// performance-checks benchmark orchestrator -- `npm run benchmark:checks` from the repo root, or
// via ../../run-benchmarks.mjs. Writes results.json (immutable, measurement-only) and RESULTS.md.
//
// Only measures. Never reads a previous results.json, never computes a diff, never decides what's a
// regression -- that's internal-package-contract's render-summary.mjs's job (called from this
// repo's own `benchmark-pr` CI job), run separately by CI.
//
// Measures src/execution/run-checks.ts's `runChecks` directly (imported from source, not the
// published `repo-contract` public API -- `runChecks` is a curated-out internal, same as a unit
// test importing it; see src/index.ts's own doc comment on what it deliberately does not
// re-export). Every generated check really spawns a real child process (the fastest possible one,
// `node -e ""`) -- this category's whole point is measuring repo-contract's own scheduling/
// orchestration overhead (dependency-scheduler.ts/concurrency-pool.ts/spawn-check.ts) at
// increasing check-graph scale, which requires exercising the real spawn path, not a mock.

import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { runChecks } from "../../../src/execution/run-checks.ts"
import { adaptiveSample, computeDurationStats } from "../../benchmark-fixtures/measure.mjs"
import { buildMetadata } from "../../benchmark-fixtures/metadata.mjs"
import { benchmarkId, buildManifest } from "../../benchmark-fixtures/ids.mjs"
import { renderResultsMarkdown } from "../../benchmark-fixtures/render-results-markdown.mjs"
import { BENCHMARK_SUITE_VERSION, RUN_CHECKS_BENCHMARKS, generateCheckGraph } from "../fixtures.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const categoryRoot = path.resolve(here, "..")
const repoRoot = path.resolve(categoryRoot, "..", "..")

const CONCURRENCY = 8
const SAMPLE_OPTS = {
  warmupIterations: 1,
  targetDurationMs: 3000,
  minIterations: 5,
  maxIterations: 20,
}

async function runTier(tierName, definitionVersion) {
  const def = RUN_CHECKS_BENCHMARKS["run-checks"]
  const tierSize = { small: 20, medium: 100, large: 400 }[tierName]
  const { checks, dependencyEdges } = generateCheckGraph(tierSize)
  const execution = { spawn, env: process.env, shell: false }

  const { samples, configuration } = await adaptiveSample(async () => {
    const t0 = performance.now()
    const results = await runChecks(checks, CONCURRENCY, execution)
    return { durationMs: performance.now() - t0, resolvedChecks: results.length }
  }, SAMPLE_OPTS)

  const last = samples[samples.length - 1]

  return {
    id: benchmarkId(
      "checks",
      "run-checks",
      tierName,
      BENCHMARK_SUITE_VERSION,
      def.definitionVersion,
    ),
    status: "completed",
    inputs: { checks: tierSize, dependencyEdges },
    durationMs: computeDurationStats(
      samples.map((s) => s.durationMs),
      configuration.warmupIterations,
    ),
    resolvedChecks: last.resolvedChecks,
    configuration,
  }
}

async function main() {
  const startedAt = new Date()
  const packageJson = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8"))
  const def = RUN_CHECKS_BENCHMARKS["run-checks"]

  const results = { "run-checks": { tiers: {} } }
  for (const tier of def.tiers) {
    console.log(`[performance-checks] run-checks.${tier} ...`)
    const entry = await runTier(tier, def.definitionVersion)
    results["run-checks"].tiers[tier] = entry
    console.log(
      `[performance-checks] run-checks.${tier}: median ${entry.durationMs.medianMs.toFixed(2)}ms, n=${entry.durationMs.iterations}, checks=${entry.inputs.checks}`,
    )
  }

  const finishedAt = new Date()
  const metadata = buildMetadata({
    repoRoot,
    startedAt,
    finishedAt,
    configuration: results["run-checks"].tiers[def.tiers[0]].configuration,
    repoContractVersion: packageJson.version,
    fixtureSeed: "deterministic",
    generatorVersion: 1,
    benchmarkSuiteVersion: BENCHMARK_SUITE_VERSION,
  })
  const benchmarkManifest = buildManifest("checks", RUN_CHECKS_BENCHMARKS, BENCHMARK_SUITE_VERSION)

  const output = { metadata, benchmarkManifest, results }
  await fs.writeFile(
    path.join(categoryRoot, "results.json"),
    JSON.stringify(output, null, 2) + "\n",
    "utf8",
  )
  await fs.writeFile(
    path.join(categoryRoot, "RESULTS.md"),
    renderResultsMarkdown(output, "performance-checks results"),
    "utf8",
  )

  console.log(`\n[performance-checks] wrote results.json and RESULTS.md`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
