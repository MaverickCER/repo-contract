# 0017: A hand-written glob matcher replaces the `minimatch` runtime dependency

## Status

Accepted. Implemented in `src/helpers/glob-match.ts`; covered by
`test/unit/helpers/glob-match.test.ts` and the differential property test
`test/property/exception-policy.property.test.ts`. Supersedes the "new runtime dependency"
section of ADR 0013.

## Context

ADR 0013 made `minimatch` this package's only runtime dependency for exception-policy category
globs. Socket.dev flags `minimatch` (environment-variable access) as a supply-chain risk on this
package's page, and the project's policy is that a shipped dependency with a supply-chain alert is
never waivable. The package's own `security-socket` check forbids exactly this class.

## Decision

Remove `minimatch` and ship a small, pure matcher (`globMatch`) that reads no environment variable,
no filesystem and imports nothing. It supports precisely the syntax category keys use: `*`, `**`,
`?`, `[...]` classes (with `!`/`^` negation), `{a,b}` alternation and `\` escapes. Everything else
(extglobs, POSIX classes, dotfile rules, case folding) is treated literally. A reversed range
in a character class matches nothing. The matcher builds no `RegExp` from its input: patterns are
tokenized and matched by a position-set simulation, polynomial in pattern and value size, so no
pattern can cause catastrophic backtracking, and brace expansion is capped at 1024 alternatives.

## Alternatives considered

- **Another glob package** (`picomatch`, `micromatch`, `zeebo-glob`, ...): rejected -- none is
  guaranteed a clean Socket score across every category, and the required surface is small enough to
  own. Any such package would also have to be re-vetted on every release.
- **Translating globs to a `RegExp`**: tried first; rejected because the repository's own
  `secure-coding` lint rules (ReDoS, non-literal `RegExp`) correctly flag it, and the simulation is
  both safer and no longer.

## Consequences

- `repo-contract` has zero runtime and zero peer dependencies.
- Behaviour matches `minimatch` for every pattern shape this repository or its consumers use
  (verified against `minimatch` while developing the matcher); unsupported minimatch features are a
  documented, breaking narrowing, released as a breaking 0.x minor.
