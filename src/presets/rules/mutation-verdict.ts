import { mutationExceptionId } from "../../affected/mutation-report.js"
import type { ResolvedMutant } from "../../affected/mutation-report.js"
import {
  EXCEPTION_V2_FIELD_KEYS,
  isExpired,
  isValidNonEmptyStringField,
  recordFieldValue,
} from "../../helpers/exception-record.js"
import type { ExceptionRegistrySchema, ExceptionV2Fields } from "../../helpers/exception-record.js"
import type { PolicyResult } from "../../types.js"

/** One `mutation.json` record: a mutant a person applied by hand and saw the suite fail on. */
export interface MutationExceptionRecord extends Partial<ExceptionV2Fields> {
  readonly id: string
  readonly version: 1 | 2
  readonly justification: string
  readonly file: string
  readonly mutator: string
  readonly original: string
  readonly replacement: string
}

/** What `repo-contract mutation run --json` prints. */
export interface MutationRunReport {
  readonly schemaVersion: 1
  /** `ran` mutated; `reused` replayed a clean run from the cache; `adopted` judged a supplied report; `nothing-to-mutate` had no target; `error` could not run. */
  readonly state: "ran" | "reused" | "adopted" | "nothing-to-mutate" | "error"
  /** The Stryker JSON report to judge, relative to the working directory. */
  readonly report: string
  /** Stryker's exit code, or `null` when Stryker did not run. */
  readonly exitCode: number | null
  readonly shard: string | null
  /** The files the run was restricted to, or `null` for everything the Stryker config selects. */
  readonly mutate: readonly string[] | null
  /** Timed-out mutants re-run alone, and how many of those were caught. */
  readonly timeouts: { readonly rerun: number; readonly caught: number }
  /** The cache key of the run's inputs, or `null` with the cache off. */
  readonly inputs: string | null
  /** One line for the rationale. */
  readonly message: string
}

/**
 * Stryker's `statusReason` for a mutant a `// Stryker disable` comment ignored. repo-contract's
 * own config cross-checks each such comment against its suppression registry.
 */
export const COMMENT_IGNORE_REASON = "Ignored using a comment"

/** Stryker's `statusReason` for a static mutant the config's `ignoreStatic: true` skipped. */
export const STATIC_IGNORE_REASON = 'Static mutant (and "ignoreStatic" was enabled)'

/** Validates `mutation:` records. A record's id must match the one derived from its own fields. */
export const MUTATION_EXCEPTION_SCHEMA: ExceptionRegistrySchema<MutationExceptionRecord> = {
  namespace: "mutation:",
  metadataKeys: ["file", "mutator", "original", "replacement"],
  validateRecord: (core, raw, index, errors) => {
    const at = `exceptions[${String(index)}]`
    const { file, mutator, original, replacement } = raw
    const fileValid = isValidNonEmptyStringField(file, `${at}.file`, errors)
    const mutatorValid = isValidNonEmptyStringField(mutator, `${at}.mutator`, errors)
    const originalValid = isValidNonEmptyStringField(original, `${at}.original`, errors)
    // A mutant that deletes code has an empty replacement.
    const replacementValid = typeof replacement === "string"
    if (!replacementValid) errors.push(`${at}.replacement must be a string.`)
    if (!fileValid || !mutatorValid || !originalValid || !replacementValid) return undefined

    const identity = { file, mutator, original, replacement }
    const derived = mutationExceptionId(identity)
    if (derived !== core.id) {
      errors.push(
        `${at}.id ${JSON.stringify(core.id)} does not match the id derived from its own file, mutator, original and replacement (${JSON.stringify(derived)}).`,
      )
      return undefined
    }
    return { id: core.id, version: 1, justification: core.justification, ...identity }
  },
}

const RUN_STATES: ReadonlySet<unknown> = new Set([
  "ran",
  "reused",
  "adopted",
  "nothing-to-mutate",
  "error",
])

/**
 * @param value - a candidate value.
 * @returns whether it is `null` or a string.
 */
const isStringOrNull = (value: unknown): value is string | null =>
  value === null || typeof value === "string"

/**
 * @param value - a candidate `mutate` list.
 * @returns whether it is `null` or an array of strings.
 */
const isFileList = (value: unknown): value is readonly string[] | null =>
  value === null || (Array.isArray(value) && value.every((file) => typeof file === "string"))

/**
 * @param value - the parsed output of `repo-contract mutation run --json`.
 * @returns the report, or `undefined` when it is not well formed.
 */
export function readMutationRun(value: unknown): MutationRunReport | undefined {
  // Parsed JSON is never `undefined`, and any other non-object fails the field checks below.
  if (value === null) return undefined
  const run = value as Readonly<Record<string, unknown>>
  const { state, report, exitCode, shard, mutate, timeouts, inputs, message } = run
  const counts = (timeouts ?? {}) as Readonly<Record<string, unknown>>
  if (
    run.schemaVersion !== 1 ||
    !RUN_STATES.has(state) ||
    typeof report !== "string" ||
    !(exitCode === null || typeof exitCode === "number") ||
    !isStringOrNull(shard) ||
    !isFileList(mutate) ||
    typeof counts.rerun !== "number" ||
    typeof counts.caught !== "number" ||
    !isStringOrNull(inputs) ||
    typeof message !== "string"
  ) {
    return undefined
  }
  return {
    schemaVersion: 1,
    state: state as MutationRunReport["state"],
    report,
    exitCode,
    shard,
    mutate: mutate === null ? null : [...mutate],
    timeouts: { rerun: counts.rerun, caught: counts.caught },
    inputs,
    message,
  }
}

/** What the registry did to a run's mutants. */
export interface AppliedMutationExceptions {
  /** Survived and NoCoverage mutants a complete record covers; left out of the score. */
  readonly suppressed: ReadonlySet<ResolvedMutant>
  /** One message per record that matches nothing; empty unless the run was full. */
  readonly stale: readonly string[]
  /** One message per incomplete or expired record. */
  readonly insufficient: readonly string[]
}

/** Every field a record must fill before it covers a mutant. */
const REQUIREMENTS = ["justification", ...EXCEPTION_V2_FIELD_KEYS] as const

const COVERABLE: ReadonlySet<string> = new Set(["Survived", "NoCoverage"])

/**
 * @param mutant - a run's mutant.
 * @param record - a registry record.
 * @returns whether the record names this mutant.
 */
const matches = (mutant: ResolvedMutant, record: MutationExceptionRecord): boolean =>
  mutant.file === record.file &&
  mutant.mutator === record.mutator &&
  mutant.original === record.original &&
  mutant.replacement === record.replacement

/**
 * Matches records to mutants by file, mutator, original text and replacement, never by line. A
 * record never covers a Timeout.
 * @param mutants - the run's mutants.
 * @param records - the registry's records.
 * @param options - how the run was scoped, and the clock.
 * @param options.full - `true` when the run mutated everything, so an unmatched record is stale.
 * @param options.now - the date `expires` is compared with.
 * @returns the suppressed mutants and the registry's problems.
 */
export function applyMutationExceptions(
  mutants: readonly ResolvedMutant[],
  records: readonly MutationExceptionRecord[],
  options: { readonly full: boolean; readonly now: Date },
): AppliedMutationExceptions {
  const suppressed = new Set<ResolvedMutant>()
  const stale: string[] = []
  const insufficient: string[] = []
  for (const record of records) {
    const matched = mutants.filter((mutant) => matches(mutant, record))
    if (matched.length === 0) {
      // A shard or a restricted run mutates part of the code, so a record for the rest matches nothing there.
      if (options.full) {
        stale.push(
          `${record.id}: ${record.file} [${record.mutator}] "${record.original}" -> "${record.replacement}" matches no mutant in the report; the code changed, so delete the record.`,
        )
      }
      continue
    }
    const missing = REQUIREMENTS.filter((key) => recordFieldValue(record, key).trim() === "")
    if (missing.length > 0) {
      insufficient.push(
        `${record.id} is missing ${missing.join(", ")}. Run \`repo-contract except ${record.id}\` to fill them in.`,
      )
      continue
    }
    const expires = recordFieldValue(record, "expires")
    if (isExpired(expires, options.now)) {
      insufficient.push(
        `${record.id} expired on ${expires}. Re-verify the mutant by hand and move the date, or delete the record.`,
      )
      continue
    }
    for (const mutant of matched) if (COVERABLE.has(mutant.status)) suppressed.add(mutant)
  }
  return { suppressed, stale, insufficient }
}

const KNOWN_STATUSES: ReadonlySet<string> = new Set([
  "Killed",
  "Survived",
  "NoCoverage",
  "Timeout",
  "RuntimeError",
  "CompileError",
  "Ignored",
])

/** A regression of hundreds of mutants would otherwise flood the output every check shares. */
const MAX_LISTED = 25

/** A multi-line `BlockStatement` span would make a listing unreadable. */
const MAX_SNIPPET = 80

/**
 * @param text - a source span.
 * @returns the span on one line, capped at {@link MAX_SNIPPET} characters.
 */
function snippet(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim()
  return collapsed.length > MAX_SNIPPET ? `${collapsed.slice(0, MAX_SNIPPET)}…` : collapsed
}

/**
 * @param mutants - the mutants to list.
 * @param withId - whether to name each one's exception id, for a status a record can cover.
 * @returns one line per mutant, capped at {@link MAX_LISTED}.
 */
function listMutants(mutants: readonly ResolvedMutant[], withId: boolean): string[] {
  const lines = mutants.slice(0, MAX_LISTED).map((mutant) => {
    const id = withId ? ` (${mutationExceptionId(mutant)})` : ""
    return `- ${mutant.file}:${String(mutant.line)}:${String(mutant.column)} [${mutant.status} ${mutant.mutator}] "${snippet(mutant.original)}" -> "${snippet(mutant.replacement)}"${id}`
  })
  if (mutants.length > MAX_LISTED) {
    lines.push(`... and ${String(mutants.length - MAX_LISTED)} more.`)
  }
  return lines
}

/**
 * @param count - how many.
 * @param label - what they are.
 * @returns `"<count> <label>"`, or nothing for zero.
 */
const part = (count: number, label: string): string[] =>
  count === 0 ? [] : [`${String(count)} ${label}`]

/**
 * Says why each left-out mutant was left out. A comment-ignored mutant is a hand-written
 * decision; a static one is the config's `ignoreStatic`; anything else came from the config too,
 * such as `excludedMutations`. Without this line a file could hide behind a clean score.
 * @param ignored - the run's Ignored mutants.
 * @param suppressed - how many a record covered.
 * @returns the line, or nothing when no mutant was left out.
 */
function leftOutLine(ignored: readonly ResolvedMutant[], suppressed: number): string[] {
  const comment = ignored.filter((m) => m.statusReason === COMMENT_IGNORE_REASON).length
  const statics = ignored.filter((m) => m.statusReason === STATIC_IGNORE_REASON).length
  const parts = [
    ...part(suppressed, "covered by a registry record"),
    ...part(comment, "ignored by a Stryker disable comment"),
    ...part(statics, "static, skipped by ignoreStatic"),
    ...part(
      ignored.length - comment - statics,
      "ignored for another reason (such as excludedMutations)",
    ),
  ]
  return parts.length === 0 ? [] : [`Left out of the score: ${parts.join("; ")}.`]
}

/**
 * Scores a run and judges it. The score is detected over detected plus Survived, NoCoverage and
 * Timeout, with Ignored and suppressed mutants left out. Fails below `minScore`, and on any
 * Timeout at all.
 * @param input - what to judge.
 * @param input.mutants - the run's mutants.
 * @param input.applied - what the registry did to them.
 * @param input.minScore - the lowest score that passes, in percent.
 * @param input.shard - the shard, written `<index>/<total>`, or `null`.
 * @returns the verdict.
 */
export function judgeMutation(input: {
  readonly mutants: readonly ResolvedMutant[]
  readonly applied: AppliedMutationExceptions
  readonly minScore: number
  readonly shard: string | null
}): PolicyResult {
  const { mutants, applied, minScore, shard } = input
  const label = shard === null ? "Mutation:" : `Mutation, shard ${shard}:`
  if (mutants.length === 0) {
    return {
      outcome: "fail",
      rationale: `${label} the report has no mutants, so it cannot show what the tests detect. Check the Stryker config's mutate patterns.`,
    }
  }
  const untested = mutants.filter((m) => m.status === "Survived" && m.testsCompleted === 0)
  if (untested.length > 0) {
    return {
      outcome: "fail",
      rationale: `${label} ${String(untested.length)} Survived mutant(s) ran 0 tests, so the run cannot be trusted: a survivor that no test ran against proves nothing. The usual causes are a stale incremental file or a test runner that matches no test name (stryker-js#6210). Run \`repo-contract mutation run\` again; it always runs cold.`,
    }
  }

  const scored = mutants.filter((m) => !applied.suppressed.has(m))
  const of = (status: string): ResolvedMutant[] => scored.filter((m) => m.status === status)
  const killed = of("Killed").length
  const runtimeErrors = of("RuntimeError").length
  const compileErrors = of("CompileError").length
  const survived = of("Survived")
  const noCoverage = of("NoCoverage")
  const timedOut = of("Timeout")
  const unknown = scored.filter((m) => !KNOWN_STATUSES.has(m.status))
  const detected = killed + runtimeErrors + compileErrors
  const total = detected + survived.length + noCoverage.length + timedOut.length

  const leftOut = leftOutLine(of("Ignored"), applied.suppressed.size)
  // A run with every mutant left out has no score at all, not a NaN one. Nothing was tested, so
  // there is nothing to hold to the floor: it passes unless a section below fails it.
  const score = total === 0 ? undefined : (detected / total) * 100
  const headline =
    score === undefined
      ? `${label} no mutant was tested, so there is no score to judge: every one of the ${String(mutants.length)} in the report was left out.`
      : `${label} score ${score.toFixed(2)}% of ${String(total)} scored mutants (minimum ${String(minScore)}%): ${String(detected)} detected (${[
          ...part(killed, "killed"),
          ...part(runtimeErrors, "runtime error"),
          ...part(compileErrors, "compile error"),
        ].join(
          ", ",
        )}), ${String(survived.length)} survived, ${String(noCoverage.length)} no coverage, ${String(timedOut.length)} timed out.`

  const offenders = scored.filter((m) => COVERABLE.has(m.status))
  const problems = [...applied.insufficient, ...applied.stale]
  const belowFloor = (score ?? 100) < minScore
  const sections = [
    ...(belowFloor
      ? [
          `Below the minimum score of ${String(minScore)}%. Add or strengthen a test that fails against each change below, or record a mutant you killed by hand with \`repo-contract except <id>\`:`,
          ...listMutants(offenders, true),
        ]
      : []),
    ...(timedOut.length > 0
      ? [
          `Timed out even when re-run alone (${String(timedOut.length)}). A record never covers a Timeout. A mutant that removes a loop bound can only hang: add a fail-fast guard in the source, or a Stryker disable comment that gives the reason:`,
          ...listMutants(timedOut, false),
        ]
      : []),
    ...(unknown.length > 0
      ? [
          `Unknown status (${String(unknown.length)}). The report may be from a newer Stryker, or cut short:`,
          ...listMutants(unknown, false),
        ]
      : []),
    ...(problems.length > 0
      ? [
          `The registry has ${String(problems.length)} problem(s):`,
          ...problems.map((problem) => `- ${problem}`),
        ]
      : []),
  ]
  if (sections.length > 0) {
    return { outcome: "fail", rationale: [headline, ...leftOut, ...sections].join("\n") }
  }
  const tolerated =
    offenders.length > 0
      ? [
          `Survived within the floor (${String(offenders.length)}):`,
          ...listMutants(offenders, true),
        ]
      : []
  return { outcome: "pass", rationale: [headline, ...leftOut, ...tolerated].join("\n") }
}
