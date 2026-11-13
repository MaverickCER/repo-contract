/**
 * The published OpenSSF Scorecard result for this repository, read from the public Scorecard API
 * (https://api.scorecard.dev), and how it compares with repo-contract's own evaluation.
 *
 * The official result is produced by OpenSSF's own `scorecard` binary, run by
 * `.github/workflows/scorecard.yml` (`ossf/scorecard-action`, `publish_results: true`), so it is the
 * number a reviewer should cite. repo-contract's own evaluation is kept beside it because it runs on
 * every `npm run contract`, before anything is pushed; showing both, and every check where they
 * differ, keeps the local evaluation from being read as the official score.
 */
import type { GhApiResult, ScorecardCheckResult } from "./types.js"

/** Every check upstream Scorecard defines (https://github.com/ossf/scorecard/blob/main/docs/checks.md), alphabetical. */
export const UPSTREAM_CHECKS = [
  "Binary-Artifacts",
  "Branch-Protection",
  "CI-Tests",
  "CII-Best-Practices",
  "Code-Review",
  "Contributors",
  "Dangerous-Workflow",
  "Dependency-Update-Tool",
  "Fuzzing",
  "License",
  "Maintained",
  "Packaging",
  "Pinned-Dependencies",
  "SAST",
  "SBOM",
  "Security-Policy",
  "Signed-Releases",
  "Token-Permissions",
  "Vulnerabilities",
  "Webhooks",
] as const

/** One check as the official result reports it: `score` is 0-10, or -1 when Scorecard could not score it. */
export interface OfficialCheck {
  readonly name: string
  readonly score: number
  readonly reason: string
}

/** The parts of the published result this document renders. */
export interface OfficialScorecard {
  /** When Scorecard produced the result. */
  readonly date: string
  /** The aggregate score, 0-10. */
  readonly score: number
  /** The `scorecard` release that produced it, for example `v5.6.0`. */
  readonly scorecardVersion: string
  /** The commit Scorecard evaluated. */
  readonly commit: string
  readonly checks: readonly OfficialCheck[]
}

/** One row of the comparison: a check, its official result if there is one, and this evaluation's. */
export interface ComparisonRow {
  readonly name: string
  readonly official: OfficialCheck | undefined
  readonly local: ScorecardCheckResult | undefined
  /** Whether both scored the check and gave it different scores. -1 and "not-applicable" agree. */
  readonly differs: boolean
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * @param slug - The `owner/repo` slug.
 * @returns The public Scorecard API URL for the project.
 */
export function officialResultUrl(slug: string): string {
  return `https://api.scorecard.dev/projects/github.com/${slug}`
}

/**
 * @param value - One entry of the API's `checks` array.
 * @returns The check, or `undefined` if any field this document renders is missing.
 */
function parseCheck(value: unknown): OfficialCheck | undefined {
  if (!isRecord(value)) return undefined
  const { name, score, reason } = value
  if (typeof name !== "string" || typeof score !== "number" || typeof reason !== "string") {
    return undefined
  }
  return { name, score, reason }
}

/**
 * Reads the API's response body. Anything that is not the documented shape is rejected whole, so the
 * document never renders half of a result as if it were all of it.
 * @param body - The parsed JSON body of the Scorecard API response.
 * @returns The result, or `undefined` if the body is not a complete result.
 */
export function parseOfficialResult(body: unknown): OfficialScorecard | undefined {
  if (!isRecord(body)) return undefined
  const { date, score, scorecard, repo, checks } = body
  if (typeof date !== "string" || typeof score !== "number" || !Array.isArray(checks)) {
    return undefined
  }
  const version = isRecord(scorecard) ? scorecard.version : undefined
  const commit = isRecord(repo) ? repo.commit : undefined
  if (typeof version !== "string" || typeof commit !== "string") return undefined
  const parsed = checks.map(parseCheck)
  if (parsed.some((check) => check === undefined)) return undefined
  return {
    date,
    score,
    scorecardVersion: version,
    commit,
    checks: parsed as readonly OfficialCheck[],
  }
}

/**
 * Fetches the published result. A network failure or a project Scorecard has not published is a
 * reason to render "could not be fetched", never a reason to fail the check (see
 * `checks/openssf-scorecard.ts`: it passes on regenerating the document, not on the score).
 * @param slug - The `owner/repo` slug.
 * @returns The result, or why it could not be read.
 */
export async function fetchOfficialResult(slug: string): Promise<GhApiResult<OfficialScorecard>> {
  const url = officialResultUrl(slug)
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
    if (response.status === 404) {
      return { ok: false, reason: "not-found", message: `${url} returned HTTP 404` }
    }
    if (!response.ok) {
      return {
        ok: false,
        reason: "error",
        message: `${url} returned HTTP ${String(response.status)}`,
      }
    }
    const parsed = parseOfficialResult(await response.json())
    if (parsed === undefined) {
      return { ok: false, reason: "error", message: `${url} did not return a complete result` }
    }
    return { ok: true, value: parsed }
  } catch (error) {
    return {
      ok: false,
      reason: "unavailable",
      message: `${url} could not be reached: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * @param official - The official score, -1 for "could not be scored".
 * @param local - This evaluation's score.
 * @returns Whether both scored the check and the scores differ.
 */
function scoresDiffer(official: number, local: ScorecardCheckResult["score"]): boolean {
  const officialScored = official >= 0
  const localScored = local !== "not-applicable"
  if (!officialScored && !localScored) return false
  if (officialScored !== localScored) return true
  return official !== local
}

/**
 * @param local - This evaluation's results.
 * @param official - The published result.
 * @returns One row per official check in the official order, then any check only this evaluation scored.
 */
export function compareWithOfficial(
  local: readonly ScorecardCheckResult[],
  official: OfficialScorecard,
): readonly ComparisonRow[] {
  const localByName = new Map(local.map((result) => [result.name, result]))
  const rows: ComparisonRow[] = official.checks.map((check) => {
    const mine = localByName.get(check.name)
    return {
      name: check.name,
      official: check,
      local: mine,
      differs: mine !== undefined && scoresDiffer(check.score, mine.score),
    }
  })
  const officialNames = new Set(official.checks.map((check) => check.name))
  for (const mine of local) {
    if (!officialNames.has(mine.name)) {
      rows.push({ name: mine.name, official: undefined, local: mine, differs: false })
    }
  }
  return rows
}

/**
 * @param local - This evaluation's results.
 * @returns Every upstream check this evaluation did not score, alphabetical.
 */
export function notEvaluatedChecks(local: readonly ScorecardCheckResult[]): readonly string[] {
  const evaluated = new Set(local.map((result) => result.name))
  return UPSTREAM_CHECKS.filter((name) => !evaluated.has(name))
}
