import { notImplemented } from "../../not-implemented.js"
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
  return notImplemented("R2", summary, maxPercentage)
}
