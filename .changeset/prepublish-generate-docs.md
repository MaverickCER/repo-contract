---
"repo-contract": patch
---

Generate the gitignored `docs/api/` and `docs/benchmarks/` pages before the publish-time contract run, so the `docs` check no longer 404s on them in the release job's fresh checkout.
