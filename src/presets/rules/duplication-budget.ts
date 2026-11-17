import type { PolicyResult } from "../../types.js"

/** One duplicated block, as jscpd reports it. */
export interface DuplicateBlock {
  readonly lines: number
  readonly tokens: number
  readonly firstFile: { readonly name: string; readonly start: number }
  readonly secondFile: { readonly name: string; readonly start: number }
}

/** The parts of jscpd's report the budget reads. */
export interface DuplicationSummary {
  readonly duplicates: readonly DuplicateBlock[]
  /** Duplicated share of scanned lines, in percent. */
  readonly percentage: number
  readonly lines: number
  readonly sources: number
}

/**
 * @param block - one duplicated block.
 * @returns a single-line `file:line duplicates file:line (lines / tokens)` summary.
 */
function formatBlock(block: DuplicateBlock): string {
  return `- ${block.firstFile.name}:${String(block.firstFile.start)} duplicates ${block.secondFile.name}:${String(block.secondFile.start)} (${String(block.lines)} lines / ${String(block.tokens)} tokens)`
}

/**
 * Judges a jscpd report against a budget. A budget of 0 fails on any block. A higher budget fails
 * only above it, and a pass still lists every block.
 * @param summary - the report's blocks and totals.
 * @param maxPercentage - the largest duplicated share allowed, in percent.
 * @returns the verdict.
 */
export function evaluateDuplicationBudget(
  summary: DuplicationSummary,
  maxPercentage: number,
): PolicyResult {
  const { duplicates, percentage, lines, sources } = summary

  if (duplicates.length === 0) {
    return {
      outcome: "pass",
      rationale: `jscpd found 0 duplicated block(s) across ${String(sources)} file(s) (${String(lines)} lines).`,
    }
  }

  const found = `jscpd found ${String(duplicates.length)} duplicated block(s) (${percentage.toFixed(2)}% of ${String(lines)} lines across ${String(sources)} file(s))`
  const listed = duplicates.map(formatBlock)

  // A budget of 0 keeps the wording from before budgets existed. jscpd rounds a small share
  // down to 0%, so a block is judged by its presence, not by the percentage.
  if (maxPercentage === 0) {
    return { outcome: "fail", rationale: [`${found}:`, ...listed].join("\n") }
  }

  const within = percentage <= maxPercentage
  return {
    outcome: within ? "pass" : "fail",
    rationale: [
      `${found}, ${within ? "within" : "above"} the ${String(maxPercentage)}% budget:`,
      ...listed,
    ].join("\n"),
  }
}

/**
 * Checks a budget when the config loads, so a typo fails before any tool runs.
 * @param maxPercentage - the `duplication` `maxPercentage` option.
 * @returns the same budget.
 * @throws {RangeError} when it is not a finite number from 0 to 100.
 */
export function checkMaxPercentage(maxPercentage: number): number {
  if (!Number.isFinite(maxPercentage) || maxPercentage < 0 || maxPercentage > 100) {
    throw new RangeError(
      `duplication: maxPercentage must be a number from 0 to 100, got ${String(maxPercentage)}.`,
    )
  }
  return maxPercentage
}
