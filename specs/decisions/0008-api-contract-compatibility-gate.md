# 0008: API-contract compatibility gate

## Status

Accepted. Implemented in `scripts/api-contract/*.ts`, wired into `repo-contract.config.ts` as the
`api-contract` self-hosting check. Self-hosting only — not a feature of the published package
itself.

## Context

Nothing in this repository derived a required SemVer release level from the package's actual
TypeScript public contract — the closest thing was a human remembering to pick the right bump type
by hand. A contract change (an export removed, a parameter narrowed, a property becoming required)
could ship with an insufficient version bump with nothing catching it.

## Decision

A dedicated check derives the minimum required release level deterministically from the observable
public-contract delta between a committed historical baseline and the current build, using a real
TypeScript-aware API-extraction tool and the language's own compiler for type-assignability
checks — never commit messages, PR metadata, git history, or heuristic/LLM interpretation.

The baseline's authority is the committed history, not the working tree — an uncommitted local
edit never affects the comparison, and the stored baseline is integrity-checked before being
trusted. The check may bootstrap a missing baseline, calculate the delta, classify compatibility,
and maintain a generated section of a pending release-notes file describing the impact — it may
never modify the package's version directly, touch the changelog, overwrite human-authored release
notes, or promote its own baseline; a separate, explicitly human-invoked command is the only way
the baseline itself is ever updated, after a release has actually shipped.

The check's policy is **advisory, not a version-blocking gate**, with exactly one exception: an
internal schema-version literal that changed shape without its own version marker being bumped
always fails, since that represents forgetting to update an internal versioning contract, not a
"not released yet" false positive. Every other finding is informational. This is deliberate: this
repository's actual release workflow means the package's live version normally lags behind the
real state of unreleased work throughout ordinary development, so gating the check on the live
version would fail nearly every PR that touches the public API for no real reason — the mechanism
that actually applies a release remains solely responsible for that.

## Consequences

- A contract change to the public API surface is now visible, classified, and release-level-scored
  automatically, without a human needing to reason about every export by hand.
- The check is entirely Private-tier, self-hosting tooling — it adds no runtime dependency, no
  exported surface, and no coverage under this package's own versioning policy.
- The published preset subpath (see the adjacent public-surface-scope ADR) is not covered by this
  mechanism today — its Experimental classification is the interim mitigation for that specific
  gap, not a permanent answer.

## Alternatives considered

- **Gating the policy on the live `package.json` version**, the originally specified design:
  rejected once it became clear this repository's actual release workflow makes that comparison
  meaningless during normal development — the version genuinely isn't meant to move yet on most
  PRs that touch the public API.
- **Letting the check itself decide, mid-run, whether it's safe to promote its own baseline**:
  rejected — a hidden second policy decision living inside what should be a purely observational
  check, with a real correctness bug: eagerly promoting using the not-yet-bumped current version as
  the new baseline would make the very next comparison silently disappear, even though nothing was
  actually released.
