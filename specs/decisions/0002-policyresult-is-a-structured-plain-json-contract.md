# 0002: `PolicyResult` is a structured, plain-JSON contract

## Status

Accepted. Implemented in `src/types.ts` (`PolicyOutcome`, `PolicyResult`, `Policy`),
`src/policy/run-policies.ts`, `src/errors.ts`.

## Context

Every policy originally returned `true | string`: `true` to pass, a string explaining why not to
fail. This had two structural problems. First, a passing policy had no way to say anything — a
policy that found a low-severity issue but chose not to block on it had no vocabulary for
surfacing that once it decided to pass; the only alternative was to fail, a different decision
entirely. Second, a freeform failure string is not a machine-readable contract: nothing stopped a
policy from writing something as useless as "see output above" — and since every check's policy
runs independently and in parallel, a `Verdict` entry can never lean on context from elsewhere in
the run's output.

## Decision

Every policy returns `{ outcome: "pass" | "fail" | "warn", rationale: string }`.

`outcome` replaces the boolean; `"pass"`/`"fail"` mean what they did before. `"warn"` is new: the
evidence doesn't violate the policy's blocking requirements, but the policy wants the condition
surfaced anyway. `"warn"` never fails the aggregate verdict — it is not a softer `"fail"`, and
using it as one misrepresents the policy's own decision.

`rationale` is now mandatory for every outcome, including `"pass"`, and must carry enough
actionable detail — specific locations, rule ids, counts — that a consumer understands the
`outcome` without rerunning the check or re-parsing raw output.

`PolicyResult` is a plain, JSON-serializable object by construction — never an `Error`, a class
instance, or a tool-specific report shape. This is what makes a verdict persistable (CI artifacts,
PR comments, history) with no package-specific deserialization step, without the package itself
doing any persistence.

A related, deliberate limitation lives in the same neighborhood: a check's parsed
`result.output.value` stays typed as `unknown` for every output format, never inferred per-check.
An earlier design tried to carry a check's own literal output format through to its policy
parameter's type; this does not reliably work in the language's type system for a record of
heterogeneous entries once a sibling callback property is also present — confirmed via an isolated
reproduction, not assumed. A policy author narrows or casts the value themselves, exactly as they
already must for formats with no schema knowledge either way.

## Consequences

- `Verdict.checks[id]` is now the `PolicyResult` itself, replacing an earlier `{ passed, reason? }`
  shape — a breaking change to that surface, acceptable pre-1.0.
- Whether a given non-blocking observation deserves `"warn"` or a plain `"pass"` is a
  repository-owned policy decision the package does not make on the author's behalf — the same way
  it has never decided what makes a check pass or fail.
- The precise, per-check-id keying of `evidence.checks`/`verdict.checks` (so a known check id
  autocompletes and an unknown one is a compile error) is unaffected by the `output.value`
  limitation above — that guarantee doesn't depend on per-check generic parameters.

## Alternatives considered

- **Merging evidence and policy result into one combined per-check object**: rejected — evidence
  describes what happened, independent of any policy's interpretation of it, and a consumer may
  reasonably want one without the other (e.g. persisting raw evidence for trend analysis
  regardless of a given run's thresholds).
- **Keeping a redundant `passed: boolean` alongside the new outcome field**: rejected as a
  confusing shim — a boolean that would have to read `true` next to an outcome that isn't literally
  `"pass"` (the `"warn"` case) is more confusing than not having it.
- **`const` type parameters, and other generic-inference techniques, to preserve per-check output
  typing**: tried in combination; none fixed the underlying inference gap for a record of
  heterogeneous generic entries once a sibling callback property is involved.
