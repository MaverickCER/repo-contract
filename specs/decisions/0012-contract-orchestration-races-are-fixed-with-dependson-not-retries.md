# 0012: Contract-orchestration races are fixed with `dependsOn`, not retries

## Status

Accepted. Implemented in `repo-contract.config.ts` (`test-integration` now `dependsOn:
["suppression-governance"]`).

## Context

During a full `npm run contract` run, `test-integration` failed:
`test/integration/suppression-governance/real-source.integration.test.ts` asserted
`disable-comments.json` matched real source (`newCount/movedCount/removedCount: 0`) and got
`{newCount:1, movedCount:9, removedCount:1}`. The same `npm run contract` run's
`suppression-governance` check also failed, reporting the same drift plus one under-justified entry.

Investigation, in order:

1. Re-ran `node scripts/run-test-category.mjs integration --coverage --reporter=json` in isolation
   (via `npx node ...` for PATH resolution) immediately after the full run: it passed, 0 drift.
   Same source, same registry file, different outcome — ruled out a source/logic bug, pointed at
   shared mutable state.
2. Read `scripts/suppression-governance/check.ts`: `runSuppressionGovernanceCheck` (the
   `suppression-governance` check's own `run` command) calls `synchronize()` then unconditionally
   `writeFile`s the reconciled registry to `disable-comments.json` on disk — a check with a
   filesystem side effect, not a pure read.
3. Read `test/integration/suppression-governance/real-source.integration.test.ts`: computes its own
   `synchronize()` against the on-disk registry and real source, asserts zero drift — a pure read of
   the same file.
4. Checked `repo-contract.config.ts`: no `dependsOn` between `test-integration` and
   `suppression-governance`. Both are scheduled concurrently. `mutation` already `dependsOn:
["suppression-governance"]` for an analogous reason (reading its evidence), establishing the
   precedent this case was missing.

Conclusion: a **contract-orchestration race** — two checks share mutable state
(`disable-comments.json`) with no declared ordering. Outcome depends on whether
`suppression-governance`'s write lands on disk before or after `test-integration`'s vitest worker
happens to execute that one test file — timing that varies with process spawn latency and vitest's
own internal scheduling, not anything `repo-contract`'s scheduler controls.

Separately (not a race): `coverage` failed with an opaque "Coverage output could not be parsed as
JSON." Running `scripts/check-coverage.mjs` directly reproduced a clear thrown error:
`coverage/integration/coverage-final.json` missing. Deliberately re-broke one assertion and
confirmed: Vitest's coverage-v8 provider does not write report files when the run has any failing
test (its `reportOnFailure` option defaults to `false`) — so `test-integration`'s failure above
fully and deterministically explains the missing coverage artifact. Root cause, not a race;
tracked separately, not by this ADR.

## Decision

Reject retrying the failed run (or the failed check alone) as a fix. A retry would only ever run
_after_ `suppression-governance`'s write from the first attempt already landed on disk, so it would
pass — not because the ordering defect was fixed, but because the retry always happens to observe
the already-corrected state. That converts a real, reproducible ordering bug into "looks reliable
in CI" while leaving the same race live for the next contributor who edits a suppression comment
and hits an unlucky schedule. A retry here would hide the defect it should have surfaced.

Instead: declare `test-integration: { dependsOn: ["suppression-governance"] }` in
`repo-contract.config.ts`, using the scheduling primitive this project already has for exactly this
purpose (see [ADR 0003](0003-dependson-and-isolated-are-two-scheduling-primitives.md)). This
guarantees the registry write settles before the real-source assertion ever reads it, on every run,
by construction rather than by timing luck.

## Consequences

`test-integration` now always runs after `suppression-governance` instead of concurrently with it,
adding `suppression-governance`'s runtime to `test-integration`'s critical path (small; that check
is fast). A future check or test that reads a file another check writes must declare the same kind
of `dependsOn` — this failure mode (pass in isolation, fail in full concurrent `npm run contract`)
is the signal to look for.

Applying that signal proactively (not waiting for another empirical failure) once surfaced a
second, structurally identical case: `api-contract` and the then-existing `changeset-docs` check
both read-modify-wrote the same `.changeset/*.md` file, and were serialized with a
`dependsOn: ["api-contract"]`. That instance is now moot — [ADR 0008](0008-api-contract-compatibility-gate.md)
removed Changesets, and with it the shared file, the `changeset-docs` check, and
`api-contract`'s file-writing (it is now a pure gate). The general principle stands: a future
check or test that reads a file another check writes must declare the same kind of `dependsOn`.

## Alternatives considered

- **Make the real-source test itself run the synchronization it depends on**, rather than depending
  on a sibling check to have already done so. Rejected: duplicates
  `scripts/suppression-governance/check.ts`'s own logic in a test, and reintroduces exactly the
  problem [ADR 0007](0007-suppression-governance.md) already solved once (suppression discovery
  owned by one script).
- **Retry the check/run on failure.** Rejected per Decision above: hides the defect instead of
  fixing it.
- **Make `suppression-governance`'s check read-only** (never write `disable-comments.json` itself;
  require a separate explicit sync command, mirroring `contract:baseline` for api-contract).
  Would also close this race, but is a larger behavioral change to an already-shipped, tested
  mechanism; not pursued here since `dependsOn` closes the actual race with no behavior change.
