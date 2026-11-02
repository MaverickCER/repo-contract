import { PILLARS } from "./record.js"
import type { Pillar, RunRecord } from "./record.js"

/** Which runs to count. */
export interface SummaryFilter {
  /** Only runs started at or after this ISO 8601 time. */
  readonly since?: string
  readonly actor?: "human" | "agent"
}

/** What a set of runs shows about speed and trust. Ratios are absent when nothing supports them. */
export interface RunSummary {
  readonly runs: number
  readonly passed: number
  readonly failed: number
  readonly passRate?: number
  readonly totalDurationMs: number
  readonly failuresByCheck: Readonly<Record<string, number>>
  readonly failuresByPillar: Readonly<Record<string, number>>
  readonly wideningsByReason: Readonly<Record<string, number>>
  /** Of the checks that consulted the cache, the share it answered. */
  readonly cacheHitRatio?: number
  /** Affected tests as a share of all tests, over affected-scope runs that recorded both. */
  readonly affectedRatio?: number
  /** Estimated minutes affected runs saved against the mean full run. */
  readonly minutesSaved?: number
  /** The share of changes whose earliest recorded run passed. */
  readonly firstPassRate?: number
  readonly mutationScore?: {
    readonly first: number
    readonly latest: number
    readonly delta: number
  }
  readonly latestExceptions?: number
  readonly latestSuppressions?: number
}

/** The pillars a set of checks covers. */
export interface PillarCoverage {
  readonly counts: Readonly<Record<Pillar, number>>
  /** Pillars no check covers, in the canonical order. */
  readonly missing: readonly Pillar[]
  /** Checks that declare no pillar. */
  readonly unclassified: readonly string[]
}

const MINUTE_MS = 60_000

const passedRun = (run: RunRecord): boolean => run.checks.every((check) => check.verdict !== "fail")
/**
 * @param runs - Runs in time order.
 * @param name - A numeric field a run may leave out.
 * @returns That field's value from every run that recorded one, in order.
 */
function recorded(
  runs: readonly RunRecord[],
  name: "mutationScore" | "exceptions" | "suppressions",
): number[] {
  return runs.flatMap((run) => {
    const value = run[name]
    return value === undefined ? [] : [value]
  })
}

/**
 * @param scores - Mutation scores in time order; at least one.
 * @param first - The earliest of them.
 * @returns The first score, the latest, and how far it moved.
 */
function trendOf(
  scores: readonly number[],
  first: number,
): { first: number; latest: number; delta: number } {
  const latest = scores.reduce((_, score) => score, first)
  return { first, latest, delta: latest - first }
}

const sum = (numbers: readonly number[]): number => numbers.reduce((total, n) => total + n, 0)

/**
 * @param names - Names to count.
 * @returns How many times each occurs.
 */
function tally(names: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const name of names) counts[name] = (counts[name] ?? 0) + 1
  return counts
}

/**
 * @param records - Run records, in any order.
 * @param filter - Which runs to count.
 * @returns The summary.
 */
export function summarizeRuns(
  records: readonly RunRecord[],
  filter: SummaryFilter = {},
): RunSummary {
  const runs = records
    .filter((run) => filter.since === undefined || run.startedAt >= filter.since)
    .filter((run) => filter.actor === undefined || run.actor === filter.actor)
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))
  const failures = runs.flatMap((run) => run.checks.filter((check) => check.verdict === "fail"))
  const passed = runs.filter(passedRun).length
  const consulted = runs
    .flatMap((run) => run.checks)
    .filter((check) => check.cache === "hit" || check.cache === "miss")
  const measured = runs.filter(
    (run) =>
      run.scope === "affected" && run.affectedTests !== undefined && (run.totalTests ?? 0) > 0,
  )
  const fullRuns = runs.filter((run) => run.scope === "full")
  const changes = new Map<string, RunRecord>()
  for (const run of runs) {
    if (run.change !== undefined && !changes.has(run.change)) changes.set(run.change, run)
  }
  const scores = recorded(runs, "mutationScore")
  const [first] = scores
  const meanFull = sum(fullRuns.map((run) => run.durationMs)) / fullRuns.length
  const exceptions = recorded(runs, "exceptions").at(-1)
  const suppressions = recorded(runs, "suppressions").at(-1)

  return {
    runs: runs.length,
    passed,
    failed: runs.length - passed,
    ...(runs.length === 0 ? {} : { passRate: passed / runs.length }),
    totalDurationMs: sum(runs.map((run) => run.durationMs)),
    failuresByCheck: tally(failures.map((check) => check.id)),
    failuresByPillar: tally(
      failures.flatMap((check) => (check.pillar === undefined ? [] : [check.pillar])),
    ),
    wideningsByReason: tally(runs.flatMap((run) => run.widenings ?? [])),
    ...(consulted.length === 0
      ? {}
      : {
          cacheHitRatio:
            consulted.filter((check) => check.cache === "hit").length / consulted.length,
        }),
    ...(measured.length === 0
      ? {}
      : {
          affectedRatio:
            sum(measured.map((run) => run.affectedTests ?? 0)) /
            sum(measured.map((run) => run.totalTests ?? 0)),
        }),
    ...(fullRuns.length === 0
      ? {}
      : {
          minutesSaved:
            sum(
              runs
                .filter((run) => run.scope === "affected")
                .map((run) => Math.max(0, meanFull - run.durationMs)),
            ) / MINUTE_MS,
        }),
    ...(changes.size === 0
      ? {}
      : { firstPassRate: [...changes.values()].filter(passedRun).length / changes.size }),
    ...(first === undefined ? {} : { mutationScore: trendOf(scores, first) }),
    ...(exceptions === undefined ? {} : { latestExceptions: exceptions }),
    ...(suppressions === undefined ? {} : { latestSuppressions: suppressions }),
  }
}

/**
 * @param checks - The configured checks and the pillar each declares, if any.
 * @returns Per pillar, how many checks cover it; which pillars nothing covers; which checks declare none.
 */
export function pillarCoverage(
  checks: readonly { readonly id: string; readonly pillar?: Pillar }[],
): PillarCoverage {
  const counts = Object.fromEntries(
    PILLARS.map((pillar) => [pillar, checks.filter((check) => check.pillar === pillar).length]),
  ) as Record<Pillar, number>
  return {
    counts,
    missing: PILLARS.filter((pillar) => counts[pillar] === 0),
    unclassified: checks.filter((check) => check.pillar === undefined).map((check) => check.id),
  }
}
