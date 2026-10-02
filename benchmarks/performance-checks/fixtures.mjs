// Tiered synthetic check-graph generator for the `run-checks` benchmark (measures
// src/execution/run-checks.ts's own orchestration: runWithConcurrency/runWithConcurrencyGraph via
// dependency-scheduler.ts/concurrency-pool.ts, and the real process-spawn path via spawn-check.ts).
// Deliberately plain JS, dependency-free -- nothing here needs type checking, and this file's own
// cost must never leak into what's measured.
//
// Every generated check's `run` is the fastest possible real child process (`node -e ""`, no
// script file, no I/O) -- the whole point of this category is isolating repo-contract's own
// scheduling/orchestration overhead, not the cost of whatever a real check's tool does. A realistic
// repository's own check graph is neither fully flat (everything independent) nor a single long
// chain -- it is mostly-independent checks with a handful of genuine `dependsOn` edges plus one or
// two `isolated` barriers (see repo-contract's own repo-contract.config.ts, which has exactly this
// shape: a writer phase, one `isolated: true` `build` barrier, then a mostly-parallel reader phase
// with a few `dependsOn` edges). Each tier reproduces that same qualitative shape at increasing
// scale, rather than switching shapes between tiers -- a regression in the scheduler's handling of
// *this* realistic shape should show up as tier scales, not be hidden by tiers exercising
// qualitatively different graphs.

export const BENCHMARK_SUITE_VERSION = 1

export const TIERS = {
  small: { checks: 20 },
  medium: { checks: 100 },
  large: { checks: 400 },
}

export const TIER_NAMES = Object.keys(TIERS)

export const RUN_CHECKS_BENCHMARKS = {
  "run-checks": { tiers: TIER_NAMES, definitionVersion: 1 },
}

/**
 * Builds a synthetic `CheckSchema` of `checkCount` near-instant checks: every 5th check (after the
 * first) `dependsOn` the immediately preceding check (a handful of genuine dependency edges, not a
 * single long chain through every check), and the check at the midpoint is `isolated: true` (one
 * scheduling barrier, matching repo-contract's own config's single `build` barrier). Every `policy`
 * is trivial and synchronous -- this category measures orchestration, not policy-evaluation cost
 * (see the sibling `performance-policy-evidence` category for that).
 * @param checkCount - how many checks to generate.
 * @returns the synthetic `checks` record, plus how many of its checks declared a real `dependsOn` edge.
 */
export function generateCheckGraph(checkCount, { dependencies = true, isolatedEvery } = {}) {
  const checks = {}
  let dependencyEdges = 0
  const isolatedIndex = Math.floor(checkCount / 2)

  for (let i = 0; i < checkCount; i++) {
    const id = `check-${String(i).padStart(4, "0")}`
    const dependsOn =
      dependencies && i > 0 && i % 5 === 0 ? [`check-${String(i - 1).padStart(4, "0")}`] : undefined
    if (dependsOn) dependencyEdges++

    checks[id] = {
      run: [process.execPath, "-e", ""],
      policy: () => ({ outcome: "pass", rationale: `${id} completed.` }),
      ...(dependsOn ? { dependsOn } : {}),
      ...((
        isolatedEvery === undefined
          ? i === isolatedIndex
          : isolatedEvery > 0 && i % isolatedEvery === 0
      )
        ? { isolated: true }
        : {}),
    }
  }

  return { checks, dependencyEdges }
}
