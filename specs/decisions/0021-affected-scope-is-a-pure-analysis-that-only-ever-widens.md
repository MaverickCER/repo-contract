# 0021: Affected-scope is a pure analysis that only ever widens

## Status

Accepted. Implemented in `src/affected/` and published as `repo-contract/affected` (Experimental, like the preset
catalog), with `repo-contract affected` as its command (see the 2026-11-01 amendments to
[ADR 0004](0004-public-surface-stays-narrow-no-cli-experimental-presets.md) and
[ADR 0011](0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md)).
The scope flag and the result cache that build on it are in [ADR 0022](0022-a-full-run-is-cold-and-a-cache-replays-only-identical-inputs.md).

## Context

A repository's contract runs every test, the whole coverage report and every mutant on every change. Most of that is
repeated work: a one-line edit to a parser re-runs the CLI's tests. The established answer (Nx, Bazel, Jest's
`--findRelatedTests`) is to compute which tests a change can reach and run only those. The cost of a wrong answer is
asymmetric here: a test wrongly skipped is a regression the contract exists to catch, and a test wrongly run is only
minutes.

Two constraints from earlier records shape the design:

- [ADR 0011](0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md):
  the published runtime must not itself spawn a process, read `process.env`, or otherwise reach the machine. Git and the
  file system are exactly what a diff analysis wants.
- The package has no runtime dependencies, and TypeScript is not one of them.

## Decision

- **The analysis is pure.** `computeAffected` takes the contents of every module, the contents of each changed module at
  the base, the diff as data, and the TypeScript compiler API as a parameter. It reads no file, runs no process and
  imports no module. Whoever calls it (a consumer's contract script, a later CLI) supplies those capabilities, the same
  way `spawn` and `env` are supplied today. `typescript` is therefore an optional peer dependency used for types only.
- **Symbol-level, by diffing.** Each changed module is parsed before and after, and every top-level name whose tokens
  differ is a changed name. Whitespace, line breaks and comments never count. Changed names are followed within the
  module through the references between declarations, so a changed private helper changes exactly the exports that reach
  it. Changed exports are followed through imports, named re-exports, `export *`, namespace re-exports and
  `export * as`, to the tests that use them.
- **Anything unknown widens; nothing is guessed narrower.**
  - A changed file the graph cannot place, or a global trigger (manifests, lockfiles, tool configs, CI, the contract's own
    records), makes the whole result `full`.
  - A module that does not parse makes the result `full`.
  - A changed top-level statement, bare import or `export *` is treated as affecting every export of that module.
  - A namespace import, a literal dynamic `import()` or `require()` is treated as a dependency on every export.
  - A module that loads code by a non-literal specifier is treated as affected by any change; if it is a test, it
    always runs.
  - A coupling the graph cannot see (a golden file a test reads) is declared by the repository as a `link`, not
    inferred.
- **Every answer carries its reason.** Each affected test records the chain of facts that put it there, and the result
  lists every widening, so "why is this test running" and "why did this go full" are answerable from the result alone.
- **Mutation scope is narrower than test scope on purpose.** Mutation targets are the changed source files and the files
  that depend on a changed symbol directly, not the transitive closure. Releases are meant to run the full set.

## Consequences

- The analysis can be tested exhaustively with in-memory projects, and costs about a second on a 400-module repository.
- A consumer must hand it a TypeScript. The command loads the project's own; where that is TypeScript 7, which has no
  compiler API, it stops and says so rather than guess.
- `computeAffectedFromGit` takes git and file reads as parameters, and any failure to answer (no base, a failing
  command, output it does not understand, a changed file it cannot read) makes the result `full`, never a partial
  answer. The one place the command trusts git without being able to check is that `merge-base` names the commit the
  caller meant.
- Narrowing can be wrong only where the graph is blind: reflection, string-built paths that happen to be literals,
  a test that shells out to a built artifact. Those are what `links` and the full release run are for, and what a later
  soundness check against full runs will measure.
- `.d.ts`-only and type-only changes are treated like any other change, which over-runs slightly.

## Alternatives considered

- **File-level only.** Sound and simple, but a one-line change to a widely imported file re-runs most tests, which is
  the cost this exists to remove. It remains the shape the symbol-level answer falls back to.
- **Using the runner's own `--related`.** It is file-level, tied to one runner, and unavailable to Stryker or to a
  non-vitest repository.
- **Spawning git and reading files inside the package.** Rejected by ADR 0011; the pure core is also what makes it
  testable.
- **Guessing at dynamic imports.** Rejected: a guess that is wrong silently skips a test.
