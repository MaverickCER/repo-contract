import { sync as spawnSync } from "cross-spawn"
import { ghApiJson } from "./gh-api.js"
import type { ScorecardCheckResult } from "./types.js"

/**
 * @param name - The Scorecard check name this stands in for.
 * @param message - Why it couldn't be evaluated.
 * @returns A `"not-applicable"` result carrying that reason.
 */
function unavailable(name: string, message: string): ScorecardCheckResult {
  return {
    name,
    score: "not-applicable",
    reason: `Could not be evaluated: ${message}`,
    details: [],
  }
}

interface BranchProtection {
  readonly required_pull_request_reviews?: {
    readonly required_approving_review_count?: number
    readonly dismiss_stale_reviews?: boolean
  }
  readonly enforce_admins?: { readonly enabled?: boolean }
  readonly required_status_checks?: { readonly contexts?: readonly string[] }
}

/**
 * Upstream scoring is a five-tier ladder culminating in 10/10 for dismiss-
 * stale-reviews plus admin enforcement. This evaluation checks the same
 * underlying `branches/:branch/protection` fields upstream reads, on a
 * simpler four-point scale (required reviews, dismiss-stale-reviews, admin
 * enforcement, required status checks) rather than reproducing upstream's
 * exact tier weighting -- see this check's own README for that scoping
 * choice.
 * @param slug - The `owner/repo` slug.
 * @param defaultBranch - The branch to check protection on.
 * @returns The Branch-Protection sub-check result.
 */
export function evaluateBranchProtection(
  slug: string,
  defaultBranch: string,
): ScorecardCheckResult {
  const result = ghApiJson<BranchProtection>(`repos/${slug}/branches/${defaultBranch}/protection`)
  if (!result.ok) {
    if (result.reason === "not-found") {
      return {
        name: "Branch-Protection",
        score: 0,
        reason: `Branch "${defaultBranch}" has no branch protection configured.`,
        details: [],
      }
    }
    return unavailable("Branch-Protection", result.message)
  }

  const p = result.value
  const points: string[] = []
  let score = 0
  if ((p.required_pull_request_reviews?.required_approving_review_count ?? 0) >= 1) {
    score += 3
    points.push("requires at least 1 approving review")
  }
  if (p.required_pull_request_reviews?.dismiss_stale_reviews) {
    score += 2
    points.push("dismisses stale reviews on new commits")
  }
  if (p.enforce_admins?.enabled) {
    score += 3
    points.push("enforces protection for administrators")
  }
  if ((p.required_status_checks?.contexts?.length ?? 0) > 0) {
    score += 2
    points.push("requires status checks to pass")
  }
  return {
    name: "Branch-Protection",
    score,
    reason:
      points.length > 0
        ? `Branch "${defaultBranch}" protection: ${points.join(", ")}.`
        : `Branch "${defaultBranch}" has a protection rule, but none of the evaluated safeguards are enabled.`,
    details: [],
  }
}

/**
 * Simplified proxy for upstream's Code-Review check, documented as such: the
 * real upstream check inspects the last 30 commits' actual review approval
 * status. This evaluation instead reads whether `required_approving_review_count
 * >= 1` is configured in branch protection -- a real, verifiable signal that
 * review is MANDATORY going forward, but not proof any specific past commit
 * was actually reviewed.
 * @param slug - The `owner/repo` slug.
 * @param defaultBranch - The branch to check the review requirement on.
 * @returns The Code-Review sub-check result.
 */
export function evaluateCodeReview(slug: string, defaultBranch: string): ScorecardCheckResult {
  const result = ghApiJson<BranchProtection>(`repos/${slug}/branches/${defaultBranch}/protection`)
  if (!result.ok) {
    if (result.reason === "not-found") {
      return {
        name: "Code-Review",
        score: 0,
        reason: `Branch "${defaultBranch}" has no branch protection, so no review requirement is enforced.`,
        details: [],
      }
    }
    return unavailable("Code-Review", result.message)
  }
  const required = result.value.required_pull_request_reviews?.required_approving_review_count ?? 0
  if (required >= 1) {
    return {
      name: "Code-Review",
      score: 10,
      reason: `Branch protection requires at least ${String(required)} approving review(s) before merge.`,
      details: [],
    }
  }
  return {
    name: "Code-Review",
    score: 0,
    reason: `Branch protection does not require any approving review before merge.`,
    details: [],
  }
}

interface ReleaseAsset {
  readonly name: string
}
interface Release {
  readonly tag_name: string
  readonly assets: readonly ReleaseAsset[]
}

const SIGNATURE_EXTENSIONS = [".sig", ".asc", ".minisig", ".intoto.jsonl"]

/**
 * Upstream scoring checks the last 5 releases' GitHub release assets for
 * SLSA provenance or signature files. This repository's own release process
 * (`.github/workflows/release.yml`) does not attach GitHub release assets at
 * all -- it publishes to npm with `npm publish --provenance`, a real SLSA
 * provenance attestation recorded on the npm registry itself (verified
 * directly: `npm view repo-contract@latest dist.attestations` returns a
 * `predicateType: "https://slsa.dev/provenance/v1"` entry). This evaluation
 * checks GitHub release assets first (upstream's own signal) and separately
 * reports the npm-registry provenance fact when no release assets exist,
 * rather than scoring 0 for a real attestation upstream's own check simply
 * isn't shaped to look for.
 * @param slug - The `owner/repo` slug.
 * @param npmPackageName - The published npm package name to check for provenance.
 * @returns The Signed-Releases sub-check result.
 */
export function evaluateSignedReleases(slug: string, npmPackageName: string): ScorecardCheckResult {
  const result = ghApiJson<readonly Release[]>(`repos/${slug}/releases?per_page=5`)
  if (!result.ok) return unavailable("Signed-Releases", result.message)
  const releases = result.value
  if (releases.length === 0) {
    return {
      name: "Signed-Releases",
      score: "not-applicable",
      reason: "No GitHub releases found.",
      details: [],
    }
  }
  const withGithubSignatures = releases.filter((release) =>
    release.assets.some((asset) => SIGNATURE_EXTENSIONS.some((ext) => asset.name.endsWith(ext))),
  )
  if (withGithubSignatures.length === releases.length) {
    return {
      name: "Signed-Releases",
      score: 8,
      reason: `All ${String(releases.length)} recent GitHub release(s) carry a signature asset.`,
      details: [],
    }
  }

  const npmProvenanceResult = spawnNpmProvenanceCheck(npmPackageName)
  if (npmProvenanceResult.hasProvenance) {
    return {
      name: "Signed-Releases",
      score: 9,
      reason: `GitHub releases carry no signature assets, but the published npm package has real SLSA provenance attestation (predicateType \`${npmProvenanceResult.predicateType}\`) via \`npm publish --provenance\`.`,
      details: [`npm registry attestation URL: \`${npmProvenanceResult.url ?? "unknown"}\``],
    }
  }
  return {
    name: "Signed-Releases",
    score: 0,
    reason: "No GitHub release signature assets and no npm provenance attestation found.",
    details: [],
  }
}

interface NpmProvenanceCheck {
  readonly hasProvenance: boolean
  readonly predicateType?: string
  readonly url?: string
}

/**
 * @param packageName - The npm package name to look up.
 * @returns Whether `npm view <packageName>@latest` reports a provenance attestation, and its predicateType/URL if so.
 */
function spawnNpmProvenanceCheck(packageName: string): NpmProvenanceCheck {
  const result = spawnSync(
    "npm",
    ["view", `${packageName}@latest`, "dist.attestations", "--json"],
    {
      encoding: "utf8",
      timeout: 30_000,
    },
  )
  if (result.status !== 0) return { hasProvenance: false }
  try {
    const parsed = JSON.parse(result.stdout) as {
      provenance?: { predicateType?: string }
      url?: string
    }
    if (parsed.provenance?.predicateType) {
      return {
        hasProvenance: true,
        predicateType: parsed.provenance.predicateType,
        url: parsed.url,
      }
    }
    return { hasProvenance: false }
  } catch {
    return { hasProvenance: false }
  }
}

interface Contributor {
  readonly login?: string
  readonly contributions: number
  readonly type: string
}

/**
 * Upstream scoring: 10 for contributors from >=3 different companies, each
 * with >=5 commits in the last 30 commits -- a signal upstream derives from
 * commit-email-domain heuristics this evaluation does not attempt to
 * reproduce (a real, non-trivial heuristic prone to false results if
 * hand-rolled quickly). This evaluation instead reports the same underlying
 * fact GitHub's own `contributors` endpoint gives directly: how many
 * distinct human accounts (excluding bots) have contributed at all, without
 * claiming to determine their employer.
 * @param slug - The `owner/repo` slug.
 * @returns The Contributors sub-check result.
 */
export function evaluateContributors(slug: string): ScorecardCheckResult {
  const result = ghApiJson<readonly Contributor[]>(`repos/${slug}/contributors?per_page=100`)
  if (!result.ok) return unavailable("Contributors", result.message)
  const humans = result.value.filter((c) => c.type !== "Bot")
  if (humans.length >= 3) {
    return {
      name: "Contributors",
      score: 10,
      reason: `${String(humans.length)} distinct human contributor(s) found (organizational diversity not independently verified -- see this check's own README).`,
      details: [],
    }
  }
  return {
    name: "Contributors",
    score: 0,
    reason: `${String(humans.length)} distinct human contributor(s) found -- upstream's >=3-organization bar is not met.`,
    details: [`Contributors: ${humans.map((c) => c.login ?? "unknown").join(", ") || "none"}`],
  }
}

interface RepoMeta {
  readonly created_at: string
  readonly pushed_at: string
  readonly archived: boolean
}

/**
 * Upstream scoring: 10 for at least one commit weekly over the previous 90
 * days; 0 if archived; requires the project to be >90 days old to assess at
 * all. This evaluation checks the same applicability precondition and the
 * same `pushed_at` recency signal, without upstream's own finer-grained
 * weekly-commit-cadence and issue-activity scoring.
 * @param slug - The `owner/repo` slug.
 * @returns The Maintained sub-check result.
 */
export function evaluateMaintained(slug: string): ScorecardCheckResult {
  const result = ghApiJson<RepoMeta>(`repos/${slug}`)
  if (!result.ok) return unavailable("Maintained", result.message)
  const { created_at: createdAt, pushed_at: pushedAt, archived } = result.value
  if (archived) {
    return { name: "Maintained", score: 0, reason: "Repository is archived.", details: [] }
  }
  const ageDays = (Date.now() - new Date(createdAt).getTime()) / 86_400_000
  if (ageDays < 90) {
    return {
      name: "Maintained",
      score: "not-applicable",
      reason: `Repository is ${String(Math.round(ageDays))} day(s) old -- upstream's Maintained check requires >90 days of history to assess.`,
      details: [],
    }
  }
  const daysSincePush = (Date.now() - new Date(pushedAt).getTime()) / 86_400_000
  if (daysSincePush <= 7) {
    return {
      name: "Maintained",
      score: 10,
      reason: `Most recent push was ${String(Math.round(daysSincePush))} day(s) ago.`,
      details: [],
    }
  }
  const score = Math.max(0, 10 - Math.floor(daysSincePush / 7))
  return {
    name: "Maintained",
    score,
    reason: `Most recent push was ${String(Math.round(daysSincePush))} day(s) ago.`,
    details: [],
  }
}
