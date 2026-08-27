# 0010: Changeset, ADR, and PR documentation discipline

## Status

Accepted. Implemented in `scripts/changeset-docs/*.ts` (`changeset-docs` check),
`scripts/adr-governance/*.ts` (`adr-governance` check), and a static ADR-structure section of the
`architecture` check.

## Context

Three related but materially distinct process questions recur for this repository, each answered
by a separate mechanism rather than folded into one: is every file a PR changed accounted for with
a human-readable description; did a PR that changes how checks execute or how policies are
evaluated actually record the reasoning behind that change; and does the reasoning trail itself
(the ADR set) stay structurally well-formed as it grows.

None of these is the same question as the API-contract compatibility gate's "did the public
TypeScript surface change" (see the adjacent ADR) — that mechanism is structurally blind to a bug
fix, an internal refactor, or a behavioral change with an unchanged type signature. Reaching those
would mean reintroducing commit-message or PR-metadata interpretation, exactly what that mechanism
exists to avoid. These are process/traceability questions instead, answered by requiring a
scaffold to be filled in, not by deriving anything automatically.

## Decision

**Changeset documentation** (`changeset-docs`): every PR gets a per-changed-file description table,
reconciled against the diff on every run — a row is added for a newly-changed file, kept (with its
description preserved verbatim) as long as the file stays part of the diff, including across a
detected rename, and dropped once the file is no longer part of the diff. The check has no opinion
on release level; it only guarantees every changed file carries a real description before merge.

**ADR governance** (`adr-governance`): a PR that touches the check-execution or policy-evaluation
engine must either touch the ADR set itself (adding or amending a file — amending an existing ADR
is just as valid an engagement with the reasoning trail as adding a new one) or reference an
existing ADR from its own changeset entry. A reference is valid only if it names a real, currently
existing ADR file — an unrelated or typo'd mention doesn't satisfy the requirement, and at least
one genuine reference is sufficient regardless of how many other mentions surround it. This is a
hard failure, not a soft nudge, on the reasoning that a process/traceability requirement of this
kind is enforced the same way this repository already enforces the changeset requirement above —
softening it would make it exactly the kind of rule that's true in prose and false in practice.

**ADR structure**: the ADR set's shape — filename convention, no duplicate numbers, the required
section headings — is validated mechanically as a static section of the existing architecture
check, the same "cheap, no-execution check about the shape of the repository" category as that
check's other sections. Its contract is stated explicitly, not merely implied: it evaluates the
_current_ file tree only, never git history — a numbering gap is accepted by design (a number can
be reserved and then abandoned without a file ever existing for it), never treated as a violation.
It checks only mechanical shape, never whether an ADR's actual reasoning holds up — that remains a
human-review concern.

## Consequences

- Every PR that changes any file outside the changeset directory itself now requires a filled-in
  description before the self-hosting suite passes — a real, deliberate addition to the
  contribution workflow.
- A PR touching the execution or policy engine without any ADR engagement now fails loudly, naming
  the files that triggered the requirement, rather than silently shipping an undocumented
  architectural decision.
- A malformed or duplicate-numbered ADR file, or one missing a required section, now fails the same
  self-hosting suite everything else does, rather than only being caught by a human reviewer
  noticing.

## Alternatives considered

- **A plain CI script instead of a genuine check** for either new mechanism: rejected — both
  produce independently meaningful, structured evidence through the same evidence-then-policy
  pipeline every other self-hosting check already uses; a bare script would mean informally
  reinventing that pipeline.
- **Folding ADR governance into the changeset-documentation check**: rejected — a materially
  different semantic question ("was an architectural decision recorded" vs. "is every changed file
  described") with a different remediation action, the same reasoning that already keeps the
  changeset-documentation check separate from the API-contract gate.
- **Enforcing strictly sequential ADR numbering** (no gaps) instead of only rejecting duplicates:
  rejected — the numbering convention this repository already follows explicitly anticipates a
  number being reserved and then abandoned without a file ever existing for it; enforcing
  contiguity would contradict that convention, not implement it.
