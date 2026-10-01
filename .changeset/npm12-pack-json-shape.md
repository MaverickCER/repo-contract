---
"repo-contract": patch
---

Accept npm 12's `npm pack --json` output (an object keyed by package name) as well as the older array form, so the consumer-install E2E suites and the `arethetypeswrong` check no longer fail under the latest npm during the release job.
