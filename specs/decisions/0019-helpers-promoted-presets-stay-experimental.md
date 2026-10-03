# 0019: `repo-contract/helpers` is Stable; `repo-contract/presets` and `init` stay Experimental

## Status

Accepted. Amends [ADR 0004](0004-public-surface-stays-narrow-no-cli-experimental-presets.md) and
[ADR 0013](0013-reusable-exception-policy-helper.md).

## Context

`internal-package-contract` (the standard every package here is held to) is built on two surfaces that
were labelled Experimental: every check imports `repo-contract/presets`, and the whole exceptions system
(`loadExceptionRegistry`, `reconcileExceptions`, `writeExceptionRegistry`, `evaluateExceptionRecord`,
`hashRequirementFields`, `validateExceptionPolicyConfig`) comes from `repo-contract/helpers`. After 1.0 a
caret range accepts any 1.x, including a patch that breaks an Experimental surface, so a 1.0.0 whose
most-used surfaces carry no compatibility promise would be misleading.

## Decision

- `repo-contract/helpers` is promoted to Stable. It has had the feedback cycle ADR 0013 asked for: the
  exceptions system grew v2 records, environment-degradation records and a legacy-tolerant reader on top
  of it with additive changes only.
- `repo-contract/presets` and the `init` command stay Experimental: preset behaviour (default paths,
  severities, policy interpretation) is still being tuned by the packages that use it.
- Consumers that cannot accept a changed preset pin a tilde range. `internal-package-contract` depends on
  `repo-contract` as `~0.8.8`, so it receives patch releases only until it chooses to move.

## Consequences

`VERSIONING.md` lists `helpers` under Stable and `presets` as the one Experimental library surface.

## Alternatives considered

- **Promote presets too.** Rejected: their default paths and severities are still being tuned.
- **Keep both Experimental and pin consumers to exact versions.** Rejected: it leaves the most-used
  surface without a promise and pushes the burden onto every consumer.
