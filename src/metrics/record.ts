/** What a check protects, so a report can show which of them a repository covers. */
export const PILLARS = [
  "correctness",
  "security",
  "performance",
  "accessibility",
  "compliance",
  "maintainability",
] as const

export type Pillar = (typeof PILLARS)[number]
export type Verdict = "pass" | "warn" | "fail"
export type CacheOutcome = "hit" | "miss" | "off"

/** One check's part in a run. */
export interface CheckRecord {
  readonly id: string
  readonly durationMs: number
  readonly verdict: Verdict
  readonly cache?: CacheOutcome
  readonly pillar?: Pillar
  /** One-based shard the check ran as, when the run was sharded. */
  readonly shard?: number
}

/** The fields of a run record before they are validated. */
export interface RunRecordInput {
  /** ISO 8601 start time. */
  readonly startedAt: string
  readonly durationMs: number
  readonly scope: "affected" | "full"
  readonly checks: readonly CheckRecord[]
  readonly base?: string
  /** Who produced the change: set by the caller from its own configuration, never inferred. */
  readonly actor?: "human" | "agent"
  /** Groups the runs of one change (a pull request, a branch) so a first pass can be told. */
  readonly change?: string
  readonly changedFiles?: number
  readonly affectedTests?: number
  readonly totalTests?: number
  /** The reasons the affected analysis widened. */
  readonly widenings?: readonly string[]
  readonly mutationScore?: number
  readonly coverage?: number
  readonly exceptions?: number
  readonly suppressions?: number
}

/** One line of the run log. */
export interface RunRecord extends RunRecordInput {
  readonly schemaVersion: 1
}

/** What went wrong reading one line of a run log. */
export interface RunLogError {
  readonly line: number
  readonly message: string
}

const VERDICTS: readonly string[] = ["pass", "warn", "fail"]
const CACHE_OUTCOMES: readonly string[] = ["hit", "miss", "off"]
const COUNTS = [
  "changedFiles",
  "affectedTests",
  "totalTests",
  "exceptions",
  "suppressions",
] as const
const PERCENTAGES = ["mutationScore", "coverage"] as const

const isNonNegative = (value: unknown): value is number =>
  Number.isFinite(value) && (value as number) >= 0

/**
 * @param record - A check record to validate.
 * @param index - Its position, for the error.
 * @returns A copy holding only the known fields.
 * @throws {TypeError} If a field is missing or out of range.
 */
function checkRecord(record: CheckRecord, index: number): CheckRecord {
  const at = `checks[${String(index)}]`
  if (typeof record.id !== "string" || record.id === "") {
    throw new TypeError(`${at}.id must be a non-empty string.`)
  }
  if (!isNonNegative(record.durationMs)) {
    throw new TypeError(`${at}.durationMs must be a non-negative number.`)
  }
  if (!VERDICTS.includes(record.verdict)) {
    throw new TypeError(`${at}.verdict must be pass, warn or fail.`)
  }
  if (record.cache !== undefined && !CACHE_OUTCOMES.includes(record.cache)) {
    throw new TypeError(`${at}.cache must be hit, miss or off.`)
  }
  if (record.pillar !== undefined && !PILLARS.includes(record.pillar)) {
    throw new TypeError(`${at}.pillar must be one of ${PILLARS.join(", ")}.`)
  }
  return {
    id: record.id,
    durationMs: record.durationMs,
    verdict: record.verdict,
    ...(record.cache === undefined ? {} : { cache: record.cache }),
    ...(record.pillar === undefined ? {} : { pillar: record.pillar }),
    ...(record.shard === undefined ? {} : { shard: record.shard }),
  }
}

/**
 * @param input - A run's fields.
 * @throws {TypeError} If the time, duration, scope or actor is missing or out of range.
 */
function validateHeader(input: RunRecordInput): void {
  if (!/\dT\d/.test(input.startedAt) || Number.isNaN(Date.parse(input.startedAt))) {
    throw new TypeError("startedAt must be an ISO 8601 timestamp.")
  }
  if (!isNonNegative(input.durationMs)) {
    throw new TypeError("durationMs must be a non-negative number.")
  }
  const scope: string = input.scope
  if (scope !== "affected" && scope !== "full") {
    throw new TypeError("scope must be affected or full.")
  }
  const actor: string | undefined = input.actor
  if (actor !== undefined && actor !== "human" && actor !== "agent") {
    throw new TypeError("actor must be human or agent.")
  }
}

/**
 * @param input - A run's fields.
 * @throws {TypeError} If a percentage or a count is out of range.
 */
function validateNumbers(input: RunRecordInput): void {
  for (const name of PERCENTAGES) {
    const value = input[name]
    if (value !== undefined && !(typeof value === "number" && value >= 0 && value <= 100)) {
      throw new TypeError(`${name} must be between 0 and 100.`)
    }
  }
  for (const name of COUNTS) {
    const value = input[name]
    if (value !== undefined && !(isNonNegative(value) && Number.isInteger(value))) {
      throw new TypeError(`${name} must be a non-negative whole number.`)
    }
  }
}

/**
 * Validates a run and stamps it with the schema version. Unknown fields are dropped, so a log only
 * ever holds what this version understands.
 * @param input - The run's fields.
 * @returns The record.
 * @throws {TypeError} If a field is missing or out of range.
 */
export function createRunRecord(input: RunRecordInput): RunRecord {
  validateHeader(input)
  validateNumbers(input)
  const optional: Record<string, unknown> = {}
  for (const name of ["base", "actor", "change", "widenings", ...PERCENTAGES, ...COUNTS] as const) {
    if (input[name] !== undefined) optional[name] = input[name]
  }
  return {
    schemaVersion: 1,
    startedAt: input.startedAt,
    durationMs: input.durationMs,
    scope: input.scope,
    checks: input.checks.map(checkRecord),
    ...optional,
  }
}

/**
 * @param record - A run record.
 * @returns The record as one JSON line, newline included, ready to append to the log.
 */
export function serializeRunRecord(record: RunRecord): string {
  return `${JSON.stringify(record)}\n`
}

/**
 * Reads a run log. A line that cannot be read is reported with its number and skipped, so one bad
 * line never hides the rest.
 * @param text - The log's content, one JSON record per line.
 * @returns The records, and what was wrong with the lines that were skipped.
 */
export function parseRunLog(text: string): {
  readonly records: readonly RunRecord[]
  readonly errors: readonly RunLogError[]
} {
  const records: RunRecord[] = []
  const errors: RunLogError[] = []
  for (const [index, line] of text.split("\n").entries()) {
    if (line.trim() === "") continue
    const number = index + 1
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      errors.push({ line: number, message: `Line ${String(number)} is not valid JSON.` })
      continue
    }
    if ((parsed as { schemaVersion?: unknown } | null)?.schemaVersion !== 1) {
      errors.push({ line: number, message: `Line ${String(number)}: schemaVersion must be 1.` })
      continue
    }
    try {
      records.push(createRunRecord(parsed as RunRecordInput))
    } catch (error) {
      errors.push({ line: number, message: `Line ${String(number)}: ${(error as Error).message}` })
    }
  }
  return { records, errors }
}
