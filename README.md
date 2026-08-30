# repo-contract

<!--
[![CI](https://github.com/maverickcer/repo-contract/actions/workflows/ci.yml/badge.svg)](https://github.com/maverickcer/repo-contract/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/repo-contract.svg)](https://www.npmjs.com/package/repo-contract)
[![License](https://img.shields.io/npm/l/repo-contract.svg)](LICENSE)
[![Coverage](https://img.shields.io/badge/coverage-pending-lightgrey)]()
[![Bundle size](https://img.shields.io/badge/gzip-%3C8KB-brightgreen)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)]()
[![Node](https://img.shields.io/node/v/repo-contract.svg)]()
TODO(readme-badges): uncomment once the first version is published to npm and CI is live.
-->

**Turn your repository's engineering standards into enforceable contracts.**

repo-contract is a tool-agnostic contract execution and evidence layer. You define the engineering standards your repository cares about — tests, coverage, mutation testing, linting, security scanning, documentation, dependency health, or anything else that runs as a command — and repo-contract turns those standards into enforceable, machine-readable contracts.

Each check executes a command, captures what actually happened as evidence, and hands that evidence to a policy function **you write**. The policy decides whether the evidence satisfies your repository's standard:

```ts
{ outcome: "pass" | "fail" | "warn", rationale: string }
```

repo-contract aggregates every policy result into one verdict.

It does not decide what "good code" means.

**Your repository does.**

This makes repo-contract different from a test runner, linter, CI provider, or quality analyzer. It does not replace ESLint, Vitest, Stryker, npm audit, or similar tools. It executes them, captures their results, and gives your repository a programmable enforcement layer across all of them.

Because it is a plain function call with no CLI and no hidden state, the same contract can run locally and in CI. Wire it into a `precommit`, `prepublishOnly`, CI job, or whatever workflow your repository already uses.

The result is not merely "the tests passed."

It is a repository-defined engineering contract with evidence explaining why.

This README is a narrative walkthrough. For the precise reference — every exported type, field, and error code — see the generated [API report](docs/api-report/repo-contract.api.md) (and its [presets counterpart](docs/api-report/repo-contract-presets.api.md) for `repo-contract/presets`), produced straight from source by [API Extractor](https://api-extractor.com/) so it can never drift from what the package actually exports.

**When this isn't worth adopting:** if your CI already runs each tool as its own separate step with its own separate pass/fail gate, and you do not need unified evidence or policies that reason across checks, plain shell scripts in your CI configuration may be all you need. repo-contract earns its keep when you want a single programmatic contract across multiple engineering standards, evidence you can persist or diff over time, or policies that reason about more than one check's output.

## Why contracts?

Modern repositories accumulate engineering standards faster than they accumulate enforcement.

A team may agree that:

- tests must pass;
- coverage must remain above a threshold;
- mutation scores must remain above a threshold;
- dependencies must have no known high-severity vulnerabilities;
- generated files must remain synchronized;
- public APIs must remain compatible;
- documentation must accompany changes;
- new code must satisfy architectural boundaries.

Those standards are often scattered across CI YAML, package scripts, documentation, code review conventions, and institutional knowledge.

repo-contract gives those standards a single executable boundary.

```text
repository standards
        |
        v
   repo-contract
        |
        +--> execute checks
        |
        +--> collect evidence
        |
        +--> interpret evidence with repository-owned policies
        |
        v
  enforceable verdict
```

The important distinction is that repo-contract does not own the standards.

Your repository does.

## Installation

```sh
npm install --save-dev repo-contract
```

Requires Node.js `>=20.0.0`.

While repo-contract is pre-1.0, pin a tilde range (`"repo-contract": "~0.1.0"`): a `0.x` **minor** bump can carry a breaking change to the Stable tier (see [VERSIONING.md](VERSIONING.md)), so read the [CHANGELOG](CHANGELOG.md)'s breaking-changes notes on every minor upgrade, not just majors.

`yaml` is an optional peer dependency, needed only if a check requests `output: { format: "yaml" }`:

```sh
npm install --save-dev yaml
```

### Runtime support matrix

repo-contract spawns processes and reads `process.env` — it is server/CLI-only by design, not an isomorphic/browser package.

| Environment                                | Supported                                                                                                                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Node.js `>=20.0.0` (macOS, Linux, Windows) | Yes                                                                                                                                                                                                          |
| Bun (latest release)                       | Yes — tested in CI against the real published package shape. No non-default permissions needed.                                                                                                              |
| Deno (latest release)                      | Yes — tested in CI against the real published package shape. Requires `--allow-read --allow-run --allow-env` (see [ADR 0003](specs/decisions/0003-cross-platform-command-execution-and-process-cleanup.md)). |
| Browser                                    | No — this package executes local processes                                                                                                                                                                   |

See [ADR 0003](specs/decisions/0003-cross-platform-command-execution-and-process-cleanup.md) for what "tested" covers here and why.

### Accessibility

repo-contract has no user interface. It produces machine-readable `Evidence`/`Verdict` objects and typed errors; any rendering — a terminal summary, a CI annotation, a dashboard — is the consumer's surface, and WCAG / accessibility conformance applies there, not here.

## Quick start

Define your repository's standards as checks:

```ts
// repo-contract.config.ts
import { defineRepoContract } from "repo-contract"

export default defineRepoContract({
  checks: {
    tests: {
      run: "npm test",

      policy: ({ result }) =>
        result.exitCode === 0
          ? {
              outcome: "pass",
              rationale: "Tests exited 0.",
            }
          : {
              outcome: "fail",
              rationale: "Tests must pass.",
            },
    },

    mutation: {
      run: "npm run mutation",
      output: { format: "json" },

      policy: ({ result }) => {
        if (!result.output?.success) {
          return {
            outcome: "fail",
            rationale: "Mutation report was not valid JSON.",
          }
        }

        const score = (result.output.value as { mutationScore: number }).mutationScore

        return score >= 90
          ? {
              outcome: "pass",
              rationale: `Mutation score was ${score}%.`,
            }
          : {
              outcome: "fail",
              rationale: `Mutation score must be at least 90% (got ${score}%).`,
            }
      },
    },
  },
})
```

Execute the contract:

```ts
import { runRepoContract } from "repo-contract"
import config from "./repo-contract.config.js"

const { evidence, verdict } = await runRepoContract(config)

console.log(verdict.passed)
console.log(verdict.checks.mutation)

process.exitCode = verdict.passed ? 0 : 1
```

`runRepoContract()` never calls `process.exit()` itself. Your integration decides what to do with the result.

There is no CLI, no config-file discovery magic, and no hidden state.

## The model

```text
check configuration
        |
        v
execute checks
        |
        v
collect evidence
        |
        v
optionally parse explicitly requested output
        |
        v
execute per-check policy
        |
        v
PolicyResult {
  outcome: "pass" | "fail" | "warn",
  rationale: string
}
        |
        v
aggregate verdict
        |
        v
{ evidence, verdict }
```

**Evidence** describes what happened: the command, its exit code, signal, timing, captured stdout/stderr, and, if requested, parsed output.

Evidence never decides whether the result was acceptable.

**Verdict** describes whether the result was acceptable according to your policies.

**Policies are repository-owned.** A policy returns:

```ts
{
  outcome: "pass" | "fail" | "warn"
  rationale: string
}
```

`rationale` is mandatory for every outcome, including `"pass"`. It should contain enough actionable detail — file/line locations, rule IDs, test names, counts, or other relevant information — that a human, CI system, or AI agent can understand the result without rerunning the check.

`"warn"` is non-blocking. It means the policy's requirements were satisfied but the evidence is worth surfacing for review.

## AI guardrails

AI coding systems have become capable of producing substantial amounts of working software. The problem is no longer simply whether an AI can write code.

The problem is whether the code consistently satisfies the engineering standards of the repository.

Robert C. Martin ("Uncle Bob") has discussed this problem publicly, describing AI-generated code that can appear productive while still leaving significant amounts of poor-quality code behind. His experience highlighted an important distinction: giving an AI more and more software-development guidance is not necessarily the best way to improve the result.

Instead of attempting to put every engineering principle, convention, and quality rule into an AI's context window, put the important rules around the AI as **enforceable guardrails**.

repo-contract lets your repository define those guardrails.

For example:

```text
AI writes code
      |
      v
repo-contract
      |
      +--> tests
      +--> typecheck
      +--> lint
      +--> coverage
      +--> mutation testing
      +--> architecture
      +--> security
      +--> API compatibility
      +--> repository-specific standards
      |
      v
actionable verdict
      |
      v
AI fixes what failed
```

The AI does not need to memorize every rule.

It needs to satisfy the repository's contract.

This is particularly useful for quality checks that are difficult to express through instructions alone. Mutation testing can test whether a test suite actually detects meaningful code changes. CRAP reports can expose code that combines complexity with insufficient test coverage. Your policy can simply require a low CRAP score or it can require both a low score and a maximum complexity. Security checks can enforce dependency and secret-management standards. Architecture checks can enforce dependency boundaries.

The result is a feedback loop:

```text
generate
   |
   v
verify
   |
   v
explain failure
   |
   v
fix
   |
   v
verify again
```

The policy rationale is important here. A result such as:

```text
FAIL: mutation score must be at least 90% (got 82%)
```

is useful to a human.

A result such as:

```text
FAIL: 3 mutants survived in src/auth/session.ts;
```

is useful to both a human and an AI agent.

repo-contract does not attempt to become an AI coding agent. It provides the executable boundary against which an agent's work can be evaluated.

**The repository supplies the guardrails. The AI supplies the implementation.**

## Open source contribution guardrails

Open source projects face a different version of the same problem.

A maintainer may know exactly what a contribution needs to satisfy, while a first-time contributor has no way to know all of those expectations.

The result can be repeated review cycles:

```text
contributor submits PR
        |
        v
maintainer finds issue
        |
        v
contributor fixes issue
        |
        v
another issue is discovered
        |
        v
repeat
```

repo-contract can move those expectations into an executable contract.

A project can enforce standards for:

- tests and test coverage;
- mutation scores;
- formatting and linting;
- type safety;
- architecture;
- documentation;
- dependency security;
- licenses;
- public API compatibility;
- generated artifacts;
- package publishing;
- repository-specific conventions.

More importantly, policies can interpret the evidence and provide actionable guidance.

Instead of:

```text
CI failed.
```

a contributor can receive:

```text
FAIL: public API compatibility check failed.

2 breaking changes were detected:

- Removed export: ContractResult
- Changed parameter type: runRepoContract(config)

Restore the export or document the breaking change according to
the repository's versioning policy.
```

This reduces the amount of repository knowledge a contributor must acquire before making a successful contribution.

It also gives maintainers a consistent enforcement mechanism that does not depend on a particular maintainer remembering every rule during review.

The goal is not to eliminate human review.

The goal is to make human review focus on the things that require human judgment rather than repeatedly identifying mechanical violations.

## Defining checks

Each check owns its identifier, command, output interpretation, and policy:

```ts
checks: {
  lint: {
    run: ["eslint", ".", "--format", "json"],
    output: { format: "json" },

    policy: ({ result }) => {
      if (!result.output?.success) {
        return {
          outcome: "fail",
          rationale: "ESLint output was not valid JSON.",
        }
      }

      const files = result.output.value as { errorCount: number }[]
      const errors = files.reduce((sum, file) => sum + file.errorCount, 0)

      return errors === 0
        ? {
            outcome: "pass",
            rationale: "ESLint reported 0 errors.",
          }
        : {
            outcome: "fail",
            rationale: `${errors} lint error(s).`,
          }
    },
  },
}
```

### `run`

A `string` is tokenized into an executable and its arguments **without invoking a shell**.

Shell operators such as `;`, `&`, `|`, backticks, `$(...)`, `<`, `>`, and newlines are not interpreted. A string containing one is rejected with a configuration error because it indicates an assumption that shell interpretation is occurring.

Glob characters such as `*`, `?`, `~`, `[`, `]`, `{`, and `}` are not rejected. Many CLI tools expand their own arguments internally, and each argument is passed through as its own, separately-escaped element rather than concatenated into a command line, so those characters do not create shell injection behavior. (On Windows, resolving a `.cmd`/`.bat` shim unavoidably routes through `cmd.exe` — see [Security model](#security-model) and [SECURITY.md](SECURITY.md) for that platform-specific nuance.)

A `readonly string[]` bypasses tokenization entirely and is used as argv verbatim. This is the recommended form for arguments containing characters that should never be interpreted.

```ts
run: "eslint . --max-warnings 0"
run: ["eslint", ".", "--max-warnings", "0"]
run: "npm run build && npm test" // throws: run string contains an unquoted "&" -- use array form or "shell: true"
```

To opt into real shell execution, including pipes, redirects, and `&&`, set `shell: true`. In that mode `run` must be a string and is passed to the platform shell as-is.

See [Security model](#security-model) before enabling this.

### `output`

By default, check output is not parsed. `result.stdout` and `result.stderr` contain the captured raw text.

Request parsing explicitly:

```ts
output: {
  format: "json"
}
```

Uses `JSON.parse`. Malformed output produces:

```ts
{
  success: false,
  error: string
}
```

and never throws.

```ts
output: {
  format: "yaml"
}
```

Requires the optional `yaml` peer dependency.

```ts
output: {
  format: "text"
}
```

Provides trimmed text passthrough and always succeeds.

`result.output.value` is `unknown` for every format. repo-contract has no schema knowledge of what an external tool prints, so your policy narrows or casts it according to the tool's actual output.

`result.output` is `undefined` when a check does not request a format. If a policy reads `result.output.value` (or `.success`/`.error`/`.format`) without narrowing first, and that check never configured `output`, `runRepoContract()` rejects with [`PolicyReadUnrequestedOutputError`](docs/api-report/repo-contract.api.md), which names the check and tells you to add `output: { format: "json" }` (or `"yaml"`/`"text"`) -- rather than the generic `PolicyThrewError` you'd otherwise have to debug from a bare "Cannot read properties of undefined" stack trace.

The sibling mistake -- reading `result.output.value` when the format _was_ requested but the parse itself failed (`result.output.success === false`, so `result.output` has `error`, not `value`) -- similarly rejects with [`PolicyReadFailedParseValueError`](docs/api-report/repo-contract.api.md) instead of a generic `PolicyThrewError`. Check `result.output.success` before reading `.value` to handle a parse failure explicitly rather than hitting either error.

### `dependsOn`

By default, every check runs independently and in parallel.

Name other check IDs to establish explicit execution ordering:

```ts
checks: {
  build: {
    run: "npm run build",

    policy: ({ result }) =>
      result.exitCode === 0
        ? {
            outcome: "pass",
            rationale: "Build succeeded.",
          }
        : {
            outcome: "fail",
            rationale: "Build failed.",
          },
  },

  integration: {
    run: "npm run test:integration",
    dependsOn: ["build"],

    policy: ({ result }) =>
      result.exitCode === 0
        ? {
            outcome: "pass",
            rationale: "Integration tests passed.",
          }
        : {
            outcome: "fail",
            rationale: "Integration tests failed.",
          },
  },
}
```

Independent checks run concurrently. `dependsOn` allows checks to express ordering only when ordering is actually required.

`dependsOn` does not cause repo-contract to decide whether the dependent check should run based on the dependency's policy result. That decision belongs to the dependent check's command or policy.

Artifacts needed by another check should flow through the filesystem or another system designed for data transfer. `dependsOn` controls execution ordering; it does not move data between checks.

Every named dependency must exist in `checks`, a check cannot depend on itself, and the entire dependency graph must be acyclic. These conditions are validated synchronously before anything is spawned.

### `policy`

```ts
interface PolicyResult {
  outcome: "pass" | "fail" | "warn"
  rationale: string
}

policy: (ctx) => PolicyResult | Promise<PolicyResult>
```

`outcome` is the policy's own judgment:

- `"pass"` — the evidence satisfies the repository's requirements.
- `"fail"` — it does not.
- `"warn"` — the requirements are satisfied, but something worth reviewing should be surfaced.

`"warn"` never fails `verdict.passed`.

`rationale` is required for every outcome. It should contain enough actionable information that the consumer can understand the result without rerunning the command or re-parsing its output.

Prefer:

```text
ESLint reported 2 errors:
- src/foo.ts:12:4 [no-explicit-any]: Unexpected any.
- src/bar.ts:8:7 [no-unused-vars]: 'value' is defined but never used.
```

over:

```text
See output above.
```

`ctx.result` is the current check's evidence.

`ctx.evidence` is the entire run's evidence, including every sibling check. Every configured check completes execution and has its evidence fully assembled before policies run, allowing policies to reason across checks:

```ts
policy: ({ result, evidence }) => {
  const testsPassed = evidence.checks.tests?.exitCode === 0

  if (!testsPassed) {
    return {
      outcome: "fail",
      rationale: "Mutation policy requires the test suite to pass.",
    }
  }

  const score = Number(result.stdout)

  return score >= 90
    ? {
        outcome: "pass",
        rationale: `Mutation score was ${score}%.`,
      }
    : {
        outcome: "fail",
        rationale: `Mutation score must be at least 90% (got ${score}%).`,
      }
}
```

`ctx.dependencies` contains this check's declared `dependsOn` evidence, keyed by ID. It is `{}` for a check without dependencies and is never `undefined`.

```ts
policy: (ctx) => {
  const buildOutput = ctx.dependencies.build?.stdout

  return buildOutput?.includes("Compiled successfully")
    ? {
        outcome: "pass",
        rationale: "Build output confirmed compilation succeeded.",
      }
    : {
        outcome: "fail",
        rationale: "Build output did not confirm successful compilation.",
      }
}
```

Dependency policy results are not included in `ctx.dependencies`. They remain available at the top-level `Verdict`.

A policy is always invoked for every check, regardless of how that check's process ended: completed, timed out, killed by a signal, or failed to spawn.

repo-contract does not decide what those execution outcomes mean. Your policy does.

A policy that throws is different. A thrown or rejected policy represents a bug in policy code, not a failed engineering check. `runRepoContract()` rejects with `PolicyThrewError`, or an `AggregateError` when multiple policies throw.

Other execution options include:

- `cwd`
- `env`
- `inheritEnv`
- `timeoutMs`

`inheritEnv` defaults to `true`. Set it to `false` when a check requires a minimal environment.

## Preset checks

You do not have to hand-write every common check.

`repo-contract/presets` ships a curated, growing catalog of ready-made `CheckDefinitionConfig`s for tools commonly used by TypeScript and JavaScript repositories.

A preset encodes how to execute and interpret a common tool.

It does **not** encode your repository's definition of quality.

Import a preset, spread it into your own `checks` record, and override whatever you need — most often `policy`:

```ts
import { defineRepoContract } from "repo-contract"
import { format, typecheck, license } from "repo-contract/presets"

export default defineRepoContract({
  checks: {
    format,
    typecheck: {
      ...typecheck,
      timeoutMs: 60_000,
    },
    license: {
      ...license,
      policy: myStricterLicensePolicy,
    },
  },
})
```

Some presets are factories because they expose options that change what gets executed:

```ts
import { defineRepoContract } from "repo-contract"
import { lint, deadCode } from "repo-contract/presets"

export default defineRepoContract({
  checks: {
    lint: lint({ path: "src" }),
    deadCode: deadCode({
      exemptUnusedDevDependencies: ["some-cli-only-tool"],
    }),
  },
})
```

**Preset options are the preferred way to change what a preset executes.** A direct `run` override is an escape hatch.

Using options keeps your configuration decoupled from a preset's exact command representation, which can evolve independently.

Every execution-affecting preset option is threaded through the actual command line so evidence records the exact options used in `evidence.checks.<id>.args`.

Every preset's policy fails with an actionable message if its underlying tool is not installed, with one deliberate exception: `securityDeps` shells out to `npm` itself, which cannot be "missing" in any environment capable of running `npm run <script>` at all. repo-contract never installs, bundles, or implicitly depends on these tools.

Each preset assumes its CLI is already a devDependency of your repository:

```sh
npm install --save-dev prettier
```

or:

```sh
pnpm add -D prettier
yarn add -D prettier
bun add -d prettier
```

| Category            | Preset                   | Wraps                                                                          |
| ------------------- | ------------------------ | ------------------------------------------------------------------------------ |
| Testing             | `test`                   | `vitest run --reporter=json`                                                   |
| Testing             | `e2e`                    | `playwright test --reporter=json`                                              |
| Code quality        | `lint(options?)`         | `eslint <path> --format json`                                                  |
| Code quality        | `format`                 | `prettier --write .`                                                           |
| Code quality        | `typecheck`              | `tsc --noEmit -p tsconfig.json`                                                |
| Code quality        | `deadCode(options?)`     | `knip --reporter json`                                                         |
| Code quality        | `duplication(options?)`  | `jscpd <path> --reporters json --output reports/jscpd --silent`                |
| Code quality        | `stylelint(options?)`    | `stylelint <glob> --formatter json`                                            |
| Docs                | `markdownlint(options?)` | `markdownlint-cli2 <glob>` — requires repository configuration for JSON output |
| Docs                | `brokenLinks(options?)`  | `linkinator <start> --recurse --format json --skip node_modules`               |
| Security/governance | `securityDeps`           | `npm audit --omit=dev --json`                                                  |
| Security/governance | `securitySecrets`        | `secretlint --format json --output reports/secretlint.json **/*`               |
| Security/governance | `license`                | `licensee --production --osi --errors-only --ndjson`                           |
| Security/governance | `commitlint(options?)`   | `commitlint --from <from> --to <to>`                                           |
| Publishing          | `publint`                | `publint run`                                                                  |
| Publishing          | `arethetypeswrong`       | `attw --pack . --format json`                                                  |

Not every test runner has a preset. Jest, Cypress, and Mocha have different reporter formats and may require bespoke presets. The underlying pattern remains the same: execute the tool, capture evidence, interpret its output, and apply your repository's policy.

Unlike its neighbors, `format` auto-fixes (`--write`) and therefore cannot itself fail on unformatted input — `prettier --write` reports success once it finishes rewriting files. If you want a hard gate on formatting (in CI, for example), run `prettier --check .` directly instead of this preset.

## Evidence

See the generated [API report](docs/api-report/repo-contract.api.md) for the full field-by-field reference on `Evidence` and `CheckEvidence`.

```ts
interface Evidence {
  version: 1
  startedAt: string
  completedAt: string
  durationMs: number

  checks: Record<
    string,
    {
      command: string
      args: readonly string[]
      startedAt: string
      completedAt: string
      durationMs: number
      exitCode: number | null
      signal: NodeJS.Signals | null
      stdout: string
      stderr: string
      status: "completed" | "timed_out" | "signaled" | "host_terminated" | "spawn_error" | "aborted"
      spawnError?: string
      output?:
        | {
            format: string
            success: true
            value: unknown
          }
        | {
            format: string
            success: false
            error: string
          }
    }
  >
}
```

`status` distinguishes **why** a process ended in its terminal state, independently of whether the policy considered that result acceptable.

A non-zero exit code is `status: "completed"`, not an execution error.

## Verdict

See the generated [API report](docs/api-report/repo-contract.api.md) for the full field-by-field reference on `Verdict`.

```ts
interface Verdict {
  version: 2
  passed: boolean

  checks: Record<
    string,
    {
      outcome: "pass" | "fail" | "warn"
      rationale: string
    }
  >
}
```

`checks[id]` is that check's own `PolicyResult`, exactly as returned by its policy.

`passed` is `true` only when every check's outcome is `"pass"` or `"warn"`.

`"fail"` is the only outcome that fails the run.

`Verdict` is returned alongside `Evidence`, never merged into it. Consumers can inspect:

```ts
evidence.checks[id]
```

to understand what happened and:

```ts
verdict.checks[id]
```

to understand what the repository concluded about it.

See [Evidence, policy rationale, and consumer judgment](specs/architecture.md#evidence-policy-rationale-and-consumer-judgment) for why these responsibilities remain separate.

## Regression detection

repo-contract has no built-in baseline system and no persistence layer.

The core engine (validation, execution, evidence, policy) does not read or write files on its own initiative beyond spawning the commands you configure and, where you set `output: { format: "json" | "yaml" }`, parsing that command's own captured stdout. A handful of published presets (`securitySecrets`, `duplication`, `markdownlint`) additionally read back a fixed report file their own `run` command was told to write, as part of interpreting that tool's JSON output — always that preset's own single, hardcoded, tool-specific path, never a scan or discovery of arbitrary files.

If your repository wants regression detection, persist the evidence or relevant measurements yourself and compare them in your policy:

```ts
import baseline from "./baseline.json"

policy: ({ result }) => {
  const current = (result.output?.value as { score: number }).score

  return current >= baseline.mutation.score
    ? {
        outcome: "pass",
        rationale: `Mutation score was ${current}.`,
      }
    : {
        outcome: "fail",
        rationale: `Mutation score regressed from ${baseline.mutation.score} to ${current}.`,
      }
}
```

This keeps persistence and baseline semantics under repository control.

## CI integration

repo-contract has no CLI and no config-discovery magic.

Call `runRepoContract()` from a small script and map the result to a process exit code yourself:

```ts
// scripts/run-contract.mjs
import { runRepoContract } from "repo-contract"
import config from "../repo-contract.config.js"

const { verdict } = await runRepoContract(config)

for (const [id, result] of Object.entries(verdict.checks)) {
  console.log(`[${result.outcome.toUpperCase()}] ${id}: ${result.rationale}`)
}

process.exitCode = verdict.passed ? 0 : 1
```

```json
{
  "scripts": {
    "contract": "tsx scripts/run-contract.mjs"
  }
}
```

The same contract can then be used by local development and CI:

```sh
npm run contract
```

Point a `precommit`, `prepublishOnly`, or CI job at the same command to enforce the same engineering standards in each environment.

This repository uses its own `repo-contract.config.ts` to validate itself. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Enterprise / locked-down environments

The package's entire shipped surface (`src/**` -- the programmatic API and every published preset) has:

- no CLI;
- no network calls;
- no telemetry;
- no automatic package installation;
- no hidden configuration.

It only does what your configuration tells it to do: execute the commands you define with the environment and options you specify. The core engine never discovers or reads a file you didn't ask it to; a small number of presets (`securitySecrets`, `duplication`, `markdownlint`) read back their own tool's fixed, hardcoded report path after running it — see [Regression detection](#regression-detection) above — which is deterministic per preset, not discovery of arbitrary filesystem state.

This makes it suitable for locked-down enterprise environments where tools such as `npx` or network access may be unavailable.

The "no network calls" guarantee is mechanically enforced, not merely documented: an ESLint rule and an independent, ESLint-free repository check both reject network-capable imports, globals, and unreviewed spawned commands anywhere in the shipped surface. See [SECURITY.md](SECURITY.md) for the full threat model and [ADR 0007](specs/decisions/0007-no-network-surface.md) for what's covered, what's deliberately excluded, and why.

## Security model

Command execution is the core of this package and therefore a security-sensitive boundary.

The default `run` behavior — whether a string or array — never explicitly invokes a shell. On POSIX this means no shell is invoked at all; on Windows, resolving a `.cmd`/`.bat` shim (how most npm-installed CLIs are actually invoked there) unavoidably routes through `cmd.exe`, with argument escaping — not shell absence — providing the same safety property. See [SECURITY.md](SECURITY.md) for the full platform-specific detail.

No untrusted value is interpolated into a command line in a way that lets it inject a second command, a redirect, or a pipeline.

`shell: true` is an explicit opt-in exception with different security properties. Whatever you put in `run` is handed to the platform shell verbatim.

Never construct a `run` string by concatenating untrusted input, such as content originating from a pull request.

See [SECURITY.md](SECURITY.md) for the complete threat model, including environment variables, command execution, captured output, and shell execution.

## Errors

See the generated [API report](docs/api-report/repo-contract.api.md) for each error class's exact shape and `code` string.

repo-contract distinguishes several failure categories and does not conflate them.

**Configuration errors** (`InvalidRepoContractConfigError`, `InvalidCheckConfigError`) indicate structurally invalid configuration. They are thrown synchronously before anything spawns.

**Execution outcomes** include missing binaries, timeouts, non-zero exits, signals, and aborted processes. These are recorded as evidence rather than thrown so that repository policies can decide what they mean.

**Parser errors** occur when requested output cannot be parsed. They are recorded as:

```ts
{
  success: false,
  error: string
}
```

on `result.output`, while raw stdout remains available.

**Policy failures** occur when your policy returns:

```ts
{
  outcome: "fail",
  rationale: string
}
```

This is not an error in repo-contract.

It is the contract working correctly.

A **policy throwing** is different. A synchronous throw or rejected promise from policy code indicates a bug in the policy itself and causes `runRepoContract()` to reject with `PolicyThrewError`, or an `AggregateError` when multiple policies throw.

Two specific mistakes get their own error instead of a plain `PolicyThrewError`, both naming the check: reading `result.output.value` (or `.success`/`.error`/`.format`) on a check that never configured `output` throws `PolicyReadUnrequestedOutputError`, telling you to add `output: { format: "json" }` (or `"yaml"`/`"text"`); reading `result.output.value` on a check whose requested parse actually failed throws `PolicyReadFailedParseValueError`, telling you to check `result.output.success` first -- see [`output`](#output).

## Status and versioning

repo-contract is pre-1.0.

Per [VERSIONING.md](VERSIONING.md), minor versions may include breaking changes to the Stable tier before 1.0.

See [CHANGELOG.md](CHANGELOG.md) for release history.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and how this repository's own `repo-contract.config.ts` uses the package to validate itself, and [RELEASING.md](RELEASING.md) for the release process.

## License

MIT — see [LICENSE](LICENSE).
