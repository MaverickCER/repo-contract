// Human-invoked maintenance script, run via `npm run contract:baseline` -- the ONLY normal way
// `.repo-contract/api-contract/baseline.*` is ever updated once a baseline already exists (the
// check itself only ever bootstraps the very first one; see check.ts). Regenerates the current
// contract and overwrites the baseline in the working tree for a human to review and commit.
//
// Intended lifecycle: change public API -> `npm run contract` maintains a changeset -> PR merges
// -> a later "Version Packages" PR (Changesets) bumps package.json/CHANGELOG.md and releases ->
// `npm run contract:baseline` -> commit the new baseline.

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
  | { readonly status: "refused" | "failed"; readonly message: string }

/**
 * Factored out of the bottom-of-file CLI invocation so `test/unit/api-contract/update-baseline.test.ts`
 * can exercise the real guardrail logic in-process against a scratch fixture repository.
 * @param root - Absolute path to the repository root whose baseline is being updated.
 * @returns The outcome: `"updated"` with the new baseline's version, `"refused"` if package.json's version isn't strictly greater than the existing baseline's, or `"failed"` if API Extractor itself reported errors.
 */
export async function runUpdateBaseline(root: string): Promise<UpdateBaselineOutcome> {
  const packageJson = await readPackageJson(root)

  const existingBaseline = await readBaseline(root)

  if (existingBaseline) {
    const currentVersion = parseVersion(packageJson.version)
    const baselineVersion = parseVersion(existingBaseline.meta.packageVersion)
    if (
      !currentVersion ||
      !baselineVersion ||
      compareVersions(currentVersion, baselineVersion) <= 0
    ) {
      return {
        status: "refused",
        message:
          `Refusing to update the baseline: package.json declares version ${packageJson.version}, which is not ` +
          `strictly greater than the existing baseline's version ${existingBaseline.meta.packageVersion}. ` +
          "Bump package.json (typically via the Changesets release flow) before running this again.",
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
  if (outcome.status === "updated") {
    process.stdout.write(`${outcome.message}\n`)
  } else {
    process.stderr.write(`${outcome.message}\n`)
    process.exitCode = 1
  }
}
