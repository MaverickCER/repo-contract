/** What one file is assumed to cost when no timing is recorded for any file. */
const DEFAULT_FILE_MS = 30_000
const MINUTE_MS = 60_000

/** A shard selector such as `2/5`, or why the text is not one. */
export type ShardSpec =
  | { readonly ok: true; readonly index: number; readonly total: number }
  | { readonly ok: false; readonly error: string }

/** How targets are split across shards. */
export interface ShardPlan {
  /** The number of shards (at least 1). */
  readonly count: number
  /** The targets of each shard, sorted; `shards[0]` is shard 1. */
  readonly shards: readonly (readonly string[])[]
  /** The summed expected cost of each shard, in milliseconds. */
  readonly weightsMs: readonly number[]
}

/** The inputs of {@link planShards}. */
export interface ShardPlanInput {
  /** The files to split, in any order. */
  readonly targets: readonly string[]
  /** Recorded cost per file in milliseconds; files without one weigh the mean of those with one. */
  readonly timingsMs?: Readonly<Record<string, number>>
  /** A fixed shard count. Wins over `targetMinutes`. */
  readonly shards?: number
  /** Size the count so that no shard is expected to take much longer than this many minutes. */
  readonly targetMinutes?: number
  /** The most shards `targetMinutes` may ask for. */
  readonly max?: number
}

/** A GitHub Actions matrix with one entry per shard. */
export interface ShardMatrix {
  readonly include: readonly {
    readonly shard: number
    readonly total: number
    readonly spec: string
  }[]
}

/** One shard's mutation report, as parsed JSON. */
export interface ShardReport {
  /** One-based shard number. */
  readonly shard: number
  readonly report: unknown
}

/** The outcome of {@link mergeMutationReports}. */
export type MergeResult =
  { readonly ok: true; readonly report: unknown } | { readonly ok: false; readonly error: string }

const sum = (numbers: readonly number[]): number => numbers.reduce((total, n) => total + n, 0)

/**
 * @param text - A selector like `2/5`: shard 2 of 5.
 * @returns The one-based index and the total, or what is wrong with the text.
 */
export function parseShardSpec(text: string): ShardSpec {
  const match = /^([1-9]\d*)\/([1-9]\d*)$/.exec(text)
  const index = Number(match?.[1])
  const total = Number(match?.[2])
  if (match === null || index > total) {
    return {
      ok: false,
      error: `A shard must be written <index>/<total> with 1 <= index <= total, not "${text}".`,
    }
  }
  return { ok: true, index, total }
}

/**
 * @param name - The option's name, for the error.
 * @param value - The value to check.
 * @param whole - Whether it must also be a whole number.
 */
function requirePositive(name: string, value: number, whole: boolean): void {
  if (!(value > 0) || (whole && !Number.isInteger(value))) {
    throw new RangeError(`${name} must be a positive${whole ? " whole" : ""} number.`)
  }
}

/**
 * Splits mutation targets across shards: heaviest first onto the lightest shard, so the shards
 * finish at about the same time. The same targets and timings always give the same plan.
 * @param input - The targets, their recorded timings, and a shard count or a time budget.
 * @returns The plan.
 * @throws {RangeError} If a count or budget is not a positive number.
 */
export function planShards(input: ShardPlanInput): ShardPlan {
  if (input.shards !== undefined) requirePositive("shards", input.shards, true)
  if (input.targetMinutes !== undefined)
    requirePositive("targetMinutes", input.targetMinutes, false)
  if (input.max !== undefined) requirePositive("max", input.max, true)

  const recorded = new Map(Object.entries(input.timingsMs ?? {}))
  const targets = [...new Set(input.targets)].sort()
  const known = targets.map((target) => recorded.get(target)).filter((ms) => ms !== undefined)
  const mean = known.length === 0 ? DEFAULT_FILE_MS : sum(known) / known.length
  const weightOf = (target: string): number => recorded.get(target) ?? mean
  const total = sum(targets.map(weightOf))

  const wanted =
    input.shards ??
    (input.targetMinutes === undefined
      ? 1
      : Math.min(Math.ceil(total / (input.targetMinutes * MINUTE_MS)), input.max ?? Infinity))
  const count = Math.max(1, Math.min(wanted, targets.length))

  const bins = Array.from({ length: count }, () => ({ files: [] as string[], weight: 0 }))
  // `targets` is already in name order and a sort is stable, so equal weights keep that order.
  const heaviestFirst = [...targets].sort((a, b) => weightOf(b) - weightOf(a))
  for (const target of heaviestFirst) {
    const lightest = bins.reduce((best, bin) => (bin.weight < best.weight ? bin : best))
    lightest.files.push(target)
    lightest.weight += weightOf(target)
  }
  return {
    count,
    shards: bins.map((bin) => bin.files.sort()),
    weightsMs: bins.map((bin) => bin.weight),
  }
}

/**
 * @param count - The number of shards.
 * @returns A matrix for `strategy.matrix: ${{ fromJSON(...) }}`.
 */
export function shardMatrix(count: number): ShardMatrix {
  return {
    include: Array.from({ length: count }, (_, index) => ({
      shard: index + 1,
      total: count,
      spec: `${String(index + 1)}/${String(count)}`,
    })),
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * Combines per-shard Stryker reports into the report an unsharded run would have produced. Never
 * a partial pass: a missing, repeated or out-of-range shard, an unreadable report, a file mutated
 * by two shards, or disagreeing schema versions all fail the merge.
 * @param reports - Each shard's number and parsed report.
 * @param total - How many shards the run was split into.
 * @returns The merged report, or why the shards cannot be merged.
 */
export function mergeMutationReports(reports: readonly ShardReport[], total: number): MergeResult {
  if (!Number.isInteger(total) || total < 1) {
    return { ok: false, error: "The shard total must be a positive whole number." }
  }
  const seen = new Set<number>()
  for (const { shard, report } of reports) {
    if (!Number.isInteger(shard) || shard < 1 || shard > total) {
      return { ok: false, error: `Shard ${String(shard)} is outside 1..${String(total)}.` }
    }
    if (seen.has(shard)) {
      return { ok: false, error: `Shard ${String(shard)} was reported more than once.` }
    }
    seen.add(shard)
    if (!isRecord(report) || !isRecord(report.files)) {
      return {
        ok: false,
        error: `Shard ${String(shard)} is not a mutation report (no files object).`,
      }
    }
  }
  if (reports.length !== total) {
    const missing = Array.from({ length: total }, (_, index) => index + 1).find((n) => !seen.has(n))
    return {
      ok: false,
      error: `Expected ${String(total)} shard reports but got ${String(reports.length)}; missing shard ${String(missing)}.`,
    }
  }

  const ordered = [...reports].sort((a, b) => a.shard - b.shard)
  const first = ordered[0] as { shard: number; report: Record<string, unknown> }
  const owners = new Map<string, number>()
  const values = new Map<string, unknown>()
  const testFiles: Record<string, unknown> = {}
  let hasTestFiles = false
  for (const { shard, report } of ordered) {
    const body = report as Record<string, unknown>
    if (body.schemaVersion !== first.report.schemaVersion) {
      return {
        ok: false,
        error: `Shard ${String(shard)} uses schema version ${JSON.stringify(body.schemaVersion)} but shard ${String(first.shard)} uses ${JSON.stringify(first.report.schemaVersion)}.`,
      }
    }
    for (const [name, value] of Object.entries(body.files as Record<string, unknown>)) {
      const previous = owners.get(name)
      if (previous !== undefined) {
        return {
          ok: false,
          error: `${name} appears in shards ${String(previous)} and ${String(shard)}.`,
        }
      }
      owners.set(name, shard)
      values.set(name, value)
    }
    if (isRecord(body.testFiles)) {
      hasTestFiles = true
      for (const [name, value] of Object.entries(body.testFiles)) {
        if (!Object.hasOwn(testFiles, name)) testFiles[name] = value
      }
    }
  }
  const merged: Record<string, unknown> = {
    ...first.report,
    files: Object.fromEntries([...values.keys()].sort().map((name) => [name, values.get(name)])),
  }
  if (hasTestFiles) merged.testFiles = testFiles
  return { ok: true, report: merged }
}
