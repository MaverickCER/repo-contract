# Day-one walkthrough: rolling out a new shared requirement

[`../boilerplate`](../boilerplate) shows the wiring — a project depends on
`internal-boilerplate-contract`, inherits `Format` / `Types` / `Lint`, and adds
nothing. This package shows the step after that: the organization introduces a
**new** shared requirement across every repository at once.

The problem with doing that naïvely: the moment the new check lands in the shared
contract, every repository that does not already satisfy it goes red — including
repositories nobody touched that week. Teams learn to distrust the contract.

The fix is not a repo-contract feature. It is ordinary policy code that looks at
the calendar.

## The pattern

[`adoption-policy.ts`](adoption-policy.ts) defines `exampleAdoptionPolicy(schedule,
evaluate)`. It wraps a requirement's real check in a dated rollout:

| Requirement state | Before `enforcedFrom`         | On/after `enforcedFrom` |
| ----------------- | ----------------------------- | ----------------------- |
| satisfied         | `pass`                        | `pass`                  |
| **not** satisfied | `warn` — with a day countdown | `fail`                  |

`repo-contract` never sees the schedule. It calls the policy and records the
`pass` / `warn` / `fail` it returns — the same three outcomes as any other policy.
`exampleAdoptionPolicy` is a function you could write and keep in your own shared
contract package; it is **not** exported by `repo-contract`.

## What [`repo-contract.config.ts`](repo-contract.config.ts) contains

- **`Types`** — the inherited baseline, the real `typecheck` preset
  (`tsc --noEmit`), unchanged.
- **`CoverageFloor`** — a requirement rolled out long ago (`enforcedFrom` in the
  past). This repository satisfies it, so it `pass`es. A repository that did
  _not_ would now `fail`, because the date has passed.
- **`MutationFloor`** — a requirement being rolled out now. This repository does
  not satisfy it yet, so it `warn`s with a countdown and a specific instruction,
  and the overall verdict still `pass`es.

The two `evaluate` callbacks are hard-coded here so the walkthrough's output is
deterministic. In a real repository they would read `coverage/coverage-summary.json`
and `reports/mutation/mutation.json` — exactly the way this repository's own
`checks/mutation.ts` reads its Stryker report. `MutationFloor`'s `enforcedFrom` is
likewise derived ~60 days out so the example never rots; a real rollout names one
fixed calendar date every repository can plan around.

## Running it

```sh
# from the repository root: build repo-contract once, then wire the workspace
npm install
cd examples && npm install

npm run walkthrough -w day-one-walkthrough
```

Expected output:

```text
day-one-walkthrough

[PASS] Types
  tsc reported no type errors.

[PASS] CoverageFloor
  Line coverage >= 85%: satisfied. coverage/coverage-summary.json reports 91.4% line coverage.

[WARN] MutationFloor
  Mutation score >= 80%: not satisfied. Becomes blocking on YYYY-MM-DD (60 day(s) from now) -- fix
  it before then to keep the build green. No mutation report found at
  reports/mutation/mutation.json. Add Stryker to this repository and wire `npm run mutation`
  before the date above.

PASS
```

`WARN` does not fail the run — `verdict.passed` is `true`. That is the whole
point: the requirement is visible and dated everywhere on day one, and blocks
nobody until the date arrives.

## See also

- [`../README.md`](../README.md) — the layered organizational governance model.
- [`../exceptions-walkthrough`](../exceptions-walkthrough) — the companion
  advanced example: a governed, justified exception to an otherwise-blocking
  finding, built on `repo-contract/helpers`.
- [ADR 0010](../../specs/decisions/0010-review-driven-contracts-and-shared-internal-system-contracts.md).
