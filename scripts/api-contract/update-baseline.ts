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
// Outcomes -- only `updated` and `current` exit 0:
//   updated   no baseline yet (bootstrap); or package.json's version is strictly greater than
//             the committed baseline's; or the version is unchanged but the public API contents
//             actually differ (an API-changing commit that merged while the Release PR was open)
//             -> regenerates and writes.
//   current   the baseline already carries package.json's version AND its contents match ->
//             writes nothing. This is what every Release-PR `synchronize` after the first sync
//             sees (the job's own baseline commit, release-please refreshing the PR), so it must
//             not fail.
//   refused   package.json's version is unparseable; or it is older than the committed
//             baseline's (regenerating would roll the baseline backwards); or the committed
//             baseline itself records an unparseable version.
//   failed    API Extractor reported errors.
//
// The unchanged-version case cannot be a blind regenerate: that would rewrite
// baseline.meta.json's `generatedAt` every run and loop the workflow's commit step forever. It
// only writes when the recorded content hashes actually differ.

import { readFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"

import {
  readBaseline,
  readPackageJson,
  readSchemaVersion,
  sha256,
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
 * @returns The outcome -- see the file header for the full matrix. Only `"updated"` and `"current"` are success (exit 0); `"refused"` and `"failed"` exit non-zero.
 */
export async function runUpdateBaseline(root: string): Promise<UpdateBaselineOutcome> {
  const packageJson = await readPackageJson(root)

  const currentVersion = parseVersion(packageJson.version)
  if (!currentVersion) {
    return {
      status: "refused",
      message:
        `Refusing to update the baseline: could not parse package.json's version "${packageJson.version}" as ` +
        "major.minor.patch. Fix package.json before running this again.",
    }
  }

  const existingBaseline = await readBaseline(root)

  let sameVersion = false
  if (existingBaseline) {
    const baselineVersion = parseVersion(existingBaseline.meta.packageVersion)
    if (!baselineVersion) {
      return {
        status: "refused",
        message:
          `Refusing to update the baseline: the committed baseline records an unparseable version ` +
          `"${existingBaseline.meta.packageVersion}". Regenerate it from a known-good commit.`,
      }
    }

    const versionDelta = compareVersions(currentVersion, baselineVersion)
    if (versionDelta < 0) {
      return {
        status: "refused",
        message:
          `Refusing to update the baseline: package.json declares version ${packageJson.version}, older than the ` +
          `committed baseline's ${existingBaseline.meta.packageVersion} -- regenerating now would roll the baseline ` +
          "backwards. Bump package.json (normally via release-please's Release PR) first.",
      }
    }
    sameVersion = versionDelta === 0
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

  // Unchanged version: only a genuine content change is worth a write. Compare against the
  // hashes the baseline already records -- the same identity `readBaseline` verifies on read.
  // (`sameVersion` is only ever set inside the `existingBaseline` branch above.)
  if (
    sameVersion &&
    sha256(apiJsonText) === existingBaseline?.meta.apiJsonHash &&
    sha256(dtsText) === existingBaseline.meta.dtsHash
  ) {
    return {
      status: "current",
      message: `Baseline is already at version ${packageJson.version} with matching contents; nothing to do.`,
    }
  }

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
    message: sameVersion
      ? `Baseline contents refreshed at version ${packageJson.version} -- the public API changed without a version bump. Review .repo-contract/api-contract/baseline.* and commit.`
      : `Baseline updated to version ${packageJson.version}. Review .repo-contract/api-contract/baseline.* and commit.`,
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
