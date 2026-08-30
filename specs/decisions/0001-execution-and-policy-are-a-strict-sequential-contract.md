# 0001: Execution, evidence, and policy evaluation form a strict, sequential contract

## Status

Accepted. Implemented in `src/run-repo-contract.ts`, `src/evidence/build-evidence.ts`,
`src/policy/run-policies.ts`, `src/types.ts` (`PolicyOutcome`, `PolicyResult`, `Policy`),
`src/errors.ts`.

## Context

Two questions about the boundary between running checks and judging them share one answer and
are recorded together here.

**Phase ordering.** A policy needs to be able to read the full run's evidence, including sibling
checks, so a policy like "only enforce the mutation-score threshold if the tests passed" is
expressible without the package itself understanding what "tests passing" means. That requires
every check's evidence to exist before any policy runs — which rules out the tempting
alternative of invoking each check's policy as soon as its own process resolves, streaming
results as they complete. Separately, a check's process can end in several distinct terminal
states — a normal exit (possibly non-zero), a timeout, an abort, an external signal, or a
failure to spawn at all — and the package needs one consistent rule for which of these are the
policy's problem to interpret.

**Policy return shape.** Every policy originally returned `true | string`: `true` to pass, a
string explaining why not, to fail. This had two structural problems. First, a passing policy
had no way to say anything — a policy that found a low-severity issue but chose not to block on
it had no vocabulary for surfacing that once it decided to pass; the only alternative was to
fail, a different decision entirely. Second, a freeform failure string is not a machine-readable
contract: nothing stopped a policy from writing something as useless as "see output above" —
and since every check's policy runs independently and in parallel, a `Verdict` entry can never
lean on context from elsewhere in the run's output.

## Decision

**Strict sequential phasing.** `runRepoContract` composes strictly as
`runChecks → buildEvidence → runPolicies`: three fully sequential phases, no interleaving. Every
check finishes and has its evidence assembled into one immutable object before any policy is
invoked.

The package draws no line itself on what counts as failure. Every configured check's policy is
invoked exactly once, no matter which terminal state its evidence reflects. `CheckEvidence.status`
records _why_ the process ended up where it did; that field is informational, not a
package-level judgment about acceptability. A policy checking `result.exitCode === 0` naturally
treats a timeout or spawn failure as a failure too, since `exitCode` is `null` in both cases —
zero special-casing required.

**`PolicyResult` is a structured, plain-JSON contract.** Every policy returns
`{ outcome: "pass" | "fail" | "warn", rationale: string }`.

`outcome` replaces the boolean; `"pass"`/`"fail"` mean what they did before. `"warn"` is new:
the evidence doesn't violate the policy's blocking requirements, but the policy wants the
condition surfaced anyway. `"warn"` never fails the aggregate verdict — it is not a softer
`"fail"`, and using it as one misrepresents the policy's own decision.

`rationale` is now mandatory for every outcome, including `"pass"`, and must carry enough
actionable detail — specific locations, rule ids, counts — that a consumer understands the
`outcome` without rerunning the check or re-parsing raw output.

`PolicyResult` is a plain, JSON-serializable object by construction — never an `Error`, a class
instance, or a tool-specific report shape. This is what makes a verdict persistable (CI
artifacts, PR comments, history) with no package-specific deserialization step, without the
package itself doing any persistence.

A related, deliberate limitation lives in the same neighborhood: a check's parsed
`result.output.value` stays typed as `unknown` for every output format, never inferred
per-check. An earlier design tried to carry a check's own literal output format through to its
policy parameter's type; this does not reliably work in the language's type system for a record
of heterogeneous entries once a sibling callback property is also present — confirmed via an
isolated reproduction, not assumed. A policy author narrows or casts the value themselves,
exactly as they already must for formats with no schema knowledge either way.

## Consequences

- A policy can safely read a sibling check's evidence with zero race risk, by construction — no
  execution is still in flight by the time any policy runs.
- No live-streaming-progress API is possible in this form. This is a deliberate trade, not an
  oversight: the real wall-clock cost of a run is in execution (spawning and waiting on real
  processes), not the policy phase, which is pure in-process JS with no I/O.
- A check still queued behind the concurrency limit when a run is aborted still receives a
  well-formed evidence entry and still has its policy invoked — the package never decides on the
  consumer's behalf whether "the run was aborted" counts as a failure.
- `Verdict.checks[id]` is now the `PolicyResult` itself, replacing an earlier
  `{ passed, reason? }` shape — a breaking change to that surface, acceptable pre-1.0.
- Whether a given non-blocking observation deserves `"warn"` or a plain `"pass"` is a
  repository-owned policy decision the package does not make on the author's behalf — the same
  way it has never decided what makes a check pass or fail.
- The precise, per-check-id keying of `evidence.checks`/`verdict.checks` (so a known check id
  autocompletes and an unknown one is a compile error) is unaffected by the `output.value`
  limitation above — that guarantee doesn't depend on per-check generic parameters.

## Alternatives considered

- **Interleaved per-check policy evaluation** (invoke a check's policy the moment its own
  process resolves): rejected — it would either forbid cross-check policies entirely,
  contradicting a requirement this design exists to satisfy, or accept that a cross-check policy
  might read a sibling's evidence before that sibling has actually finished, producing results
  that silently depend on scheduling.
- **Auto-failing non-"completed" statuses without invoking the policy**: rejected as exactly the
  kind of package-imposed quality judgment this design forbids — deciding a timeout is _always_
  a failure is itself an opinion about acceptability, not a neutral fact.
- **Merging evidence and policy result into one combined per-check object**: rejected — evidence
  describes what happened, independent of any policy's interpretation of it, and a consumer may
  reasonably want one without the other (e.g. persisting raw evidence for trend analysis
  regardless of a given run's thresholds).
- **Keeping a redundant `passed: boolean` alongside the new outcome field**: rejected as a
  confusing shim — a boolean that would have to read `true` next to an outcome that isn't
  literally `"pass"` (the `"warn"` case) is more confusing than not having it.
- **`const` type parameters, and other generic-inference techniques, to preserve per-check
  output typing**: tried in combination; none fixed the underlying inference gap for a record of
  heterogeneous generic entries once a sibling callback property is involved.
