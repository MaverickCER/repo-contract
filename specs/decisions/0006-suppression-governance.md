# 0006: Suppression governance — centrally-inventoried, policy-gated disable comments

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

## Amendment (2026-09-07): verification, not attestation

`specs/decisions/0013-reusable-exception-policy-helper.md` generalized this registry's own
exact/pattern/domain/global precedence and field-completeness engine into
`repo-contract/helpers`, and `security-socket`/`coderabbitai`/`security-network` all built on it
with one further gate this registry did not originally have: a **content-bound verification**
block. This amendment brings that same gate to `disable-comments.json`.

**The gap.** Every field this ADR's original design named —
`justification`/`alternatives`/`remediation`/`category`/`verificationMethod` — is self-reported by
the same actor who wants the suppression permitted. `verificationMethod` in particular _names_ a
verification technique (`mutation-run`, `existing-test-suite`, ...) but nothing ever checks that
the technique was actually applied to this specific record's claim. That is attestation, not
enforcement — proving a suppression was _described_, never that it was _examined_ — precisely the
weakness `specs/decisions/0013-reusable-exception-policy-helper.md`'s "Verification, not
attestation" section identifies and fixes for the other checks built on the same primitive.

**The fix.** `DisableCommentRecord` gains three more hand-authored fields, filled in and preserved
across reruns exactly like the five above them:

- `verifiedBy` — who (or what mechanical process) signed off.
- `verifiedAt` — an ISO 8601 timestamp of the sign-off (informational; validated for shape, never
  itself a policy requirement).
- `verifiedContentHash` — `hashRequirementFields()` (`src/helpers/exception-policy.ts`) computed
  over the record's six authoring fields (the five above, plus `reason`) _at the moment of
  sign-off_.

Every `"exception"`-mode policy in `suppressionPolicy` now additionally requires `"verifiedBy"`.
`checks/suppression-governance.ts`'s own `fieldValue` resolves it only when `verifiedContentHash`
still equals the hash recomputed from the record's _current_ authoring fields — editing
`justification` (or any of the other five hashed fields) after sign-off silently invalidates the
hash, `verifiedBy` reverts to "missing", and the record fails policy again on the very next run,
with no separate staleness-tracking logic anywhere. Per the same user direction
specs/decisions/0013 records, the reported `missing` list is _staged_: a freshly-created record's
first failure names only the still-empty authoring fields, never `verifiedBy` simultaneously — it
is added to the ask only once every authoring field is filled in.

`verifiedBy` deliberately reuses the _existing_ `verificationMethod` enum rather than introducing
a second, separate `method` field the way the security checks' `ExceptionVerification.method`
does: `verificationMethod` already names _how_ the underlying claim was substantiated
(`mutation-run`, `existing-test-suite`, `differential-testing`, `static-reasoning`, `untestable`),
and a suppression's own domain (`stryker` mutation results, an ESLint rule, a `@ts-ignore`) has no
second, independent tool this ADR's model could re-run the way `security-socket`/`security-network`
re-scan a package or a file — `verificationMethod` already _is_ the record of what evidence was
obtained, and content-binding it via `verifiedContentHash` is what makes it accountable rather than
just recorded.

**Migration.** All 64 records committed under this ADR's original (pre-amendment) model were
backfilled with a single migration pass at the time this amendment landed: `verifiedBy:
"@maverickcer"`, `verifiedAt` the migration date, `verifiedContentHash` computed from each record's
own already-committed authoring fields. This is a one-time baseline, not 64 individual fresh
reviews — but the content-binding is what makes the baseline meaningful going forward: any of those
64 records whose prose is edited from here on immediately loses its inherited sign-off and must be
re-verified like any other record. Every suppression discovered _after_ this amendment starts
unsigned, exactly like every other hand-authored field.

**Recommended repository setting** (documented, not enforced by repo-contract itself, per ADR
0011's "don't own ambient platform capabilities you don't need" posture): require a second
approving review on any PR touching `disable-comments.json`, so `verifiedBy` has a real,
GitHub-enforced backing rather than resting on repo-contract's own say-so.

### Alternatives considered (amendment)

- **A separate `method: "mechanical-reverification" | "independent-human-review"` field**,
  mirroring `scripts/shared/exception-record.ts`'s `ExceptionVerification` exactly. Rejected —
  `verificationMethod` already captures a strictly _more specific_ version of the same idea (which
  technique, not just which of two coarse categories), and adding a second, coarser field alongside
  it would be redundant classification with no consumer.
- **Auto-populating `verifiedBy` at synchronization time** (e.g. from the git commit author who
  introduced the suppression). Rejected — the author and the verifier being allowed to be the same
  actor with no independent check is exactly the "believe me" pattern this amendment closes; an
  automatic self-sign-off would reintroduce it structurally, just one step removed.
- **Skipping the 64-record backfill and letting every pre-existing suppression fail until
  individually re-reviewed.** Rejected as the initial migration step — it would make landing this
  amendment itself a hard blocker on a full manual audit of unrelated, already-reviewed history.
  The content-bound hash means the baseline costs nothing going forward: it is not a permanent
  exemption, only a starting point that the very next edit to any of those records revokes.
