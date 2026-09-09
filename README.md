# repo-contract

[![CI](https://github.com/MaverickCER/repo-contract/actions/workflows/ci.yml/badge.svg)](https://github.com/MaverickCER/repo-contract/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/repo-contract.svg)](https://www.npmjs.com/package/repo-contract)
[![Node](https://img.shields.io/node/v/repo-contract.svg)](https://www.npmjs.com/package/repo-contract)
[![License](https://img.shields.io/npm/l/repo-contract.svg)](LICENSE)

**Define your engineering standards once. Share them across repositories. Get actionable rationale for every outcome.**

repo-contract is a TypeScript library that turns the engineering rules scattered across CI, scripts, configuration, and documentation into a single contract you can version, review, and share. It runs the tools you already use, evaluates their results against your standards, and gives actionable information for every outcome. You replace none of your existing tools; your CI, scripts, and development workflow stay intact.

[See it run](#see-it-run) · [Quick Start](#quick-start) · [Across repositories](#from-one-repo-to-a-whole-org)

## See it run

**Actionable rationale for every outcome.** Here's the real output of the tiny contract in [`examples/demo/`](examples/demo/README.md) — three published presets against one deliberately imperfect file:

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

Real output, not a mockup — run it yourself with `npm run demo` from [`examples/demo/`](examples/demo/README.md). Not "CI failed": each line says what happened, where, why the repository treats it that way, and — when there's something to fix — how. `warn` doesn't block the run; `fail` does.

## Why it exists

Green CI does not mean your standard held.

- Coverage stays above 85%, but the file you just added has almost none — and whether that's acceptable isn't written down anywhere executable.
- The mutation score moved because the test suite moved — and nothing reconciles the two.
- A contributor gets "CI failed" and no idea what the repository expects them to do.

Individual tools answer individual questions. Your engineering standard is the answer to all of them together — and today it lives scattered across CI YAML, `package.json` scripts, configuration, docs, and review habits. repo-contract makes that standard one executable thing.

Tools run checks. Quality gates aggregate their exit codes. repo-contract sits a layer under both: it turns each tool's output into structured evidence, then lets your own policies decide what that evidence means — including reading one check's evidence to judge another's.

## Quick start

**Your standards, defined once as typed code.**

```sh
npm install --save-dev repo-contract tsx typescript vitest eslint
npx repo-contract init
npm run contract
```

`init` reads your `package.json`'s existing devDependencies (`typescript`, `vitest`, and `eslint`
above — install whichever of the [presets](GUIDE.md#presets) apply to you, `init` only wires up
what it finds), writes the same two files shown below
from them, and adds (or, if one's already there, leaves untouched) that same `"contract"` entry in
`package.json`'s own `scripts` — nothing it generates is required to run a contract; it's the same
scaffold you'd otherwise type by hand, once, so it stops being the first thing between you and
seeing this work. Point your pre-commit hook and your CI job at that same `npm run contract`.
`init` is Experimental (see [VERSIONING.md](VERSIONING.md)) — everything it writes is yours from
the moment it lands, so that classification is about the generator, never about what it produces.

### Already know how you want it configured? Create it by hand

A hand-authored contract is the same two files and the same `package.json` entry `init` writes,
with nothing hidden.

`tsx` runs the TypeScript config and runner. Each check invokes its own tool, so install those too — `typescript`, `vitest`, and `eslint` for the three below. repo-contract bundles none of them.

```ts
// repo-contract.config.mts — your standard, as typed code
import { spawn } from "node:child_process"
import { defineRepoContract } from "repo-contract"
import { lint, test, typecheck } from "repo-contract/presets"

export default defineRepoContract({
  spawn,
  env: process.env,
  checks: { typecheck, test, lint: lint() },
})
```

`.mts`, not `.ts`: an `.mts` file is always ESM to Node, regardless of whether your own `package.json` has `"type": "module"` set (`npm init`'s default output doesn't). A plain `.ts` config would compile to CommonJS in that case while the `.mjs` runner below — ESM by its own extension — imports it, and Node's CJS/ESM default-export interop would silently hand `runRepoContract` the wrong shape.

```ts
// scripts/contract.mjs — the entry point; this is the whole thing
import { runRepoContract } from "repo-contract"
import config from "../repo-contract.config.mjs"

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

Point your pre-commit hook and your CI job at that same `npm run contract`. The [Guide](GUIDE.md#the-runner-and-ci-integration) covers the runner, the `spawn`/`env` capability model, and Windows. Node.js `>=20` (Bun and Deno are tested too).

Two patterns worth knowing about early, not just once you're rolling this out across an org: the
[**ratchet**](examples/day-one-walkthrough/README.md) (a new requirement lands as a dated `warn` →
`fail`, never an overnight red build) and [**governed exceptions**](examples/exceptions-walkthrough/README.md)
(_Experimental_ — a justified, reviewed waiver for one specific finding, without weakening the
check for everything else).

## What a policy can express

**Checks produce evidence. Policies decide whether that evidence meets your standard** — and a policy can read any other check's result to do it:

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

That relationship — "don't evaluate X until Y passed" — is easy to state in the contract and awkward to maintain as independent CI steps. The [Guide](GUIDE.md#a-fuller-example-cross-check-policy) has the full version: coverage floors, per-file warnings, surviving-mutant rationales.

Presets exist for the common tools — TypeScript, ESLint, Vitest, Prettier, security auditing, dependency and dead-code analysis, package validation, and more. Each assumes its CLI is already a devDependency; repo-contract never installs anything. [Full catalog →](GUIDE.md#presets)

## Why not just add more CI steps?

**repo-contract distributes the whole engineering standard, not just individual checks.** One versioned package defines what your repositories consider acceptable — typed code, reviewed like any other code, and runnable on a developer's laptop as well as in CI.

You can express any individual check in CI. The problem is that the standard governing those checks ends up scattered across CI YAML, shared configs, and reusable workflows — infrastructure that distributes **how checks run**, rather than **what your organization considers acceptable**.

Shared ESLint configs, reusable workflows, and template repos distribute individual checks. repo-contract distributes the **whole standard**: the checks, the policies that relate them, and the rationale for their outcomes.

```text
GitHub Actions                    repo-contract
  lint      ✓                       one policy reads another check's result
  test      ✓                       the same contract runs in a pre-commit hook and in CI
  coverage  ✓                       it's typed code in your repo, reviewed like any code
  mutation  ✓                       every outcome carries a rationale you can act on
  ── but does that meet
     our standard? ──
```

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

**One definition, shared across every repository.** An organization expresses its engineering standard for a project type **once** — an internal package that wraps repo-contract and owns the executors — and every project of that type extends it instead of redefining it. Change the shared standard, and consuming repositories receive it through their normal dependency updates, including ones created from an older boilerplate.

- [`examples/`](examples/README.md) — a minimal, runnable end-to-end wiring of that model.
- [`examples/day-one-walkthrough/`](examples/day-one-walkthrough/README.md) — the **ratchet** pattern: rolling out a new shared requirement as a dated `warn` → `fail`, not an overnight red build.
- [`examples/exceptions-walkthrough/`](examples/exceptions-walkthrough/README.md) — _Experimental:_ a governed, justified waiver for one finding, without weakening the check.
- [ADR 0010](specs/decisions/0010-review-driven-contracts-and-shared-internal-system-contracts.md) — the reasoning.

## You probably don't need it when

- `npm test` plus a linter is the whole story;
- each CI check is already independent and that's fine;
- you don't need any policy logic on top of exit codes.

## Works with automation

AI coding agents, CI bots, and release automation consume the same contract as human contributors. An actionable rationale gives automation a concrete thing to fix rather than a bare "a check failed" — making regenerate-until-green workflows much easier to converge.

## Status

Pre-1.0. Per [VERSIONING.md](VERSIONING.md), a `0.x` minor may carry a breaking change to the Stable tier before 1.0 — pin accordingly and read the [CHANGELOG](CHANGELOG.md) on every minor upgrade.

## Learn more

- **[Guide](GUIDE.md)** — how to integrate it, define checks, parse output, write cross-check policies, use presets, and handle errors.
- **[Security](SECURITY.md)** — how commands run, which capabilities the consumer supplies, and the enforced no-network guarantee.
- **[API reference](https://maverickcer.github.io/repo-contract/api/)** — every exported type, field, and error code, generated from source so it cannot drift.
- **[Architecture](specs/architecture.md)** and the **[ADRs](https://github.com/MaverickCER/repo-contract/tree/main/specs/decisions)** — why it is built this way.
- **[examples/](examples/README.md)** — runnable end-to-end wiring, plus the two deep-dive walkthroughs.

## If this is useful

If this model matches how you think about repository standards, try the demo and examples. If it doesn't fit your repo, [open an issue](https://github.com/MaverickCER/repo-contract/issues) and say why.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and how this repository uses its own `repo-contract.config.ts` to validate itself, and [RELEASING.md](RELEASING.md) for the release process.

## License

MIT — see [LICENSE](LICENSE).
