# repo-contract

[![CI](https://github.com/MaverickCER/repo-contract/actions/workflows/ci.yml/badge.svg)](https://github.com/MaverickCER/repo-contract/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/repo-contract.svg)](https://www.npmjs.com/package/repo-contract)
[![Node](https://img.shields.io/node/v/repo-contract.svg)](https://www.npmjs.com/package/repo-contract)
[![License](https://img.shields.io/npm/l/repo-contract.svg)](LICENSE)

**Turn your repository's engineering standards into one enforceable contract.**

repo-contract runs the lint, test, coverage, security, and quality tools you already use, and turns their results into one repository-defined **pass / warn / fail** — with an actionable reason on every outcome.

You replace nothing. Your tools, your CI, and your scripts stay exactly as they are.

[See it run](#see-it-run) · [Quick start](#quick-start) · [Guide](GUIDE.md) · [API reference](https://maverickcer.github.io/repo-contract/api/)

## See it run

The real output of the tiny contract in [`examples/demo/`](examples/demo/README.md) — three published presets against one deliberately imperfect file:

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
  Prettier reported formatting failures: Checking formatting...
  [warn] src/greet.ts
  [warn] Code style issues found in the above file. Run Prettier with --write to fix.

[WARN] lint
  ESLint reported 0 errors but 1 warning(s):
  - src/greet.ts:15:3 [no-console]: Unexpected console statement.
```

Real output, not a mockup — run it yourself with `npm run demo` from [`examples/demo/`](examples/demo/README.md). Not "CI failed": each line says what happened, where, why the repository treats it that way, and what to do. `warn` doesn't block the run; `fail` does.

## Why it exists

Green CI does not mean your standard held.

- Coverage stays above 85% while the file you just added has almost none — no step notices.
- The mutation score moved because the test suite moved — no step knows the number is now meaningless.
- A contributor gets "CI failed" and no idea what the repository expects them to do.

Individual tools answer individual questions. A repository standard is a question about all of them **together** — and today that question lives scattered across CI YAML, `package.json` scripts, docs, and review habits. repo-contract makes it one executable thing.

## Quick start

Three files, about five minutes.

```sh
npm install --save-dev repo-contract
```

```ts
// repo-contract.config.ts — your standard, as typed code
import { spawn } from "node:child_process"
import { defineRepoContract } from "repo-contract"
import { lint, test, typecheck } from "repo-contract/presets"

export default defineRepoContract({
  spawn,
  env: process.env,
  checks: { typecheck, test, lint: lint() },
})
```

```ts
// scripts/contract.mjs — the entry point; this is the whole thing
import { runRepoContract } from "repo-contract"
import config from "../repo-contract.config.js"

const { verdict } = await runRepoContract(config)
for (const [id, result] of Object.entries(verdict.checks)) {
  console.log(`[${result.outcome.toUpperCase()}] ${id}: ${result.rationale}`)
}
process.exitCode = verdict.passed ? 0 : 1
```

```json
{ "scripts": { "contract": "tsx scripts/contract.mjs" } }
```

```sh
npm run contract
```

Point your pre-commit hook and your CI job at that same `npm run contract`. There is no CLI [by design](GUIDE.md#the-runner-and-ci-integration) — your repository owns the entry point (the file above), not the package. `spawn` and `env` are passed in rather than acquired by the package, so the runner holds no ambient capabilities; plain `node:child_process` works on macOS/Linux, on Windows pass [`cross-spawn`](GUIDE.md#supplying-spawn-and-env).

Node.js `>=20` (Bun and Deno are tested too).

## What a policy can express

A check runs a tool. A **policy** — your code — decides whether that result meets your standard, and can read any other check's result to do it:

```ts
checks: {
  tests: test,

  mutation: {
    run: ["npm", "run", "mutation"],
    dependsOn: ["tests"], // run after tests; hand this policy their result
    policy: ({ dependencies }) =>
      dependencies.tests?.exitCode !== 0
        ? { outcome: "fail", rationale: "Tests must pass before a mutation score means anything." }
        : { outcome: "pass", rationale: "Tests passed; mutation score is meaningful." },
  },
}
```

That "don't evaluate X until Y passed" is the thing a pile of independent CI steps can't say. The [Guide](GUIDE.md#a-fuller-example-cross-check-policy) has the full version — coverage floors, per-file warnings, surviving-mutant rationales.

Presets exist for the common tools — TypeScript, ESLint, Vitest, Prettier, security auditing, dependency and dead-code analysis, package validation, and more. Each assumes its CLI is already a devDependency; repo-contract never installs anything. [Full catalog →](GUIDE.md#presets)

## Why not just add more CI steps?

CI steps tell you whether each tool passed. They can't tell you what the results mean **together**, and they don't run on your laptop.

```text
GitHub Actions                    repo-contract
  lint      ✓                       one policy reads another check's result
  test      ✓                       the same contract runs in a pre-commit hook and in CI
  coverage  ✓                       it's typed code in your repo, reviewed like any code
  mutation  ✓                       every outcome carries a rationale you can act on
  ── but does that meet
     our standard? ──
```

Shared ESLint configs, reusable workflows, and template repos distribute individual checks. repo-contract distributes the **whole standard** as one versioned package your repositories depend on.

## From one repo to a whole org

```text
typecheck + lint + test
      |  add policy
coverage + mutation + security
      |  share it
one contract package, inherited by every repository
      |  roll out safely
new requirements land as `warn`, become `fail` on a date
```

An organization expresses its engineering standard for a project type **once** — an internal package that wraps repo-contract and owns the executors — and every project of that type extends it instead of redefining it. Change the shared standard, and every consuming repository picks it up, including ones created from an older boilerplate.

- [`examples/`](examples/README.md) — a minimal, runnable end-to-end wiring of that model.
- [`examples/day-one-walkthrough/`](examples/day-one-walkthrough/README.md) — rolling out a new shared requirement as a dated `warn` → `fail`, not an overnight red build.
- [`examples/exceptions-walkthrough/`](examples/exceptions-walkthrough/README.md) — _Experimental:_ a governed, justified waiver for one finding, without weakening the check.
- [ADR 0010](specs/decisions/0010-review-driven-contracts-and-shared-internal-system-contracts.md) — the reasoning.

## Works with automated contributors

An AI coding agent, a CI bot, or release automation gets the same contract as a human. Rather than pushing every rule into an agent's context window, put the important ones around the automation: the change is regenerated until the verdict passes, and a rationale that names the file, line, and fix is what makes that loop converge.

## You probably don't need it when

- `npm test` plus a linter is the whole story;
- each CI check is already independent and that's fine;
- you don't need any policy logic on top of exit codes.

## Status

Pre-1.0. Per [VERSIONING.md](VERSIONING.md), a `0.x` minor may carry a breaking change to the Stable tier before 1.0 — pin accordingly and read the [CHANGELOG](CHANGELOG.md) on every minor upgrade.

## Learn more

- **[Guide](GUIDE.md)** — how to integrate it, define checks, parse output, write cross-check policies, use presets, and handle errors.
- **[Security](SECURITY.md)** — how commands run, which capabilities the consumer supplies, and the enforced no-network guarantee.
- **[API reference](https://maverickcer.github.io/repo-contract/api/)** — every exported type, field, and error code, generated from source so it cannot drift.
- **[Architecture](specs/architecture.md)** and the **[ADRs](https://github.com/MaverickCER/repo-contract/tree/main/specs/decisions)** — why it is built this way.
- **[examples/](examples/README.md)** — runnable end-to-end wiring, plus the two deep-dive walkthroughs.

## If this is useful

If this model matches how you think about repository standards, [star it on GitHub](https://github.com/MaverickCER/repo-contract) — it's the main way other maintainers find it. If it doesn't fit your repo, [open an issue](https://github.com/MaverickCER/repo-contract/issues) and say why; that's more useful than a star.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and how this repository uses its own `repo-contract.config.ts` to validate itself, and [RELEASING.md](RELEASING.md) for the release process.

## License

MIT — see [LICENSE](LICENSE).
