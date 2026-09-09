# repo-contract architecture

Canonical current-state description of how repo-contract is built and what guarantees its
architecture provides. `specs/decisions/` holds the reasoning trail (the ADRs); this document is
the destination those decisions arrived at, not the argument for them. For the product overview
and integration guidance, see [README.md](../README.md) and [GUIDE.md](../GUIDE.md).

- [Purpose](#purpose)
- [The pipeline](#the-pipeline)
- [Core invariants](#core-invariants)
- [Execution phase](#execution-phase)
- [Evidence, policy rationale, and consumer judgment](#evidence-policy-rationale-and-consumer-judgment)
- [Policy phase](#policy-phase)
- [Consumer-supplied capabilities](#consumer-supplied-capabilities)
- [Command execution](#command-execution)
- [Type-system boundaries](#type-system-boundaries)
- [Module layout](#module-layout)
- [Self-hosting](#self-hosting)
- [Architectural decisions](#architectural-decisions)
- [Related documentation](#related-documentation)

## Purpose

repo-contract is an execution and evidence layer for repository-defined engineering policy. It
does not perform verification itself: a repository supplies commands (TypeScript, ESLint, Vitest,
mutation testing, security scanners, anything that runs), repo-contract executes them, captures
their results as structured evidence, and evaluates repository-owned policies against that
evidence.

The architecture keeps three concerns from collapsing into one:

```text
tool execution   -> what actually happened
      |
   evidence      -> the facts, recorded
      |
    policy       -> does that meet this repository's standard?
      |
    verdict      -> the policy judgment, aggregated
```

The tool determines what happened. Evidence records it. A policy decides whether it is
acceptable. The caller still owns the final decision about what to do with the verdict.

## The pipeline

`runRepoContract` (`src/run-repo-contract.ts`) composes exactly four stages, in this order, with
no interleaving:

```text
validate config
      |
run-checks.ts       fan spawnCheck() out over every configured check, bounded by concurrency
      |
build-evidence.ts   attach parsed output (if requested); assemble the versioned Evidence object
      |
run-policies.ts     invoke every check's policy against the complete Evidence; aggregate Verdict
      |
{ evidence, verdict }
```

The separation is the point, not an implementation detail: it guarantees that no policy ever
executes against incomplete evidence. Every configured check finishes first; its evidence is
assembled into one complete `Evidence` object; only then do policies run.

## Core invariants

These are the guarantees the rest of the design exists to uphold. Each links to the section that
describes its mechanics.

### Execution and policy evaluation are strictly phased

The complete order is:

```text
ALL configured checks execute (respecting concurrency)
        |
ALL check evidence assembled into one immutable Evidence object
        |
ALL policies execute against that complete Evidence object
        |
Verdict assembled
```

No policy runs until every configured check — including every sibling — has finished executing
and had its evidence assembled. A policy can therefore safely read another check:

```ts
policy: ({ result, evidence }) => {
  const testsPassed = evidence.checks.tests?.exitCode === 0
  // ...
}
```

The referenced check has already reached a terminal state, and reading it is never a race
because nothing is still in flight by the time any policy runs. An interleaved "run this check's
policy as soon as it individually finishes" design was considered and rejected specifically
because it would break this guarantee. See
[ADR 0001](decisions/0001-execution-and-policy-are-a-strict-sequential-contract.md). This is the
single most load-bearing architectural guarantee in the package.

### Evidence is factual; policy is interpretive; the consumer judges

See [Evidence, policy rationale, and consumer judgment](#evidence-policy-rationale-and-consumer-judgment)
for the full treatment. In brief: `CheckEvidence` records facts and never interprets them; a
`policy` returns `{ outcome, rationale }` as the repository's interpretation; `runRepoContract()`
returns both `evidence` and `verdict` so the caller can weigh them together.

### Every configured check gets exactly one terminal result and one policy call

Every configured check ends with a well-formed `CheckEvidence` entry carrying a terminal
[`status`](#status-classification), and every configured check's policy is invoked exactly once
per run — including checks that never spawned because the run was aborted while they were still
queued. See [Status classification](#status-classification).

### Consumer callbacks cannot corrupt the run

`policy` is the only function a consumer hands the package to invoke. Every invocation is wrapped
so that a synchronous throw, a rejected promise, or a malformed return value becomes a typed
error rather than a corrupted verdict. See [Policy failure isolation](#policy-failure-isolation).

### Commands never invoke a shell by default

`config/tokenize-command.ts` turns a `run` string into argv without a shell; unquoted
shell/multi-command operators are rejected as configuration errors. `shell: true` is an explicit
per-check opt-in. See [Command execution](#command-execution) and [SECURITY.md](../SECURITY.md).

### The whole process tree is cleaned up

A timed-out, aborted, or host-terminated check has its entire descendant process tree killed,
not just the process repo-contract spawned directly. See [Process-tree cleanup](#process-tree-cleanup).

### The shipped surface makes no network calls

Nothing in `src/**` opens a socket, and that is mechanically enforced by a check (an ESLint rule
plus an independent, ESLint-free repository check), not merely documented. See
[ADR 0007](decisions/0007-no-network-surface.md) and [SECURITY.md](../SECURITY.md).

### The public API is exactly three curated barrels

`src/index.ts`, `src/presets/index.ts`, and `src/helpers/index.ts` are the entire public surface.
A symbol is public only if one of those three explicitly re-exports it. See
[Module layout](#module-layout).

## Execution phase

`execution/run-checks.ts` runs every configured check through `execution/spawn-check.ts`, which
owns one process end to end: spawn, stdout/stderr capture, timeout, abort, termination, and
terminal-status classification. The execution layer never interprets whether a non-zero exit code
is good or bad — that is the policy's job.

### Concurrency and declaration order

Checks with no scheduling constraint run through `execution/concurrency-pool.ts`'s bounded
`runWithConcurrency`. Declaration order in the `checks` object is the required topological order,
not cosmetic: a check is launched in declaration order and runs concurrently with whatever is
declared around it, bounded by `concurrency`, except where `dependsOn` or `isolated` says
otherwise. See [ADR 0002](decisions/0002-dependson-and-isolated-are-two-scheduling-primitives.md).

### `dependsOn`

A check's `dependsOn: readonly string[]` names other check ids that must reach a terminal status
before this check's own process is spawned — execution ordering only, never a policy-outcome
gate: whether a dependency's _policy_ passed is never consulted to decide whether a dependent
spawns. Every named id must be declared _earlier_ in the `checks` object than the check declaring
`dependsOn` on it — a forward reference throws `DependencyDeclaredLaterError` synchronously,
before anything spawns; a cycle is consequently impossible, since no edge can ever point forward.

This lives entirely inside the execution phase: it changes _when within that phase_ a check's
process spawns, nothing about the phase boundary itself. `run-checks.ts` schedules a graph via
`execution/dependency-scheduler.ts`'s `runWithConcurrencyGraph` (a reactive,
dependency-respecting sibling of the flat `runWithConcurrency`) when any check declares a
non-empty `dependsOn` or `isolated: true`; the default fully-disconnected graph takes the same
`runWithConcurrency` path as before this feature existed. A dependent's policy reads its
dependencies' evidence via `ctx.dependencies` — a convenience view derived from the
already-assembled `Evidence`, not new persisted data. See
[ADR 0002](decisions/0002-dependson-and-isolated-are-two-scheduling-primitives.md), including why
this required no changes to policy evaluation itself.

### `isolated`

A check's `isolated: boolean` (default `false`) is a deliberately separate primitive from
`dependsOn` — pure scheduling exclusivity, not an evidence dependency. When `true`, the check is a
full barrier at its own declared position: it does not spawn until every check declared _earlier_
has reached a terminal status, and every check declared _after_ it — isolated or not — waits for
it in turn, so nothing overlaps it in either direction.

Unlike `dependsOn`, it names no other check by id, so it lives on `CheckDefinitionConfig` and can
be declared directly in a check's own file rather than needing assembly-time context. Two
isolated checks in the same run are therefore always sequential relative to each other. It is
never merged into the check's own `dependsOn` array and never appears in `ctx.dependencies` — a
check that is merely isolated has expressed no need for any other check's evidence, only for the
machine to itself (e.g. tooling that spawns its own concurrent worker processes). It also does
not affect `resolveCheckDependencies`'s transitive closure for a partial `options.checks` run —
requesting just the isolated check runs just that check, even if it is declared after another
isolated barrier.

A common use of this positional barrier: declare every file-writing check first, then one
`isolated: true` "build" check, then every read/report-only check — the readers wait for the
build with zero per-check `dependsOn` wiring, purely from where they are declared. See
[ADR 0002](decisions/0002-dependson-and-isolated-are-two-scheduling-primitives.md).

### Status classification

Each check's terminal `status` is derived with this priority, in `spawn-check.ts`:

1. the run-level `AbortSignal` fired and triggered the kill → `"aborted"`
2. the check's own `timeoutMs` fired → `"timed_out"`
3. the _host_ process running repo-contract received SIGINT/SIGTERM, which killed every in-flight
   check as cleanup → `"host_terminated"` — repo-contract requested this signal too, just not via
   `options.signal`/`timeoutMs`, so it must not be conflated with an externally-caused
   `"signaled"` below
4. the process exited via a signal repo-contract did not request → `"signaled"`
5. spawning itself failed, no pid was ever obtained → `"spawn_error"`
6. otherwise → `"completed"` (the exit code may still be non-zero — that is for the policy to
   interpret, never this package; see
   [ADR 0001](decisions/0001-execution-and-policy-are-a-strict-sequential-contract.md))

A check still queued behind the concurrency limit when the run is aborted never spawns, but still
receives a well-formed `status: "aborted"` evidence entry — so every configured check's policy is
invoked exactly once, for every run, regardless of whether that check ever actually ran.

### Why capture resolves on `"close"`, not `"exit"`

`spawn-check.ts` resolves a check's evidence on the child process's `"close"` event, not
`"exit"`. Node's own documentation warns that `"exit"` can fire before a child's stdio streams
have finished delivering their final buffered data — resolving on `"exit"` risks silently
truncating `stdout`/`stderr` for a process that writes a lot of output right before exiting. This
was not hypothetical: it was caught during implementation against `secretlint`'s own CLI, whose
`bin/secretlint.js` calls `console.log(largeJsonString)` immediately followed by
`process.exit(exitStatus)` with no flush wait, which reliably truncated captured stdout at ~64KB.
`"close"` fires only after every stdio stream has ended and still carries the same
`(code, signal)` pair `"exit"` does. See
[ADR 0008](decisions/0008-self-hosting-tool-and-dependency-choices.md).

### Process-tree cleanup

`execution/process-tree.ts`'s `killTree` terminates an entire process tree, not just the
directly-spawned process, because a check's command is often itself a wrapper (`npm test` spawns
`npm`, which spawns the real test runner) — `spawn`'s own `timeout`/`signal` options only ever
affect the directly spawned process. On POSIX, this sends the signal to the whole process group
via the negative-pid convention (the process is spawned with `detached: true` specifically to
become a process-group leader). On Windows, process groups do not work the same way, so this
shells out to `taskkill /pid <pid> /t /f` instead — the same technique `tree-kill` uses
internally. A consumer targeting Windows can supply `killProcessTree` (a synchronous spawner) so
the taskkill call itself is routed the same way as their `spawn`. See
[ADR 0003](decisions/0003-cross-platform-command-execution-and-process-cleanup.md).

## Evidence, policy rationale, and consumer judgment

Three distinct questions get answered at three distinct points in the pipeline, and the package
deliberately keeps them from collapsing into one:

- **Evidence answers "what happened?"** — `CheckEvidence` (command, args, exit code, signal,
  timing, captured stdout/stderr, parsed output, `status`). Facts only; no interpretation. A
  non-zero exit code is `status: "completed"`, not an execution error.
- **Policy rationale answers "what does the repository's policy conclude about what happened?"** —
  every check's `policy` returns a `PolicyResult`
  (`{ outcome: "pass" | "fail" | "warn", rationale: string }`, `src/types.ts`), not a bare
  boolean or string. `outcome` is the policy's own repository-owned judgment given its configured
  requirements; `rationale` is mandatory and must carry enough actionable detail (specific
  file/line locations, rule ids, test names, counts) that a consumer never has to rerun a command
  or re-parse raw output to understand why. `"warn"` exists specifically so a policy that is
  technically satisfied can still flag a condition worth a closer look — it is not a weaker
  `"fail"`; it never fails `Verdict.passed` (see `run-policies.ts`).
- **Consumer judgment answers "given the evidence and the policy interpretation, what should I
  ultimately decide?"** — the policy's `outcome` is not the final word. `runRepoContract()`'s
  caller (a CI script, a human reviewer, an AI agent) still makes the final call, informed by
  both `evidence.checks[id]` and `verdict.checks[id]` together — which is exactly why both stay
  available on the returned object rather than one being derived away.

### The `Evidence` object

`evidence/build-evidence.ts` turns completed check results into the versioned `Evidence`
structure. Parsed output is attached only when a check explicitly requests a format via `output`;
otherwise `result.output` is `undefined` and only raw `stdout`/`stderr` are available. The
assembled object contains one entry for every configured check. See the
[API reference](https://maverickcer.github.io/repo-contract/api/) for the field-by-field shape of
`Evidence`, `CheckEvidence`, and `Verdict`.

### Output parsing

`parsing/parse-output.ts` dispatches a requested `output.format` to one of three parsers:
`parse-json.ts` (`JSON.parse`; a malformed result is preserved as `{ success: false, error }`,
never thrown), `parse-text.ts` (trimmed passthrough, always succeeds), and `parse-yaml.ts` (via
the optional `yaml` peer dependency, only loaded when YAML is requested). A policy therefore
receives explicit evidence about a parse failure rather than fabricated or ambiguous output.
`output.schema` (any [Standard Schema](https://standardschema.dev)) can additionally validate and
reshape the parsed value; a schema _returning_ failure issues becomes an ordinary
parser-error-shaped result, while a schema that itself _throws_ rejects the run with
`StandardSchemaValidateThrewError`. See
[ADR 0012](decisions/0012-hand-vendored-standard-schema-support-for-optional-output-validation.md).

## Policy phase

`policy/run-policies.ts` invokes every configured policy against the complete evidence, isolates
each invocation from the others, and aggregates the `PolicyResult` values into the final
`Verdict`. `Verdict.passed` is `true` only when every outcome is `"pass"` or `"warn"`; `"fail"`
is the only outcome that fails the run.

### `PolicyResult` is plain data

`PolicyResult` is deliberately a plain, JSON-serializable object (string `outcome`, string
`rationale`, nothing else) — never an `Error`, a class instance, or a tool-specific report shape
— so it can be persisted, transmitted between processes, aggregated across the parallel checks,
and consumed directly by a human or an AI without any package-specific deserialization step. See
[ADR 0001](decisions/0001-execution-and-policy-are-a-strict-sequential-contract.md), including
why `outcome`/`rationale` replaced an earlier `true | string` return type.

### Policy failure isolation

Every `policy` invocation is wrapped so that neither a synchronous throw, a later promise
rejection, nor a malformed return value can corrupt the run: the call is wrapped in `try`/`catch`,
its returned value is `await`-ed inside that same `try`, and the resolved value is then validated
against the `PolicyResult` contract itself (`outcome` is exactly `"pass"`, `"fail"`, or `"warn"`;
`rationale` is a string) before it is trusted. This validation matters because `Verdict.passed`
is computed by comparing `outcome` against `"fail"`, so an unvalidated garbage value (a typo'd
literal, or any value at all from a JavaScript consumer with no compiler enforcing the contract)
would otherwise be silently treated as non-failing instead of surfacing as the bug it is.

Each of these three failure modes is wrapped in an error, with the original thrown value — or a
descriptive validation error, for a malformed result — preserved via the native `cause` chain,
never stringified or discarded. Two specific, common mistakes get a more actionable error
subclass instead of the generic `PolicyThrewError`, chosen by `wrapPolicyFailure`
(`run-policies.ts`): reading a `result.output` property on a check that never requested a format
(`PolicyReadUnrequestedOutputError`), and reading `result.output.value` on a check whose
requested parse actually failed (`PolicyReadFailedParseValueError`) — both still extend
`RepoContractError` directly and preserve the original `TypeError` via `cause`.

One policy failing this way never stops any other check's policy from running (`run-policies.ts`
isolates each invocation independently inside a `Promise.all`). If more than one policy fails this
way in the same run, `runRepoContract()` rejects with a native `AggregateError` holding one such
error (of whichever subclass applies) per failing check, rather than surfacing only the first.

## Consumer-supplied capabilities

repo-contract never imports a process-spawning implementation or reads `process.env` itself. The
consumer supplies both on the config:

```ts
defineRepoContract({ spawn, env: process.env, checks: {/* ... */} })
```

They are trusted capabilities: repo-contract calls `spawn` with a resolved command/argv/options
and does not inspect, wrap, or sanitize it, and reads `env` only as the environment to pass
through. This makes the process and environment capabilities explicit at the integration
boundary — the repository controls what the contract can do — and keeps the package itself free
of ambient authority (verified against the published tarball by
`scripts/verify-no-ambient-capabilities.mjs`). On macOS and Linux, Node's native
`child_process.spawn` is sufficient; a consumer targeting Windows supplies a compatible
implementation such as `cross-spawn` (and optionally `killProcessTree` for process-tree cleanup).
`shell` is a separate, independent opt-in and does not follow from the spawner choice. See
[ADR 0011](decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md)
and [SECURITY.md](../SECURITY.md).

## Command execution

`config/tokenize-command.ts` splits a `run` string into argv without ever invoking a shell.
Quoting (`'...'` / `"..."`) groups whitespace into one token; `\` escapes the next character.
Unquoted occurrences of true shell/multi-command operators (`;`, `&`, `|`, backtick, `$(`, `<`,
`>`, newline) are rejected as a configuration error. Glob characters (`*`, `?`, `~`, `[`, `]`,
`{`, `}`) and a bare `$` are deliberately _not_ rejected — many CLI tools expand their own
arguments, and each argument is passed as its own separately-escaped element, so those characters
create no injection behavior. An array `run` bypasses tokenization entirely and is used as argv
verbatim. `shell: true` hands the string to the platform shell as-is and must never be
constructed from untrusted input. See
[ADR 0003](decisions/0003-cross-platform-command-execution-and-process-cleanup.md) for why an
earlier, broader rejection list was wrong, and [SECURITY.md](../SECURITY.md) for the full threat
model.

## Type-system boundaries

`CheckDefinition` is deliberately **not** generic over its `output.format`. An earlier design
attempted to carry each check's own literal format through to that same check's `policy`
parameter type (so `output: { format: "text" }` would type `result.output.value` as `string`,
not `unknown`). This does not reliably work in TypeScript for a `Record` of heterogeneous generic
entries once a callback property (`policy`) is also present — confirmed via isolated repro during
implementation, not assumed. `result.output.value` is `unknown` for every format; a policy author
narrows or casts it themselves.

The genuinely valuable part of the type system is unaffected: `evidence.checks` / `verdict.checks`
are keyed and typed per configured check id, so `evidence.checks.mutation` autocompletes and
`evidence.checks.doesNotExist` is a compile error. That does not depend on per-check generic
parameters. See
[ADR 0001](decisions/0001-execution-and-policy-are-a-strict-sequential-contract.md).

## Module layout

The implementation is organized by architectural responsibility, and the dependency direction is
strictly one-way — `config -> execution -> evidence -> policy`, composed by `run-repo-contract.ts`:

```text
src/
  index.ts            curated public barrel -- the only file consumers import from
  types.ts            all exported types; also the source ts-json-schema-generator reads
  errors.ts           the RepoContractError hierarchy
  config/
    tokenize-command.ts      run: string -> argv, no shell, deterministic
    validate-config.ts       structural validation, throws before anything spawns
    define-repo-contract.ts  identity function, exists for type inference only
  execution/
    spawn-check.ts           one check end to end: spawn, timeout, abort, capture
    process-tree.ts          killTree() -- POSIX process-group / Windows taskkill
    concurrency-pool.ts      bounded-parallelism primitive, no domain knowledge
    dependency-scheduler.ts  runWithConcurrencyGraph() -- same, plus dependsOn ordering
    abort-signals.ts         composeSignals() -- native AbortSignal.any with a manual fallback
    run-checks.ts            fans spawn-check.ts out over every configured check
  parsing/
    parse-output.ts          dispatches to one of the three parsers below by OutputFormat
    parse-json.ts            stdout -> JSON, failure preserved as data, never throws
    parse-text.ts            stdout -> trimmed string, always succeeds
    parse-yaml.ts            stdout -> YAML via the optional `yaml` peer dependency
  evidence/
    build-evidence.ts        attaches parsed output; assembles the versioned Evidence object
  policy/
    run-policies.ts          invokes every policy; aggregates the Verdict
  run-repo-contract.ts       composes the four stages above
  presets/
    index.ts                 second, independent curated barrel -- repo-contract/presets
    shared/                  internal helpers shared across presets, never re-exported
  helpers/
    index.ts                 third, independent curated barrel -- repo-contract/helpers
    exception-policy.ts      the generic exception-policy primitive (resolve/evaluate/hash)
    load-exception-registry.ts  reads + validates one exception registry file's envelope
```

Nothing outside `src/index.ts`'s explicit re-export list is part of the public API, regardless of
whether a given file happens to `export` a symbol — it is a curated barrel, not an automatic one.
`src/presets/index.ts` is a second, independent curated barrel published under its own `./presets`
subpath (see
[ADR 0004](decisions/0004-public-surface-stays-narrow-no-cli-experimental-presets.md)) — presets
are never re-exported from the root barrel, and the root barrel is never re-exported from presets.
`src/helpers/index.ts` is a third such barrel, published under `./helpers` (see
[ADR 0013](decisions/0013-reusable-exception-policy-helper.md)) — a generic, reusable
exception-policy primitive that decides nothing and matches nothing on its own; it never
re-exports from, or is re-exported by, either of the other two. `scripts/schema-types.ts` exists
solely as a target for `ts-json-schema-generator` (see
[ADR 0008](decisions/0008-self-hosting-tool-and-dependency-choices.md)); it is not part of the
runtime.

`bin/` is a fourth top-level module, a sibling of `src/`, not a layer within it — published as
this package's one executable surface (`repo-contract init`, see
[ADR 0004](decisions/0004-public-surface-stays-narrow-no-cli-experimental-presets.md)'s
2026-09-09 amendment). It is the first hand-written, unbundled top-level JS this package has ever
published: not compiled by tsup, not routed through `src/index.ts`, and it imports nothing from
`src/` — only `node:fs`/`node:path`. It writes files; it never executes the pipeline above.

## Self-hosting

This repository's own `repo-contract.config.ts` uses the package's real public API to validate
itself — one check per verification category in
[specs/verification-taxonomy.md](verification-taxonomy.md), each a real command with a real
policy. `repo-contract.config.ts`'s own `checks` record is the authoritative, current list of
check ids (an enumeration here would only drift as checks are added or renamed). See
`CONTRIBUTING.md` for how to run it,
[ADR 0008](decisions/0008-self-hosting-tool-and-dependency-choices.md) for how the CRAP and
secret-scanning tools were selected, and
[ADR 0005](decisions/0005-independent-verification-boundaries-coverage-is-a-union.md) for how the
Vitest-based categories' independent execution boundaries and aggregate coverage are structured.

`specs/verification-taxonomy.md` is the canonical reference for _what each verification category
establishes_ (unit / integration / property / e2e / architecture, plus how they relate to the
static-analysis / coverage / mutation / dependency-analysis / API-compatibility checks) — this
document describes how the package itself is built; that one describes what the repository
verifies and why each category is distinct.

## Architectural decisions

The ADRs in [`specs/decisions/`](https://github.com/MaverickCER/repo-contract/tree/main/specs/decisions)
carry the reasoning behind the constraints above. The ones this document leans on directly:

- [ADR 0001 — Execution and policy are a strict sequential contract](decisions/0001-execution-and-policy-are-a-strict-sequential-contract.md)
- [ADR 0002 — `dependsOn` and `isolated` are two scheduling primitives](decisions/0002-dependson-and-isolated-are-two-scheduling-primitives.md)
- [ADR 0003 — Cross-platform command execution and process cleanup](decisions/0003-cross-platform-command-execution-and-process-cleanup.md)
- [ADR 0004 — Public surface stays narrow; no CLI](decisions/0004-public-surface-stays-narrow-no-cli-experimental-presets.md)
- [ADR 0005 — Independent verification boundaries; coverage is a union](decisions/0005-independent-verification-boundaries-coverage-is-a-union.md)
- [ADR 0007 — No network surface](decisions/0007-no-network-surface.md)
- [ADR 0008 — Self-hosting tool and dependency choices](decisions/0008-self-hosting-tool-and-dependency-choices.md)
- [ADR 0011 — Process spawning and environment access are consumer-supplied capabilities](decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md)
- [ADR 0012 — Hand-vendored Standard Schema support for optional output validation](decisions/0012-hand-vendored-standard-schema-support-for-optional-output-validation.md)
- [ADR 0013 — Reusable exception-policy helper](decisions/0013-reusable-exception-policy-helper.md)

## Related documentation

- [README](../README.md) — product overview, adoption, and a minimal first contract
- [GUIDE](../GUIDE.md) — integration and full usage reference
- [SECURITY](../SECURITY.md) — the execution and capability threat model
- [verification-taxonomy](verification-taxonomy.md) — what this repository verifies
- [API reference](https://maverickcer.github.io/repo-contract/api/) — the generated public API
