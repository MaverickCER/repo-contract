# performance-api-contract

Measures internal-package-contract's own API-contract diff/classification engine
(`scripts/api-contract/compatibility-classifier.ts`'s `classifyContractChanges`,
`model-normalizer.ts`'s `normalizeApiPackage`, `type-assignability.ts`'s reference/item indexing and
TypeChecker-backed assignability probing, `schema-version-consistency.ts`'s
`detectSchemaVersionDrift`) — the exact code path repo-contract.config.ts wires in as the real,
gating `api-contract` check (see that config's own module doc comment) — at increasing public-API
surface size.

See [`../README.md`](../README.md) for the shared methodology across all three categories.

## What's generated

[`fixtures.mjs`](fixtures.mjs)'s `generateApiContractFixture(tierName, ...)` writes and compiles
(via the real `tsc`) two related synthetic TypeScript packages per tier — `baseline` (`N` `@public`-
tagged exports) and `current` (the same exports with a deterministic, proportional set of changes:
roughly every 10th export gains an added optional parameter, every 17th export's parameter type
changes outright, and the surface gains 2 new exports while losing its last 2) — then runs each
through the real, programmatic API Extractor (`runApiExtractor`, the same function the real
`api-contract` check itself calls), producing a real `.api.json` Doc Model and a real rolled-up
`.d.ts` per variant.

This compile+extract step happens once per tier, outside the sampled loop, and is reported
separately as `fixtureGenerationMs` (regenerated fresh on every run under
`fixtures/generated/<tier>/`, gitignored, never committed). Only the real
load+normalize+index+classify step is adaptively sampled — repo-contract's actual "computing/
diffing API contracts" hot path.

| Tier     | Exported symbols | Purpose                     |
| -------- | ---------------- | --------------------------- |
| `small`  | 20               | Fast-feedback sanity point. |
| `medium` | 100              | Mid-ladder point.           |
| `large`  | 400              | Top of the scaling ladder.  |

## Run it

```sh
npm run benchmark:api-contract
```
