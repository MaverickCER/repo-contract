# 0001: Execution and policy evaluation form a strict, sequential contract

## Status

Accepted. Implemented in `src/run-repo-contract.ts`, `src/evidence/build-evidence.ts`,
`src/policy/run-policies.ts`.

## Context

A policy needs to be able to read the full run's evidence, including sibling checks, so a policy
like "only enforce the mutation-score threshold if the tests passed" is expressible without the
package itself understanding what "tests passing" means. That requires every check's evidence to
exist before any policy runs — which rules out the tempting alternative of invoking each check's
policy as soon as its own process resolves, streaming results as they complete.

Separately: a check's process can end in several distinct terminal states — a normal exit
(possibly non-zero), a timeout, an abort, an external signal, or a failure to spawn at all. The
package needs one consistent rule for which of these are the policy's problem to interpret.

## Decision

`runRepoContract` composes strictly as `runChecks → buildEvidence → runPolicies`: three fully
sequential phases, no interleaving. Every check finishes and has its evidence assembled into one
immutable object before any policy is invoked.

The package draws no line itself on what counts as failure. Every configured check's policy is
invoked exactly once, no matter which terminal state its evidence reflects. `CheckEvidence.status`
records _why_ the process ended up where it did; that field is informational, not a package-level
judgment about acceptability. A policy checking `result.exitCode === 0` naturally treats a timeout
or spawn failure as a failure too, since `exitCode` is `null` in both cases — zero special-casing
required.

## Consequences

- A policy can safely read a sibling check's evidence with zero race risk, by construction — no
  execution is still in flight by the time any policy runs.
- No live-streaming-progress API is possible in this form. This is a deliberate trade, not an
  oversight: the real wall-clock cost of a run is in execution (spawning and waiting on real
  processes), not the policy phase, which is pure in-process JS with no I/O.
- A check still queued behind the concurrency limit when a run is aborted still receives a
  well-formed evidence entry and still has its policy invoked — the package never decides on the
  consumer's behalf whether "the run was aborted" counts as a failure.

## Alternatives considered

- **Interleaved per-check policy evaluation** (invoke a check's policy the moment its own process
  resolves): rejected — it would either forbid cross-check policies entirely, contradicting a
  requirement this design exists to satisfy, or accept that a cross-check policy might read a
  sibling's evidence before that sibling has actually finished, producing results that silently
  depend on scheduling.
- **Auto-failing non-"completed" statuses without invoking the policy**: rejected as exactly the
  kind of package-imposed quality judgment this design forbids — deciding a timeout is _always_ a
  failure is itself an opinion about acceptability, not a neutral fact.
