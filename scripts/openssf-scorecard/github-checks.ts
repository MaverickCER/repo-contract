import { sync as spawnSync } from "cross-spawn"
import { ghApiGraphql, ghApiJson } from "./gh-api.js"
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

/** One merged pull request, reduced to what Code-Review scores. */
export interface MergedPullRequest {
  readonly number: number
  readonly author: string
  /** Everyone who left an `APPROVED` review. */
  readonly approvers: readonly string[]
}

/**
 * Upstream scores Code-Review from what happened to recent changes: the share of them that were
 * approved by someone other than their author. A branch-protection rule that requires a review is
 * not that evidence, because a rule can be bypassed (an administrator merging without approval is the
 * common case); so this scores the merged pull requests themselves, rounded down as upstream's
 * proportional score is.
 * @param pullRequests - Recently merged pull requests into the default branch.
 * @param requiredReviews - The approving-review count branch protection requires, for the reason text.
 * @returns The Code-Review sub-check result.
 */
export function scoreCodeReview(
  pullRequests: readonly MergedPullRequest[],
  requiredReviews: number,
): ScorecardCheckResult {
  if (pullRequests.length === 0) {
    return {
      name: "Code-Review",
      score: "not-applicable",
      reason: "No merged pull requests were found to assess.",
      details: [],
    }
  }
  const unreviewed = pullRequests.filter(
    (pr) => !pr.approvers.some((approver) => approver !== pr.author),
  )
  const reviewed = pullRequests.length - unreviewed.length
  return {
    name: "Code-Review",
    score: Math.floor((10 * reviewed) / pullRequests.length),
    reason:
      `${String(reviewed)} of ${String(pullRequests.length)} recently merged pull request(s) had an approving review from someone other than their author. ` +
      `Branch protection requires ${String(requiredReviews)} approving review(s); a merge that bypasses that rule counts as unreviewed here, as it does upstream.`,
    details:
      unreviewed.length === 0
        ? []
        : [
            `Merged without an approving review from someone else: ${unreviewed.map((pr) => `#${String(pr.number)}`).join(", ")}`,
          ],
  }
}

interface ReviewQuery {
  readonly data?: {
    readonly repository?: {
      readonly pullRequests?: {
        readonly nodes?: readonly {
          readonly number: number
          readonly author: { readonly login: string } | null
          readonly reviews: {
            readonly nodes: readonly { readonly author: { readonly login: string } | null }[]
          }
        }[]
      }
    }
  }
}

/**
 * @param slug - The `owner/repo` slug.
 * @param defaultBranch - The branch whose merged pull requests are scored.
 * @returns The Code-Review sub-check result.
 */
export function evaluateCodeReview(slug: string, defaultBranch: string): ScorecardCheckResult {
  const [owner = "", name = ""] = slug.split("/")
  const query = `query($owner: String!, $name: String!, $base: String!) {
    repository(owner: $owner, name: $name) {
      pullRequests(baseRefName: $base, states: MERGED, last: 30) {
        nodes { number author { login } reviews(states: APPROVED, first: 20) { nodes { author { login } } } }
      }
    }
  }`
  const reviews = ghApiGraphql<ReviewQuery>(query, { owner, name, base: defaultBranch })
  if (!reviews.ok) return unavailable("Code-Review", reviews.message)
  const nodes = reviews.value.data?.repository?.pullRequests?.nodes
  if (nodes === undefined) {
    return unavailable("Code-Review", "the GitHub GraphQL API returned no pull request list.")
  }
  const protection = ghApiJson<BranchProtection>(
    `repos/${slug}/branches/${defaultBranch}/protection`,
  )
  const required = protection.ok
    ? (protection.value.required_pull_request_reviews?.required_approving_review_count ?? 0)
    : 0
  return scoreCodeReview(
    nodes.map((pr) => ({
      number: pr.number,
      author: pr.author?.login ?? "",
      approvers: pr.reviews.nodes.flatMap((review) =>
        review.author === null ? [] : [review.author.login],
      ),
    })),
    required,
  )
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
 * claiming to determine their employer, and scores it proportionally toward upstream's bar of three
 * (upstream normalizes one organization to 3, two to 6).
 * @param logins - The distinct human contributors.
 * @returns The Contributors sub-check result.
 */
export function scoreContributors(logins: readonly string[]): ScorecardCheckResult {
  return {
    name: "Contributors",
    score: Math.min(10, Math.floor((10 * logins.length) / 3)),
    reason: `${String(logins.length)} distinct human contributor(s) found. Upstream counts the organizations contributors belong to; this evaluation counts people, which can only over-count organizations.`,
    details: [`Contributors: ${logins.join(", ") || "none"}`],
  }
}

/**
 * @param slug - The `owner/repo` slug.
 * @returns The Contributors sub-check result.
 */
export function evaluateContributors(slug: string): ScorecardCheckResult {
  const result = ghApiJson<readonly Contributor[]>(`repos/${slug}/contributors?per_page=100`)
  if (!result.ok) return unavailable("Contributors", result.message)
  return scoreContributors(
    result.value.filter((c) => c.type !== "Bot").map((c) => c.login ?? "unknown"),
  )
}

interface RepoMeta {
  readonly created_at: string
  readonly pushed_at: string
  readonly archived: boolean
}

/**
 * Upstream scoring: 10 for at least one commit weekly over the previous 90
 * days; 0 if archived; 0 for a project created within the last 90 days.
 * This evaluation applies the same two zero rules and the same `pushed_at`
 * recency signal, without upstream's finer-grained weekly-commit-cadence
 * and issue-activity scoring.
 * @param meta - The repository's `created_at`, `pushed_at` and `archived` fields.
 * @param now - The current time, in milliseconds since the epoch.
 * @returns The Maintained sub-check result.
 */
export function scoreMaintained(meta: RepoMeta, now: number): ScorecardCheckResult {
  const { created_at: createdAt, pushed_at: pushedAt, archived } = meta
  if (archived) {
    return { name: "Maintained", score: 0, reason: "Repository is archived.", details: [] }
  }
  const ageDays = (now - new Date(createdAt).getTime()) / 86_400_000
  if (ageDays < 90) {
    return {
      name: "Maintained",
      score: 0,
      reason: `Repository is ${String(Math.round(ageDays))} day(s) old. Upstream scores a repository created within the last 90 days as 0, so this evaluation does too.`,
      details: [],
    }
  }
  const daysSincePush = (now - new Date(pushedAt).getTime()) / 86_400_000
  return {
    name: "Maintained",
    score: Math.max(0, 10 - Math.floor(daysSincePush / 7)),
    reason: `Most recent push was ${String(Math.round(daysSincePush))} day(s) ago.`,
    details: [],
  }
}

/**
 * @param slug - The `owner/repo` slug.
 * @returns The Maintained sub-check result.
 */
export function evaluateMaintained(slug: string): ScorecardCheckResult {
  const result = ghApiJson<RepoMeta>(`repos/${slug}`)
  if (!result.ok) return unavailable("Maintained", result.message)
  return scoreMaintained(result.value, Date.now())
}
