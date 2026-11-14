import type { Pillar } from "./record.js"

/** Facts a maturity level is computed from. */
export interface MaturityInput {
  /** Whether any run has been recorded. */
  readonly hasRuns: boolean
  /** How many enabled checks cover each pillar. */
  readonly pillars: Readonly<Record<Pillar, number>>
  /** Whether the most recent full-scope run passed; `undefined` if there has been none. */
  readonly lastFullRunPassed?: boolean
  readonly exceptions: { readonly count: number; readonly budget: number }
  /** Whether the zero-tolerance policies (mutation, suppressions) are on. */
  readonly zeroTolerance: boolean
  /** Whether the soundness canary has found no escapes; `undefined` if it has not run. */
  readonly canaryClean?: boolean
  readonly manifestPresent: boolean
}

/** A maturity level, 0 to 4, and what the next one needs. */
export interface MaturityResult {
  readonly level: 0 | 1 | 2 | 3 | 4
  /** Absent at level 4. */
  readonly next?: { readonly level: 1 | 2 | 3 | 4; readonly missing: readonly string[] }
}

const CORE: readonly Pillar[] = ["security", "maintainability"]
const REST: readonly Pillar[] = ["performance", "accessibility", "compliance"]

const lacking = (input: MaturityInput, pillars: readonly Pillar[]): string[] =>
  pillars
    .filter((pillar) => input.pillars[pillar] === 0)
    .map((pillar) => `a check for the ${pillar} pillar`)

/**
 * What each level requires, lowest first. A level is reached only through the ones below it, so
 * the result is the first level whose requirements are not all met.
 * @param input - The facts to judge.
 * @returns A list per level of what is still missing.
 */
function gaps(input: MaturityInput): readonly (readonly string[])[] {
  const level1 = [
    ...(input.hasRuns ? [] : ["at least one recorded run"]),
    ...lacking(input, ["correctness"]),
  ]
  const level2 = [
    ...lacking(input, CORE),
    ...(input.lastFullRunPassed === true ? [] : ["a passing full-scope run"]),
  ]
  const { count, budget } = input.exceptions
  const level3 = [
    ...lacking(input, REST),
    ...(count <= budget
      ? []
      : [`exceptions within budget (${String(count)} of ${String(budget)})`]),
    ...(input.zeroTolerance ? [] : ["zero-tolerance policies switched on"]),
  ]
  const level4 = [
    ...(input.canaryClean === true ? [] : ["a clean soundness canary"]),
    ...(input.manifestPresent ? [] : ["an evidence manifest"]),
  ]
  return [level1, level2, level3, level4]
}

/**
 * Computes a maturity level deterministically from recorded facts:
 * - 1 once there are runs and correctness is covered.
 * - 2 with the security and maintainability pillars and a passing full run.
 * - 3 with every pillar, exceptions within budget and zero-tolerance policies.
 * - 4 with a clean soundness canary and an evidence manifest.
 * @param input - The facts to judge.
 * @returns The level, and what the next one needs.
 */
export function maturityLevel(input: MaturityInput): MaturityResult {
  const needs = gaps(input)
  const missing = needs.find((list) => list.length > 0)
  if (missing === undefined) return { level: 4 }
  const level = needs.indexOf(missing)
  return {
    level: level as 0 | 1 | 2 | 3,
    next: { level: (level + 1) as 1 | 2 | 3 | 4, missing },
  }
}
