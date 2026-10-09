---
"repo-contract": patch
---

`npm run version` now regenerates the committed SBOMs, which embed the package's own version, so the release pull request no longer leaves the working tree dirty and fails the contract.
