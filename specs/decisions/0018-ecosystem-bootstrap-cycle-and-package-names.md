# 0018: The ecosystem's bootstrap cycle, and its package names

## Status

Accepted.

## Context

Four repositories make up one toolkit:

| Package                           | npm name                      | Role                                                                                                                                                   |
| --------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `repo-contract`                   | `repo-contract`               | The mechanism: runs checks, assembles evidence, evaluates policy into a verdict.                                                                       |
| `internal-package-contract` (IPC) | — (private, a git dependency) | The standard: what every publishable package must continuously satisfy, expressed once as a contract, plus the shared release and benchmark workflows. |
| `env-cap`                         | `@maverickcer/env-cap`        | A package governed by the standard: configuration treated as a capability with an owner.                                                               |
| `data-cap`                        | `data-cap`                    | A package governed by the standard: data treated as a capability with an owner.                                                                        |

Two things need a recorded decision because each is expensive to change once people depend on it.

**A dependency cycle.** IPC depends on `repo-contract` (every check is a `repo-contract` check, and the
exception system is built from `repo-contract/helpers`). `repo-contract` in turn depends on IPC as a
_development_ dependency: its own self-contract composes IPC's standard checks, and its releases use IPC's
shared workflows, API-contract engine and benchmark kit.

**Package names.** `env-cap` is scoped (`@maverickcer/env-cap`); `repo-contract` and `data-cap` are not.
Documentation across the repositories has at times used a scoped name that does not exist on npm
(`@maverickcer/data-cap`) and an unscoped one that does not either (`env-cap`).

## Decision

### The cycle is deliberate, and bounded by two rules

1. **IPC resolves the _published_ `repo-contract`**, through a tilde range (`~0.x.y`) while `repo-contract`
   is 0.x, so it takes patch releases automatically and each minor deliberately.
2. **`repo-contract` resolves IPC from a git release tag and runs its self-contract against its own freshly
   built `dist/`**, never against the published copy of itself.

Because of (1) and (2) neither side ever needs the other's _unreleased_ code, so the cycle cannot deadlock.
The order of operations for a breaking `repo-contract` change follows:

1. Publish the new `repo-contract`.
2. Bump IPC's `repo-contract` range and release IPC (a new tag).
3. Re-pin `repo-contract`'s own IPC devDependency to that tag. (`dependency-pin-sync` does this, and moves
   any workflow pinned to an IPC commit SHA with it.)

### Names are kept as published

`@maverickcer/env-cap`, `data-cap` and `repo-contract` stay as they are. Renaming after adoption means a
new package plus a deprecation of the old one, which costs every user something; the inconsistency costs
only a sentence in the documentation. The documentation says exactly what exists: `@maverickcer/env-cap`,
`data-cap`, `repo-contract`, and IPC (not published). A new package in the toolkit chooses a scope on its
merits, not to match.

### One vocabulary

The same words mean different things in different repositories; [the glossary](../glossary.md) fixes each,
and every repository links it from its architecture document.

## Alternatives considered

- **Publish IPC to npm so `repo-contract` and the others consume it from the registry.** Rejected for
  now: it would make the standard a public product with a compatibility promise of its own before it has
  stabilized, and it does not remove the cycle (IPC would still need `repo-contract` to exist).
- **Fold IPC into `repo-contract`.** Rejected: `repo-contract` is a general mechanism with no opinions
  about what a publishable package must satisfy; the standard is organization policy and changes on a
  different cadence.
- **Break the cycle by vendoring IPC's checks into `repo-contract`.** Rejected: that is the forked
  standard this decision exists to prevent (two implementations of the same check drift).
- **Rename to one scope (`@maverickcer/*`).** Rejected, above: a rename is a new package plus a
  deprecation for every existing user.

## Consequences

- A reader evaluating "MaverickCER packages" has one page that says how the four relate (every README links
  the toolkit section, which is generated from the same wording).
- IPC's tilde range makes a `repo-contract` minor an explicit step; it is the price of not letting a
  stable-sounding caret range accept an Experimental surface that broke in a minor.
- Nothing here changes a published name or interface.
