# repo-contract

[![CI](https://github.com/MaverickCER/repo-contract/actions/workflows/ci.yml/badge.svg)](https://github.com/MaverickCER/repo-contract/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/repo-contract.svg)](https://www.npmjs.com/package/repo-contract)
[![License](https://img.shields.io/npm/l/repo-contract.svg)](LICENSE)
[![Coverage](https://img.shields.io/badge/coverage-%E2%89%A585%25-brightgreen)](scripts/coverage-thresholds.mjs)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](tsconfig.json)
[![Node](https://img.shields.io/node/v/repo-contract.svg)](package.json)
[![Socket Badge](https://badge.socket.dev/npm/package/repo-contract/latest)](https://badge.socket.dev/npm/package/repo-contract/latest)

**Turn your repository's engineering standards into enforceable contracts.**

Your tools produce the facts. Your repository decides what those facts mean.

[Quick start](#quick-start) · [See real output](#see-real-output) · [API reference](https://maverickcer.github.io/repo-contract/api/)

## What repo-contract does

You define the engineering standards your repository cares about — tests, coverage, mutation testing, linting, security scanning, documentation, dependency health, or anything else that runs as a command. Each check executes a command, repo-contract captures what actually happened as evidence, and a policy function **you write** decides whether that evidence is acceptable. repo-contract aggregates every policy result into one verdict.

```text
ESLint, Vitest, Stryker, npm audit, ...
              |
        repo-contract
              |
     evidence + verdict
              |
      local hooks / CI
```

It does not decide what "good code" means. **Your repository does.** That is what makes it different from a test runner, linter, CI provider, or quality analyzer: it executes those tools, captures their results, and gives your repository a single programmable enforcement layer across all of them.

The result is not merely "the tests passed." It is a repository-defined engineering contract with evidence explaining why.

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

## Why repo-contract?

- **Repository-owned standards** — the contract lives in your repository, in typed code you control. CI is one consumer of it, not the place it is defined.
- **Unified, structured evidence** — exit code, signal, timing, and captured/parsed output for every check, in one stable shape you can persist or diff over time.
- **Cross-check policies** — a policy can read any other check's evidence, because every check finishes before any policy runs.
- **Actionable rationales** — every outcome, including pass, carries a mandatory rationale a human, CI system, or AI agent can act on without rerunning anything.
- **The same contract, everywhere** — the same definition runs in a pre-commit hook, a pre-push hook, and CI.
- **Reusable across an org** — a shared contract package can be inherited by every repository, instead of reconstructing CI logic in each one. See [Standardize once, enforce everywhere](#standardize-once-enforce-everywhere).

## When this isn't worth adopting

If your CI already runs each tool as its own separate step with its own separate pass/fail gate, and you do not need unified evidence or policies that reason across checks, plain shell scripts in your CI configuration may be all you need. repo-contract earns its keep when you want a single programmatic contract across multiple engineering standards, evidence you can persist or diff over time, or policies that reason about more than one check's output.

## Who is repo-contract for?

- **Teams maintaining complex repositories** — when engineering standards span multiple tools and need a common enforcement model.
- **Organizations standardizing repositories** — when multiple services should inherit the same engineering contract rather than independently recreating CI logic.
- **Open-source maintainers** — when contributors need executable expectations rather than institutional knowledge.
- **Teams using AI coding agents** — when generated changes must satisfy the same repository standards as human-written changes.

If your repository only needs a handful of independent CI steps, repo-contract may not add enough value.

## Installation

```sh
npm install --save-dev repo-contract
```

Requires Node.js `>=20.0.0` (Bun and Deno are also tested — see [Runtime support](#runtime-support)).

While repo-contract is pre-1.0, pin a tilde range (`"repo-contract": "~0.1.0"`): a `0.x` **minor** bump can carry a breaking change to the Stable tier (see [VERSIONING.md](VERSIONING.md)), so read the [CHANGELOG](CHANGELOG.md)'s breaking-changes notes on every minor upgrade, not just majors.

`yaml` is an optional peer dependency, needed only if a check requests `output: { format: "yaml" }`:

```sh
npm install --save-dev yaml
```

## Quick start

Define one check, run it, read the verdict:

```ts
// repo-contract.config.ts
import { spawn } from "node:child_process"
import { defineRepoContract } from "repo-contract"

export default defineRepoContract({
  spawn,
  env: process.env,
  checks: {
    tests: {
      run: "npm test",
      policy: ({ result }) =>
        result.exitCode === 0
          ? { outcome: "pass", rationale: "Tests passed." }
          : { outcome: "fail", rationale: "Tests must pass." },
    },
  },
})
```

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

`runRepoContract()` never calls `process.exit()` itself. Your integration decides what to do with the result. There is no CLI and no config-file discovery — the contract is a plain function call.

> **`spawn` and `env` are required fields.** repo-contract never imports a process-spawning implementation or reads `process.env` itself — you supply both, as trusted capabilities (see [Supplying `spawn`/`env`](#supplying-spawnenv) for the reason and the Windows integration).

Point a `precommit`, `prepublishOnly`, or CI job at the same command to enforce the same standards in every environment. This repository uses its own `repo-contract.config.ts` to validate itself — see [CONTRIBUTING.md](CONTRIBUTING.md).

## See real output

This is the actual result of running the tiny contract in [`examples/demo/`](examples/demo/README.md) — three real, published presets, evaluated against one deliberately imperfect file:

```ts
// examples/demo/repo-contract.config.ts
checks: {
  typecheck,
  format: { ...format, run: ["prettier", "--check", "."] },
  lint: lint(),
}
```

```text
$ npm run demo

[PASS] typecheck
  tsc reported no type errors.

[FAIL] format
  Prettier reported formatting failures: Checking formatting...
  [warn] src/greet.ts
  [warn] Code style issues found in the above file. Run Prettier with --write to fix.

[WARN] lint
  ESLint reported 0 errors but 1 warning(s):
  - src/greet.ts:15:3 [no-console]: Unexpected console statement.
```

That is real output, not a mockup — run it yourself with `npm run demo` from `examples/demo/`. The important difference: every result says what happened and why the repository interpreted it that way. `format` names the file and the exact fix (`prettier --write`). `lint` is a non-blocking `"warn"` and still names the file, the line, and the rule. Nothing says "CI failed" without saying why.

## The model

```text
Engineering standards
        |
        v
   repo-contract
        |
   .----+----.
   v         v
Evidence   Policy
   |         |
   '----+----'
        v
     Verdict
        |
   .----+----.
   v         v
 Local       CI
```

```text
Evidence → What happened?
Policy   → What does our standard require?
Verdict  → Did the contract pass?
Consumer → What should happen next?
```

**Evidence** describes what happened: the command, its exit code, signal, timing, captured stdout/stderr, and, if requested, parsed output. Evidence never decides whether the result was acceptable.

**Policy** is repository-owned. It returns:

```ts
{
  outcome: "pass" | "fail" | "warn"
  rationale: string
}
```

`rationale` is mandatory for every outcome, including `"pass"`. It should contain enough actionable detail — file/line locations, rule IDs, test names, counts — that the result is understandable without rerunning the check.

`"warn"` is non-blocking: the policy's requirements were satisfied, but the evidence is worth surfacing. Whether an observation deserves `"warn"` or a plain `"pass"` is a repository-owned decision — repo-contract gives you the outcome and the mandatory rationale; it doesn't compute "margin" on your behalf.

**Verdict** aggregates every policy result. `passed` is `true` only when every outcome is `"pass"` or `"warn"`; `"fail"` is the only outcome that fails the run.

**The consumer** decides what to do with the verdict — CI can block a merge, a script can set an exit code, a bot or human can inspect the result. `Verdict` is returned alongside `Evidence`, never merged into it, so a consumer has both `evidence.checks[id]` and `verdict.checks[id]` independently. See [Evidence, policy rationale, and consumer judgment](specs/architecture.md#evidence-policy-rationale-and-consumer-judgment) for why these responsibilities stay separate.

## Defining checks

Each check owns its identifier, command, output interpretation, and policy:

```ts
checks: {
  lint: {
    run: ["eslint", ".", "--format", "json"],
    output: { format: "json" },

    policy: ({ result }) => {
      if (!result.output?.success) {
        return { outcome: "fail", rationale: "ESLint output was not valid JSON." }
      }

      const files = result.output.value as { errorCount: number }[]
      const errors = files.reduce((sum, file) => sum + file.errorCount, 0)

      return errors === 0
        ? { outcome: "pass", rationale: "ESLint reported 0 errors." }
        : { outcome: "fail", rationale: `${errors} lint error(s).` }
    },
  },
}
```

### `run`

A `string` is tokenized into an executable and its arguments **without invoking a shell**.

Shell operators such as `;`, `&`, `|`, backticks, `$(...)`, `<`, `>`, and newlines are not interpreted. A string containing one is rejected with a configuration error because it indicates an assumption that shell interpretation is occurring.

Glob characters such as `*`, `?`, `~`, `[`, `]`, `{`, and `}` are not rejected. Many CLI tools expand their own arguments internally, and each argument is passed through as its own, separately-escaped element rather than concatenated into a command line, so those characters do not create shell injection behavior. (On Windows, resolving a `.cmd`/`.bat` shim unavoidably routes through `cmd.exe` — see [Security model](#security-model) and [SECURITY.md](SECURITY.md).)

A `readonly string[]` bypasses tokenization entirely and is used as argv verbatim. This is the recommended form for arguments containing characters that should never be interpreted.

```ts
run: "eslint . --max-warnings 0"
run: ["eslint", ".", "--max-warnings", "0"]
run: "npm run build && npm test" // throws: run string contains an unquoted "&" -- use array form or "shell: true"
```

To opt into real shell execution, including pipes, redirects, and `&&`, set `shell: true`. In that mode `run` must be a string and is passed to the platform shell as-is. See [Security model](#security-model) before enabling this.

### `output`

By default, check output is not parsed. `result.stdout` and `result.stderr` contain the captured raw text.

Request parsing explicitly:

```ts
output: {
  format: "json"
} // JSON.parse; malformed output produces { success: false, error } and never throws
output: {
  format: "yaml"
} // requires the optional `yaml` peer dependency
output: {
  format: "text"
} // trimmed text passthrough; always succeeds
```

`result.output.value` is `unknown` for every format. repo-contract has no schema knowledge of what an external tool prints, so your policy narrows or casts it according to the tool's actual output.

`result.output` is `undefined` when a check does not request a format. If a policy reads `result.output.value` (or `.success`/`.error`/`.format`) without narrowing first, and that check never configured `output`, `runRepoContract()` rejects with [`PolicyReadUnrequestedOutputError`](docs/api-report/repo-contract.api.md), which names the check and tells you to add `output: { format: "json" }` — rather than the generic `PolicyThrewError` you'd otherwise have to debug from a bare "Cannot read properties of undefined" stack trace. The sibling mistake — reading `result.output.value` when the format _was_ requested but the parse failed (`result.output.success === false`) — similarly rejects with [`PolicyReadFailedParseValueError`](docs/api-report/repo-contract.api.md). Check `result.output.success` before reading `.value`.

#### Validating parsed output with a schema

`output.schema` accepts any object implementing [Standard Schema](https://standardschema.dev) — Zod, Valibot, ArkType, and others already do. repo-contract does not install or depend on any of them; it hand-vendors the (pure-type, zero-runtime-code) `StandardSchemaV1` interface itself (see [ADR 0012](specs/decisions/0012-hand-vendored-standard-schema-support-for-optional-output-validation.md)). Bring whichever schema library your repo already uses. The smallest possible example, using a hand-written object satisfying the interface directly:

```ts
output: {
  format: "json",
  schema: {
    "~standard": {
      version: 1,
      vendor: "example",
      validate: (value) => {
        const errorCount =
          value !== null && typeof value === "object"
            ? (value as { errorCount?: unknown }).errorCount
            : undefined
        return typeof errorCount === "number"
          ? { value: { errorCount } }
          : { issues: [{ message: "errorCount must be a number", path: ["errorCount"] }] }
      },
    },
  },
}
```

A successful validation _replaces_ `result.output.value` with the schema's own (possibly transformed or coerced) output — a schema can normalize, default, or reshape its input, and the policy receives that result. A failing validation becomes a normal `ParsedOutputFailure`, indistinguishable in shape from a malformed-JSON parse failure, joining every issue's path and message into `result.output.error`. `result.output.value`'s declared type stays `unknown` regardless.

`schema["~standard"].validate()` itself throwing or rejecting (rather than returning a `Result`) means the schema is broken, not the check's output, so it rejects `runRepoContract()` with `StandardSchemaValidateThrewError` instead of becoming evidence.

### `policy`

```ts
interface PolicyResult {
  outcome: "pass" | "fail" | "warn"
  rationale: string
}

policy: (ctx) => PolicyResult | Promise<PolicyResult>
```

`ctx.result` is the current check's evidence. `ctx.evidence` is the entire run's evidence, including every sibling check — every configured check completes execution and has its evidence fully assembled before policies run, so policies can reason across checks:

```ts
policy: ({ result, evidence }) => {
  if (evidence.checks.tests?.exitCode !== 0) {
    return { outcome: "fail", rationale: "Mutation policy requires the test suite to pass." }
  }
  const score = Number(result.stdout)
  return score >= 90
    ? { outcome: "pass", rationale: `Mutation score was ${score}%.` }
    : { outcome: "fail", rationale: `Mutation score must be at least 90% (got ${score}%).` }
}
```

`ctx.dependencies` contains this check's declared `dependsOn` evidence, keyed by ID. It is `{}` for a check without dependencies and is never `undefined`. Dependency policy results are not included — they remain available at the top-level `Verdict`.

A policy is always invoked for every check, regardless of how that check's process ended: completed, timed out, killed by a signal, or failed to spawn. repo-contract does not decide what those outcomes mean; your policy does.

A policy that _throws_ is different — a thrown or rejected policy represents a bug in policy code, not a failed engineering check. `runRepoContract()` rejects with `PolicyThrewError`, or an `AggregateError` when multiple policies throw.

Other execution options: `cwd`, `env`, `inheritEnv` (defaults to `true`; set `false` for a minimal environment), `timeoutMs`.

## Multiple checks

By default, every check runs independently and in parallel. Name other check IDs in `dependsOn` to establish explicit execution ordering:

```ts
checks: {
  build: {
    run: "npm run build",
    policy: ({ result }) =>
      result.exitCode === 0
        ? { outcome: "pass", rationale: "Build succeeded." }
        : { outcome: "fail", rationale: "Build failed." },
  },

  integration: {
    run: "npm run test:integration",
    dependsOn: ["build"],
    policy: ({ result }) =>
      result.exitCode === 0
        ? { outcome: "pass", rationale: "Integration tests passed." }
        : { outcome: "fail", rationale: "Integration tests failed." },
  },
}
```

A dependency must be declared before the check that names it — naming a check declared later in the same `checks` record is a configuration error, not a forward reference. `dependsOn` controls execution ordering only; it does not move data between checks (flow artifacts through the filesystem) and it does not decide whether the dependent check runs based on the dependency's policy result (that belongs to the dependent check's command or policy).

Every named dependency must exist, a check cannot depend on itself, and the entire dependency graph must be acyclic. These conditions are validated synchronously before anything is spawned. Checks whose tooling needs exclusive access can declare `isolated`.

## A fuller example: cross-check policy

Once a contract grows past "run tests, run mutation," it typically starts reasoning across checks. This example uses a preset as-is and one spread and overridden, orders execution with `dependsOn`, reads a sibling check's evidence, and produces a specific, actionable `"warn"` instead of a vague one:

```ts
// repo-contract.config.ts
import { spawn } from "node:child_process"
import { defineRepoContract } from "repo-contract"
import { test, typecheck } from "repo-contract/presets"
import {
  readCoverageSummary,
  weakestFile,
  readSurvivingMutants,
  describeMutant,
} from "./contract/reports.js"

const COVERAGE_FLOOR = 85
const MUTATION_FLOOR = 90

export default defineRepoContract({
  spawn,
  env: process.env,
  checks: {
    // A preset used exactly as published.
    typecheck,

    // The same preset, spread and overridden: published command and output
    // parsing, your timeout.
    tests: { ...test, timeoutMs: 300_000 },

    // Your own check. `output: { format: "json" }` is what makes
    // `result.output.value` available to the policy at all.
    coverage: {
      run: ["npm", "run", "coverage", "--", "--reporter=json-summary"],
      output: { format: "json" },
      policy: ({ result }) => {
        const summary = readCoverageSummary(result.output)
        if (!summary.ok) return summary.failure

        const total = summary.value.total.lines.pct
        const weakest = weakestFile(summary.value)

        if (total < COVERAGE_FLOOR) {
          return {
            outcome: "fail",
            rationale:
              `Line coverage is ${total}%, ${(COVERAGE_FLOOR - total).toFixed(1)} points below the ` +
              `${COVERAGE_FLOOR}% floor. Start with ${weakest.path} (${weakest.pct}%, ` +
              `${weakest.uncoveredLines} uncovered lines) -- it is the single largest gap.`,
          }
        }

        // Clearing the floor is not the same as being finished.
        return weakest.pct < COVERAGE_FLOOR
          ? {
              outcome: "warn",
              rationale:
                `Line coverage is ${total}%, above the ${COVERAGE_FLOOR}% floor. ` +
                `${weakest.path} is at ${weakest.pct}% and is being carried by the rest of the ` +
                `repository; its ${weakest.uncoveredLines} uncovered lines are the highest-value ` +
                `tests left to write.`,
            }
          : {
              outcome: "pass",
              rationale:
                `Line coverage is ${total}% and every file is at or above the ${COVERAGE_FLOOR}% ` +
                `floor. Closest to it: ${weakest.path} at ${weakest.pct}%.`,
            }
      },
    },

    // `dependsOn` orders execution and hands this policy that check's
    // evidence in `ctx.dependencies`.
    mutation: {
      run: ["npm", "run", "mutation"],
      dependsOn: ["tests"],
      policy: async ({ dependencies }) => {
        if (dependencies.tests?.exitCode !== 0) {
          return {
            outcome: "fail",
            rationale:
              "Mutation score is not meaningful while the suite is red. Fix the failures named " +
              "by the `tests` check, then rerun -- no mutation threshold was evaluated.",
          }
        }

        const { score, survivors } = await readSurvivingMutants()

        return survivors.length === 0
          ? {
              outcome: "pass",
              rationale: `Mutation score is ${score}% (floor ${MUTATION_FLOOR}%). 0 mutants survived.`,
            }
          : {
              outcome: "fail",
              rationale: [
                `Mutation score is ${score}% (floor ${MUTATION_FLOOR}%). ${survivors.length} mutants ` +
                  `survived -- lines your tests execute but never assert on:`,
                ...survivors.map((mutant) => `- ${describeMutant(mutant)}`),
                "Add an assertion that fails when each replacement is applied, or delete the branch if it is unreachable.",
              ].join("\n"),
            }
      },
    },
  },
})
```

`./contract/reports.js` is your own code, not something repo-contract ships. `readSurvivingMutants()` reads a report file from disk, exactly as `checks/mutation.ts` does in this repository's own contract. The resulting verdict:

```ts
verdict.checks
// {
//   typecheck: { outcome: "pass", rationale: "tsc reported no type errors." },
//   tests:     { outcome: "pass", rationale: "Vitest completed 412 test(s) with 0 failures across 38 suite(s)." },
//   coverage:  { outcome: "warn", rationale:
//     "Line coverage is 91.4%, above the 85% floor. src/http/retry.ts is at 78.2% and is being
//      carried by the rest of the repository; its 12 uncovered lines are the highest-value tests
//      left to write." },
//   mutation:  { outcome: "fail", rationale:
//     "Mutation score is 82% (floor 90%). 3 mutants survived -- lines your tests execute but never
//      assert on:
//      - src/auth/session.ts:42:11 - ConditionalExpression: replaced `expiresAt > now` with `true`
//      - src/auth/session.ts:57:3 - BooleanLiteral: replaced `false` with `true`
//      - src/http/retry.ts:19:22 - ArithmeticOperator: replaced `attempt * 2` with `attempt / 2`
//      Add an assertion that fails when each replacement is applied, or delete the branch if it is
//      unreachable." },
// }
```

Two passes, one warning, one failure — and every one names something specific: a metric, a file, a line, a fix.

## Standardize once, enforce everywhere

An organization can express its engineering standard for a project type **once** — as an internal contract package that wraps repo-contract and owns the executors — and start every project of that type from a matching boilerplate that extends the shared configuration rather than redefining it.

```text
Organization standard
        |
        v
Shared contract package
        |
  ------+------
  |     |     |
service service service
  |     |     |
local/CI ... local/CI
```

Each service depends on one package and receives repo-contract plus every executor transitively. When the shared standard changes, every consuming repository picks it up — including repositories created from an older boilerplate.

[`examples/`](examples/README.md) is a minimal, runnable end-to-end wiring of that model: an `internal-boilerplate-contract` package (three read-only checks, exported ESLint/Prettier/TypeScript baselines, a reusable CI workflow) and a trivial `boilerplate` that consumes it. Two deeper, runnable walkthroughs build on it:

- [`examples/day-one-walkthrough/`](examples/day-one-walkthrough/README.md) — rolling out a **new** shared requirement across every repository at once, as a dated `warn` → `fail` rather than an immediate red build.
- [`examples/exceptions-walkthrough/`](examples/exceptions-walkthrough/README.md) — _Experimental:_ a governed, justified waiver for one specific finding, built on [`repo-contract/helpers`](#helpers), without weakening the check for everything else.

See the [walkthrough](examples/README.md) and [ADR 0010](specs/decisions/0010-review-driven-contracts-and-shared-internal-system-contracts.md).

## Open-source contribution guardrails

A maintainer may know exactly what a contribution needs to satisfy, while a first-time contributor has no way to know all of those expectations — which produces repeated review cycles: maintainer finds an issue, contributor fixes it, another issue surfaces, repeat.

repo-contract moves those mechanical expectations into an executable contract. Instead of:

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

The goal is not to eliminate human review. It is to make human review focus on the things that require human judgment rather than repeatedly identifying mechanical violations.

## Automated development guardrails

AI coding agents can produce substantial amounts of working software. The open question is whether the code consistently satisfies the engineering standards of the repository — and putting every principle, convention, and quality rule into an agent's context window is not the most reliable way to get there.

Put the important rules **around** the automation as enforceable guardrails instead:

```text
generated change
      |
      v
repo-contract  (tests, typecheck, lint, coverage, mutation, architecture, security, API compatibility, ...)
      |
      v
actionable verdict
      |
      v
the change is fixed until it satisfies the contract
```

The agent does not need to memorize every rule. It needs to satisfy the repository's contract — and a rationale that names the file, the line, and the fix is exactly what makes the feedback loop work.

The same applies to any non-human contributor: CI bots, release automation, scheduled jobs. **The repository supplies the guardrails. Whatever produced the change supplies the implementation.**

## Why not just use my existing tools?

You should keep them. repo-contract does not replace the tools that analyze your code or the systems that automate your repository.

| Existing approach                    | Where it works        | What repo-contract adds                      |
| ------------------------------------ | --------------------- | -------------------------------------------- |
| CI steps (GitHub Actions, GitLab, …) | Executing checks      | A repository-owned contract CI consumes      |
| npm scripts                          | Command orchestration | An evidence model, policy functions, verdict |
| Shell / Make                         | Workflow logic        | A typed, reusable, tested contract model     |
| Quality platforms (SonarQube, …)     | Specialized analysis  | A contract layer around their results        |

The value is not that arbitrary command execution is impossible without repo-contract. It is having a reusable, typed, tested contract model — with cross-check policies and structured rationales — instead of rebuilding that infrastructure in every repository.

## Preset checks

You do not have to hand-write every common check. `repo-contract/presets` ships a curated, growing catalog of ready-made `CheckDefinitionConfig`s. A preset encodes how to execute and interpret a common tool; it does **not** encode your repository's definition of quality.

Import a preset, spread it into your `checks` record, and override whatever you need — most often `policy`:

```ts
import { format, typecheck, license } from "repo-contract/presets"

checks: {
  format,
  typecheck: { ...typecheck, timeoutMs: 60_000 },
  license: { ...license, policy: myStricterLicensePolicy },
}
```

Some presets are factories because they expose options that change what gets executed:

```ts
import { lint, deadCode } from "repo-contract/presets"

checks: {
  lint: lint({ path: "src" }),
  deadCode: deadCode({ exemptUnusedDevDependencies: ["some-cli-only-tool"] }),
}
```

**Preset options are the preferred way to change what a preset executes** — a direct `run` override is an escape hatch. Every execution-affecting option is threaded through the actual command line, so evidence records the exact options used in `evidence.checks.<id>.args`.

Every preset's policy fails with an actionable message if its underlying tool is not installed (the one exception is `securityDeps`, which shells out to `npm` itself). repo-contract never installs, bundles, or implicitly depends on these tools — each assumes its CLI is already a devDependency of your repository.

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

Not every test runner has a preset. Jest, Cypress, and Mocha have different reporter formats and may need bespoke presets — the pattern is the same: execute the tool, capture evidence, interpret its output, apply your policy.

Unlike its neighbors, `format` auto-fixes (`--write`) and therefore cannot itself fail on unformatted input. If you want a hard gate on formatting, run `prettier --check .` directly instead of this preset — exactly the substitution the [demo above](#see-real-output) makes.

## Helpers

**Experimental** (see [VERSIONING.md](VERSIONING.md)): its TypeScript signature and runtime behavior may both change in a minor or patch release, the same classification `repo-contract/presets` carries.

If you've ever wanted a check to permit a specific, named, justified exception to an otherwise-blocking finding — "this dependency's advisory is a known false positive," "this network capability is reviewed and accepted" — without hand-rolling the matching, precedence, and field-completeness logic yourself, `repo-contract/helpers` is that logic, extracted and generalized. It's the same mechanism this repository's own `suppression-governance` check uses to gate `disable-comments.json`.

It decides nothing and matches nothing on its own. You supply a classification (`{ group, category }`), a policy configuration, and a way to read a field's current value off your own record shape; it resolves the strictest applicable policy and tells you which required fields (if any) are still empty:

```ts
import { evaluateExceptionRecord } from "repo-contract/helpers"
import type { ExceptionPolicyConfig } from "repo-contract/helpers"

const policy: ExceptionPolicyConfig = {
  socket: {
    rules: {
      critical: { mode: "forbidden" },
      high: { mode: "forbidden" },
      medium: { mode: "exception", requirements: ["justification", "alternatives"] },
    },
  },
}

const determinant = evaluateExceptionRecord({
  record: myFinding,
  classifications: [{ group: "socket", category: myFinding.severity }],
  config: policy,
  globalDefault: { mode: "forbidden" },
  fieldValue: (record, field) => (record as Record<string, string>)[field] ?? "",
})

// determinant.verdict: "forbidden" | "insufficient" | "permitted"
// determinant.missing: which required fields (if any) are still empty
```

`resolveExceptionPolicy` alone answers "what policy applies to this classification" — exact match, then glob (via [minimatch](https://www.npmjs.com/package/minimatch)), then the group's own default, then your global default. `loadExceptionRegistry` reads and validates one exception-registry file's envelope (`{ "exceptions": [...] }`) from disk against a [Standard Schema](https://standardschema.dev) you supply — a missing file is a normal, empty-registry state, never an error. `hashRequirementFields` produces a deterministic digest of a set of fields' current values, useful for binding a sign-off to the exact prose it approved.

What this package deliberately does **not** do: decide what a "finding" is, match a finding to a registry record, or derive a canonical identity for either one. Those stay entirely up to you.

## CI integration

The runner script in [Quick start](#quick-start) is the whole integration. The same contract definition runs locally and in CI:

```sh
npm run contract
```

Point a `precommit`, `prepublishOnly`, or CI job at that command. `spawn`, `env`, and the installed toolchain are consumer-supplied and can differ per environment — what stays identical is the contract definition and the code path, with no hidden state.

## Regression detection

repo-contract has no built-in baseline system and no persistence layer. The core engine does not read or write files on its own initiative beyond spawning the commands you configure and parsing that command's own captured stdout when you set `output: { format: "json" | "yaml" }`. A handful of published presets (`securitySecrets`, `duplication`, `markdownlint`) additionally read back a fixed report file their own `run` command was told to write — always that preset's own single, hardcoded path, never a scan of arbitrary files.

If your repository wants regression detection, persist the evidence or relevant measurements yourself and compare them in your policy:

```ts
import baseline from "./baseline.json"

policy: ({ result }) => {
  const current = (result.output?.value as { score: number }).score
  return current >= baseline.mutation.score
    ? { outcome: "pass", rationale: `Mutation score was ${current}.` }
    : {
        outcome: "fail",
        rationale: `Mutation score regressed from ${baseline.mutation.score} to ${current}.`,
      }
}
```

## Evidence and Verdict reference

Browse the generated [HTML API reference](https://maverickcer.github.io/repo-contract/api/) for the full field-by-field shape of `Evidence`, `CheckEvidence`, `Verdict`, and every error class. The underlying [markdown reports](docs/api-report/repo-contract.api.md) are regenerated and byte-compared against the source on every commit by this repository's own `api-docs` check, so the reference can never drift from what the package actually exports.

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
        | { format: string; success: true; value: unknown }
        | { format: string; success: false; error: string }
    }
  >
}

interface Verdict {
  version: 2
  passed: boolean
  checks: Record<string, { outcome: "pass" | "fail" | "warn"; rationale: string }>
}
```

`status` distinguishes **why** a process ended in its terminal state, independently of whether the policy considered that result acceptable. A non-zero exit code is `status: "completed"`, not an execution error.

## Supplying `spawn`/`env`

`spawn` and `env` are required fields on the config — repo-contract never imports a process-spawning implementation or reads `process.env` internally (see [ADR 0011](specs/decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md)). You supply both, as trusted capabilities repo-contract calls with a resolved command/argv/options — it does not inspect, wrap, or sanitize them.

**macOS/Linux** — plain `node:child_process` is enough:

```ts
import { spawn } from "node:child_process"

export default defineRepoContract({ spawn, env: process.env, checks: {/* ... */} })
```

**Windows** — most npm-installed CLI tools (`eslint`, `prettier`, `tsc`, …) resolve to `.cmd` shims, and plain `node:child_process.spawn` refuses to run those without `shell: true` (Node's own CVE-2024-27980 mitigation). Install [`cross-spawn`](https://www.npmjs.com/package/cross-spawn) and pass it instead — it resolves `.cmd`/`.bat` shims and quotes arguments safely for `cmd.exe`, **without** turning on shell metacharacter interpretation:

```ts
import crossSpawn, { sync as crossSpawnSync } from "cross-spawn"

export default defineRepoContract({
  spawn: crossSpawn,
  env: process.env,
  // Optional: lets a timed-out/aborted/Ctrl+C-killed check's full process
  // tree (not just its immediate process) get cleaned up on Windows too.
  killProcessTree: crossSpawnSync,
  checks: {/* ... */},
})
```

**`cross-spawn` does not mean "shell execution."** These are two independent choices:

| `Spawner` choice | `shell` option    | Result                                                                                                                               |
| ---------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| native `spawn`   | `false` (default) | argv-only, no shell interpretation                                                                                                   |
| `cross-spawn`    | `false` (default) | Windows `.cmd`/`.bat` resolution + safe `cmd.exe` quoting, still argv-only                                                           |
| either           | `true`            | shell metacharacters (`&&`, `\|`, …) interpreted — a per-check or global opt-in, see [`shell`](docs/api-report/repo-contract.api.md) |

Passing `cross-spawn` fixes Windows command resolution; it does not by itself enable shell metacharacter interpretation. `check.shell` (or the config-level `shell` default) is the separate, explicit opt-in for that — see `SECURITY.md` before enabling it. `repo-contract` doesn't ship a ready-made spawner of its own, on purpose (see ADR 0011's Alternatives).

## Security model

Command execution is the core of this package and therefore a security-sensitive boundary.

The default `run` behavior — string or array — never explicitly invokes a shell. On POSIX no shell is invoked at all; on Windows, resolving a `.cmd`/`.bat` shim unavoidably routes through `cmd.exe`, with argument escaping — not shell absence — providing the same safety property. No untrusted value is interpolated into a command line in a way that lets it inject a second command, a redirect, or a pipeline.

`shell: true` is an explicit opt-in exception with different security properties: whatever you put in `run` is handed to the platform shell verbatim. Never construct a `run` string by concatenating untrusted input, such as content originating from a pull request.

The package's entire shipped surface (`src/**`) has no CLI, no network calls, no telemetry, no automatic package installation, and no hidden configuration — making it suitable for locked-down enterprise environments where `npx` or network access may be unavailable. The "no network calls" guarantee is mechanically enforced, not merely documented: an ESLint rule and an independent, ESLint-free repository check both reject network-capable imports, globals, and unreviewed spawned commands anywhere in the shipped surface.

See [SECURITY.md](SECURITY.md) for the complete threat model (environment variables, command execution, captured output, shell execution) and [ADR 0007](specs/decisions/0007-no-network-surface.md) for what the no-network guarantee covers and deliberately excludes.

## Errors

repo-contract distinguishes several failure categories and does not conflate them. See the generated [API report](docs/api-report/repo-contract.api.md) for each error class's exact shape and `code` string.

- **Configuration errors** (`InvalidRepoContractConfigError`, `InvalidCheckConfigError`) — structurally invalid configuration, thrown synchronously before anything spawns.
- **Execution outcomes** — missing binaries, timeouts, non-zero exits, signals, aborted processes. Recorded as evidence rather than thrown, so repository policies can decide what they mean.
- **Parser errors** — requested output that cannot be parsed. Recorded as `{ success: false, error }` on `result.output`, while raw stdout remains available.
- **Policy failures** — your policy returns `{ outcome: "fail", rationale }`. Not an error in repo-contract; the contract working correctly.
- **Policy throwing** — a synchronous throw or rejected promise from policy code. `runRepoContract()` rejects with `PolicyThrewError` (or an `AggregateError`). Two specific mistakes get their own error naming the check: `PolicyReadUnrequestedOutputError` (reading `result.output` on a check that never configured `output`) and `PolicyReadFailedParseValueError` (reading `.value` on a check whose parse failed).
- **Schema throwing** — `output.schema["~standard"].validate()` itself throwing rejects with `StandardSchemaValidateThrewError`. A schema _returning_ failure `issues`, by contrast, is an ordinary parser-error-shaped `result.output`.

## Runtime support

| Environment                                | Supported                                                                                                                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Node.js `>=20.0.0` (macOS, Linux, Windows) | Yes                                                                                                                                                                                                          |
| Bun (latest release)                       | Yes — tested in CI against the real published package shape. No non-default permissions needed.                                                                                                              |
| Deno (latest release)                      | Yes — tested in CI against the real published package shape. Requires `--allow-read --allow-run --allow-env` (see [ADR 0003](specs/decisions/0003-cross-platform-command-execution-and-process-cleanup.md)). |
| Browser                                    | No — this package executes local processes                                                                                                                                                                   |

repo-contract's checks run as spawned processes and read the ambient environment, but repo-contract never imports a process-spawning implementation or reads `process.env` itself; it is server/CLI-only by design regardless, since the capability a consumer supplies is itself always a real Node-only spawning mechanism. See [ADR 0003](specs/decisions/0003-cross-platform-command-execution-and-process-cleanup.md) for what "tested" covers.

## Accessibility

repo-contract has no user interface. It produces machine-readable `Evidence`/`Verdict` objects and typed errors; any rendering — a terminal summary, a CI annotation, a dashboard — is the consumer's surface, and WCAG / accessibility conformance applies there.

## Status and versioning

repo-contract is pre-1.0. Per [VERSIONING.md](VERSIONING.md), minor versions may include breaking changes to the Stable tier before 1.0. See [CHANGELOG.md](CHANGELOG.md) for release history, and [specs/architecture.md](specs/architecture.md) plus the [ADRs](https://github.com/MaverickCER/repo-contract/tree/main/specs/decisions) for the reasoning behind the architecture, its invariants, and its compatibility guarantees.

## If this is useful

If this model matches how you think about repository standards, [star it on GitHub](https://github.com/MaverickCER/repo-contract) — it's the main way other maintainers find it. If it doesn't fit your repo, [open an issue](https://github.com/MaverickCER/repo-contract/issues) and say why instead; that's more useful than a star.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and how this repository's own `repo-contract.config.ts` uses the package to validate itself, and [RELEASING.md](RELEASING.md) for the release process.

## License

MIT — see [LICENSE](LICENSE).
