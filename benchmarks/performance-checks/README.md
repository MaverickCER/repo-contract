# performance-checks

Measures `src/execution/run-checks.ts`'s `runChecks` — repo-contract's own check-execution
orchestration (`dependency-scheduler.ts`'s graph-aware scheduling, `concurrency-pool.ts`'s
concurrency clamping, `spawn-check.ts`'s real process spawning) — at increasing check-graph scale.

See [`../README.md`](../README.md) for the shared methodology across all three categories.

## What's generated

[`fixtures.mjs`](fixtures.mjs)'s `generateCheckGraph(checkCount)` builds a synthetic `CheckSchema`
of `checkCount` near-instant checks (`run: [process.execPath, "-e", ""]`, no script file, no I/O):
every 5th check `dependsOn` the one immediately before it (a handful of genuine dependency edges,
not a single long chain), and the check at the midpoint is `isolated: true` (one scheduling
barrier) — the same qualitative shape as repo-contract's own `repo-contract.config.ts` (a writer
phase, one `isolated: true` `build` barrier, a mostly-parallel reader phase with a few `dependsOn`
edges), reproduced at increasing scale rather than switching shapes between tiers.

| Tier     | Checks | Purpose                                                          |
| -------- | ------ | ---------------------------------------------------------------- |
| `small`  | 20     | Fast-feedback sanity point, small enough for every local run.    |
| `medium` | 100    | Mid-ladder point establishing whether scheduling cost is linear. |
| `large`  | 400    | Top of the scaling ladder.                                       |

Every generated check's `policy` is trivial and synchronous — this category isolates orchestration
cost from policy-evaluation cost (see the sibling `performance-policy-evidence` category for that).

## Run it

```sh
npm run benchmark:checks
```
