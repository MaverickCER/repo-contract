---
"repo-contract": patch
---

Documentation corrections only. No exported type, flag, error `code`, JSON key or schema constraint changed.

- The README and GUIDE now say CI tests Bun and Deno on Linux only. The `runtime-compat` job now fails when either runtime is missing.
- GUIDE names all four presets that read their own report file, adding `test`. A unit test keeps that list in step with the preset sources.
- GUIDE and the agent skill say the library, not the package, never spawns or reads `process.env`. The `bin/` CLI does both.
- GUIDE links to the generated `Evidence` and `Verdict` reference in place of a hand-copied interface that had drifted.
- SECURITY, CODE_REVIEW, RELEASING and VERSIONING drop stale details: the files `init` writes, where the declared bump comes from, the release PR title and the internal-package-contract range.
