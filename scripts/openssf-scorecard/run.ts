// The spawned entrypoint this check's `run: [...]` invokes. Computes every
// sub-check EXCEPT Vulnerabilities (which needs the security-deps check's
// own evidence, only available to the in-process `policy` function via
// `dependsOn` -- see checks/openssf-scorecard.ts) and prints the result as
// JSON for that policy function to parse, merge with Vulnerabilities, and
// render into docs/OpenSSF-Scorecard.md.
import { pathToFileURL } from "node:url"
import { ghApiJson, repoSlug } from "./gh-api.js"
import {
  evaluateBranchProtection,
  evaluateCodeReview,
  evaluateContributors,
  evaluateMaintained,
  evaluateSignedReleases,
} from "./github-checks.js"
import {
  evaluateCiTests,
  evaluateDangerousWorkflow,
  evaluateLicense,
  evaluatePackaging,
  evaluatePinnedDependencies,
  evaluateSecurityPolicy,
  evaluateTokenPermissions,
} from "./local-checks.js"
import type { ScorecardCheckResult } from "./types.js"

interface RepoMeta {
  readonly default_branch: string
  readonly license: { readonly spdx_id: string | null } | null
  readonly name: string
}

/** Computes every non-Vulnerabilities sub-check and prints the JSON result to stdout. Synchronous throughout -- every gh-API/local-file call this makes is itself synchronous (`gh-api.ts` uses `spawnSync`). */
function main(): void {
  const root = process.cwd()
  const slug = repoSlug(root)

  const localResults: ScorecardCheckResult[] = [
    evaluateLicense(root, undefined),
    evaluateSecurityPolicy(root),
    evaluatePinnedDependencies(root),
    evaluateTokenPermissions(root),
    evaluateDangerousWorkflow(root),
    evaluateCiTests(root),
    evaluatePackaging(root),
  ]

  const repoMetaResult = ghApiJson<RepoMeta>(`repos/${slug}`)
  const githubResults: ScorecardCheckResult[] = []

  if (repoMetaResult.ok) {
    const { default_branch: defaultBranch, license, name } = repoMetaResult.value
    // License is re-evaluated here (not in `localResults` above) once the
    // real GitHub-detected SPDX id is known -- `evaluateLicense`'s own local-
    // file fallback still applies when the API call itself is unavailable.
    localResults[0] = evaluateLicense(root, license?.spdx_id)
    githubResults.push(
      evaluateBranchProtection(slug, defaultBranch),
      evaluateCodeReview(slug, defaultBranch),
      evaluateSignedReleases(slug, name),
      evaluateContributors(slug),
      evaluateMaintained(slug),
    )
  } else {
    const unavailable = (name: string): ScorecardCheckResult => ({
      name,
      score: "not-applicable",
      reason: `Could not be evaluated: ${repoMetaResult.message}`,
      details: [],
    })
    githubResults.push(
      unavailable("Branch-Protection"),
      unavailable("Code-Review"),
      unavailable("Signed-Releases"),
      unavailable("Contributors"),
      unavailable("Maintained"),
    )
  }

  process.stdout.write(JSON.stringify({ repo: slug, results: [...localResults, ...githubResults] }))
}

// Mirrors scripts/security-socket/scan.ts's own "only run when invoked directly, not when
// imported by a test" guard.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
