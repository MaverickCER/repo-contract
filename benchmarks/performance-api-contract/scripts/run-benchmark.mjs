// performance-api-contract benchmark orchestrator -- `npm run benchmark:api-contract` from the
// repo root, or via ../../run-benchmarks.mjs. Writes results.json (immutable, measurement-only)
// and RESULTS.md.
//
// Only measures. Never reads a previous results.json, never computes a diff, never decides what's a
// regression -- that's internal-package-contract's render-summary.mjs's job (called from this
// repo's own `benchmark-pr` CI job), run separately by CI.
//
// Measures internal-package-contract's own API-contract diff/classification engine directly
// (`scripts/api-contract/*.ts`, deep-imported the same way repo-contract.config.ts already imports
// IPC's `checks/api-contract.ts` for the real `api-contract` check -- an established pattern in
// this exact repository, not a new one introduced here). Per-tier fixture compilation + extraction
// (../fixtures.mjs's `generateApiContractFixture`, real `tsc` + real API Extractor) happens once,
// outside the sampled loop, and is reported separately as `fixtureGenerationMs`; only the real
// load+normalize+classify step is adaptively sampled.

import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { adaptiveSample, computeDurationStats } from "../../benchmark-fixtures/measure.mjs"
import { buildMetadata } from "../../benchmark-fixtures/metadata.mjs"
import { benchmarkId, buildManifest } from "../../benchmark-fixtures/ids.mjs"
import { renderResultsMarkdown } from "../../benchmark-fixtures/render-results-markdown.mjs"
import {
  API_CONTRACT_BENCHMARKS,
  BENCHMARK_SUITE_VERSION,
  TIERS,
  generateApiContractFixture,
} from "../fixtures.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const categoryRoot = path.resolve(here, "..")
const repoRoot = path.resolve(categoryRoot, "..", "..")
const fixturesRoot = path.join(categoryRoot, "fixtures", "generated")

const SAMPLE_OPTS = {
  warmupIterations: 1,
  targetDurationMs: 2000,
  minIterations: 5,
  maxIterations: 20,
}

/** Mirrors internal-package-contract's own scripts/api-contract/check.ts `getExcerptForPosition` -- not exported by that module, so replicated here for the real assignability-probing path (see that file's own doc comment for why each position maps to its own mixin/class check). */
function getExcerptForPosition(item, position, parameterIndex, apiExtractorModel) {
  const { ApiParameterListMixin, ApiReturnTypeMixin, ApiPropertyItem, ApiVariable, ApiTypeAlias } =
    apiExtractorModel
  switch (position) {
    case "parameter":
      return ApiParameterListMixin.isBaseClassOf(item) && parameterIndex !== undefined
        ? item.parameters[parameterIndex]?.parameterTypeExcerpt
        : undefined
    case "return":
      return ApiReturnTypeMixin.isBaseClassOf(item) ? item.returnTypeExcerpt : undefined
    case "property":
      return item instanceof ApiPropertyItem ? item.propertyTypeExcerpt : undefined
    case "variable":
      return item instanceof ApiVariable ? item.variableTypeExcerpt : undefined
    case "type-alias":
      return item instanceof ApiTypeAlias ? item.typeExcerpt : undefined
    default:
      return undefined
  }
}

async function loadEngine() {
  const base = path.join(
    repoRoot,
    "node_modules",
    "internal-package-contract",
    "scripts",
    "api-contract",
  )
  const [
    extractorAdapter,
    modelNormalizer,
    compatibilityClassifier,
    schemaVersionConsistency,
    typeAssignability,
    apiExtractorModel,
  ] = await Promise.all([
    import(path.join(base, "extractor-adapter.ts")),
    import(path.join(base, "model-normalizer.ts")),
    import(path.join(base, "compatibility-classifier.ts")),
    import(path.join(base, "schema-version-consistency.ts")),
    import(path.join(base, "type-assignability.ts")),
    import("@microsoft/api-extractor-model"),
  ])
  return {
    extractorAdapter,
    modelNormalizer,
    compatibilityClassifier,
    schemaVersionConsistency,
    typeAssignability,
    apiExtractorModel,
  }
}

async function runTier(tierName, definitionVersion, engine) {
  const {
    extractorAdapter,
    modelNormalizer,
    compatibilityClassifier,
    schemaVersionConsistency,
    typeAssignability,
    apiExtractorModel,
  } = engine

  const genStart = performance.now()
  const { baseline, current } = await generateApiContractFixture(tierName, fixturesRoot, repoRoot)
  const [baselineDtsText, currentDtsText] = await Promise.all([
    fs.readFile(baseline.dtsRollupFilePath, "utf8"),
    fs.readFile(current.dtsRollupFilePath, "utf8"),
  ])
  const fixtureGenerationMs = performance.now() - genStart

  const { samples, configuration } = await adaptiveSample(async () => {
    const t0 = performance.now()

    const { pkg: baselinePkg } = extractorAdapter.loadApiModel(baseline.apiJsonFilePath)
    const { pkg: currentPkg } = extractorAdapter.loadApiModel(current.apiJsonFilePath)

    const baselineNormalized = modelNormalizer.normalizeApiPackage(baselinePkg, "public")
    const currentNormalized = modelNormalizer.normalizeApiPackage(currentPkg, "public")

    const baselineRefIndex = typeAssignability.buildReferenceIndex(baselinePkg)
    const currentRefIndex = typeAssignability.buildReferenceIndex(currentPkg)
    const baselineItemIndex = typeAssignability.buildItemIndex(baselinePkg)
    const currentItemIndex = typeAssignability.buildItemIndex(currentPkg)

    const resolveAssignability = (query) => {
      const oldItem = baselineItemIndex.get(query.oldCanonicalReference)
      const newItem = currentItemIndex.get(query.newCanonicalReference)
      if (!oldItem || !newItem) return "unknown"
      const oldExcerpt = getExcerptForPosition(
        oldItem,
        query.position,
        query.parameterIndex,
        apiExtractorModel,
      )
      const newExcerpt = getExcerptForPosition(
        newItem,
        query.position,
        query.parameterIndex,
        apiExtractorModel,
      )
      if (!oldExcerpt || !newExcerpt) return "unknown"
      const freeTypeParameterNames = new Set([
        ...typeAssignability.freeTypeParameterNamesFor(oldItem),
        ...typeAssignability.freeTypeParameterNamesFor(newItem),
      ])
      return typeAssignability.checkAssignability(
        {
          baselineDts: baselineDtsText,
          currentDts: currentDtsText,
          baselineRefIndex,
          currentRefIndex,
          oldExcerpt,
          newExcerpt,
          freeTypeParameterNames,
        },
        query.direction,
      )
    }

    const { changes } = compatibilityClassifier.classifyContractChanges(
      baselineNormalized,
      currentNormalized,
      { resolveAssignability },
    )
    const schemaVersionChanges = schemaVersionConsistency.detectSchemaVersionDrift(
      baselineNormalized,
      currentNormalized,
    )

    return {
      durationMs: performance.now() - t0,
      changeCount: changes.length + schemaVersionChanges.length,
    }
  }, SAMPLE_OPTS)

  const last = samples[samples.length - 1]

  return {
    id: benchmarkId(
      "api-contract",
      "diff-api-contract",
      tierName,
      BENCHMARK_SUITE_VERSION,
      definitionVersion,
    ),
    status: "completed",
    inputs: { exportedSymbols: TIERS[tierName].exports },
    fixtureGenerationMs: Math.round(fixtureGenerationMs),
    durationMs: computeDurationStats(
      samples.map((s) => s.durationMs),
      configuration.warmupIterations,
    ),
    changeCount: last.changeCount,
    configuration,
  }
}

async function main() {
  const startedAt = new Date()
  const packageJson = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8"))
  const def = API_CONTRACT_BENCHMARKS["diff-api-contract"]
  const engine = await loadEngine()

  const results = { "diff-api-contract": { tiers: {} } }
  for (const tier of def.tiers) {
    console.log(`[performance-api-contract] diff-api-contract.${tier} ...`)
    const entry = await runTier(tier, def.definitionVersion, engine)
    results["diff-api-contract"].tiers[tier] = entry
    console.log(
      `[performance-api-contract] diff-api-contract.${tier}: median ${entry.durationMs.medianMs.toFixed(2)}ms, n=${entry.durationMs.iterations}, exports=${entry.inputs.exportedSymbols}, changes=${entry.changeCount}`,
    )
  }

  const finishedAt = new Date()
  const metadata = buildMetadata({
    repoRoot,
    startedAt,
    finishedAt,
    configuration: results["diff-api-contract"].tiers[def.tiers[0]].configuration,
    repoContractVersion: packageJson.version,
    fixtureSeed: "deterministic",
    generatorVersion: 1,
    benchmarkSuiteVersion: BENCHMARK_SUITE_VERSION,
  })
  const benchmarkManifest = buildManifest(
    "api-contract",
    API_CONTRACT_BENCHMARKS,
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
    renderResultsMarkdown(output, "performance-api-contract results"),
    "utf8",
  )

  console.log(`\n[performance-api-contract] wrote results.json and RESULTS.md`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
