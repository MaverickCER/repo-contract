import type { PolicyResult } from "../../types.js"
import { shownValue } from "./option-checks.js"

/** One function, as crap4ts's JSON reporter lists it. */
interface CrapFunction {
  readonly file: unknown
  readonly name: unknown
  readonly startLine: unknown
  readonly complexity: unknown
  readonly crap: unknown
}

/** A function whose two scores are finite numbers. */
interface ScoredFunction extends CrapFunction {
  readonly complexity: number
  readonly crap: number
}

const FIX = "Split each function or cover its branches."

/**
 * @param fn - one reported function.
 * @returns where it is, as `file:line name`.
 */
function where(fn: CrapFunction): string {
  return `${String(fn.file)}:${String(fn.startLine)} ${String(fn.name)}`
}

/**
 * Judges a crap4ts JSON report. Fails on a function above either ceiling, and on a function whose
 * score or complexity is not a finite number.
 *
 * The CRAP score is `complexity^2 * (1 - coverage)^3 + complexity`. It falls to plain complexity
 * as coverage nears 100%, so the separate complexity ceiling keeps a fully covered but deeply
 * branched function from passing. The limits passed in win over the threshold the report echoes.
 * @param report - the parsed report.
 * @param limits - the ceilings.
 * @param limits.threshold - the highest CRAP score allowed.
 * @param limits.maxComplexity - the highest cyclomatic complexity allowed.
 * @returns the verdict.
 */
export function evaluateCrapReport(
  report: unknown,
  limits: { readonly threshold: number; readonly maxComplexity: number },
): PolicyResult {
  const { threshold, maxComplexity } = limits
  const listed: unknown =
    typeof report === "object" && report !== null
      ? (report as { functions?: unknown }).functions
      : undefined
  if (!Array.isArray(listed)) {
    return {
      outcome: "fail",
      rationale: "crap4ts produced an invalid report: `functions` is not an array.",
    }
  }
  const entries: readonly unknown[] = listed
  if (!entries.every((entry) => typeof entry === "object" && entry !== null)) {
    return {
      outcome: "fail",
      rationale: "crap4ts produced an invalid report: a function entry is not an object.",
    }
  }
  const functions = entries as readonly CrapFunction[]

  // An unreadable score is an unjudged function; leaving it out could hide one above a ceiling.
  // `Number.isFinite` is false for anything that is not a number, so it needs no type guard.
  const unreadable = functions.filter(
    (fn) => !Number.isFinite(fn.crap) || !Number.isFinite(fn.complexity),
  )
  if (unreadable.length > 0) {
    return {
      outcome: "fail",
      rationale: [
        `crap4ts reported ${String(unreadable.length)} function(s) with a CRAP or complexity score that is not a finite number:`,
        ...unreadable.map(
          // JSON.stringify(undefined) is undefined, which the template prints as "undefined".
          (fn) =>
            `- ${where(fn)}: CRAP ${JSON.stringify(fn.crap)}, complexity ${JSON.stringify(fn.complexity)}`,
        ),
      ].join("\n"),
    }
  }
  const scored = functions as readonly ScoredFunction[]

  const overCrap = scored.filter((fn) => fn.crap > threshold).sort((a, b) => b.crap - a.crap)
  const overComplexity = scored
    .filter((fn) => fn.complexity > maxComplexity)
    .sort((a, b) => b.complexity - a.complexity)

  if (overCrap.length === 0 && overComplexity.length === 0) {
    return {
      outcome: "pass",
      rationale: `crap4ts scored ${String(scored.length)} function(s); none is above CRAP ${String(threshold)} or cyclomatic complexity ${String(maxComplexity)}.`,
    }
  }

  const lines: string[] = []
  if (overCrap.length > 0) {
    lines.push(
      `${String(overCrap.length)} function(s) are above CRAP ${String(threshold)}:`,
      ...overCrap.map((fn) => `- ${where(fn)}: CRAP ${String(fn.crap)}`),
    )
  }
  if (overComplexity.length > 0) {
    lines.push(
      `${String(overComplexity.length)} function(s) are above cyclomatic complexity ${String(maxComplexity)}:`,
      ...overComplexity.map((fn) => `- ${where(fn)}: complexity ${String(fn.complexity)}`),
    )
  }
  lines.push(FIX)
  return { outcome: "fail", rationale: lines.join("\n") }
}

/**
 * Checks the two ceilings when the config loads, so a typo fails before crap4ts runs.
 * @param limits - the `crap` `threshold` and `maxComplexity` options.
 * @param limits.threshold - the highest CRAP score allowed.
 * @param limits.maxComplexity - the highest cyclomatic complexity allowed.
 * @returns the same limits.
 * @throws {RangeError} naming the first limit that is not a finite number above 0.
 */
export function checkCrapLimits(limits: {
  readonly threshold: number
  readonly maxComplexity: number
}): { readonly threshold: number; readonly maxComplexity: number } {
  for (const [name, value] of Object.entries(limits)) {
    if (!(Number.isFinite(value) && value > 0)) {
      throw new RangeError(`crap: ${name} must be a number above 0, got ${shownValue(value)}.`)
    }
  }
  return limits
}
