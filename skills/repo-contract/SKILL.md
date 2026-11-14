---
name: repo-contract
description: repo-contract configs. Load when a task writes or edits a `defineRepoContract` check or policy, adds a preset, reads `Evidence` or a `Verdict`, or wires `npm run contract` into a hook or CI.
---

# repo-contract

Use deterministic and AI checks to enforce a baseline engineering standard across your org. A contract is one typed `defineRepoContract` config: each check, deterministic or AI, records its result as evidence, and the repository's policy turns it into a verdict with a reason.

Not for: replacing your linters, test runners or CI provider. It runs the tools you have; it does not decide what good code is.

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
| `repo-contract/helpers` | Governed exceptions: `loadExceptionRegistry`, `reconcileExceptions`, `repoContractLogs` |
| `repo-contract/metrics` | Run records: `createRunRecord`, `summarizeRuns`, `buildEvidenceManifest` |
| `repo-contract/presets` | Ready-made checks: `typecheck`, `lint`, `format`, `test`, `securityDeps`, `license`, `aiReview` |
| `repo-contract/schema` | The JSON Schemas for the documents `serializeRun` writes |

## Rules

- Supply `spawn` and `env` yourself: the package never imports a spawner or reads `process.env`. On Windows pass `cross-spawn`.
- A policy returns `{ outcome, rationale }`; the rationale is required even for `pass`. Put file, line, rule and counts in it.
- `warn` is visible and never blocks. Only `fail` fails the run.
- Name a check in `dependsOn` only after it is declared. `dependsOn` orders execution; the policy decides what a failed dependency means.
- Ask for parsed output with `output: { format: "json" }`; otherwise a policy sees only raw `stdout` and `stderr`.
- Prefer a `run` array. A string runs without a shell and rejects shell operators; `shell: true` opts into one.

## Rely on

- Checks run in parallel unless one names another in `dependsOn` or is marked `isolated`.
- A command that cannot be started is recorded as evidence with `status: "spawn_error"`, not thrown.
- Evidence says what happened; a separate Verdict document says whether the rules held.
- Presets, `./affected` and `./metrics` are Experimental: they may change in a minor release.

## Common mistakes

| Instead of | Do this |
| --- | --- |
| Using the `format` preset as a gate | It runs `prettier --write`, which never fails on unformatted files. Use `{ ...format, run: ["prettier", "--check", "."] }`. |
| A policy with no rationale, or one that only says it failed | Say what to fix, where, and why. |
| An AI check whose policy reads prose | Use `aiReview({ agent })`: it gates on scored JSON and warns on an unreadable reply. |

## Verify

1. Run `npm run contract` and read every FAIL and WARN rationale.
2. Confirm every import is a package.json export.

Report any check you could not run, and any assumption you made.

## Go deeper

- [Every option of a check, the presets and the evidence shapes](https://github.com/MaverickCER/repo-contract/blob/main/GUIDE.md)
- [Adding an AI reviewer: the `aiReview` preset and its scored-JSON reply](https://github.com/MaverickCER/repo-contract/blob/main/GUIDE.md#ai-review-checks)
- [Why each rule exists](https://github.com/MaverickCER/repo-contract/blob/main/specs/decisions)
- [Every public signature](https://github.com/MaverickCER/repo-contract/blob/main/skills/repo-contract/references/api.md)

## Authority

Target `repo-contract@0.13.0`. The installed package's exports and type declarations are the API: use only what they declare. Its tests and examples establish its behaviour. When this skill and the code disagree, report the disagreement before acting on either.
