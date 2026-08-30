# Layered organizational governance

A minimal, runnable example of `repo-contract` as the enforcement layer beneath an
organizational standard and a project boilerplate.

The point it demonstrates: **a repository should not reinvent its engineering
standards.** An organization, team, or individual developer defines a standard once
per project type, and every project of that type inherits it — while still being
free to add its own requirements.

## The organizational model

Engineering standards should generally be established at the organization, team,
project-type, or individual-practice level, not independently reinvented by every
repository. An organization typically maintains several standards, one per project
type:

```text
Organization
    |
    +-- Server contract      -----> service A, service B, service C
    +-- Package contract     -----> package A, package B
    +-- Frontend contract    -----> app A, app B
    +-- TanStack contract    -----> app C, app D
```

Each project consumes the standard for its type and may extend it locally. The
baseline is inherited, never copied.

## The layers

`internal-boilerplate-contract` here is the **contract that defines the standard the
boilerplate implements** — not "the boilerplate's contract."

| Layer                                                            | Owns                                           | Answers                                                  |
| ---------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------- |
| [`repo-contract`](../README.md)                                  | execution, evidence, and policy mechanism      | _How_ is a requirement evaluated into a verdict?         |
| [`internal-boilerplate-contract`](internal-boilerplate-contract) | the organization's standard for a project type | _What_ must a project of this type continuously satisfy? |
| [`boilerplate`](boilerplate)                                     | the starting state of a new project            | _How_ does a project of this type start?                 |
| a real project                                                   | project-specific checks and implementation     | _What_ else does this one repository require?            |

Boilerplate and shared contracts are complementary. Boilerplate establishes
conventions at creation time; the shared contract enforces durable requirements as
the project evolves — including on projects created from an older boilerplate
version. See
[ADR 0010](../specs/decisions/0010-review-driven-contracts-and-shared-internal-system-contracts.md).

## What each package here shows

```text
boilerplate
    |
    |  devDependency: internal-boilerplate-contract   (its ONLY direct dependency)
    v
internal-boilerplate-contract
    |
    |  dependency: repo-contract + prettier + typescript + eslint + ...
    v
repo-contract
```

- **[`internal-boilerplate-contract/`](internal-boilerplate-contract)**
  - `contract.ts` — three read-only checks: `Format`, `Types`, `Lint`.
  - `bin/contract.mjs` — a runnable entry point, so the consumer's `package.json`
    only needs `"scripts": { "contract": "internal-boilerplate-contract" }`.
  - `eslint.config.ts`, `prettier.config.ts`, `tsconfig.json` — baselines exported
    via the `./eslint`, `./prettier`, `./tsconfig` subpaths.
  - `.github/workflows/contract.yml` — a reusable workflow (`on: workflow_call`).
- **[`boilerplate/`](boilerplate)**
  - `src/index.ts` — one `console.log`. The example is about wiring, not code.
  - `eslint.config.ts`, `prettier.config.ts`, `tsconfig.json` — each extends the
    exported baseline in one line, then adds only project-specific pieces.
  - `.github/workflows/contract.yml` — a thin caller that references the reusable
    workflow.

## How execution context works

```text
consumer repository
        |
        |  npm run contract
        v
internal-boilerplate-contract/bin/contract.mjs
        |
        |  loads its own contract.ts   (the contract DEFINITION comes from the package)
        v
runRepoContract(config)                (no cwd override)
        |
        v
process.cwd()  ==  consumer repository (the EXECUTION CONTEXT comes from the consumer)
```

The package owns the contract definition. The consumer owns the execution context.
That is what lets one published standard govern many repositories without any of
them vendoring the checks.

## Running it

Requires Node >= 24 — the exported configs are TypeScript, and Prettier loads a
`.ts` config only on a Node with native type stripping.

```sh
# 1. Build repo-contract once (CONTRIBUTING already has you do this).
npm install

# 2. Wire the example workspace.
cd examples
npm install

# 3. Run the organization's contract against the boilerplate.
npm run contract -w boilerplate
```

All three checks (`Format`, `Types`, `Lint`) run against `boilerplate/` and pass.

This is a self-contained example workspace — it is **not** part of the
`repo-contract` package, its CI, or its own `npm run contract`, and nothing here is
published. The `file:` dependencies point back at this repository so the dependency
relationships are visible in source. In a real organization, `internal-boilerplate-contract`
is published to an internal registry (or linked as a workspace); a new project then
depends on that one package and receives `repo-contract` plus every executor
transitively — which is why the executors are regular `dependencies` of the
contract package.

## Design principle

```text
Define once
     |
     v
Organizational contract  (shared config + shared checks + shared tooling + shared CI)
     |
     v
Organizational boilerplate
     |
     +----------+----------+
     v          v          v
  project    project    project
```

`repo-contract` remains the generic contract execution and evidence layer. It does
not define or own an organization's standards. `internal-boilerplate-contract` is
the opinionated layer, and it lives here as an example — not in `repo-contract`
itself.

## See also

- [ADR 0010 — Review-driven contract evolution and consumer-owned shared contracts](../specs/decisions/0010-review-driven-contracts-and-shared-internal-system-contracts.md)
- [The `repo-contract` README](../README.md)
