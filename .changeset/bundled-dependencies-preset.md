---
"repo-contract": minor
---

`repo-contract/presets` gains `bundledDependencies`, a check that fails when package.json bundles a package its `dependencies` do not declare. npm publishes each such name into the registry manifest as `"*"`, and Socket reports the mismatch as manifest confusion.

- **What it reads.** `bundleDependencies` and `bundledDependencies` in the package.json of the working directory, through `node -e`; no tool to install. `true` bundles exactly the declared dependencies, so it passes.
- **What it fails.** A bundled name missing from `dependencies`, each one listed. A field that is neither a list of names nor a boolean. A package.json that cannot be read. A package that bundles nothing passes.
- **On by default for published packages.** `repo-contract init` now adds it unless package.json says `"private": true`. That matches how `init` adds `distNoUrls` for a package that publishes `dist/`. Its "Not detected" list names a private package's skip.
