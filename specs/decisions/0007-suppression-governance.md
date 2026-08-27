# 0007: Suppression governance — centrally-inventoried, policy-gated disable comments

## Status

Accepted. Implemented in `scripts/suppression-governance/*.ts`, `checks/suppression-governance.ts`,
`checks/mutation.ts`. Registry: `disable-comments.json` (repository root).

## Context

Inline suppression comments (a linter disable, a type-checker ignore, a mutation-testing
suppression) are a normal, necessary escape hatch. What no ordinary check provides is a guarantee
that those suppressions are _centrally inventoried and durably justified_ — a suppression comment
is trivial to add, easy to lose track of, and, especially with AI-assisted development able to
generate plausible-looking justification text quickly, an easy way for a real guardrail to be
silently bypassed without leaving a trail a reviewer would actually notice. The goal is not to
forbid suppressions; it's to guarantee every one of them is visible somewhere a human or a policy
can actually judge it.

## Decision

Every suppression comment in governed source is tracked in a committed registry, discovered via
the language's own compiler scanner rather than the linter itself — this system must be able to
audit a suppression that caused the linter to be bypassed in the first place, so its own discovery
cannot depend on the linter succeeding, or even running.

Each record's policy resolves to one of three modes: **forbidden** (never permitted), **allowed**
(permitted unconditionally), or **exception** (permitted only once every field a rule's policy
names is filled in with real, non-empty prose). This deliberately replaced an earlier design that
modeled "how much justification does this need" as a numeric threshold — in practice, a plain
count is trivially satisfied by generating enough generic-sounding filler entries without doing any
of the underlying work the count was meant to prove happened. Named, individually-reviewable prose
fields don't make low-effort filler impossible — no static check can verify prose is _true_ — but
each field is now reviewable against a specific question, not an undifferentiated count.

Two further classification fields exist for the same reason and are subject to the same rule:
hand-authored, closed enumerations (what kind of suppression this is; how the underlying claim was
substantiated), never auto-inferred from the suppression comment's own text — a classification a
tool derives mechanically from prose is exactly as gameable as the prose itself.

Records are matched to source by an identity independent of these prose/classification fields, so
that reclassifying a suppression can never accidentally look like a different suppression and wipe
out its own justification on the next run. An ambiguous move (more than one candidate on either
side of a reconciliation pass) is never resolved by proximity or any other heuristic — every such
candidate falls through to a fresh "new" record instead, since an automated registry that could
silently transfer justification between two different suppressions would itself be a way to defeat
the whole point of the check.

The mutation-testing check separately cross-verifies every relevant suppression in this registry as
a single, registry-wide gate before trusting any mutant dismissed purely on a comment's say-so —
Stryker's own report gives no reliable way to attribute one specific ignored mutant back to one
specific disable comment, so the check instead requires the _entire_ relevant slice of the registry
to be adequately justified whenever at least one mutant is trusted on a comment's strength alone.

## Consequences

- No suppression can silently bypass a guardrail without appearing somewhere durable and
  reviewable — the registry is committed, not ephemeral.
- Every field a policy requires must be non-empty before the suppression is permitted; this is
  intentionally the check that fails hardest and most visibly among this repository's self-hosting
  checks, since a low-effort suppression is exactly the failure mode it exists to catch.
- Observed directly in practice, not just in theory: implementing an unrelated self-hosting check
  triggered two real security-rule findings. The fast path (add a suppression, backfill three prose
  fields) was available; the actual fix rewrote the flagged code to avoid the pattern entirely,
  adding zero new suppressions. The cost of a suppression here was never the disable comment
  itself — it was the next step, writing prose that would have to hold up under review — and that
  cost changed the outcome.

## Alternatives considered

- **A numeric "N justification entries required" threshold**: the original design, superseded
  during implementation for the reason described above — a count is satisfied the moment enough
  entries exist, regardless of content.
- **Parsing suppressions via the linter's own rule-comment API** instead of the language's compiler
  scanner: rejected — this system must be able to audit a suppression that caused the linter itself
  to be bypassed, so its own discovery cannot depend on the linter running successfully, or at all.
- **Resolving an ambiguous suppression move by nearest-line heuristics**: rejected outright — it
  would let an automated governance registry silently transfer justification between two different
  suppressions just because they happen to be near each other, exactly the kind of silent bypass
  this system exists to prevent.
