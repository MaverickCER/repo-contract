# 0015: Post-1.0 security fixes are backported one major version back, for a minimum of six months

## Status

Accepted. Implemented in `SECURITY.md`'s "Supported versions" section.
Mirrors `@maverickcer/env-cap`'s identical
[ADR 0015](https://github.com/MaverickCER/env-cap/blob/main/specs/decisions/0015-security-backport-window.md)
and `@maverickcer/data-cap`'s ADR 0061 — all three packages are heading
toward `1.0` together and should give an evaluator the same forward
commitment, not a gap in one and an answer in the other two.

## Context

`SECURITY.md`'s "Supported versions" section said only that repo-contract is
pre-`1.0`, security fixes target the latest published `0.x` release, and
"once `1.0` ships, this document will be updated with a longer-term support
policy" — a placeholder deferring the actual answer rather than stating it.
`@maverickcer/env-cap` and `@maverickcer/data-cap` both closed this exact
gap with a concrete, dated forward commitment (env-cap's ADR 0015,
data-cap's ADR 0061); repo-contract — the foundation both of those
packages' own governance tooling is built on — had not, surfaced during a
v1.0-readiness audit across all three.

## Decision

Starting at the first `1.0` release, security fixes will be backported to
the latest minor release of the previous major version for a minimum of six
months after a new major version ships. That minimum window may be extended
at the maintainer's discretion, but once a minimum end date has been stated
for a given major version's backport window, it will never be shortened
retroactively. Before `1.0`, the existing "latest `0.x` only" policy
continues unchanged — this decision does not attempt to backdate a
commitment onto pre-1.0 releases.

## Consequences

- An organization evaluating `repo-contract` for a hard LTS/backport
  requirement now has a concrete, dated answer for the _post-1.0_ state,
  consistent across all three of the maintainer's related packages.
- This is a forward commitment, not a proven track record — stated as such.
- A future major-version release's changelog/release notes must state the
  backport window's end date explicitly, since the "never shortened once
  stated" guarantee only has teeth if the stated date is written down
  somewhere a consumer can point back to.

## Alternatives considered

Identical reasoning to env-cap's ADR 0015 and data-cap's ADR 0061 — see
either for the full "no commitment at all" / "shorter or open-ended window"
/ "revocable commitment" alternatives and why each was rejected. No
repo-contract-specific reasoning changes any of those conclusions here.
