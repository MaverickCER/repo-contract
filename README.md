# repo-contract

[![CI](https://github.com/MaverickCER/repo-contract/actions/workflows/ci.yml/badge.svg)](https://github.com/MaverickCER/repo-contract/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/repo-contract.svg)](https://www.npmjs.com/package/repo-contract)
[![Coverage: the lowest of line, statement, function and branch coverage](https://img.shields.io/endpoint?url=https://maverickcer.github.io/repo-contract/coverage-badge.json)](https://maverickcer.github.io/repo-contract/coverage.json)
[![Mutation score: the share of applicable mutants the tests detect](https://img.shields.io/endpoint?url=https://maverickcer.github.io/repo-contract/mutation-badge.json)](https://maverickcer.github.io/repo-contract/mutation.json)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/MaverickCER/repo-contract/badge)](https://scorecard.dev/viewer/?uri=github.com/MaverickCER/repo-contract)
![Socket Badge](https://badge.socket.dev/npm/package/repo-contract/latest)
[![Node](https://img.shields.io/node/v/repo-contract.svg)](https://www.npmjs.com/package/repo-contract)
[![License](https://img.shields.io/npm/l/repo-contract.svg)](LICENSE)

**One typed contract for the tools your CI runs: each check says pass, warn or fail and why; every governed exception is a reviewable record.**

For engineers who own quality gates in one repository or many. Most presets wrap a real tool, such as tsc, ESLint, Vitest or Stryker; `coverage`, `sbom`, `distNoUrls` and `bundledDependencies` run their own `node -e` script.
A policy you write turns the tool's output into a verdict with a reason. It can read another check's result first.
A governed exception, kept in an exception registry that `repo-contract except <id>` can fill in, holds a justification, review fields and an optional expiry date. A tier check turned off shows in `explain` as loosened. Agents get the same reasons, a skill and JSON with published schemas.
It runs the tools you install and replaces none of them.

<!-- quick-start:begin -->

```sh
npm i -D repo-contract tsx
npx repo-contract init --preset strict   # writes the config, the runner and scripts.contract
npx repo-contract explain                # lists the tier's checks and any setting you loosened
```

<!-- quick-start:end -->

Next, install the tools `init` listed as missing, then run the gate. For `strict` in an empty project, that is:

```sh
npm i -D prettier eslint typescript vitest secretlint knip jscpd licensee linkinator @vitest/coverage-v8 publint @arethetypeswrong/cli @danibram/crap4ts markdownlint-cli2 @commitlint/cli @stryker-mutator/core @stryker-mutator/vitest-runner
npm run contract   # one [PASS|WARN|FAIL] line per check, with its reason
```

Tiers (`basic`, `app`, `library`, `strict`) and `explain` are Experimental. Plain `npx repo-contract init` wires the tools your package.json lists. It also adds three checks that need no tool: `securityDeps` always, `bundledDependencies` unless the package is private, and `distNoUrls` when it publishes `dist/`.

[Why](#why-it-exists) · [Alternatives](#alternatives) · [See it run](#see-it-run) · [Install](#install-and-verify) · [Limits](#limits-and-when-not-to-use-it) · [Security](#security-and-supply-chain) · [Maturity](#maturity-versioning-and-support) · [Guide](GUIDE.md)

## Why it exists

**Problem:** green CI does not mean your rules held. Coverage stays above the floor while the new file you added has almost none. The mutation score moves because the test suite moved, and nothing reconciles the two. A contributor gets "CI failed" and no idea what the repository expects. The rules live across CI YAML, `package.json` scripts, tool configuration and review habits, so no single file says what they are.

**Who it is for:** platform and staff engineers who own quality gates for several repositories, and teams whose gates have outgrown independent CI steps. A developer can use it alone in one repository.

**Outcome:** one reviewed, versioned contract that runs on a laptop and in CI. It tells a contributor what to fix, not only that something failed. Publish it as an npm package and it becomes your organization's **standard**. Each repository that extends it runs the same checks and policies, and can add its own.

## How it differs

Hook runners such as pre-commit and lefthook judge by exit code. In repo-contract, each tool's output becomes **evidence**, and your policies decide what it means. A policy can read one check's evidence to judge another, and the same typed code runs locally and in CI.

Sharing config is not new: lefthook `remotes` and MegaLinter `EXTENDS` share commands across repositories, and Renovate presets share config. A standard also shares the policies that judge the results. It stays a dependency, so a changed check or policy arrives as an update.

### Alternatives

| Use instead                                     | When you need                                                | repo-contract adds                                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| husky + lint-staged, or lefthook                | Commands on staged files, set up in a minute                 | Warn as well as fail, a reason per check, and waivers that can expire                                    |
| pre-commit, Trunk, MegaLinter or Qlty           | Hooks for many languages, with the tools installed for you   | A policy that reads another check's result, and evidence JSON with published schemas                     |
| Trunk "Hold The Line"                           | Only new issues fail, line by line                           | A dated ratchet you write as a policy (`warn` until a date, then `fail`), per check rather than per line |
| Danger JS                                       | `warn()` and `fail()` comments about the pull request itself | Wrapped tools with recorded evidence; Danger can still post the summary                                  |
| Nx or Turborepo                                 | Remote caching and task graphs across a monorepo             | Test-level scope with `--explain`, and mutation shards                                                   |
| `vitest --changed` or `jest --findRelatedTests` | Only the tests a change touches                              | Why each test was picked, and the mutation targets for the same change                                   |

repo-contract installs no tools. If you want them installed for you, pick pre-commit, Trunk, MegaLinter or Qlty.

## What it does

A **check** runs a command and captures its result as **evidence**. A **policy** you own turns that evidence into a **verdict**: `pass`, `warn` or `fail`, each with a reason (its `rationale` field). `warn` is visible and does not block the run; `fail` does. [How it works](GUIDE.md#the-model) covers the model; [presets](GUIDE.md#presets) wrap the common tools (TypeScript, ESLint, Vitest, Prettier, security auditing, dead-code and package validation).

### See it run

[`examples/demo/`](examples/demo/README.md) runs three published presets against one deliberately imperfect file:

```ts
checks: {
  typecheck,
  format: { ...format, run: ["prettier", "--check", "."] },
  lint: lint(),
}
```

`npm run demo` prints:

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

Each result names the check, its outcome and the reason behind it. Failures carry the diagnostics needed to fix them; warnings stay visible without blocking. [`examples/release-gate/`](examples/release-gate/README.md) adds a fourth check, `release`, whose policy reads the other three and makes one decision:

<!-- example-output: release-gate/demo (scripts/run-examples.mjs fails CI when the example stops printing these lines) -->

```text
[FAIL] release
  Release blocked by format. Passing: typecheck. lint: 0 error(s), 1 warning(s); warnings do not block a release.
```

An **AI check** asks a model reviewer for fixed JSON with a confidence score on every finding. Only confident `error` findings fail it; the rest warn, so low-confidence answers stay visible without failing the build. The demo's [AI review check](examples/demo/README.md#the-ai-review-check) adds the [`aiReview` preset](GUIDE.md#ai-review-checks). Given a recorded reply with one confident error, it prints:

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
```

`dependsOn` orders execution and exposes the dependency's evidence to the policy, but it does not skip a check. The mutation command still runs when tests fail, and its policy decides what that evidence means. The policy separates a red dependency (no valid mutation evidence) from a valid but inadequate mutation result. The [Guide](GUIDE.md#a-fuller-example-cross-check-policy) has the full version with coverage floors, per-file warnings and a reason for each surviving mutant.

### Evidence it works

- **Self-hosted:** this repository is checked by its own contract on every change, with the coverage and mutation badges above generated from it. Mutation testing is held at zero survivors across `src/`. The `mutate` array in `stryker.config.mjs` lists each excluded file with its reason. Static mutants are not counted, and every other exception is a reviewable record ([CODE_REVIEW.md](CODE_REVIEW.md#3-automated-checks-versus-residual-review)).
- **Tested as shipped:** CI installs and exercises the packed tarball on Node.js under Linux, macOS and Windows. Bun and Deno run it on Linux only, in a CI job that fails when either runtime is missing ([runtime support](GUIDE.md#runtime-support)).
- **Runnable proof:** the [examples](examples/README.md) are real projects, not snippets. CI's `examples` job runs each example's main command (`scripts/run-examples.mjs`) and checks the exit code and output lines its README shows. Follow-up steps, such as fixing a file and rerunning, are not run. They cover the demo above, a [ratchet rollout](examples/day-one-walkthrough/README.md), a [governed exception](examples/exceptions-walkthrough/README.md), and a [cross-check release gate](examples/release-gate/README.md).
- **Verifiable release:** published with npm OIDC provenance, so a consumer can check that an artifact was built by this repository's CI ([ADOPTION.md](ADOPTION.md#security--threat-model)).

## Install and verify

**Prerequisites:** Node.js `>=22` (Bun and Deno are tested too) and a project with a `package.json`. The package has no runtime dependencies and bundles none of the tools it runs. Install the ones you want checked (`typescript`, `eslint`, `vitest`, and so on), and `init` wires up the checks for what it finds.

The quick start at the top installs the package and `tsx`, which loads the TypeScript config. `init --preset strict` writes `repo-contract.config.mts`, which spreads the [tier](GUIDE.md#tiers), and `scripts/contract.mjs`, and adds a `contract` script to `package.json`. It also names each tool the tier runs that your devDependencies lack. Plain `npx repo-contract init` wires one [preset](GUIDE.md#presets) per tool package.json lists, plus `securityDeps`, and `bundledDependencies` unless package.json is `private`. `init` never overwrites existing files, and it does not scaffold tool configuration (`tsconfig.json`, an ESLint flat config). A missing one surfaces as that tool's own "no config found" error. The smallest hand-written contract is `defineRepoContract({ spawn, env: process.env, checks: { typecheck } })`, with `spawn` from `node:child_process`.

**Verify it works:** `npm run contract` prints one `[PASS|WARN|FAIL] check: rationale` line per check and exits non-zero on a `fail`. Point your pre-commit hook and CI job at that same command. Saving evidence as files and publishing a CI summary are in the [Guide](GUIDE.md#the-runner-and-ci-integration); [Windows notes](GUIDE.md#troubleshooting) are in the troubleshooting table.

**Using an AI agent?** The package ships its skill at `node_modules/repo-contract/skills/repo-contract/SKILL.md`, a short manual written from its own exports. `npm run --silent contract -- --json` prints the run as JSON: the evidence and verdict documents, each valid against its `repo-contract/schema` file. `--silent` keeps npm's banner out of the JSON. This repository's `agent-skill` check keeps the skill current and within its word budget; nothing measures whether it makes an agent more accurate.

### Run less on a pull request

`npx repo-contract affected --base origin/main` lists the tests a change can reach, and `--explain` says why. It narrows only when it can be sure, and reports everything otherwise. It needs the project's own `typescript` ([supported versions](GUIDE.md#runtime-support)). Scopes, the result cache, mutation shards, fail-fast, `doctor` and run metrics are in the [Guide](GUIDE.md#running-less-affected-scope-cache-and-speed).

## Fit and capabilities

**Use cases:** enforce a quality bar in one repository. Hold one standard across many, with an internal package that wraps a contract ([ADR 0010](specs/decisions/0010-review-driven-contracts-and-shared-internal-system-contracts.md)). Roll out a new requirement as a dated `warn` that becomes `fail` ([ratchet](examples/day-one-walkthrough/README.md)). Give CI bots and coding agents a reason to act on.

**Core capabilities:**

- Checks that run any command, with output parsed as JSON or validated against a schema ([Defining checks](GUIDE.md#defining-checks)).
- Policies that read other checks' evidence, with `dependsOn` ordering and `isolated` barriers.
- Presets for common tools, spread and overridden as needed ([catalog](GUIDE.md#presets)), and four tiers that bundle them: `basic`, `app`, `library` and `strict` ([tiers](GUIDE.md#tiers)).
- Structured, schema-versioned evidence and verdict documents, plus a Markdown summary renderer ([Persisting a run](GUIDE.md#persisting-a-run-and-publishing-a-summary)).
- Ratchets and [governed exceptions](GUIDE.md#advanced-governed-exceptions) for a justified waiver of one finding without weakening the check.

**Integration:** it is a library, so your repository owns the entry point. Your tools, CI provider, and scripts keep running as they do; process spawning and environment access are capabilities you supply, never ambient ([ADR 0011](specs/decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md)). It adopts one check at a time: `runRepoContract`'s `checks` option runs a named subset of the configured checks. **Configuration and extension:** a typed `defineRepoContract` object. Spread a preset to override its command or timeout, or write your own check and policy ([Guide](GUIDE.md#defining-checks)). An organization publishes its contract as a standard that other repositories extend ([examples](examples/README.md)).

**Runtimes:** Node.js `>=22` on macOS, Linux, and Windows; Bun and Deno (Deno needs `--allow-read --allow-run --allow-env`); not browsers ([details](GUIDE.md#runtime-support)). **Package managers:** npm is supported. pnpm, Yarn 1 and Yarn Berry (node-modules linker) are tested for install and import of every entry point only ([details](GUIDE.md#package-managers)).

## Limits and when not to use it

- **Skip it when** `npm test` plus a linter is the whole story. The same goes when each CI check is independent and that is fine, or you need no policy logic beyond exit codes.
- **Trade-offs:** it is a layer you maintain (a config and a runner). Checks run as local processes, so tools must be installed in every environment. `init`'s detection table, the presets, `./tiers`, `./config`, `./affected` and `./metrics` are Experimental and may change shape before 1.0.
- **Not a replacement** for your CI provider, test runner, or scanners. It does not install tools, host results, or authorize anything; it is not a dashboard.
- **Automation:** agents and bots can read the same verdicts as JSON, but a reason does not ensure a fix converges. The loop that retries, stops, and validates changes is the automation's job.

## Security and supply chain

- **Runtime properties:** no shell by default (a `run` array is argv; a string is tokenized). No ambient spawn or environment access in the library. In the `bin`, `affected` and `doctor` run `git`, and `quick-start` runs npm and the commands your README marks. `npm-script` runs one npm script, and `mutation run` runs Stryker ([ADR 0011](specs/decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md#amendment-2026-11-01-the-command-line-tool-is-a-consumer-of-its-own-library)). The library makes no network calls and sends no telemetry, and a check in this repository's own contract enforces the no-network property ([SECURITY.md](SECURITY.md#runtime-security-model)).
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
