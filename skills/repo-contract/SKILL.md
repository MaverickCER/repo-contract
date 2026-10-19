---
name: repo-contract
description: Load when a task creates or edits a repo-contract config (defineRepoContract, checks, policies), adds a preset, reads Evidence or a Verdict, or wires the contract into a script, hook or CI. Skip it for repositories that do not use repo-contract.
---

# repo-contract

repo-contract runs a repository's own checks, captures each result as structured evidence, and lets a policy the repository owns turn that evidence into a verdict with a reason.

Not for: replacing your linters, test runners or CI provider. It runs the tools you already have; it does not decide what good code is.

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
    // The published `format` preset ships `prettier --write .`, which fixes
    // files in place and so can never itself fail. Substituting the
    // read-only `--check` form is what lets this demo show a real,
    // repeatable failure instead of a silent rewrite -- the same
    // substitution `examples/internal-boilerplate-contract/contract.ts`
    // already makes for the same reason.
    format: { ...format, run: ["prettier", "--check", "."] },
    lint: lint(),
  },
})
```

From `examples/demo/repo-contract.config.ts`.

## Import from

| Import | For |
| --- | --- |
| `repo-contract` | `defineRepoContract`, `runRepoContract`, `serializeRun`, `renderMarkdownSummary`, the types |
| `repo-contract/helpers` | Governed exceptions: `loadExceptionRegistry`, `reconcileExceptions`, `repoContractLogs` |
| `repo-contract/presets` | Ready-made checks: `typecheck`, `lint`, `format`, `test`, `securityDeps`, `license` |
| `repo-contract/schema` | The JSON Schemas for the documents `serializeRun` writes |

## Rules

- Supply `spawn` and `env` yourself. The package never imports a spawner or reads `process.env`; on Windows pass `cross-spawn`.
- A policy returns `{ outcome, rationale }` and the rationale is required, even for `pass`. Put file, line, rule and counts in it.
- `warn` is visible and never blocks. Only `fail` fails the run.
- Name a check in `dependsOn` only after it is declared. `dependsOn` orders execution; the policy still decides what a failed dependency means.
- Ask for parsed output with `output: { format: "json" }`; without it a policy sees only raw `stdout` and `stderr`.
- Prefer a `run` array; a string is for `shell: true`, which uses the platform shell.

## Rely on

- Checks run in parallel unless one names another in `dependsOn` or is marked `isolated`.
- A command that cannot be started is recorded as evidence with `status: "spawn_error"`, not thrown.
- Evidence and Verdict are separate documents: evidence says what happened, the verdict says whether the standard held.
- Presets are Experimental: a new preset or changed default may arrive in a minor release.

## Common mistakes

| Instead of | Do this |
| --- | --- |
| Reading `process.env` or importing `child_process` inside a check | Take both from the config, so it runs the same on a laptop, in CI and in tests. |
| Using the `format` preset as a gate | It runs `prettier --write`, which never fails on unformatted files. Use `{ ...format, run: ["prettier", "--check", "."] }`. |
| A policy with no rationale, or one that only says it failed | Say what to fix, where, and why it matters. |

## Verify

1. Run the project's contract script (`npm run contract`) and read every FAIL and WARN rationale.
2. Confirm every import is a package.json export.

Report any check you could not run, and any assumption you made.

## Go deeper

- [Every option of a check, the presets and the evidence shapes](https://github.com/MaverickCER/repo-contract/blob/main/GUIDE.md)
- [Why each rule exists](https://github.com/MaverickCER/repo-contract/blob/main/specs/decisions)
- [Every public signature](https://github.com/MaverickCER/repo-contract/blob/main/skills/repo-contract/references/api.md)

## Authority

Target `repo-contract@0.11.1`. The installed package's exports and type declarations are the API: do not invent exports, options or return values. Behaviour is established by its tests and examples. If this skill and the code disagree, say so rather than guessing.
