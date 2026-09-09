# 0004: The public surface stays deliberately narrow — no CLI, an Experimental preset catalog

## Status

Accepted, both halves revisitable. As originally accepted: reflected in `package.json` (no `bin`
field), and `src/presets/**`, published via the `./presets` subpath. **Amended 2026-09-09** — see
below: `package.json` now has a `bin` field (`bin/repo-contract.mjs`), narrowly scoped to
scaffolding only; the preset-catalog half is unchanged.

## Context

Two separate scope questions came up early and share a common shape: how much surface should this
package expose before it has been through a real feedback cycle?

First, whether to ship a CLI. The package's own acceptance criterion is a programmatic API call
succeeding — no separately-published binary is required to satisfy it, and adding one now would mean
designing a config-loading strategy (how does a CLI load a TypeScript config file without a build
step?) that hasn't been designed or tested.

Second, every consumer of the core API hand-writes every check — the whole point of the package is
that it never decides what "good code" means, a repository's own config does. But that also means
every adopter re-derives the same boilerplate for extremely common tools (a linter, a formatter, a
type checker, a dependency audit). This repository already had well-tested internal examples of
exactly that boilerplate, written for its own self-hosting and never published.

## Decision

**No CLI, no `bin`, no composite CI-provider action** in the initial release. The public surface
stays two functions and a handful of types; a future CLI remains straightforward to add later as a
thin consumer of the existing programmatic API, without requiring any change to the current
surface's shape.

**A published preset catalog**, a curated, growing set of ready-made check definitions for common
tools, shipped as `repo-contract`'s own `./presets` subpath export (`src/presets/**`, per this
ADR's Status line above) rather than the root export, and rather than a separate scoped package. It
is published as **Experimental**: its TypeScript signature and its runtime behavior may both change
in a minor or patch release, since it hasn't been through a real feedback cycle yet. This repository
consumes the same published presets in its own self-hosting configuration wherever they fully cover
what an internal check used to do — proof the abstraction actually works, not just that internal
checks were copied into a package.

A preset encodes how to execute and interpret a common tool; it never encodes a repository's
definition of quality. Every field stays spread/override-able. Any option that affects execution
must be represented in the actual command line, not held back in a closure — evidence must
describe what a run actually did, not just what configured it.

## Consequences

- A consumer can go from hand-writing every check to importing a handful of presets for the checks
  that are genuinely common, while keeping the exact same spread/override model taught for
  hand-written checks.
- This repository's own self-hosting configuration now exercises its own published presets on every
  run, closing the gap between "the package that validates itself" and "the package another
  repository would actually install."
- The published preset surface currently has no automated backward-compatibility protection of its
  own — the compatibility-gate mechanism (see
  [ADR 0009](0009-conventional-commits-versioning-and-local-gates.md)) covers only the root
  export's entry point. The Experimental classification is the interim mitigation for that gap, not
  a permanent answer.

## Alternatives considered

- **Shipping a minimal CLI for consistency with this package's sibling projects**: rejected for the
  initial release — the spec this package follows treats a CLI as optional future work, and adding
  it now would be scope not required by the stated acceptance criteria.
- **Publishing the existing internal check definitions as-is**: rejected — most of them shell out to
  this repository's own internal wrapper scripts, which don't exist in a consumer's repository at
  all, and even the directly portable subset carried repository-specific assumptions that needed
  generalizing before they were fit to publish.
- **A single generic `run`/`policy` factory parameterized by tool name**, instead of one
  purpose-built module per preset: rejected — every tool's output contract and failure modes differ
  enough that a generic wrapper would either be too weak to be useful, or accumulate special cases
  until it stopped being generic.

## Amendment (2026-09-09): a narrow `bin` for scaffolding only

The no-CLI clause above is narrowed, not reversed. This amendment exercises the door the original
Decision already left open — _"a future CLI remains straightforward to add later as a thin
consumer of the existing programmatic API"_ — for exactly one reason: onboarding friction.
Competitor research (packages with real adoption momentum: `lint`, `@forgespace/core`,
`forge-ai-init`) found that repo-contract requires hand-authoring two files
(`repo-contract.config.ts`, `scripts/contract.mjs`) and a `package.json` script edit before any
value is visible, where comparable tools offer one command. The friction is entirely at setup time —
nothing about _running_ checks was ever missing a CLI; `npm run contract` already is, and remains,
the working runtime entry point.

**Decision.** Ship exactly one `bin` entry, `repo-contract` → `bin/repo-contract.mjs`, recognizing
exactly one subcommand: `init`. Any other invocation (`run`, `ci`, `explain`, `doctor`, no args)
prints that `init` is the only supported command and that checks run via `npm run contract`, then
exits non-zero. `init` writes the same two files, and makes the same `package.json` script edit, a
consumer would otherwise hand-write, using a
fixed, hand-maintained table from each of the 16 existing presets to the npm `devDependency` it
needs — checking `devDependencies` only, matching every preset's own published documentation
("...is already a devDependency of your repository") — and never anything fuzzier than "is this
devDependency present." It performs **zero process spawning
and zero `process.env` access** — it only reads the consumer's local `package.json` via `node:fs`
and writes local files, extending [ADR 0011](0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md)'s
invariant to this new surface rather than excepting it from it.

> **ADR 0004 remains authoritative for runtime invocation. This amendment permits exactly one
> published executable surface whose sole responsibility is scaffolding. It does not permit
> contract execution, policy evaluation, diagnostics, or environment discovery through the CLI.**
> A hand-authored contract and an `init`-generated one are equally first-class; `init` must never
> become a prerequisite for running one.

That paragraph is deliberately load-bearing: it is what makes "we already have a CLI, let's add
`repo-contract doctor`" visibly inconsistent with this decision later, not merely discouraged by
convention.

**Consequences.** `package.json` gains a `bin` field, and `files` gains a new top-level published
directory (`bin/`), for the first time — the first hand-written, unbundled top-level JS this
package has ever published (everything else in `files` today is build output or a JSON schema).
`bin/repo-contract.mjs` becomes new published surface independently subject to
`scripts/verify-no-ambient-capabilities.mjs`, the mechanical enforcement of ADR 0011's invariant.
It ships under the same **Experimental** classification already established above for
`src/presets/**` — a version-stability classification (its detection table and generated output
may still change in a 0.x release), not a caution against using it.

### Alternatives considered (amendment)

- **A general `init`/`run`/`doctor` CLI now**, closing the onboarding gap and adding diagnostics in
  one release: rejected — reopens the config-loading-without-a-build-step question this ADR's
  original Decision already deferred, and would contradict ADR 0011's consumer-owns-execution
  invariant. `doctor` and `explain` specifically are rejected as their own concerns: every check
  already returns an actionable `rationale` per outcome, so a diagnostic command would duplicate
  that or incentivize checks to under-invest in it; and GUIDE.md's preset table plus each preset's
  own doc comments already answer "what does this check and with what options," so a parallel
  `explain` command would be a second source of truth to keep in sync with the first.
- **A separate published package** (e.g. `create-repo-contract`, the `create-*` npm convention):
  rejected — a second package to version and keep in sync with this package's own preset catalog,
  for no real benefit over one `bin` entry in the existing package.
- **A namespace-less `repo-contract-init` binary**, avoiding a `repo-contract` command namespace
  entirely: rejected — doesn't match the `npx <pkg> init` shape users expect from comparable tools,
  and a disciplined single-case dispatcher achieves the same narrowness without the awkward UX.
- **Stack/framework or monorepo detection beyond devDependency presence, SARIF or other output
  adapters, and deriving the preset→dependency table from new metadata added to all 16 preset
  modules**: rejected — no existing precedent for any of these, each is scope disproportionate to
  the onboarding-friction problem this amendment addresses, and the last one would mean changing
  already-published preset modules for the sake of a scaffolding helper. Consistent with this ADR's
  original rejection, above, of a generic wrapper that accumulates special cases.
- **Injecting a demonstrative cross-check policy into every generated contract**, so a new user
  immediately sees evidence-from-one-check-informing-another's-verdict: rejected as an automated
  behavior — an example relationship between presets that isn't grounded in the consumer's actual
  detected state (e.g. relating a check that isn't even installed) is `init` inventing a standard,
  which is exactly what this package exists to avoid deciding on a repository's behalf. The
  generated config instead carries a short comment pointing at GUIDE.md's real example.
