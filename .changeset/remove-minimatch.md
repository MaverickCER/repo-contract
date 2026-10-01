---
"repo-contract": minor
---

Remove the `minimatch` runtime dependency. Exception-policy category globs are now matched by a
dependency-free, environment-free matcher (`src/helpers/glob-match.ts`, ADR 0017), so the package
has zero runtime dependencies. **Breaking (0.x minor):** only `*`, `**`, `?`, `[...]` classes,
`{a,b}` alternation and `\` escapes are supported; extglobs, POSIX classes, dotfile exclusion and
case folding are no longer interpreted, and a malformed character class now throws.
