// Entry point for the "api-contract" self-hosting check, invoked via
// `run: ["tsx", "scripts/api-contract/check.ts", "--release-tag=public"]` in repo-contract.config.ts.
// Prints ONLY the JSON evidence to stdout (for `output: { format: "json" }` to parse) -- everything
// else, including anything API Extractor itself would otherwise print, is routed to stderr.

import { readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

import type { ApiItem, Excerpt } from "@microsoft/api-extractor-model"
import {
  ApiParameterListMixin,
  ApiPropertyItem,
  ApiReturnTypeMixin,
  ApiTypeAlias,
  ApiVariable,
} from "@microsoft/api-extractor-model"

import {
  readBaseline,
  readPackageJson,
  readSchemaVersion,
  sha256,
  writeBaselineFiles,
} from "./baseline-store.js"
import { applyChangeset } from "./changeset-manager.js"
import type { AssignabilityQuery, ResolveAssignability } from "./compatibility-classifier.js"
import { classifyContractChanges } from "./compatibility-classifier.js"
import type {
  ApiContractEvidence,
  ApiContractSnapshot,
  ContractImpact,
  RequiredReleaseLevel,
} from "./evidence-types.js"
import {
  getApiExtractorVersion,
  loadApiModel,
  runApiExtractorForRoot,
} from "./extractor-adapter.js"
import type { ReleaseTagLevel } from "./model-normalizer.js"
import { normalizeApiPackage } from "./model-normalizer.js"
import { detectSchemaVersionDrift } from "./schema-version-consistency.js"
import { computeMinimumRequiredVersion, parseVersion } from "./semver.js"
import { summarizeChanges } from "./summarize-changes.js"
import {
  buildItemIndex,
  buildReferenceIndex,
  checkAssignability,
  freeTypeParameterNamesFor,
} from "./type-assignability.js"

/**
 * @returns The `--release-tag` CLI argument's value if it's "beta" or "alpha", otherwise "public".
 */
function parseReleaseTagArg(): ReleaseTagLevel {
  const arg = process.argv.find((a) => a.startsWith("--release-tag="))
  const value = arg?.slice("--release-tag=".length)
  return value === "beta" || value === "alpha" ? value : "public"
}

/**
 * @param item - The API item (baseline or current side) to read a type excerpt from.
 * @param position - Which type-bearing position on `item` to read.
 * @param parameterIndex - The parameter's index, required when `position` is "parameter".
 * @returns The excerpt at that position, or `undefined` if `item` doesn't carry one there.
 */
function getExcerptForPosition(
  item: ApiItem,
  position: AssignabilityQuery["position"],
  parameterIndex: number | undefined,
): Excerpt | undefined {
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

/**
 * `ApiModel.loadPackage` only accepts a file path -- the committed baseline text (read from git HEAD, never the working tree) is written to a scratch temp file outside the repo, loaded, then removed.
 * @param text - The baseline's raw API JSON text, as read from git `HEAD`.
 * @returns The loaded model's `ApiPackage`.
 */
async function loadPackageFromText(text: string) {
  const tmpPath = path.join(
    os.tmpdir(),
    `repo-contract-api-contract-baseline-${String(process.pid)}-${String(Date.now())}.api.json`,
  )
  await writeFile(tmpPath, text, "utf8")
  try {
    return loadApiModel(tmpPath).pkg
  } finally {
    await rm(tmpPath, { force: true })
  }
}

/**
 * The check's full logic, factored out of the bottom-of-file script invocation so
 * `test/integration/api-contract/check.integration.test.ts` can exercise the complete real path (source ->
 * API Extractor -> API JSON -> historical comparison -> evidence) in-process against a scratch
 * fixture repository, without spawning a subprocess. `root` must contain `dist/index.d.ts`
 * (already built) and a `tsconfig.json`, matching this repository's own layout convention.
 * @param root - Path to the package's project folder; must contain `dist/index.d.ts` and `tsconfig.json`.
 * @param releaseTag - The minimum release tag (`public`/`beta`/`alpha`) to include in the comparison.
 * @returns The complete evidence for this run -- snapshots, diff, impact, required level, and changeset outcome.
 */
export async function runApiContractCheck(
  root: string,
  releaseTag: ReleaseTagLevel,
): Promise<ApiContractEvidence> {
  const extractResult = runApiExtractorForRoot(root)

  if (!extractResult.succeeded) {
    throw new Error(
      `API Extractor reported ${String(extractResult.errorCount)} error(s) -- see stderr above for details.`,
    )
  }

  // currentApiJsonText/currentDtsText/packageJson are three independent reads; loadApiModel's own
  // read of apiJsonFilePath can't be folded into currentApiJsonText's, though -- ApiModel.loadPackage
  // only accepts a file path (it does its own internal read+parse), the same constraint
  // loadPackageFromText below works around for the baseline side by round-tripping through a temp
  // file, which isn't a win here since the current side already has a real file path on disk.
  const [currentApiJsonText, currentDtsText, packageJson] = await Promise.all([
    readFile(extractResult.apiJsonFilePath, "utf8"),
    readFile(extractResult.dtsRollupFilePath, "utf8"),
    readPackageJson(root),
  ])
  const { pkg: currentPkg } = loadApiModel(extractResult.apiJsonFilePath)
  const apiExtractorVersion = getApiExtractorVersion()

  const currentSnapshot: ApiContractSnapshot = {
    packageName: packageJson.name,
    apiExtractorVersion,
    apiJsonSchemaVersion: readSchemaVersion(currentApiJsonText),
    apiJsonHash: sha256(currentApiJsonText),
    apiReportPath: path.relative(root, extractResult.apiReportFilePath),
  }

  const baseline = await readBaseline(root)
  let evidence: ApiContractEvidence

  if (!baseline) {
    evidence = {
      initialBaseline: true,
      current: currentSnapshot,
      diff: [],
      lowerTierDiff: [],
      impact: "unchanged",
      requiredLevel: "none",
      minimumRequiredVersion: "0.1.0",
      currentVersion: packageJson.version,
      summary: summarizeChanges([], "unchanged", true),
      changeset: { action: "none", generatedSectionUpdated: false },
    }

    await writeBaselineFiles(root, {
      apiJsonText: currentApiJsonText,
      dtsText: currentDtsText,
      packageName: packageJson.name,
      packageVersion: packageJson.version,
      apiExtractorVersion,
      apiJsonSchemaVersion: currentSnapshot.apiJsonSchemaVersion,
    })
  } else {
    const baselinePkg = await loadPackageFromText(baseline.apiJsonText)

    const currentNormalized = normalizeApiPackage(currentPkg, releaseTag)
    const baselineNormalized = normalizeApiPackage(baselinePkg, releaseTag)

    const currentRefIndex = buildReferenceIndex(currentPkg)
    const baselineRefIndex = buildReferenceIndex(baselinePkg)
    const currentItemIndex = buildItemIndex(currentPkg)
    const baselineItemIndex = buildItemIndex(baselinePkg)

    const resolveAssignability: ResolveAssignability = (query) => {
      const oldItem = baselineItemIndex.get(query.oldCanonicalReference)
      const newItem = currentItemIndex.get(query.newCanonicalReference)
      if (!oldItem || !newItem) return "unknown"

      const oldExcerpt = getExcerptForPosition(oldItem, query.position, query.parameterIndex)
      const newExcerpt = getExcerptForPosition(newItem, query.position, query.parameterIndex)
      if (!oldExcerpt || !newExcerpt) return "unknown"

      const freeTypeParameterNames = new Set([
        ...freeTypeParameterNamesFor(oldItem),
        ...freeTypeParameterNamesFor(newItem),
      ])

      return checkAssignability(
        {
          baselineDts: baseline.dtsText,
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

    const { changes: classifierChanges, impact: classifierImpact } = classifyContractChanges(
      baselineNormalized,
      currentNormalized,
      { resolveAssignability },
    )
    const schemaVersionChanges = detectSchemaVersionDrift(baselineNormalized, currentNormalized)
    const diff = [...classifierChanges, ...schemaVersionChanges].sort((a, b) =>
      a.id.localeCompare(b.id),
    )

    // Informational-only pass at the lowest threshold (admits every release tier), so changes
    // below the check's own --release-tag floor aren't silently invisible. Reuses
    // resolveAssignability/*RefIndex/*ItemIndex above unchanged -- those are built from the raw
    // ApiPackage, not threshold-filtered, so no rebuild is needed. Set-difference by change `id`
    // against the already-computed threshold-admitted `diff` isolates exactly the changes that only
    // appear once lower tiers are admitted, without inspecting releaseTag per item. Never affects
    // impact/requiredLevel/minimumRequiredVersion below -- those are derived from `diff` alone.
    const { changes: allTierChanges } = classifyContractChanges(
      normalizeApiPackage(baselinePkg, "internal"),
      normalizeApiPackage(currentPkg, "internal"),
      { resolveAssignability },
    )
    const publicIds = new Set(diff.map((change) => change.id))
    const lowerTierDiff = allTierChanges
      .filter((change) => !publicIds.has(change.id))
      .sort((a, b) => a.id.localeCompare(b.id))

    const impact: ContractImpact = schemaVersionChanges.length > 0 ? "breaking" : classifierImpact
    const baselineVersion = parseVersion(baseline.meta.packageVersion)

    let requiredLevel: RequiredReleaseLevel | undefined
    if (impact === "unknown") {
      requiredLevel = undefined
    } else if (impact === "breaking") {
      requiredLevel = "major"
    } else if (impact === "compatible") {
      // A compatible change needs a minor bump when it *widens* the public
      // surface: a new export/member/overload/enum-member (`*-added`), and
      // also a `release-tag-changed` -- which, being compatible rather than
      // breaking, can only mean a tag was widened (e.g. `@beta` -> `@public`),
      // newly exposing API. Everything else compatible (a doc-only edit, an
      // optionality relaxation) is a patch.
      const widensSurface = (kind: (typeof diff)[number]["kind"]): boolean =>
        kind.endsWith("-added") || kind === "release-tag-changed"
      requiredLevel = diff.some((change) => widensSurface(change.kind)) ? "minor" : "patch"
    } else {
      requiredLevel = "none"
    }

    const minimumRequiredVersion =
      requiredLevel === undefined
        ? undefined
        : computeMinimumRequiredVersion(baselineVersion, requiredLevel)

    const summary = summarizeChanges(diff, impact, false)

    const changeset = await applyChangeset({
      root,
      packageName: packageJson.name,
      impact,
      requiredLevel,
      diff,
      lowerTierDiff,
      summary,
      apiJsonHash: currentSnapshot.apiJsonHash,
    })

    evidence = {
      initialBaseline: false,
      baseline: {
        packageName: baseline.meta.packageName,
        apiExtractorVersion: baseline.meta.apiExtractorVersion,
        apiJsonSchemaVersion: baseline.meta.apiJsonSchemaVersion,
        apiJsonHash: baseline.meta.apiJsonHash,
      },
      current: currentSnapshot,
      diff,
      lowerTierDiff,
      impact,
      requiredLevel,
      minimumRequiredVersion,
      baselineVersion: baseline.meta.packageVersion,
      currentVersion: packageJson.version,
      summary,
      changeset,
    }
  }

  return evidence
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const evidence = await runApiContractCheck(process.cwd(), parseReleaseTagArg())
  process.stdout.write(JSON.stringify(evidence))
}
