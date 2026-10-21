---
"repo-contract": patch
---

- The `license` preset uses the repository's own `.licensee.json` when there is one. It used to always pass `--osi`, and licensee ignores `.licensee.json` whenever a policy flag is given, so the file had no effect. The preset now passes `--osi` only when there is no `.licensee.json` in the check's working directory, and the verdict names the policy it applied. licensee is now resolved from the working directory's `node_modules` (a local development dependency), not looked up on `PATH`. A config that overrides `run` to call `licensee` directly behaves as before.
- The `e2e` preset fails when Playwright ran 0 tests (no test matched, or every test was skipped). It used to report a pass, because 0 tests means 0 failures.
- The `test` preset fails when Vitest ran 0 tests (for example when every test is skipped), instead of reporting a pass.
- The published package no longer lists files under a nested `examples/**/node_modules` directory, which `npm pack` included whenever one existed locally.
