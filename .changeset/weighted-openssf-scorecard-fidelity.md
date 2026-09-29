---
"repo-contract": patch
---

The `openssf-scorecard` self-evaluation now computes a weighted aggregate (`Σ(score × weight) / Σ(weight)`), with per-check weights fetched live from `ossf/scorecard`'s own published `docs/checks/internal/checks.yaml` risk tiers and `pkg/scorecard/scorecard_result.go` risk-weight table, rather than a simple average -- mirroring upstream's own `Result.GetAggregateScore` for closer methodology fidelity. `docs/OpenSSF-Scorecard.md` also now records provenance metadata (run date, evaluated repo + commit, and this evaluator's own version -- explicitly distinguished from the upstream `scorecard` binary's version, since this evaluation never runs that binary). Internal tooling only (`checks/`, `scripts/`); no public API change.
