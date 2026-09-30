// Tiered synthetic public-API-surface generator for the `diff-api-contract` benchmark (measures
// the API-contract diffing code path IPC's checks/api-contract.ts / scripts/api-contract/*.ts own
// -- the engine repo-contract.config.ts wires in directly as the `api-contract` check; see that
// config's own module doc comment). Deliberately plain JS.
//
// Fixture generation here is deliberately real, not mocked: a scratch TypeScript package is
// written to disk, compiled with the real `tsc`, and run through the real, programmatic API
// Extractor (`runApiExtractor`, the same function `check.ts` itself calls) -- twice, once for a
// "baseline" surface and once for a "current" surface with a deterministic, proportional set of
// changes injected (some additions, some removals, some breaking signature changes). This is the
// one-time, per-tier cost reported separately as `fixtureGenerationMs`; it never runs inside the
// sampled loop (see scripts/run-benchmark.mjs). What IS sampled is the real, in-memory diff/classify
// step: `loadApiModel` + `normalizeApiPackage` + `buildReferenceIndex`/`buildItemIndex` +
// `classifyContractChanges` + `detectSchemaVersionDrift` -- repo-contract's own "computing/diffing
// API contracts" hot path, isolated from the one-time compile/extract cost around it.

import { execFileSync } from "node:child_process"
import fs, { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

export const BENCHMARK_SUITE_VERSION = 1

export const TIERS = {
  small: { exports: 20 },
  medium: { exports: 100 },
  large: { exports: 400 },
}

export const TIER_NAMES = Object.keys(TIERS)

export const API_CONTRACT_BENCHMARKS = {
  "diff-api-contract": { tiers: TIER_NAMES, definitionVersion: 1 },
}

const PARAM_TYPES = ["number", "string", "boolean", "readonly string[]"]

/** One deterministic exported function declaration, `@public`-tagged so it survives normalizeApiPackage's "public" threshold (an item with no release tag is treated as `"internal"` -- see model-normalizer.ts). */
function renderExport(index, { extraParam, changedParamType } = {}) {
  const paramType = changedParamType ?? PARAM_TYPES[index % PARAM_TYPES.length]
  const extra = extraParam ? `, extra${String(index)}?: number` : ""
  return [
    "/**",
    ` * Synthetic export #${String(index)}, generated for the performance-api-contract benchmark.`,
    " * @public",
    " */",
    `export function fn${String(index)}(value${String(index)}: ${paramType}${extra}): boolean {`,
    `  return Boolean(value${String(index)})`,
    "}",
    "",
  ].join("\n")
}

/**
 * Builds two related source files for one tier: `baseline` (exactly `exportCount` exports) and
 * `current` (the same exports, with a deterministic, proportional set of changes): every 10th
 * export gains an added optional parameter (a compatible widening), every 17th export's parameter
 * type changes (a breaking change), and the last 2 exports of `baseline` are dropped from
 * `current` while 2 brand-new exports are appended (a removal + an addition) -- a realistic,
 * non-trivial mixed diff rather than either "identical" or "completely different."
 * @param exportCount - how many exports the baseline surface declares.
 * @returns the baseline and current source text.
 */
function renderSourcePair(exportCount) {
  const baselineParts = []
  const currentParts = []

  for (let i = 0; i < exportCount; i++) {
    baselineParts.push(renderExport(i))
    if (i % 17 === 0 && i > 0) {
      currentParts.push(renderExport(i, { changedParamType: "number[]" }))
    } else if (i % 10 === 0 && i > 0) {
      currentParts.push(renderExport(i, { extraParam: true }))
    } else if (i < exportCount - 2) {
      currentParts.push(renderExport(i))
    }
    // The final 2 baseline exports are intentionally omitted from `current` (a removal).
  }
  currentParts.push(renderExport(exportCount, {}))
  currentParts.push(renderExport(exportCount + 1, {}))

  return { baselineSource: baselineParts.join("\n"), currentSource: currentParts.join("\n") }
}

const TSCONFIG = {
  compilerOptions: {
    target: "ES2022",
    module: "NodeNext",
    moduleResolution: "NodeNext",
    declaration: true,
    emitDeclarationOnly: true,
    outDir: "dist",
    strict: true,
    skipLibCheck: true,
  },
  include: ["src/**/*.ts"],
}

/** Writes and compiles one synthetic package (`variant` is "baseline" or "current"), then runs the real API Extractor against it, returning the absolute paths of its `.api.json` and rolled-up `.d.ts`. */
async function buildVariant(tierDir, variant, source, repoRoot) {
  const { runApiExtractor } = await import(
    path.join(
      repoRoot,
      "node_modules/internal-package-contract/scripts/api-contract/extractor-adapter.ts",
    )
  )

  const variantDir = path.join(tierDir, variant)
  await mkdir(path.join(variantDir, "src"), { recursive: true })
  await writeFile(
    path.join(variantDir, "package.json"),
    JSON.stringify(
      {
        name: "benchmark-api-contract-fixture",
        version: "0.0.0",
        main: "dist/index.js",
        types: "dist/index.d.ts",
      },
      null,
      2,
    ),
  )
  await writeFile(path.join(variantDir, "tsconfig.json"), JSON.stringify(TSCONFIG, null, 2))
  await writeFile(path.join(variantDir, "src", "index.ts"), source)

  execFileSync(
    process.execPath,
    [path.join(repoRoot, "node_modules", ".bin", "tsc"), "-p", "tsconfig.json"],
    { cwd: variantDir, stdio: ["ignore", "ignore", "ignore"] },
  )

  const outDir = path.join(variantDir, "out")
  const result = runApiExtractor({
    projectFolder: variantDir,
    mainEntryPointFilePath: "dist/index.d.ts",
    tsconfigFilePath: path.join(variantDir, "tsconfig.json"),
    apiJsonFilePath: path.join(outDir, `${variant}.api.json`),
    dtsRollupFilePath: path.join(outDir, `${variant}.d.ts`),
    apiReportFolder: outDir,
    apiReportFileName: variant,
  })

  if (!result.succeeded) {
    throw new Error(
      `API Extractor reported ${String(result.errorCount)} error(s) for the ${variant} fixture.`,
    )
  }

  return { apiJsonFilePath: result.apiJsonFilePath, dtsRollupFilePath: result.dtsRollupFilePath }
}

/**
 * Generates (compiles + extracts) one tier's baseline/current fixture pair on disk, under
 * `benchmarks/performance-api-contract/fixtures/generated/<tierName>/` (gitignored -- see
 * .gitignore -- regenerated fresh on every benchmark run, never committed).
 * @param tierName - which tier to generate ("small"/"medium"/"large").
 * @param outputRoot - absolute path to this category's own `fixtures/generated` directory.
 * @param repoRoot - absolute path to the repo root (to resolve internal-package-contract's extractor-adapter.ts and the local tsc binary).
 * @returns absolute paths to both variants' `.api.json` and `.d.ts` rollup files.
 */
export async function generateApiContractFixture(tierName, outputRoot, repoRoot) {
  const exportCount = TIERS[tierName].exports
  const tierDir = path.join(outputRoot, tierName)
  await fs.rm(tierDir, { recursive: true, force: true })
  await mkdir(tierDir, { recursive: true })

  const { baselineSource, currentSource } = renderSourcePair(exportCount)

  const baseline = await buildVariant(tierDir, "baseline", baselineSource, repoRoot)
  const current = await buildVariant(tierDir, "current", currentSource, repoRoot)

  return { baseline, current }
}
