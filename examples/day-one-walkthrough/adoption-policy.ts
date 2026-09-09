/**
 * `exampleAdoptionPolicy` -- a pattern you can build on top of repo-contract, NOT a repo-contract
 * primitive.
 *
 * repo-contract has no concept of a "rollout", a "schedule", or an "effective date". It calls your
 * policy and records the `"pass" | "warn" | "fail"` it returns. Everything below is ordinary policy
 * code: it looks at today's date and the requirement's own state, and decides which of those three
 * outcomes to return. An organization that wants to introduce a new shared requirement across many
 * repositories at once -- without breaking every consumer's build on the day it lands -- can wrap
 * the requirement's real check in a function like this so that, before a chosen date, a
 * not-yet-satisfied repository gets an actionable `"warn"` with a countdown instead of a `"fail"`.
 *
 * See ./README.md and repo-contract's own README section "From one repo to a whole org".
 */
import type { Policy, PolicyContext } from "repo-contract"

/** One organizational requirement being rolled out on a schedule. */
export interface AdoptionSchedule {
  /** The requirement in one line, used verbatim at the front of every rationale this policy emits. */
  readonly requirement: string
  /**
   * The date (`YYYY-MM-DD`, interpreted as UTC midnight) the requirement becomes blocking. Before
   * it, a repository that does not yet satisfy the requirement gets a `"warn"`; on or after it, the
   * same state is a `"fail"`.
   */
  readonly enforcedFrom: string
}

/** What a requirement's real check reports back to {@link exampleAdoptionPolicy}. */
export interface RequirementState {
  /** Whether this repository currently satisfies the requirement. */
  readonly satisfied: boolean
  /**
   * A specific, actionable sentence describing the current state -- the file that is missing, the
   * measured value versus the target, the exact command to run. Appended to every rationale.
   */
  readonly detail: string
}

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

/** Whole days from `now` until `enforcedFrom` (UTC midnight); negative once the date has passed. */
function daysUntilEnforced(enforcedFrom: string, now: Date): number {
  const enforced = Date.parse(`${enforcedFrom}T00:00:00Z`)
  return Math.ceil((enforced - now.getTime()) / MILLISECONDS_PER_DAY)
}

/**
 * Wraps a requirement's real check in a dated `warn` -> `fail` rollout.
 * @param schedule - The requirement and the date it starts blocking.
 * @param evaluate - The requirement's real check: reads `ctx` (evidence from this check and every
 *   sibling) and returns whether the repository satisfies the requirement, plus an actionable detail
 *   line. Kept separate from the scheduling logic so the same rollout wrapper works for any
 *   requirement.
 * @param now - Injectable clock, for tests. Defaults to the current time.
 * @returns A {@link Policy} suitable for a check's `policy` field.
 */
export function exampleAdoptionPolicy(
  schedule: AdoptionSchedule,
  evaluate: (ctx: PolicyContext) => RequirementState,
  now: () => Date = () => new Date(),
): Policy {
  return (ctx) => {
    const state = evaluate(ctx)

    if (state.satisfied) {
      return {
        outcome: "pass",
        rationale: `${schedule.requirement}: satisfied. ${state.detail}`,
      }
    }

    const remaining = daysUntilEnforced(schedule.enforcedFrom, now())

    if (remaining <= 0) {
      return {
        outcome: "fail",
        rationale:
          `${schedule.requirement}: not satisfied, and blocking since ${schedule.enforcedFrom}. ` +
          `${state.detail}`,
      }
    }

    return {
      outcome: "warn",
      rationale:
        `${schedule.requirement}: not satisfied. Becomes blocking on ${schedule.enforcedFrom} ` +
        `(${String(remaining)} day(s) from now) -- fix it before then to keep the build green. ` +
        `${state.detail}`,
    }
  }
}
