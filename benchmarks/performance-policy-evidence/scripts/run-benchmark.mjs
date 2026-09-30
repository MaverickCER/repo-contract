// performance-policy-evidence benchmark orchestrator -- `npm run benchmark:policy-evidence` from
// the repo root, or via ../../run-benchmarks.mjs. Writes results.json (immutable,
// measurement-only) and RESULTS.md.
//
// Only measures. Never reads a previous results.json, never computes a diff, never decides what's a
// regression -- that's internal-package-contract's render-summary.mjs's job (called from this
// repo's own `benchmark-pr` CI job), run separately by CI.
//
// Measures src/evidence/build-evidence.ts's `buildEvidence` and src/policy/run-policies.ts's
// `runPolicies` directly (imported from source -- both are curated-out internals, not part of the
// published `repo-contract` public API; see src/index.ts's own doc comment). Fixture generation
// (synthesizing the per-check JSON payloads) happens once per tier, outside the sampled loop, and
// is reported separately as `fixtureGenerationMs` -- only the real `buildEvidence`+`runPolicies`
// call is what's adaptively sampled.

import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { buildEvidence } from "../../../src/evidence/build-evidence.ts"
import { runPolicies } from "../../../src/policy/run-policies.ts"
import { adaptiveSample, computeDurationStats } from "../../benchmark-fixtures/measure.mjs"
import { buildMetadata } from "../../benchmark-fixtures/metadata.mjs"
import { benchmarkId, buildManifest } from "../../benchmark-fixtures/ids.mjs"
import { renderResultsMarkdown } from "../../benchmark-fixtures/render-results-markdown.mjs"
import {
  BENCHMARK_SUITE_VERSION,
  POLICY_EVIDENCE_BENCHMARKS,
  TIERS,
  generateEvidenceFixture,
} from "../fixtures.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const categoryRoot = path.resolve(here, "..")
const repoRoot = path.resolve(categoryRoot, "..", "..")

const SAMPLE_OPTS = {
  warmupIterations: 2,
  targetDurationMs: 2000,
  minIterations: 8,
  maxIterations: 60,
}

async function runTier(tierName, definitionVersion) {
  const tier = TIERS[tierName]
  const genStart = performance.now()
  const { entries: results, totalBytes } = generateEvidenceFixture(tier.checks, tier.payloadBytes)
  const fixtureGenerationMs = performance.now() - genStart

  const { samples, configuration } = await adaptiveSample(async () => {
    const t0 = performance.now()
    const startedAt = new Date()
    const { evidence, entries } = await buildEvidence(results, startedAt, new Date())
    const verdict = await runPolicies(entries, evidence)
    return {
      durationMs: performance.now() - t0,
      checksEvaluated: Object.keys(verdict.checks).length,
    }
  }, SAMPLE_OPTS)

  const last = samples[samples.length - 1]

  return {
    id: benchmarkId(
      "policy-evidence",
      "evaluate-evidence-and-policy",
      tierName,
      BENCHMARK_SUITE_VERSION,
      definitionVersion,
    ),
    status: "completed",
    inputs: { checks: tier.checks, evidenceBytes: totalBytes },
    fixtureGenerationMs: Math.round(fixtureGenerationMs),
    durationMs: computeDurationStats(
      samples.map((s) => s.durationMs),
      configuration.warmupIterations,
    ),
    checksEvaluated: last.checksEvaluated,
    configuration,
  }
}

async function main() {
  const startedAt = new Date()
  const packageJson = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8"))
  const def = POLICY_EVIDENCE_BENCHMARKS["evaluate-evidence-and-policy"]

  const results = { "evaluate-evidence-and-policy": { tiers: {} } }
  for (const tier of def.tiers) {
    console.log(`[performance-policy-evidence] evaluate-evidence-and-policy.${tier} ...`)
    const entry = await runTier(tier, def.definitionVersion)
    results["evaluate-evidence-and-policy"].tiers[tier] = entry
    console.log(
      `[performance-policy-evidence] evaluate-evidence-and-policy.${tier}: median ${entry.durationMs.medianMs.toFixed(2)}ms, n=${entry.durationMs.iterations}, checks=${entry.inputs.checks}, evidenceBytes=${entry.inputs.evidenceBytes}`,
    )
  }

  const finishedAt = new Date()
  const metadata = buildMetadata({
    repoRoot,
    startedAt,
    finishedAt,
    configuration: results["evaluate-evidence-and-policy"].tiers[def.tiers[0]].configuration,
    repoContractVersion: packageJson.version,
    fixtureSeed: "deterministic",
    generatorVersion: 1,
    benchmarkSuiteVersion: BENCHMARK_SUITE_VERSION,
  })
  const benchmarkManifest = buildManifest(
    "policy-evidence",
    POLICY_EVIDENCE_BENCHMARKS,
    BENCHMARK_SUITE_VERSION,
  )

  const output = { metadata, benchmarkManifest, results }
  await fs.writeFile(
    path.join(categoryRoot, "results.json"),
    JSON.stringify(output, null, 2) + "\n",
    "utf8",
  )
  await fs.writeFile(
    path.join(categoryRoot, "RESULTS.md"),
    renderResultsMarkdown(output, "performance-policy-evidence results"),
    "utf8",
  )

  console.log(`\n[performance-policy-evidence] wrote results.json and RESULTS.md`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
