# 0006: Verification categories get independent execution boundaries; coverage is a union

## Status

Accepted. Implemented in `vitest.base.config.ts`, the per-category Vitest configs,
`scripts/run-test-category.mjs`, `scripts/check-test-boundaries.mjs`,
`scripts/aggregate-coverage.mjs`.

## Context

This repository's own test suite originally ran as one monolithic invocation covering unit,
integration, and eventually property-based and end-to-end tests together, with no way to run one
category without the others, and no mechanism preventing a test from silently landing in the wrong
tier — the distinction existed only as directory-naming convention and developer discipline.

Once each category runs as its own independent process, "coverage" stops being a single number
produced by a single run and becomes a genuine open question: what does coverage mean when it comes
from more than one independent execution, and how do several separately-produced coverage reports
become one number a policy can evaluate?

## Decision

**Independent execution boundaries.** Each verification category owns its own directory and its
own test-runner config, sharing only genuinely common settings. A category can be run completely
alone. This boundary is **mechanically guarded, permanently** — a dedicated, static check verifies
every test file belongs to exactly one category's directory and every category's config only ever
references its own directory — not merely assumed correct once at implementation time.

**Coverage is a union, never additive or averaged.** A source location is "covered" in the
aggregate if _any_ contributing category's run executed it; one category reporting 80% and another
reporting 60% never implies "140%" or a 70% average — the aggregate is computed directly from the
per-location union via the standard library-level coverage-map merge mechanism, the same technique
common coverage-merging tools use, not an invented format. A category that exercises the built,
bundled package output through a real separate process boundary (rather than instrumented source
in-process) does not contribute to this measurement at all — that's a deliberate, documented
absence, not an oversight, since bundled output isn't line-mapped 1:1 back to source.

Threshold enforcement lives exclusively in one place, reading the aggregate; no per-category config
carries its own threshold, since no single category's coverage was ever meant to meet the whole
repository's bar alone.

## Consequences

- A developer can run any one category, including a slow end-to-end suite, without executing any
  other — verified, not just assumed, since the boundary guardrail is exercised as its own
  permanent check, not a one-time implementation-time verification.
- Adding a future coverage-producing category requires one addition to the aggregation script's own
  source list — nothing else about the coverage architecture changes.
- The consumer of the aggregate (a downstream complexity/risk-analysis check, for instance) must
  read the identical canonical artifact the coverage check itself just evaluated, never a
  separately or independently computed one.

## Alternatives considered

- **A single shared multi-project test-runner configuration** instead of fully separate config
  files: rejected for this repository specifically — it would make each category's boundary
  implicit in one shared file rather than independently inspectable per-file, and this repository
  already prefers explicit, per-file configuration over consolidated, workspace-aware tooling.
- **Summing or averaging per-category coverage percentages**: rejected outright as not a coherent
  notion of coverage — a location double-counted across categories would inflate the aggregate
  beyond what any single, complete run could ever report, and would actively mislead a human or an
  AI reading the evidence.
- **Trusting glob-based include patterns with no runtime/static guardrail**: rejected — exactly the
  "developer discipline and undocumented filename convention" this design replaces with a mechanical
  check.
