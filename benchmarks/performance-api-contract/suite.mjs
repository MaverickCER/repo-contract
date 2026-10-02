// repo-contract benchmark suite 3 of 3: the API-contract engine that diffs a package's public surface
// against its committed baseline (loading, normalizing and classifying every change). It lives in
// internal-package-contract and is what repo-contract's own `api-contract` check runs. How to read and
// write one: ../READING-BENCHMARKS.md and ../WRITING-BENCHMARKS.md.
//
// Each size compiles a real synthetic TypeScript package (a baseline and a changed copy) and runs the
// real API Extractor over it once; only the load/normalize/classify steps are measured.

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineSuite } from "internal-package-contract/benchmark"
import { generateApiContractFixture } from "./fixtures.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, "..", "..")
const fixturesRoot = path.join(here, "fixtures", "generated")

const engineBase = path.join(
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
  import(path.join(engineBase, "extractor-adapter.ts")),
  import(path.join(engineBase, "model-normalizer.ts")),
  import(path.join(engineBase, "compatibility-classifier.ts")),
  import(path.join(engineBase, "schema-version-consistency.ts")),
  import(path.join(engineBase, "type-assignability.ts")),
  import("@microsoft/api-extractor-model"),
])

/** Compiling and extracting a synthetic package is expensive, so each size is built once and shared. */
const fixtureCache = new Map()
function fixture(n) {
  if (!fixtureCache.has(n))
    fixtureCache.set(n, generateApiContractFixture(n, fixturesRoot, repoRoot))
  return fixtureCache.get(n)
}

/** Mirrors internal-package-contract's own check.ts `getExcerptForPosition` (not exported there). */
function excerptFor(item, position, parameterIndex) {
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

async function loadPair(n) {
  const { baseline, current } = await fixture(n)
  const baselineDts = fs.readFileSync(baseline.dtsRollupFilePath, "utf8")
  const currentDts = fs.readFileSync(current.dtsRollupFilePath, "utf8")
  return { baseline, current, baselineDts, currentDts }
}

function normalizePair(pair) {
  const { pkg: baselinePkg } = extractorAdapter.loadApiModel(pair.baseline.apiJsonFilePath)
  const { pkg: currentPkg } = extractorAdapter.loadApiModel(pair.current.apiJsonFilePath)
  return {
    ...pair,
    baselinePkg,
    currentPkg,
    baselineNormalized: modelNormalizer.normalizeApiPackage(baselinePkg, "public"),
    currentNormalized: modelNormalizer.normalizeApiPackage(currentPkg, "public"),
  }
}

function classify(prepared) {
  const {
    baselinePkg,
    currentPkg,
    baselineDts,
    currentDts,
    baselineNormalized,
    currentNormalized,
  } = prepared
  const baselineRefIndex = typeAssignability.buildReferenceIndex(baselinePkg)
  const currentRefIndex = typeAssignability.buildReferenceIndex(currentPkg)
  const baselineItemIndex = typeAssignability.buildItemIndex(baselinePkg)
  const currentItemIndex = typeAssignability.buildItemIndex(currentPkg)
  const resolveAssignability = (query) => {
    const oldItem = baselineItemIndex.get(query.oldCanonicalReference)
    const newItem = currentItemIndex.get(query.newCanonicalReference)
    if (!oldItem || !newItem) return "unknown"
    const oldExcerpt = excerptFor(oldItem, query.position, query.parameterIndex)
    const newExcerpt = excerptFor(newItem, query.position, query.parameterIndex)
    if (!oldExcerpt || !newExcerpt) return "unknown"
    const freeTypeParameterNames = new Set([
      ...typeAssignability.freeTypeParameterNamesFor(oldItem),
      ...typeAssignability.freeTypeParameterNamesFor(newItem),
    ])
    return typeAssignability.checkAssignability(
      {
        baselineDts,
        currentDts,
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
  const drift = schemaVersionConsistency.detectSchemaVersionDrift(
    baselineNormalized,
    currentNormalized,
  )
  return changes.length + drift.length
}

const SYMBOLS = {
  name: "exported symbols",
  how: "swept",
  description: "The tier axis: how many functions the package's public surface exports.",
}
const SURFACE = {
  name: "surface shape",
  how: "fixed",
  value: "functions with one parameter each",
  description:
    "Interfaces, classes, generics and overloads add proportionally more per symbol and are not covered.",
}
const CHANGE_MIX = {
  name: "change mix",
  how: "fixed",
  value: "about 6% widened, 6% breaking, 2 removed, 2 added",
  description:
    "A realistic mixed diff rather than 'identical' or 'completely different'; more changes mean more assignability probes.",
}
const RUNTIME = {
  name: "runtime",
  how: "fixed",
  value: "Node (V8)",
  description: "Measured on Node only.",
}
const SLOW = { warmupIterations: 1, minIterations: 3, maxIterations: 10, targetDurationMs: 2000 }

export default defineSuite({
  package: { name: "repo-contract", bundleFiles: [] },
  tiers: [20, 40, 80, 160, 320, 640, 1280],

  workload: {
    unit: "export",
    description:
      "One exported function in the package's public API. 160 is a mid-sized library's surface; the ladder reaches 1,280. It stops there, not at 10,240, because every size compiles a real synthetic TypeScript package and runs API Extractor over it, which takes minutes at the largest sizes.",
    typicalN: 160,
  },

  endToEnd: {
    purpose:
      "Shows what a pull request pays, on every API-contract check, to find out whether the public API changed compatibly, compared with the bare minimum of reading the two API descriptions. Both sides start from the same extracted `.api.json` files; the difference is the engine's model loading, normalization and compatibility classification (including its type-assignability probing). This runs on every pull request and every pre-push.",
    baseline: {
      description:
        "Read and JSON-parse the baseline and current API descriptions -- the least anyone would do to look at them.",
      sampling: SLOW,
      setup: async (n) => loadPair(n),
      run: ({ baseline, current }) =>
        JSON.parse(fs.readFileSync(baseline.apiJsonFilePath, "utf8")).members.length +
        JSON.parse(fs.readFileSync(current.apiJsonFilePath, "utf8")).members.length,
    },
    withPackage: {
      description:
        "Load both API models, normalize them to the public surface, build the reference indexes and classify every change, probing type assignability where needed.",
      sampling: SLOW,
      setup: async (n) => loadPair(n),
      run: (pair) => classify(normalizePair(pair)),
    },
    variables: [
      SYMBOLS,
      SURFACE,
      CHANGE_MIX,
      {
        name: "extraction",
        how: "fixed",
        value: "excluded",
        description:
          "Compiling and running API Extractor is a separate, larger cost done once per build; it is generated once per size and not measured here.",
      },
      RUNTIME,
    ],
  },

  functions: [
    {
      id: "load-api-model",
      name: "loadApiModel (both API descriptions)",
      why: "The first step of every API-contract check: reading the extracted API descriptions into an in-memory model.",
      poorPerformanceMeans:
        "Every API check starts slower in proportion to the size of the public surface, and a large model also raises memory use in CI.",
      expectedComplexity: "linear",
      complexityReason:
        "Loading parses the JSON description and builds one model item per declaration, so cost is proportional to the size of the surface.",
      variables: [SYMBOLS, SURFACE, RUNTIME],
      inEndToEnd: {
        callsPerOperation: 1,
        description:
          "Once per API check, loading both the baseline and the current API description (this function loads both).",
      },
      sampling: SLOW,
      setup: (n) => loadPair(n),
      run: (pair) => {
        extractorAdapter.loadApiModel(pair.baseline.apiJsonFilePath)
        return extractorAdapter.loadApiModel(pair.current.apiJsonFilePath)
      },
    },
    {
      id: "normalize-api-package",
      name: "normalizeApiPackage",
      why: "Reduces the loaded model to the comparable public surface (applying release tags and ordering), so two versions can be diffed symbol by symbol.",
      poorPerformanceMeans:
        "API checks slow down with the size of the surface, and normalization runs twice per check (baseline and current).",
      expectedComplexity: "linearithmic",
      complexityReason:
        "It walks every declaration once and sorts members into a canonical order so the two versions line up, so the sort adds a log factor to the linear walk.",
      variables: [SYMBOLS, SURFACE, RUNTIME],
      inEndToEnd: {
        callsPerOperation: 1,
        description:
          "Once per API check, normalizing both the baseline and the current model (this function normalizes both).",
      },
      sampling: SLOW,
      setup: async (n) => {
        const pair = await loadPair(n)
        return {
          baselinePkg: extractorAdapter.loadApiModel(pair.baseline.apiJsonFilePath).pkg,
          currentPkg: extractorAdapter.loadApiModel(pair.current.apiJsonFilePath).pkg,
        }
      },
      run: ({ baselinePkg, currentPkg }) => [
        modelNormalizer.normalizeApiPackage(baselinePkg, "public"),
        modelNormalizer.normalizeApiPackage(currentPkg, "public"),
      ],
    },
    {
      id: "classify-contract-changes",
      name: "classifyContractChanges (with type-assignability probing)",
      why: "Decides, change by change, whether a pull request breaks consumers -- the verdict that gates a release. It also drives the most expensive step, asking the TypeScript compiler whether one type still accepts another.",
      poorPerformanceMeans:
        "Slower API checks on every pull request, and the cost lands on exactly the large packages that most need the protection; a super-linear classifier would make the check impractical for them.",
      expectedComplexity: "linear",
      complexityReason:
        "It matches symbols by name through maps and classifies each difference once; type-assignability probes happen only for the changed symbols, whose number is a fixed proportion of the surface, so cost is proportional to the size of the surface.",
      variables: [SYMBOLS, SURFACE, CHANGE_MIX, RUNTIME],
      notCovered: [
        {
          name: "changes that need the compiler to be conservative",
          reason:
            "Rare generic and conditional-type edge cases take slower probing paths; the synthetic surface uses simple parameter types.",
        },
      ],
      inEndToEnd: {
        callsPerOperation: 1,
        description: "Once per API check, after both models are normalized.",
      },
      sampling: SLOW,
      setup: async (n) => normalizePair(await loadPair(n)),
      run: (prepared) => classify(prepared),
    },
  ],
})
