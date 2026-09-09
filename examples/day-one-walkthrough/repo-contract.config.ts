/**
 * A consumer of the organization's standard, one step past `../boilerplate`.
 *
 * `../boilerplate` shows the wiring: depend on `internal-boilerplate-contract`, inherit `Format` /
 * `Types` / `Lint`, add nothing. This package shows the next thing an organization actually does:
 * introduce a NEW shared requirement across every repository at once, on a schedule, so the day it
 * lands it is an actionable warning rather than a broken build.
 *
 * The baseline check here (`Types`) is a real preset, exactly as `internal-boilerplate-contract`
 * uses it. The two rollout checks use {@link exampleAdoptionPolicy} -- see ./adoption-policy.ts for
 * why that is ordinary policy code, not a repo-contract feature.
 */
import { spawn } from "node:child_process"

import { defineRepoContract } from "repo-contract"
import { typecheck } from "repo-contract/presets"

import { exampleAdoptionPolicy } from "./adoption-policy.js"

// A real rollout names a fixed calendar date every consuming repository can see and plan around.
// This example derives one ~60 days out so the walkthrough always shows a realistic pre-enforcement
// countdown instead of rotting into a `fail` (or a nonsensically large number) as time passes.
const ROLLOUT_DATE = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

export default defineRepoContract({
  spawn,
  env: process.env,
  checks: {
    // The inherited baseline: `tsc --noEmit -p tsconfig.json`, read-only, preset policy unchanged.
    Types: typecheck,

    // A requirement the organization rolled out months ago. Its date is in the past, so a
    // repository that did not satisfy it would now `fail`; this one does, so it `pass`es. In a real
    // repository, `evaluate` would read `coverage/coverage-summary.json`; here it is hard-coded so
    // the walkthrough's verdict is deterministic.
    CoverageFloor: {
      run: ["node", "--version"],
      policy: exampleAdoptionPolicy(
        {
          requirement: "Line coverage >= 85%",
          enforcedFrom: "2020-01-01",
        },
        () => ({
          satisfied: true,
          detail: "coverage/coverage-summary.json reports 91.4% line coverage.",
        }),
      ),
    },

    // A requirement the organization is rolling out right now. Its date is in the near future, so a
    // repository that does not satisfy it yet gets a `warn` with a countdown -- not a `fail`.
    MutationFloor: {
      run: ["node", "--version"],
      policy: exampleAdoptionPolicy(
        {
          requirement: "Mutation score >= 80%",
          enforcedFrom: ROLLOUT_DATE,
        },
        () => ({
          satisfied: false,
          detail:
            "No mutation report found at reports/mutation/mutation.json. Add Stryker to this " +
            "repository and wire `npm run mutation` before the date above.",
        }),
      ),
    },
  },
})
