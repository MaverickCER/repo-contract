---
"repo-contract": patch
---

Claims now match the evidence behind them. `docs/OpenSSF-Scorecard.md` leads with the official OpenSSF Scorecard result fetched from the public Scorecard API, lists every check where this repository's own evaluation differs and why, and computes its "not evaluated" list from the upstream check list (it had said no SBOM was generated). The local evaluation now scores Code-Review from approvals on merged pull requests rather than the branch-protection setting, scores Maintained as 0 for a repository younger than 90 days as upstream does, and scores Contributors proportionally. The evidence manifest's documentation now says its digest detects accidental edits and is not a signature, and the README says which features the workflow test covers and which have unit tests instead.

What installing the package adds is now generated into ADOPTION.md from `package.json` by `internal-package-contract generate`, and the contract gains the shared `GeneratedRegions` check so it cannot go stale.
