# repo-contract architecture

Canonical current-state description of how repo-contract is built, referenced from
README/CONTRIBUTING/SECURITY. `specs/decisions/` holds the reasoning trail (ADRs); this document
is the destination those decisions arrived at, not the argument for them.

## The pipeline

```text
validate config
      |
run-checks.ts: fan out spawnCheck() over every configured check, bounded by concurrency
      |
build-evidence.ts: attach parsed output (if requested); assemble the versioned Evidence object
      |
run-policies.ts: invoke every check's policy against the complete Evidence; aggregate Verdict
      |
{ evidence, verdict }
```

`runRepoContract` (`src/run-repo-contract.ts`) composes exactly these four stages, in this
order, with no interleaving. See [Execution and policy evaluation are strictly
phased](#execution-and-policy-evaluation-are-strictly-phased) below for why that ordering is an
architectural invariant, not an implementation detail.

## Evidence, policy rationale, and consumer judgment

Three distinct questions get answered at three distinct points in the pipeline above, and the
package deliberately keeps them from collapsing into one:

- **Evidence answers "what happened?"** — `CheckEvidence` (exit code, signal, timing, captured
  stdout/stderr, parsed output). Facts only; no interpretation.
- **Policy rationale answers "what does the repository's policy conclude about what
  happened?"** — every check's `policy` returns a `PolicyResult`
  (`{ outcome: "pass" | "fail" | "warn", rationale: string }`, `src/types.ts`), not a bare
  boolean or string. `outcome` is the policy's own repository-owned judgment given its
  configured requirements; `rationale` is mandatory and must carry enough actionable detail
  (specific file/line locations, rule ids, test names, counts) that a consumer never has to rerun
  a command or re-parse raw output to understand why. `"warn"` exists specifically so a policy
  that is technically satisfied can still flag a condition worth a closer look — it is not a
  weaker `"fail"`; it never fails `Verdict.passed` (see `run-policies.ts`).
- **Consumer judgment answers "given the evidence and policy interpretation, what should I
  ultimately decide?"** — the policy's `outcome` is not the final word. `runRepoContract()`'s
  caller (a CI script, a human reviewer, an AI agent) still makes the final call, informed by
  both `evidence.checks[id]` and `verdict.checks[id]` together — which is exactly why both stay
  available on the returned object rather than one being derived away.

`PolicyResult` is deliberately a plain, JSON-serializable object (string `outcome`, string
`rationale`, nothing else) — never an `Error`, a class instance, or a tool-specific report shape
— so it can be persisted, transmitted between processes, aggregated across the parallel checks
described above, and consumed directly by a human or an AI without any package-specific
deserialization step. See [ADR 0002](decisions/0002-policyresult-is-a-structured-plain-json-contract.md) for the full
reasoning, including why `outcome`/`rationale` replaced an earlier `true | string` return type.

## Module boundaries

```text
src/
  index.ts            curated public barrel -- the only file consumers import from
  types.ts            all exported types; also the source ts-json-schema-generator reads
  errors.ts           the RepoContractError hierarchy
  config/
    tokenize-command.ts   run: string -> argv, no shell, deterministic
    validate-config.ts    structural validation, throws before anything spawns
    define-repo-contract.ts  identity function, exists for type inference only
  execution/
    spawn-check.ts     one check end to end: spawn, timeout, abort, capture
    process-tree.ts    killTree() -- POSIX process-group / Windows taskkill
    concurrency-pool.ts  bounded-parallelism primitive, no domain knowledge
    dependency-scheduler.ts  runWithConcurrencyGraph() -- same, plus dependsOn ordering
    abort-signals.ts   composeSignals() -- native AbortSignal.any with a manual fallback
    run-checks.ts       fans spawn-check.ts out over every configured check
  parsing/
    parse-output.ts    dispatches to one of the three parsers below by OutputFormat
    parse-json.ts       stdout -> JSON, failure preserved as data, never throws
    parse-text.ts       stdout -> trimmed string, always succeeds
    parse-yaml.ts       stdout -> YAML via the optional `yaml` peer dependency
  evidence/
    build-evidence.ts  attaches parsed output; assembles the versioned Evidence object
  policy/
    run-policies.ts    invokes every policy; aggregates the Verdict
  run-repo-contract.ts  composes the four stages above
  presets/
    index.ts           second, independent curated barrel -- repo-contract/presets
    shared/            internal helpers shared across presets, never re-exported
```

Nothing outside `src/index.ts`'s explicit re-export list is part of the public API, regardless
of whether a given file happens to `export` a symbol — `src/index.ts` is a curated barrel, not
an automatic one. `src/presets/index.ts` is a second, independent curated barrel of the same
kind, published under its own `./presets` subpath (see
[ADR 0005](decisions/0005-public-surface-stays-narrow-no-cli-experimental-presets.md)) — presets are never re-exported from the
root barrel, and the root barrel is never re-exported from presets; each stays curated on its
own terms. `scripts/schema-types.ts` exists solely as a target for
`ts-json-schema-generator` (see [ADR 0009](decisions/0009-self-hosting-tool-and-dependency-choices.md));
it is not part of the runtime.

## Execution and policy evaluation are strictly phased

This is the single most load-bearing architectural guarantee in the package, and the reason a
policy can safely do this:

```ts
policy: ({ result, evidence }) => {
  const testsPassed = evidence.checks.tests?.exitCode === 0
  // ...
}
```

By construction:

```text
ALL checks execute (respecting concurrency)
        |
ALL evidence assembled into one immutable Evidence object
        |
ALL policies execute against that complete Evidence object
        |
verdict assembled
```

No policy runs until every configured check — including every sibling check — has finished
executing and had its evidence assembled. A policy is never invoked against a
partially-populated `evidence`, and reading a sibling check's result from inside another check's
policy is never a race, because no execution is still in flight by the time any policy runs.
`run-repo-contract.ts` composes strictly as `run-checks → build-evidence → run-policies`; an
interleaved "run this check's policy as soon as it individually finishes" design was considered
and rejected specifically because it would break this guarantee — see
[ADR 0001](decisions/0001-execution-and-policy-are-a-strict-sequential-contract.md).

## Declaration order and scheduling

Declaration order in the `checks` object is the required topological order, not cosmetic: a check
runs concurrently with whatever's declared around it (launched in declaration order, bounded by
`concurrency`) except where `dependsOn` or `isolated` says otherwise. See
[ADR 0003](decisions/0003-dependson-and-isolated-are-two-scheduling-primitives.md) for the full
reasoning.

## Check dependencies (`dependsOn`)

A check's `dependsOn: readonly string[]` names other check ids that must reach a terminal status
before this check's own process is spawned — execution ordering only, never a policy-outcome
gate: whether a dependency's _policy_ passed is never consulted to decide whether a dependent
spawns. Every named id must be declared _earlier_ in the `checks` object than the check declaring
`dependsOn` on it — a forward reference throws `DependencyDeclaredLaterError`, synchronously,
before anything spawns; a cycle is consequently impossible, since no edge can ever point forward.
This lives entirely inside the execution phase described above — it changes _when within that
phase_ a check's process spawns, nothing about the phase boundary itself.
`run-checks.ts` schedules a graph of checks via `execution/dependency-scheduler.ts`'s
`runWithConcurrencyGraph` (a reactive, dependency-respecting sibling of `concurrency-pool.ts`'s
flat `runWithConcurrency`) when any check declares a non-empty `dependsOn` or `isolated: true`; a
fully-disconnected graph (the default — no check declares either) takes the same
`runWithConcurrency` path as before this feature existed. A dependent's policy reads its
dependencies' evidence via `ctx.dependencies` — a convenience view derived from the
already-assembled `Evidence`, not new persisted data. See
[ADR 0003](decisions/0003-dependson-and-isolated-are-two-scheduling-primitives.md) for the full
reasoning, including why this required no changes to policy evaluation itself.

## Check isolation (`isolated`)

A check's `isolated: boolean` (default `false`) is a distinct, deliberately separate primitive from
`dependsOn` above — pure scheduling exclusivity, not an evidence dependency. When `true`, the check
is a full barrier at its own declared position: it does not spawn until every check declared
_earlier_ has reached a terminal status, and every check declared _after_ it — isolated or not —
waits for it in turn, so nothing overlaps it in either direction. Unlike `dependsOn`, it names no
other check by id, so it lives on `CheckDefinitionConfig` and can be declared directly in a check's
own file rather than needing assembly-time context. Two isolated checks in the same run are
therefore always sequential relative to each other (the later one's "everything declared earlier"
already includes the earlier one). It is never merged into the check's own `dependsOn`
array and therefore never appears in `ctx.dependencies` — a check that is merely isolated has
expressed no need for any other check's evidence, only for the machine to itself (e.g. a check
whose own tooling spawns concurrent worker processes that would otherwise contend with the rest of
the run). It also does not affect `resolveCheckDependencies`'s transitive closure for a partial
`options.checks` run — requesting just the isolated check runs just that check, even if it's
declared after another isolated barrier. A common use of this positional barrier: declaring every
file-writing check first, then one `isolated: true` "build" check, then every read/report-only
check — the readers wait for the build with zero per-check `dependsOn` wiring, purely from where
they're declared. See
[ADR 0003](decisions/0003-dependson-and-isolated-are-two-scheduling-primitives.md).

## Status classification

Each check's terminal `status` is derived with this priority, in `spawn-check.ts`:

1. the run-level `AbortSignal` fired and triggered the kill → `"aborted"`
2. the check's own `timeoutMs` fired → `"timed_out"`
3. the _host_ process running repo-contract itself received SIGINT/SIGTERM, which killed every
   in-flight check as cleanup → `"host_terminated"` — repo-contract requested this signal too, just
   not via `options.signal`/`timeoutMs`, so it must not be conflated with an externally-caused
   `"signaled"` below
4. the process exited via a signal repo-contract did not request → `"signaled"`
5. spawning itself failed, no pid was ever obtained → `"spawn_error"`
6. otherwise → `"completed"` (the exit code may still be non-zero — that's for the policy to
   interpret, never this package; see [ADR 0001](decisions/0001-execution-and-policy-are-a-strict-sequential-contract.md))

A check still queued behind the concurrency limit when the run is aborted never spawns at all,
but still receives a well-formed `status: "aborted"` evidence entry — every configured check's
policy is invoked exactly once, for every run, regardless of whether that check ever actually
ran.

## Consumer-supplied callback isolation

`policy` is the only function a consumer hands the package to invoke on their behalf. Every
invocation is wrapped so that neither a synchronous throw, a later promise rejection, nor a
malformed return value can corrupt the run: the call is wrapped in `try`/`catch`, its returned
value is `await`-ed inside that same `try`, and the resolved value is then validated against the
`PolicyResult` contract itself (`outcome` is exactly `"pass"`, `"fail"`, or `"warn"`; `rationale`
is a string) before it is trusted — this matters because `Verdict.passed` is computed by
comparing `outcome` against `"fail"`, so an unvalidated garbage value (a typo'd literal, or any
value at all from a JavaScript consumer with no compiler enforcing the contract) would otherwise
be silently treated as non-failing instead of surfacing as the bug it is. Every one of these three
failure modes is wrapped in an error, with the original thrown value — or a descriptive validation
error, for a malformed result — preserved via the native `cause` chain, never stringified or
discarded. Two specific, common mistakes get a more actionable error subclass instead of the
generic one, chosen by `wrapPolicyFailure` (`run-policies.ts`): reading a `result.output` property
on a check that never requested a format (`PolicyReadUnrequestedOutputError`), and reading
`result.output.value` on a check whose requested parse actually failed
(`PolicyReadFailedParseValueError`) — both still extend `RepoContractError` directly and preserve
the original `TypeError` via `cause`, exactly like the plain `PolicyThrewError` case every other
failure gets. One policy failing this way never stops any other check's policy from running
(`run-policies.ts` isolates each policy invocation independently inside a `Promise.all`). If more
than one policy fails this way in the same run, `runRepoContract()` rejects with a native
`AggregateError` holding one such error (of whichever of the three subclasses applies) per failing
check, rather than surfacing only the first one found.

## Why stdout/stderr capture uses `"close"`, not `"exit"`

`spawn-check.ts` resolves a check's evidence on the child process's `"close"` event, not
`"exit"`. Node's own documentation warns that `"exit"` can fire before a child's stdio streams
have finished delivering their final buffered data — resolving on `"exit"` risks silently
truncating `stdout`/`stderr` for a process that writes a lot of output right before exiting.
This was not a hypothetical: it was caught during implementation against `secretlint`'s own CLI,
whose `bin/secretlint.js` calls `console.log(largeJsonString)` immediately followed by
`process.exit(exitStatus)` with no flush wait, which reliably truncated captured stdout at
~64KB. `"close"` fires only after every stdio stream has ended and still carries the same
`(code, signal)` pair `"exit"` does. See [ADR 0009](decisions/0009-self-hosting-tool-and-dependency-choices.md).

## The `run` tokenizer

`config/tokenize-command.ts` splits a `run` string into argv without ever invoking a shell.
Quoting (`'...'`/`"..."`) groups whitespace into one token; `\` escapes the next character.
Unquoted occurrences of true shell/multi-command operators (`;`, `&`, `|`, backtick, `$(`, `<`,
`>`, newline) are rejected as a configuration error. Glob characters (`*`, `?`, `~`, `[`, `]`,
`{`, `}`) and a bare `$` are deliberately _not_ rejected — see
[ADR 0004](decisions/0004-cross-platform-command-execution-and-process-cleanup.md) for why an earlier, broader
rejection list was wrong.

## Process-tree cleanup

`execution/process-tree.ts`'s `killTree` terminates an entire process tree, not just the
directly-spawned process, because a check's command is often itself a wrapper (`npm test` spawns
`npm`, which spawns the real test runner) — `spawn`'s own `timeout`/`signal` options only ever
affect the directly spawned process. On POSIX, this sends the signal to the whole process group
via the negative-pid convention (the process is spawned with `detached: true` specifically to
become a process-group leader). On Windows, process groups don't work the same way, so this
shells out to `taskkill /pid <pid> /t /f` instead — the same technique the `tree-kill` package
uses internally. See [ADR 0004](decisions/0004-cross-platform-command-execution-and-process-cleanup.md).

## Type inference boundary

`CheckDefinition` is deliberately **not** generic over its `output.format`. An earlier design
attempted to carry each check's own literal format through to that same check's `policy`
parameter type (so `output: { format: "text" }` would type `result.output.value` as `string`
specifically, not `unknown`). This does not reliably work in TypeScript for a `Record` of
heterogeneous generic entries once a callback property (`policy`) is also present — confirmed
via isolated repro during implementation, not assumed. `result.output.value` is `unknown` for
every format; a policy author narrows or casts it themselves, exactly as they already must for
formats with no schema knowledge either way. The genuinely valuable part of the type system —
`evidence.checks`/`verdict.checks` keyed and typed per configured check id, so
`evidence.checks.mutation` autocompletes and `evidence.checks.doesNotExist` is a compile error —
is unaffected, since it doesn't depend on per-check generic parameters. See
[ADR 0002](decisions/0002-policyresult-is-a-structured-plain-json-contract.md).

## Self-hosting

This repository's own `repo-contract.config.ts` uses the package's real public API to validate
itself — one check per verification category in
[specs/verification-taxonomy.md](verification-taxonomy.md), each a real command with a real
policy; `repo-contract.config.ts`'s own `checks` record is the authoritative, current list of check
ids (an enumeration here would only drift out of sync as checks are added or renamed). See
`CONTRIBUTING.md` for how to run it,
[ADR 0009](decisions/0009-self-hosting-tool-and-dependency-choices.md)
for how the CRAP and secret-scanning tools specifically were selected, and
[ADR 0006](decisions/0006-independent-verification-boundaries-coverage-is-a-union.md) for how the Vitest-based categories'
independent execution boundaries and aggregate coverage are structured.

`specs/verification-taxonomy.md` is the canonical reference for _what each verification category
establishes_ (unit/integration/property/e2e/architecture, plus how they relate to the existing
static-analysis/coverage/mutation/dependency-analysis/API-compatibility checks above) — this
document describes how the package itself is built; that one describes what the repository verifies
and why each category is distinct from the others.
