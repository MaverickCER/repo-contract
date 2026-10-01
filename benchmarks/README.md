# Benchmarks

[`performance-checks/`](performance-checks/), [`performance-policy-evidence/`](performance-policy-evidence/),
and [`performance-api-contract/`](performance-api-contract/) are project confidence tooling, not
adoption samples like [`examples/`](../examples/) — they exist to answer "does this scale" and "did
this regress" for repo-contract's own three real hot paths: running checks against a repository,
evaluating policy against evidence, and computing/diffing API contracts. Run via `npm run benchmark`
from the repo root, or each category's own `npm run benchmark:<category>` script.

[`benchmark-fixtures/`](benchmark-fixtures/) is shared support code the three run-benchmark.mjs
scripts import from — plain `.mjs`, no `package.json` of its own, never run directly.

## Why three categories, not one

Unlike env-cap/data-cap (which benchmark cold-start/build-time of _generated consumer code_),
repo-contract is a check-execution engine, and its own performance-sensitive surface is internal to
itself:

- **`performance-checks`** measures `src/execution/run-checks.ts`'s own orchestration
  (`dependency-scheduler.ts`/`concurrency-pool.ts`/`spawn-check.ts`) — how scheduling overhead
  scales as a repository configures more checks with real `dependsOn`/`isolated` structure. Every
  generated check really spawns the fastest possible real process (`node -e ""`), so the measured
  cost is repo-contract's own scheduling, not whatever a real check's tool happens to do.
- **`performance-policy-evidence`** measures `src/evidence/build-evidence.ts`'s `buildEvidence` and
  `src/policy/run-policies.ts`'s `runPolicies` — pure, in-memory evidence-assembly and
  policy-evaluation cost (JSON-output parsing, `dependsOn` evidence lookups, rationale
  construction) as check count and per-check output size grow. No process is spawned here, which
  is deliberate: isolating this stage from `performance-checks`' real process-spawn noise is the
  whole point.
- **`performance-api-contract`** measures internal-package-contract's own API-contract
  diff/classification engine (`scripts/api-contract/compatibility-classifier.ts`,
  `model-normalizer.ts`, `type-assignability.ts`) — the code path repo-contract.config.ts wires in
  as its real `api-contract` check — at increasing public-API surface size. Per-tier fixture
  compilation (a real, synthetic TypeScript package, compiled with `tsc` and run through the real,
  programmatic API Extractor) happens once and is reported separately as `fixtureGenerationMs`;
  only the real load+normalize+classify step is sampled.

All three import repo-contract's (or internal-package-contract's) own internals directly, from
source, via `tsx` — not the published `repo-contract` public API. This is benchmarking tooling
reaching into its own repository's implementation, the same way a unit test does; it is not a
model for how an external consumer should use this package (see `src/index.ts`'s own doc comment
for the curated public surface).

## Methodology

- **Measurement, never regression detection.** Each `run-benchmark.mjs` only measures and writes
  `results.json`/`RESULTS.md`. Diffing against history, budget highlighting, and complexity-shift
  detection are internal-package-contract's shared benchmark engine's job
  (`scripts/benchmark/render-summary.mjs`/`append-history.mjs`/`classify-complexity.mjs`), invoked
  from this repo's own `benchmark-pr` CI job (`.github/workflows/ci.yml`) — see that job's own
  comments for why it calls those scripts directly rather than `uses:`-ing
  internal-package-contract's `benchmark-pr.yml` reusable workflow (that workflow is currently
  hardcoded to exactly two categories, `performance-runtime`/`performance-buildtime` — a shape that
  fits env-cap/data-cap but not repo-contract's three).
- **Tiers.** Each category defines its own `small`/`medium`/`large` tier ladder, sized to its own
  dimension (check count, evidence payload bytes, exported-symbol count) — see each category's own
  `fixtures.mjs`. `inputs` on every tier result is a generic `Record<string, number>`; complexity
  classification (`classify-complexity.mjs`) sums it generically, never assuming a hardcoded tier
  name or field.
- **Determinism.** Every fixture generator is a pure function of its own tier/index parameters —
  zero `Math.random()`, zero timestamp-seeded content.
- **Adaptive sampling.** `benchmark-fixtures/measure.mjs`'s `adaptiveSample` runs a few discarded
  warmup iterations, then samples until a target duration elapses (never fewer than a minimum,
  never more than a maximum) — the same methodology env-cap/data-cap use.
