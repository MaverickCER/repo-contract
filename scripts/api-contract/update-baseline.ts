// Run via `npm run contract:baseline` -- the ONLY normal way
// `.repo-contract/api-contract/baseline.*` is updated once a baseline already exists (the check
// itself only ever bootstraps the very first one; see check.ts). Regenerates the current contract
// and overwrites the baseline in the working tree for review and commit -- by a human, or by
// .github/workflows/api-baseline.yml on release-please's Release PR branch.
//
// Intended lifecycle: change public API in a commit that declares the right bump (`api-contract`
// gates this) -> PR merges -> release-please's Release PR bumps package.json/CHANGELOG.md and
// the release publishes -> `npm run contract:baseline` -> commit the new baseline.
//
// Idempotent: when the baseline already carries package.json's version there is nothing to do,
// so it reports `"current"` and exits 0 rather than erroring. That makes it safe for the
// workflow to run on every Release-PR `synchronize` (its own baseline commit, or release-please
// refreshing the PR after another merge) -- only the first run of a given release version writes
// anything. It still `"refused"`s (exit 1) if package.json is *older* than the baseline, which
// would be a regression.

import { readFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"

import {
  readBaseline,
  readPackageJson,
  readSchemaVersion,
  writeBaselineFiles,
} from "./baseline-store.js"
import { getApiExtractorVersion, runApiExtractorForRoot } from "./extractor-adapter.js"
import { compareVersions, parseVersion } from "./semver.js"

export type UpdateBaselineOutcome =
  | { readonly status: "updated"; readonly message: string }
  | { readonly status: "current"; readonly message: string }
  | { readonly status: "refused" | "failed"; readonly message: string }

/**
 * Factored out of the bottom-of-file CLI invocation so `test/unit/api-contract/update-baseline.test.ts`
 * can exercise the real guardrail logic in-process against a scratch fixture repository.
 * @param root - Absolute path to the repository root whose baseline is being updated.
 * @returns The outcome: `"updated"` with the new baseline's version; `"current"` (a benign no-op) when the baseline already carries package.json's version; `"refused"` when package.json's version is older than the baseline's, or either is unparseable; or `"failed"` if API Extractor itself reported errors.
 */
export async function runUpdateBaseline(root: string): Promise<UpdateBaselineOutcome> {
  const packageJson = await readPackageJson(root)

  const existingBaseline = await readBaseline(root)

  if (existingBaseline) {
    const currentVersion = parseVersion(packageJson.version)
    const baselineVersion = parseVersion(existingBaseline.meta.packageVersion)

    if (!currentVersion || !baselineVersion) {
      return {
        status: "refused",
        message:
          `Refusing to update the baseline: could not parse package.json version ${packageJson.version} ` +
          `and/or the existing baseline's version ${existingBaseline.meta.packageVersion}.`,
      }
    }

    const versionDelta = compareVersions(currentVersion, baselineVersion)

    if (versionDelta === 0) {
      return {
        status: "current",
        message: `Baseline is already at version ${packageJson.version}; nothing to do.`,
      }
    }

    if (versionDelta < 0) {
      return {
        status: "refused",
        message:
          `Refusing to update the baseline: package.json declares version ${packageJson.version}, which is older ` +
          `than the existing baseline's version ${existingBaseline.meta.packageVersion} -- regenerating now would ` +
          "roll the baseline backwards. Bump package.json (normally via release-please's Release PR) first.",
      }
    }
  }

  const extractResult = runApiExtractorForRoot(root)

  if (!extractResult.succeeded) {
    return {
      status: "failed",
      message: `API Extractor reported ${String(extractResult.errorCount)} error(s) -- see stderr above for details.`,
    }
  }

  const [apiJsonText, dtsText] = await Promise.all([
    readFile(extractResult.apiJsonFilePath, "utf8"),
    readFile(extractResult.dtsRollupFilePath, "utf8"),
  ])
  const apiJsonSchemaVersion = readSchemaVersion(apiJsonText)

  await writeBaselineFiles(root, {
    apiJsonText,
    dtsText,
    packageName: packageJson.name,
    packageVersion: packageJson.version,
    apiExtractorVersion: getApiExtractorVersion(),
    apiJsonSchemaVersion,
  })

  return {
    status: "updated",
    message: `Baseline updated to version ${packageJson.version}. Review .repo-contract/api-contract/baseline.* and commit.`,
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outcome = await runUpdateBaseline(process.cwd())
  if (outcome.status === "updated" || outcome.status === "current") {
    process.stdout.write(`${outcome.message}\n`)
  } else {
    process.stderr.write(`${outcome.message}\n`)
    process.exitCode = 1
  }
}
