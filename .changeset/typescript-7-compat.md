---
"repo-contract": minor
---

The published declarations are now proven against TypeScript 5, 6 and 7 (the native compiler) in CI: the packed tarball is installed into a scratch consumer under each major's newest release and type-checked with `moduleResolution: "nodenext"` and `strict`, instead of only against whatever `typescript@latest` happens to be. The repository's own source is also type-checked with the TypeScript 7 compiler. No runtime or API change.
