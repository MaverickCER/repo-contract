# 0002: `dependsOn` and `isolated` are two separate scheduling primitives, declaration order is the required topological order, and orchestration races are fixed with them — not retries

## Status

Accepted. Implemented in `src/execution/dependency-scheduler.ts`, `src/execution/run-checks.ts`,
`src/config/validate-config.ts`, `src/policy/run-policies.ts`, `src/errors.ts`, `src/types.ts`,
and applied in `repo-contract.config.ts` (`test-integration` and `mutation` both
`dependsOn: ["suppression-governance"]`).

## Context

Every check originally ran independently in one unordered concurrent pool. Running this
repository's own self-hosting suite fully concurrently surfaced a real flake: a resource-heavy
check that spins up its own concurrent worker processes internally starved timing margins
elsewhere in the suite under load. The fix needed a way to express "run this check only after
these others have settled" (`coverage` genuinely needs the artifacts three test categories
already produced) and, separately, "run this check alone, with the machine to itself" (a pure
resource-contention concern with no data dependency at all).

The first implementation of the second need reused the first mechanism: the resource-heavy
check's `dependsOn` hand-listed every other check id, even though its policy never read any of
their evidence. That directly contradicted the mechanism's own contract — a dependent's policy
is supposed to read `ctx.dependencies`, evidence it explicitly needs — and required every future
check to remember to add itself to that list by hand, an easy thing to silently forget.

Separately, a common, real need — "run every check that writes to a shared file first, then a
build step that depends on their output, then every check that only reads and reports" — needed
expressing too. Doing it purely with `dependsOn` would mean hand-adding a dependency from every
reader check onto the build step, verbose and easy to forget on a newly added check; a wholly
new metadata field (an explicit "phase" or "order" key, or an `isWriteCheck`/`read` boolean)
would only duplicate information declaration order in the `checks` object could already express
for free, if declaration order were made to actually mean something. Under a purely cosmetic
declaration order, this repository's own config had in fact already drifted into a real,
unenforced-because-unenforceable invalid state: `suppression-governance` writes the suppression
registry as a side effect, and both `test-integration` and `mutation`
`dependsOn: ["suppression-governance"]` to avoid racing that write (the race that forced this is
detailed below) — but `suppression-governance` was declared last in the checks object, after
both of them, with nothing to catch the mismatch.

That exact drift then surfaced empirically during a full `npm run contract` run rather than only
in review. `test-integration` failed —
`test/integration/suppression-governance/real-source.integration.test.ts` asserted
`disable-comments.json` matched real source (`newCount/movedCount/removedCount: 0`) and got
`{newCount:1, movedCount:9, removedCount:1}` — while the same run's `suppression-governance`
check reported the same drift plus one under-justified entry. The investigation, in order:

1. Re-ran the integration category in isolation immediately after the full run: it passed, zero
   drift. Same source, same registry file, different outcome — ruled out a source/logic bug,
   pointed at shared mutable state.
2. `scripts/suppression-governance/check.ts`'s `run` command calls `synchronize()` then
   unconditionally `writeFile`s the reconciled registry to `disable-comments.json` on disk — a
   check with a filesystem side effect, not a pure read.
3. The failing test computes its own `synchronize()` against the on-disk registry and real
   source and asserts zero drift — a pure read of the same file the other check writes.
4. `repo-contract.config.ts` declared no ordering between the two; they were scheduled
   concurrently, and the outcome depended on whether `suppression-governance`'s write landed on
   disk before or after `test-integration`'s vitest worker happened to execute that one test
   file — timing that varies with process spawn latency and vitest's own scheduling, not
   anything `repo-contract`'s scheduler controls.

That is a **contract-orchestration race**: two checks share mutable state
(`disable-comments.json`) with no declared ordering. (Separately, and not a race: the same run's
`coverage` check failed with an opaque "Coverage output could not be parsed as JSON" because
Vitest's coverage-v8 provider does not write report files when any test in the run fails — a
deterministic downstream effect of the `test-integration` failure above, tracked on its own,
not by this decision.)

## Decision

Two primitives, kept deliberately separate, and declaration order in the `checks` object is the
required topological order both are scheduled against.

**`dependsOn: readonly string[]`** names other check ids from the same schema. A check whose
`dependsOn` is non-empty does not spawn until every named dependency has reached a terminal
status. This is execution-ordering only — whether a dependency's _policy_ passed is never
consulted to decide whether a dependent spawns; a dependent that cares about its dependency's
outcome expresses that itself, in its own command or policy, using evidence handed via
`ctx.dependencies`. Every named id must be declared _earlier_ in the `checks` object than the
check declaring `dependsOn` on it — a forward reference throws `DependencyDeclaredLaterError`
from `validateRepoContractConfig`, synchronously, before anything spawns, the same timing as
every other structural config error. Because every edge is required to point backward, a
dependency cycle is structurally impossible: there is no DFS cycle detector anywhere in this
package — `validate-config.ts` needs only one pass checking each `dependsOn` id's index against
its declaring check's own index.

**`isolated: boolean`** (default `false`) is a full scheduling barrier at the check's own
declared position: it does not spawn until every check declared _earlier_ has reached a terminal
status (nothing "currently in flight" when its turn comes can be anything other than an
earlier-declared check, since nothing declared later has even been reached yet in a
declaration-order walk), and every check declared _after_ it — isolated or not — waits for it in
turn, so nothing overlaps it in either direction. Concretely, `run-checks.ts`'s
`dependencyIndexesFor` gives an isolated check at index `i` an edge to every index `< i`, and
every check at index `> i` an edge to `i`. It names no other check by id, so it lives on the
per-check config rather than the assembled schema — a fact a check knows about itself ("my own
tooling needs the machine to itself"), not something that only becomes meaningful once the full
schema is assembled. It is never merged into `dependsOn` and never appears in `ctx.dependencies`
or in a partial `options.checks` run's transitive closure — a check that is merely isolated has
expressed no need for any other check's evidence, only for the machine to itself. Two isolated
checks in the same run are always sequential relative to each other (the later one's "everything
declared earlier" already includes the earlier one).

A phase grouping ("every writer, then a build step, then every reader") falls out of ordinary
declaration order plus one `isolated: true` on the phase-boundary check itself, with zero
per-reader-check wiring: readers simply need to be declared after the barrier.

**A typo'd or self-referencing `dependsOn` id fails to compile, not just at runtime**, for a
config authored through `defineRepoContract` — a later reversal of this repository's own
original stance that this class of typo checking wasn't worth attempting for v1.
`defineRepoContract` narrows each check's `dependsOn` from a bare `readonly string[]` to only
the _other_ keys of that same schema, so an unknown or self-referencing id is a compile error at
the point a config is authored. This is additive safety only: `runRepoContract`'s own runtime
validation is unchanged and still catches the same defect for any config that reaches it without
going through `defineRepoContract` first (e.g. one assembled dynamically from untyped data) —
the compile-time check is strictly earlier feedback for the common case, not a replacement for
the runtime guarantee. It does not, and cannot, catch a forward reference (which check is
declared where isn't visible to `dependsOn`'s own key-based type constraint) — that's
`DependencyDeclaredLaterError`'s job, at runtime, for every config regardless of how it was
authored.

**Orchestration races are fixed with the ordering primitive, not with retries.** When two
checks share mutable state, the fix is a `dependsOn` edge from the reader to the writer — e.g.
`test-integration: { dependsOn: ["suppression-governance"] }` — so the write settles before the
read on every run, by construction rather than by timing luck. Retrying the failed check, or the
failed run, is explicitly rejected as a fix: a retry would only ever run _after_
`suppression-governance`'s write from the first attempt already landed on disk, so it would pass
— not because the ordering defect was fixed, but because the retry always happens to observe the
already-corrected state. That converts a real, reproducible ordering bug into "looks reliable in
CI" while leaving the same race live for the next contributor who edits a suppression comment
and hits an unlucky schedule. The signal to watch for is a check or test that passes in
isolation and fails only in the full concurrent `npm run contract`; the response is a
`dependsOn` edge, not a rerun. Applying that signal proactively — not waiting for another
empirical failure — once surfaced a second, structurally identical case: `api-contract` and the
then-existing `changeset-docs` check both read-modify-wrote the same `.changeset/*.md` file, and
were serialized with a `dependsOn` edge. That instance is now moot —
[ADR 0009](0009-conventional-commits-versioning-and-local-gates.md) removed Changesets, and with
it the shared file, the `changeset-docs` check, and `api-contract`'s file-writing (it is now a
pure gate) — but the general principle stands.

## Consequences

- `dependsOn` means exactly what it says: a genuine evidence dependency. The resource-contention
  case no longer overloads it.
- A new check added to the schema no longer needs to remember to add itself to any other check's
  hand-maintained list — an isolated check's effective exclusivity is computed automatically
  from its own position, not maintained by hand.
- No new metadata field was needed for phase grouping — declaration order plus one
  `isolated: true` on the boundary check does the whole job.
- Reordering an existing `checks` object is not purely cosmetic — moving a check earlier or
  later can change what it implicitly waits for (via an earlier isolated barrier) or is waited
  on by. This repository's own config needed reordering to become valid under this rule (see
  Context above) — `suppression-governance` moved before `test-integration`/`mutation`.
- `test-integration` now always runs after `suppression-governance` instead of concurrently with
  it, adding `suppression-governance`'s runtime to `test-integration`'s critical path (small;
  that check is fast). A future check or test that reads a file another check writes must declare
  the same kind of `dependsOn`.
- `validate-config.ts` stays small: no DFS cycle detector, no whole-schema isolated-edge
  computation separate from real scheduling — `run-checks.ts`'s `dependencyIndexesFor` is the
  only place that computes `isolated`'s implied edges.
- Requesting a subset of checks that includes only an isolated one runs just that one check,
  with nothing else to be exclusive from — isolation doesn't drag in the rest of the schema, and
  neither does a reader declared after an isolated phase boundary transitively pull in that
  boundary or what's before it (`resolveCheckDependencies` walks `dependsOn` alone). **Judgment
  call, not settled by data**: today's `precontract` npm hook runs the full build
  unconditionally before any `contract` invocation regardless, so this is currently unobservable
  end to end — but a future direct `runRepoContract({ ... }, { checks: ["someReader"] })` caller
  outside that hook would see the reader run against whatever's already on disk, not a
  guaranteed-fresh build. If that turns out to matter in practice, the fix is an explicit
  `dependsOn: ["build"]` on the specific readers that need it, not a change to what `isolated`
  implies.

## Alternatives considered

- **Wave/layer-based scheduling** for `dependsOn`: rejected — it would stall a dependent whose
  single dependency finishes early behind an unrelated slow item sharing its layer, a real
  regression for a diamond or fan-out dependency shape, with no complexity savings over a
  reactive, event-driven scheduler.
- **A generic "exclusive group" concept** instead of a single `isolated` flag: rejected as
  unnecessary generality for the one real use case that exists today; a group concept can be
  layered on later if a genuine second case appears.
- **Auto-skipping a dependent when its dependency's policy failed**: rejected — this would
  violate the execution/policy separation this package's whole design rests on (see
  [ADR 0001](0001-execution-and-policy-are-a-strict-sequential-contract.md)): whether a process
  spawns and whether a check passed are deliberately independent questions.
- **Leaving `dependsOn` typo-checking to runtime only**: this repository's own original
  position, on the reasoning that cross-key validation is a strictly harder version of a known
  TypeScript inference limitation. Revisited once `defineRepoContract` needed to solve a
  related, adjacent inference problem anyway (carrying each check's own `output` shape into its
  `policy` parameter); once that machinery existed, extending it to also narrow `dependsOn`
  per-check was a small addition, not a speculative one — see `ValidatedCheckSchema` in
  `src/types.ts`.
- **An explicit `order`/`phase` field, or an `isWriteCheck`/`read` boolean**, instead of making
  declaration order itself load-bearing: rejected — it would duplicate information declaration
  order already encodes, and require every check (not just boundary ones) to be annotated to
  stay meaningful, rather than only the barrier check.
- **Making `isolated`'s barrier also populate `ctx.dependencies` with every earlier check's
  evidence, and pulling it into partial-run closure**: considered, since it would make "a reader
  transitively waits for `build`" automatic. Rejected for now — it would silently balloon
  `ctx.dependencies` for every check declared after any isolated barrier to include every
  earlier check's evidence regardless of relevance, and would mean requesting one reader via
  `options.checks` could pull in the entire rest of the suite. Revisit if a real caller needs a
  partial run to guarantee a fresh build first (see the judgment call in Consequences above).
- **Retrying a failed check or run to paper over an orchestration race**: rejected — hides the
  defect it should have surfaced (see the Decision's retry discussion above).
- **Making `suppression-governance`'s check read-only** (never writing `disable-comments.json`
  itself; requiring a separate explicit sync command, mirroring `contract:baseline` for
  `api-contract`): would also close this race, but is a larger behavioral change to an
  already-shipped, tested mechanism; not pursued here since `dependsOn` closes the actual race
  with no behavior change.
- **Making the real-source test itself run the synchronization it depends on**, rather than
  depending on a sibling check to have already done so: rejected — duplicates
  `scripts/suppression-governance/check.ts`'s own logic in a test, and reintroduces exactly the
  problem [ADR 0006](0006-suppression-governance.md) already solved once (suppression discovery
  owned by one script).
