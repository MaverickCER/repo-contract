# repo-contract

[![CI](https://github.com/MaverickCER/repo-contract/actions/workflows/ci.yml/badge.svg)](https://github.com/MaverickCER/repo-contract/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/repo-contract.svg)](https://www.npmjs.com/package/repo-contract)
[![Coverage: the lowest of line, statement, function and branch coverage](https://img.shields.io/endpoint?url=https://maverickcer.github.io/repo-contract/coverage-badge.json)](https://maverickcer.github.io/repo-contract/coverage.json)
[![Mutation score: the share of applicable mutants the tests detect](https://img.shields.io/endpoint?url=https://maverickcer.github.io/repo-contract/mutation-badge.json)](https://maverickcer.github.io/repo-contract/mutation.json)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/MaverickCER/repo-contract/badge)](https://scorecard.dev/viewer/?uri=github.com/MaverickCER/repo-contract)
![Socket Badge](https://badge.socket.dev/npm/package/repo-contract/latest)
[![Node](https://img.shields.io/node/v/repo-contract.svg)](https://www.npmjs.com/package/repo-contract)
[![License](https://img.shields.io/npm/l/repo-contract.svg)](LICENSE)

**Use deterministic and AI checks to enforce a baseline engineering standard across your org.**

repo-contract is a TypeScript library and CLI for teams that own quality gates in one repository or many. Each tool your CI runs, such as `tsc`, ESLint or Vitest, becomes a **deterministic check** in one typed config file, the **contract**: the same code always gets the same result. A **policy**, a function you write, reads a check's result and returns `pass`, `warn` or `fail` with a reason that says what to fix. `npm run contract` runs every check the same way on a laptop, in a git hook and in CI.

An **AI check** asks a model reviewer for a fixed JSON shape with a confidence score on every finding. The [`aiReview` preset](GUIDE.md#ai-review-checks) runs the agent you name and fails only on confident `error` findings. It warns on the rest, so a model's changing answers stay visible without flipping builds.

Publish a contract as an npm package and it becomes your organization's **standard**. It is a **baseline**: every repository that extends it runs the same checks and policies, can add its own on top, and gets changes as a dependency update. Shared ESLint configs and reusable workflows share single checks; a standard also shares the policies that judge them.

```sh
npm install --save-dev repo-contract tsx
npx repo-contract init   # writes a contract for the tools your package.json lists
npm run contract         # one [PASS|WARN|FAIL] line per check, with its reason
```

The [`examples/demo/`](examples/demo/README.md) contract runs three published presets against one deliberately imperfect file. `npm run demo` prints:

<!-- example-output: demo/demo (scripts/run-examples.mjs fails CI when the demo stops printing these lines) -->

```text
[PASS] typecheck
  tsc reported no type errors.

[FAIL] format
  Prettier reported formatting failures:
  Checking formatting...
  [warn] src/greet.ts
  [warn] Code style issues found in the above file. Run Prettier with --write to fix.

[WARN] lint
  ESLint reported 0 errors but 1 warning(s):
  - src/greet.ts:15:3 [no-console]: Unexpected console statement.
```

It runs your linters, test runners and scanners, and replaces none of them. Skip it when exit codes already tell you enough.

[Why](#why-it-exists) · [See it run](#see-it-run) · [Install](#install-and-verify) · [Fit](#fit-and-capabilities) · [Limits](#limits-and-when-not-to-use-it) · [Security](#security-and-supply-chain) · [Maturity](#maturity-versioning-and-support) · [Docs](#documentation)

## Why it exists

**Problem:** green CI does not mean your rules held. Coverage stays above the floor while the new file you added has almost none. The mutation score moves because the test suite moved, and nothing reconciles the two. A contributor gets "CI failed" and no idea what the repository expects. The rules live across CI YAML, `package.json` scripts, tool configuration and review habits, so no single file says what they are.

**Who it is for:** platform and staff engineers who own quality gates for several repositories, and teams whose gates have outgrown independent CI steps. A developer can use it alone in one repository.

**Outcome:** one reviewed, versioned contract that runs on a laptop and in CI. It tells a contributor what to fix, not only that something failed. Twenty repositories that copy CI YAML end up with twenty slightly different rule sets. Twenty that extend one standard get the same rules through a dependency update.

## How it differs

Tools run checks, and CI jobs aggregate their exit codes. repo-contract sits a layer under both: it records each tool's output as **evidence**, then your policies decide what that evidence means. A policy can also read one check's evidence to judge another, and the same typed code runs locally and in CI.

A template repository copies a starting point once, and each copy then drifts. A standard stays a dependency, so its checks, its policies and the reason for each outcome keep arriving as updates.

## What it does

A **check** runs a command and captures its result as **evidence**. A **policy** you own turns that evidence into a **verdict**: `pass`, `warn` or `fail`, each with a reason (its `rationale` field). `warn` is visible and does not block the run; `fail` does. [How it works](GUIDE.md#the-model) covers the model; [presets](GUIDE.md#presets) wrap the common tools (TypeScript, ESLint, Vitest, Prettier, security auditing, dead-code and package validation).

### See it run

The output at the top of this page comes from these checks in [`examples/demo/`](examples/demo/README.md):

```ts
checks: {
  typecheck,
  format: { ...format, run: ["prettier", "--check", "."] },
  lint: lint(),
}
```

Each result names the check, its outcome and the reason behind it. Failures carry the diagnostics needed to fix them; warnings stay visible without blocking. [`examples/release-gate/`](examples/release-gate/README.md) adds a fourth check, `release`, whose policy reads the other three and makes one decision:

<!-- example-output: release-gate/demo (scripts/run-examples.mjs fails CI when the example stops printing these lines) -->

```text
[FAIL] release
  Release blocked by format. Passing: typecheck. lint: 0 error(s), 1 warning(s); warnings do not block a release.
```

The demo's [AI review check](examples/demo/README.md#the-ai-review-check) runs the demo contract as a baseline and adds the `aiReview` preset. Given a recorded reply with one confident error, it adds:

<!-- example-output: demo/ai-review (scripts/run-examples.mjs fails CI when the example stops printing these lines) -->

```text
[FAIL] aiReview
  1 error finding(s) at or above confidence 0.8:
  - src/greet.ts:16 [return-value] error, confidence 0.92: The greeting omits a trailing newline that the caller's protocol requires.
  - src/greet.ts:15 [no-logging-in-library] warn, confidence 0.7: greet() logs every name; leave logging to the caller.
```

### One check judging another

A policy can read any other check's evidence. Here mutation testing is only meaningful once the tests pass:

```ts
checks: {
  tests: test,

  mutation: {
    run: ["npm", "run", "mutation"],
    dependsOn: ["tests"], // orders execution and hands this policy the tests' evidence
    policy: ({ result, dependencies }) => {
      if (dependencies.tests?.exitCode !== 0) {
        return { outcome: "fail", rationale: "The test suite is failing, so no mutation score was evaluated. Fix the failing tests first." }
      }
      return result.exitCode === 0
        ? { outcome: "pass", rationale: "Mutation testing passed against a green test suite." }
        : { outcome: "fail", rationale: "Tests pass but mutation testing failed: surviving mutants mean tests run code they never assert on." }
    },
  },
}
```

`dependsOn` orders execution and exposes the dependency's evidence to the policy, but it does not skip a check. The mutation command still runs when tests fail, and its policy decides what that evidence means. The policy separates a red dependency (no valid mutation evidence) from a valid but inadequate mutation result. The [Guide](GUIDE.md#a-fuller-example-cross-check-policy) has the full version with coverage floors, per-file warnings and a reason for each surviving mutant.

### Evidence it works

- **Self-hosted:** this repository is checked by its own contract on every change, with the coverage and mutation badges above generated from it. Mutation testing is held at zero survivors across `src/`. The `mutate` array in `stryker.config.mjs` lists each excluded file with its reason. Static mutants are not counted, and every other exception is a reviewable record ([CODE_REVIEW.md](CODE_REVIEW.md#3-automated-checks-versus-residual-review)).
- **Tested as shipped:** CI installs and exercises the published package shape on Node.js, Bun, and Deno. It does so on Linux, macOS, and Windows ([runtime support](GUIDE.md#runtime-support)).
- **Runnable proof:** the [examples](examples/README.md) are real projects, not snippets. CI's `examples` job runs each example's main command (`scripts/run-examples.mjs`) and checks the exit code and output lines its README shows. Follow-up steps, such as fixing a file and rerunning, are not run. They cover the demo above, a [ratchet rollout](examples/day-one-walkthrough/README.md), a [governed exception](examples/exceptions-walkthrough/README.md), and a [cross-check release gate](examples/release-gate/README.md).
- **Verifiable release:** published with npm OIDC provenance, so a consumer can check that an artifact was built by this repository's CI ([ADOPTION.md](ADOPTION.md#security--threat-model)).

## Install and verify

**Prerequisites:** Node.js `>=22` (Bun and Deno are tested too) and a project with a `package.json`. The package has no runtime dependencies and bundles none of the tools it runs. Install the ones you want checked (`typescript`, `eslint`, `vitest`, and so on), and `init` wires up the checks for what it finds.

The three commands at the top of this page are the whole install. `init` writes `repo-contract.config.mts` and `scripts/contract.mjs`, and adds a `contract` script to `package.json`. In a project with only these two packages, `init` wires one check, `securityDeps`, which passes when `npm audit` finds nothing. A tool you add later gets its check by adding its [preset](GUIDE.md#presets) to the generated config (`init` never overwrites existing files). Each tool still needs its own configuration (`tsconfig.json`, an ESLint flat config). `init` does not scaffold those; a missing one surfaces as that tool's own "no config found" error.

The smallest hand-written contract has the same shape as the file `init` generates:

```ts
// repo-contract.config.mts
import { spawn } from "node:child_process"
import { defineRepoContract } from "repo-contract"
import { typecheck } from "repo-contract/presets"

export default defineRepoContract({ spawn, env: process.env, checks: { typecheck } })
```

**Verify it works:** `npm run contract` prints one `[PASS|WARN|FAIL] check: rationale` line per check and exits non-zero on a `fail`. Point your pre-commit hook and CI job at that same command. Writing the runner by hand, saving evidence as JSON, and publishing a CI summary are in the [Guide](GUIDE.md#the-runner-and-ci-integration); [Windows notes](GUIDE.md#troubleshooting) are in the troubleshooting table.

**Using an AI agent?** Give it [the skill](https://raw.githubusercontent.com/MaverickCER/repo-contract/main/skills/repo-contract/SKILL.md): a short manual written from this package's own exports, with the rules a type signature cannot say.

### Run less on a pull request

`npx repo-contract affected --base origin/main` lists the tests a change can reach, and `--explain` says why. It narrows only when it can be sure, and reports everything otherwise. It needs the project's own `typescript` ([supported versions](GUIDE.md#runtime-support)). Scopes, the result cache, mutation shards, fail-fast, `doctor` and run metrics are in the [Guide](GUIDE.md#running-less-affected-scope-cache-and-speed).

## Fit and capabilities

**Use cases:**

- Enforce a quality bar in one repository.
- Hold one standard across many repositories: an internal package wraps a contract and owns the executors ([ADR 0010](specs/decisions/0010-review-driven-contracts-and-shared-internal-system-contracts.md)).
- Roll out a new requirement safely as a dated `warn` that becomes `fail` ([ratchet](examples/day-one-walkthrough/README.md)).
- Give CI bots and coding agents a concrete reason to act on.

**Core capabilities:**

- Checks that run any command, with output parsed as JSON or validated against a schema ([Defining checks](GUIDE.md#defining-checks)).
- Policies that read other checks' evidence, with `dependsOn` ordering and `isolated` barriers.
- Presets for common tools, spread and overridden as needed ([catalog](GUIDE.md#presets)).
- Structured, schema-versioned evidence and verdict documents, plus a Markdown summary renderer ([Persisting a run](GUIDE.md#persisting-a-run-and-publishing-a-summary)).
- Ratchets and [governed exceptions](GUIDE.md#advanced-governed-exceptions) for a justified waiver of one finding without weakening the check.

**Integration:** it is a library, so your repository owns the entry point. Your tools, CI provider, and scripts keep running as they do; process spawning and environment access are capabilities you supply, never ambient ([ADR 0011](specs/decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md)). It adopts one check at a time: `runRepoContract`'s `checks` option runs a named subset of the configured checks.

**Runtimes:** Node.js `>=22` on macOS, Linux, and Windows; Bun and Deno (Deno needs `--allow-read --allow-run --allow-env`); not browsers ([details](GUIDE.md#runtime-support)).

**Package managers:** npm is supported. pnpm, Yarn 1 and Yarn Berry (node-modules linker) are tested for install and import of every entry point only ([details](GUIDE.md#package-managers)).

**Configuration and extension:** a typed `defineRepoContract` object. Spread a preset to override its command or timeout, or write your own check and policy ([Guide](GUIDE.md#defining-checks)). An organization publishes its contract as a standard that other repositories extend ([examples](examples/README.md)).

## Limits and when not to use it

- **Skip it when** `npm test` plus a linter is the whole story. The same goes when each CI check is independent and that is fine, or you need no policy logic beyond exit codes.
- **Trade-offs:** it is a layer you maintain (a config and a runner). Checks run as local processes, so tools must be installed in every environment. `init`'s detection table, the presets, `./affected` and `./metrics` are Experimental and may change shape before 1.0.
- **Not a replacement** for your CI provider, test runner, or scanners. It does not install tools, host results, or authorize anything; it is not a dashboard.
- **Automation:** agents and bots can consume the same structured verdicts, but a reason does not ensure a fix converges. The loop that retries, stops, and validates changes is the automation's job.

## Security and supply chain

- **Runtime properties:** no shell by default (a `run` array is argv; a string is tokenized). No ambient spawn or environment access in the library; the `affected` and `doctor` commands in the `bin` run `git` ([ADR 0011](specs/decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md#amendment-2026-11-01-the-command-line-tool-is-a-consumer-of-its-own-library)). No network calls or telemetry, and a check in this repository's own contract enforces the no-network property ([SECURITY.md](SECURITY.md#runtime-security-model)).
- **Trust boundaries:** it executes the commands your config names with the environment you pass, so the config and any policy you write are trusted code. What these properties do not cover is in [Application responsibilities](SECURITY.md#application-responsibilities).
- **Dependencies and licence:** zero runtime dependencies (the list, generated from `package.json`, is in the [Adoption guide](ADOPTION.md#security--threat-model)), MIT licensed. Two CycloneDX SBOMs are committed, one for what installing the package adds and one for this repository's build tooling ([what each covers](SECURITY.md#sboms)).
- **Reporting:** [private security advisory](https://github.com/MaverickCER/repo-contract/security/advisories/new); supported versions are in [SECURITY.md](SECURITY.md#supported-versions).

## Maturity, versioning and support

Pre-1.0 (see the npm badge for the current version). Per [VERSIONING.md](VERSIONING.md), a `0.x` minor may carry a breaking change to the Stable tier before 1.0, so pin accordingly. Evidence and verdict documents version independently of the package. Security fixes target the latest release until 1.0, after which they backport for a stated window ([ADR 0015](specs/decisions/0015-security-backport-window.md), a forward commitment, not yet a track record).

- **Upgrade:** read the [CHANGELOG](CHANGELOG.md) on every minor; there is no dedicated migration guide yet, and [ADOPTION.md](ADOPTION.md#migrating-onto-repo-contract) says what to use instead.
- **Release history:** [CHANGELOG](CHANGELOG.md) and [GitHub releases](https://github.com/MaverickCER/repo-contract/releases); the release process is in [RELEASING.md](RELEASING.md).
- **Bugs and requests:** [open an issue](https://github.com/MaverickCER/repo-contract/issues); questions go to Discussions ([SUPPORT.md](SUPPORT.md)).
- **Troubleshooting:** the [table in the Guide](GUIDE.md#troubleshooting) covers the common errors.

## Documentation

- **[Guide](GUIDE.md)**: integration, defining checks, cross-check policies, presets, errors, troubleshooting.
- **[Adoption guide](ADOPTION.md)**: the decision-maker summary of security, stability tiers, and architectural invariants.
- **[API reference](https://maverickcer.github.io/repo-contract/api/)**: every exported type, field, and error code, generated from source.
- **[Architecture](specs/architecture.md)** and **[ADRs](https://github.com/MaverickCER/repo-contract/tree/main/specs/decisions)**: why it is built this way. [Glossary](specs/glossary.md).
- **[Examples](examples/README.md)**: runnable end-to-end wiring and walkthroughs.
- **Part of the MaverickCER toolkit:** `repo-contract` is the mechanism that runs checks and produces verdicts. [`internal-package-contract`](https://github.com/MaverickCER/internal-package-contract) is the standard the other packages satisfy, and [`@maverickcer/env-cap`](https://github.com/MaverickCER/env-cap) and [`data-cap`](https://github.com/MaverickCER/data-cap) are sibling packages it verifies. See the [toolkit overview](https://github.com/MaverickCER/internal-package-contract/blob/main/TOOLKIT.md) and [ADR 0018](specs/decisions/0018-ecosystem-bootstrap-cycle-and-package-names.md).

## Next steps

- **Evaluate:** read the [Adoption guide](ADOPTION.md), then run `npm run demo` in [`examples/demo/`](examples/demo/README.md).
- **Integrate:** follow the [Guide](GUIDE.md#the-runner-and-ci-integration) and the [examples](examples/README.md).
- **Verify:** inspect the [security model](SECURITY.md#runtime-security-model) and the [architecture](specs/architecture.md).

Contributing: [CONTRIBUTING.md](CONTRIBUTING.md) covers setup and how this repository validates itself with its own contract. License: MIT, see [LICENSE](LICENSE).
