---
name: repo-contract
description: repo-contract configs. Load when a task writes or edits a `defineRepoContract` check or policy, adds a preset or adopts a tier, or fills an exception record. Also load to read `Evidence`, a `Verdict` or `explain` output, or to wire `npm run contract` into a hook or CI.
---

# repo-contract

One typed contract for the tools your CI runs: each check says pass, warn or fail and why; every governed exception is a reviewable record. Each check records its result as evidence, and a policy you write turns that into the verdict.

Not for: replacing your linters, test runners or CI provider.

## Use it

```ts
import { spawn } from "node:child_process"
import { defineRepoContract } from "repo-contract"
import { format, lint, typecheck } from "repo-contract/presets"

export default defineRepoContract({
  spawn,
  env: process.env,
  checks: {
    typecheck,
    // The preset runs `prettier --write`, which rewrites the file. `--check`
    // reports it instead, so the demo shows a repeatable failure.
    format: { ...format, run: ["prettier", "--check", "."] },
    lint: lint(),
  },
})
```

From `examples/demo/repo-contract.config.ts`.

## Import from

| Import | For |
| --- | --- |
| `repo-contract` | `defineRepoContract`, `runRepoContract`, `serializeRun`, `renderMarkdownSummary`, types |
| `repo-contract/affected` | Scope a run: `computeAffectedFromGit`, `resolveScope`, `createCache` |
| `repo-contract/config` | Tool config from `exports`: `entries` |
| `repo-contract/config/knip` | `knipConfig` |
| `repo-contract/config/stryker` | `strykerConfig` |
| `repo-contract/config/tsup` | `tsupConfig` |
| `repo-contract/config/typedoc` | `typedocConfig` |
| `repo-contract/config/vitest` | `vitestConfig` |
| `repo-contract/helpers` | Governed exceptions: `loadExceptionRegistry`, `reconcileExceptions`, `repoContractLogs` |
| `repo-contract/metrics` | Run records: `createRunRecord`, `summarizeRuns`, `buildEvidenceManifest` |
| `repo-contract/presets` | Ready-made checks: `typecheck`, `lint`, `format`, `test`, `securityDeps`, `license`, `aiReview` |
| `repo-contract/schema` | The JSON Schemas for the documents `serializeRun` writes |
| `repo-contract/tiers` | Tiers: `basic`, `app`, `library`, `strict`, `explainTier` |

## Rules

- Supply `spawn` and `env` yourself: the library never imports a spawner or reads `process.env`. On Windows pass `cross-spawn`.
- A policy returns `{ outcome, rationale }`; the rationale is required even for `pass`. Put file, line, rule and counts in it.
- `warn` is visible and never blocks. Only `fail` fails the run.
- Name a check in `dependsOn` only after it is declared. `dependsOn` orders execution; the policy decides what a failed dependency means.
- Ask for parsed output with `output: { format: "json" }`; otherwise a policy sees only raw `stdout` and `stderr`.
- Prefer a `run` array. A string runs without a shell and rejects shell operators; `shell: true` opts into one.

## Rely on

- Checks run in parallel unless one names another in `dependsOn` or is marked `isolated`.
- A command that cannot be started is recorded as evidence with `status: "spawn_error"`, not thrown.
- Presets, `./tiers`, `./config`, `./affected` and `./metrics` are Experimental: they may break in any `0.x` minor or patch release.

## Common mistakes

| Instead of | Do this |
| --- | --- |
| An AI check whose policy reads prose | Use `aiReview({ agent })`: it gates on scored JSON and warns on an unreadable reply. |

## Verify

1. Run `npm run --silent contract -- --json` (a runner `init` wrote) and read each `fail` and `warn` rationale in `verdict.checks`.
2. Confirm every import is a package.json export.

Report any check you could not run, and any assumption you made.

## Go deeper

- [Every option of a check, the presets and the evidence shapes](https://github.com/MaverickCER/repo-contract/blob/main/GUIDE.md)
- [Adding an AI reviewer: the `aiReview` preset and its scored-JSON reply](https://github.com/MaverickCER/repo-contract/blob/main/GUIDE.md#ai-review-checks)
- [Adopting a tier, and what `explain` reports as loosened](https://github.com/MaverickCER/repo-contract/blob/main/GUIDE.md#tiers)
- [Filling in an exception record with `repo-contract except`](https://github.com/MaverickCER/repo-contract/blob/main/GUIDE.md#fill-in-and-count-exception-records)
- [Why each rule exists](https://github.com/MaverickCER/repo-contract/blob/main/specs/decisions)
- [Every public signature](https://github.com/MaverickCER/repo-contract/blob/main/skills/repo-contract/references/api.md)

## Authority

Target `repo-contract@0.16.0`. The installed package's exports and type declarations are the API: use only what they declare. Its tests and examples establish its behaviour. When this skill and the code disagree, report the disagreement before acting on either.
