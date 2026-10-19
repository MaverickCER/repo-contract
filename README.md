# repo-contract

[![CI](https://github.com/MaverickCER/repo-contract/actions/workflows/ci.yml/badge.svg)](https://github.com/MaverickCER/repo-contract/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/repo-contract.svg)](https://www.npmjs.com/package/repo-contract)
[![Coverage: the lowest of line, statement, function and branch coverage](https://img.shields.io/endpoint?url=https://maverickcer.github.io/repo-contract/coverage-badge.json)](https://maverickcer.github.io/repo-contract/coverage.json)
[![Mutation score: the share of applicable mutants the tests detect](https://img.shields.io/endpoint?url=https://maverickcer.github.io/repo-contract/mutation-badge.json)](https://maverickcer.github.io/repo-contract/mutation.json)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/MaverickCER/repo-contract/badge)](https://scorecard.dev/viewer/?uri=github.com/MaverickCER/repo-contract)
[![Socket Badge](https://badge.socket.dev/npm/package/repo-contract/latest)](https://socket.dev/npm/package/repo-contract)
[![Node](https://img.shields.io/node/v/repo-contract.svg)](https://www.npmjs.com/package/repo-contract)
[![License](https://img.shields.io/npm/l/repo-contract.svg)](LICENSE)

**Define your engineering standards once. Share them across repositories. Get actionable rationale for every outcome.**

repo-contract is a TypeScript library for defining, versioning, and sharing engineering standards across repositories. It runs your existing tools, captures their results as structured evidence, and evaluates that evidence against repository-owned policies. Every policy outcome carries a rationale you can act on. Your linters, test runners, security scanners, CI provider, and workflow stay as they are.

[Why](#why-it-exists) · [See it run](#see-it-run) · [Install](#install-and-verify) · [Fit](#fit-and-capabilities) · [Limits](#limits-and-when-not-to-use-it) · [Security](#security-and-supply-chain) · [Maturity](#maturity-versioning-and-support) · [Docs](#documentation)

## Why it exists

**Benefit:** one reviewed, versioned definition of what "good" means for a repository, runnable on a laptop and in CI, that tells a contributor what to fix rather than only that something failed.

**Problem:** green CI does not mean your standard held. Coverage stays above the floor while the file you just added has almost none. The mutation score moves because the test suite moved, and nothing reconciles the two. A contributor gets "CI failed" and no idea what the repository expects. The standard itself lives scattered across CI YAML, `package.json` scripts, configuration, and review habits, so nothing executable says what it is.

**Who it is for:** platform and staff engineers who own quality gates for several repositories, and teams whose gates have outgrown independent CI steps. Developers can use it alone in a single repository.

**Why it matters:** a standard that is not written as code drifts. Twenty repositories with copied YAML end up with twenty slightly different standards, and each failure costs someone a local re-run just to learn what broke.

## How it differs

Shared ESLint configs, reusable workflows, and template repositories distribute individual checks. repo-contract distributes the whole standard: the checks, the policies that relate them, and the rationale for each outcome, as typed code in your repository.

Reusable workflows can express sophisticated policy, so this is not a claim that they cannot. The difference is a typed, repository-owned policy model with structured evidence that runs the same way locally and in CI, instead of one assembled from workflow-specific orchestration. Tools run checks and quality gates aggregate exit codes. repo-contract sits a layer under both: it turns each tool's output into evidence, then lets your policies decide what that evidence means, including reading one check's evidence to judge another's.

## What it does

A **check** runs a command and captures its result as **evidence**. A **policy** you own turns that evidence into a **verdict**: `pass`, `warn`, or `fail`, each with a rationale. `warn` is visible and does not block the run; `fail` does. [How it works](GUIDE.md#the-model) covers the model; [presets](GUIDE.md#presets) wrap the common tools (TypeScript, ESLint, Vitest, Prettier, security auditing, dead-code and package validation).

### See it run

The real output of the contract in [`examples/demo/`](examples/demo/README.md): three published presets against one deliberately imperfect file.

```ts
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
  Prettier reported formatting failures:
  Checking formatting...
  [warn] src/greet.ts
  [warn] Code style issues found in the above file. Run Prettier with --write to fix.

[WARN] lint
  ESLint reported 0 errors but 1 warning(s):
  - src/greet.ts:15:3 [no-console]: Unexpected console statement.
```

Each result names the check, its outcome, and the rationale behind it. Failures carry the diagnostics needed to fix them; warnings stay visible without blocking. Run it yourself with `npm run demo` from [`examples/demo/`](examples/demo/README.md).

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

`dependsOn` orders execution and exposes the dependency's evidence to the policy, but it does not skip a check: the mutation command still runs when tests fail, and its policy decides what that evidence means. The policy separates a red dependency (no valid mutation evidence) from a valid but inadequate mutation result. The [Guide](GUIDE.md#a-fuller-example-cross-check-policy) has the full version with coverage floors, per-file warnings, and surviving-mutant rationales.

### Evidence it works

- **Self-hosted:** this repository is checked by its own contract on every change, with the coverage and mutation badges above generated from it. Mutation is held at 100% on `src/**`, with every exception a reviewable record ([CODE_REVIEW.md](CODE_REVIEW.md#3-automated-checks-versus-residual-review)).
- **Tested as shipped:** the published package shape is installed and exercised in CI on Node.js, Bun, and Deno, and on Linux, macOS, and Windows ([runtime support](GUIDE.md#runtime-support)).
- **Runnable proof:** the [examples](examples/README.md) are real projects, not snippets: the demo above, a [ratchet rollout](examples/day-one-walkthrough/README.md), a [governed exception](examples/exceptions-walkthrough/README.md), and a [cross-check release gate](examples/release-gate/README.md).
- **Verifiable release:** published with npm OIDC provenance, so a consumer can check that an artifact was built by this repository's CI ([ADOPTION.md](ADOPTION.md#security--threat-model)).

## Install and verify

**Prerequisites:** Node.js `>=22` (Bun and Deno are tested too) and a project with a `package.json`. repo-contract has no runtime dependencies and bundles none of the tools it runs: install the ones you want checked (`typescript`, `eslint`, `vitest`, and so on), and `init` wires up the checks for what it finds.

```sh
npm install --save-dev repo-contract tsx
npx repo-contract init   # writes repo-contract.config.mts and scripts/contract.mjs, adds a "contract" script
npm run contract
```

That is the fastest path to a working result: in a project with only these two packages it produces a passing `securityDeps` check, and a tool you add later gets its check by adding its [preset](GUIDE.md#presets) to the generated config (`init` never overwrites existing files). Each tool still needs its own configuration (`tsconfig.json`, an ESLint flat config); `init` does not scaffold those, and a missing one surfaces as that tool's own "no config found" error.

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

## Fit and capabilities

**Use cases:** enforce a quality bar in one repository; share one standard across many through an internal package that owns the executors ([ADR 0010](specs/decisions/0010-review-driven-contracts-and-shared-internal-system-contracts.md)); roll out a new requirement safely as a dated `warn` that becomes `fail` ([ratchet](examples/day-one-walkthrough/README.md)); give CI bots and coding agents a concrete rationale to act on.

**Core capabilities:**

- Checks that run any command, with output parsed as JSON or validated against a schema ([Defining checks](GUIDE.md#defining-checks)).
- Policies that read other checks' evidence, with `dependsOn` ordering and `isolated` barriers.
- Presets for common tools, spread and overridden as needed ([catalog](GUIDE.md#presets)).
- Structured, schema-versioned evidence and verdict documents, plus a Markdown summary renderer ([Persisting a run](GUIDE.md#persisting-a-run-and-publishing-a-summary)).
- Ratchets and [governed exceptions](GUIDE.md#advanced-governed-exceptions) (Experimental) for a justified waiver of one finding without weakening the check.

**Integration:** it is a library, so your repository owns the entry point. Your tools, CI provider, and scripts keep running as they do; process spawning and environment access are capabilities you supply, never ambient ([ADR 0011](specs/decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md)). It adopts one check at a time: `--checks a,b,c` runs a named subset.

**Runtimes:** Node.js `>=22` on macOS, Linux, and Windows; Bun and Deno (Deno needs `--allow-read --allow-run --allow-env`); not browsers ([details](GUIDE.md#runtime-support)).

**Configuration and extension:** a typed `defineRepoContract` object. Spread a preset to override its command or timeout, or write your own check and policy ([Guide](GUIDE.md#defining-checks)). Organizations wrap it in a shared package that other repositories extend ([examples](examples/README.md)).

## Limits and when not to use it

- **Skip it when** `npm test` plus a linter is the whole story, each CI check is independent and that is fine, or you need no policy logic beyond exit codes.
- **Trade-offs:** it is a layer you maintain (a config and a runner), checks run as local processes so tools must be installed in every environment, and `init`'s detection table and the presets are Experimental and may change shape before 1.0.
- **Not a replacement** for your CI provider, test runner, or scanners. It does not install tools, host results, or authorize anything; it is not a dashboard.
- **Automation:** agents and bots can consume the same structured verdicts, but rationale does not guarantee a fix converges. The loop that retries, stops, and validates changes is the automation's job.

## Security and supply chain

- **Guarantees:** no shell by default (a `run` array is argv; a string is tokenized), no ambient spawn or environment access, no network calls or telemetry, and the no-network property is enforced by a check in this repository's own contract ([SECURITY.md](SECURITY.md#runtime-security-model)).
- **Trust boundaries:** it executes the commands your config names with the environment you pass, so the config and any policy you write are trusted code; what its guarantees do not cover is in [Application responsibilities](SECURITY.md#application-responsibilities).
- **Dependencies and licence:** zero runtime dependencies, MIT licensed. Two CycloneDX SBOMs are committed, one for what installing the package adds and one for this repository's build tooling ([what each covers](SECURITY.md#sboms)).
- **Reporting:** [private security advisory](https://github.com/MaverickCER/repo-contract/security/advisories/new); supported versions are in [SECURITY.md](SECURITY.md#supported-versions).

## Maturity, versioning and support

Pre-1.0 (see the npm badge for the current version). Per [VERSIONING.md](VERSIONING.md), a `0.x` minor may carry a breaking change to the Stable tier before 1.0, so pin accordingly. Evidence and verdict documents version independently of the package. Security fixes target the latest release until 1.0, after which they backport for a stated window ([ADR 0015](specs/decisions/0015-security-backport-window.md), a forward commitment, not yet a track record).

- **Upgrade:** read the [CHANGELOG](CHANGELOG.md) on every minor; there is no dedicated migration guide yet, and [ADOPTION.md](ADOPTION.md#migrating-onto-repo-contract) says what to use instead.
- **Release history:** [CHANGELOG](CHANGELOG.md) and [GitHub releases](https://github.com/MaverickCER/repo-contract/releases); the release process is in [RELEASING.md](RELEASING.md).
- **Bugs and requests:** [open an issue](https://github.com/MaverickCER/repo-contract/issues); questions go to Discussions ([SUPPORT.md](SUPPORT.md)).
- **Troubleshooting:** the [table in the Guide](GUIDE.md#troubleshooting) covers the common errors.

## Documentation

- **[Guide](GUIDE.md)**: integration, defining checks, cross-check policies, presets, errors, troubleshooting.
- **[Adoption guide](ADOPTION.md)**: the decision-maker summary of security, stability tiers, and architectural guarantees.
- **[API reference](https://maverickcer.github.io/repo-contract/api/)**: every exported type, field, and error code, generated from source.
- **[Architecture](specs/architecture.md)** and **[ADRs](https://github.com/MaverickCER/repo-contract/tree/main/specs/decisions)**: why it is built this way. [Glossary](specs/glossary.md).
- **[Examples](examples/README.md)**: runnable end-to-end wiring and walkthroughs.
- **Part of the MaverickCER toolkit:** `repo-contract` is the mechanism that runs checks and produces verdicts. [`internal-package-contract`](https://github.com/MaverickCER/internal-package-contract) is the standard the other packages satisfy, and [`@maverickcer/env-cap`](https://github.com/MaverickCER/env-cap) and [`data-cap`](https://github.com/MaverickCER/data-cap) are sibling packages it verifies. See the [toolkit overview](https://github.com/MaverickCER/internal-package-contract/blob/main/TOOLKIT.md) and [ADR 0018](specs/decisions/0018-ecosystem-bootstrap-cycle-and-package-names.md).

## Next steps

- **Evaluate:** read the [Adoption guide](ADOPTION.md), then run `npm run demo` in [`examples/demo/`](examples/demo/README.md).
- **Integrate:** follow the [Guide](GUIDE.md#the-runner-and-ci-integration) and the [examples](examples/README.md).
- **Verify:** inspect the [security model](SECURITY.md#runtime-security-model) and the [architecture](specs/architecture.md).

Contributing: [CONTRIBUTING.md](CONTRIBUTING.md) covers setup and how this repository validates itself with its own contract. License: MIT, see [LICENSE](LICENSE).
