# 0004: The public surface stays deliberately narrow — no CLI, an Experimental preset catalog

## Status

Accepted, both halves revisitable. Reflected in `package.json` (no `bin` field), and
`src/presets/**`, published via the `./presets` subpath.

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
