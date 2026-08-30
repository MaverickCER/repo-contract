# internal-boilerplate-contract

The organization's engineering standard for one project type, built on
`repo-contract`. It answers _what must a project of this type continuously
satisfy?_ — the [boilerplate](../boilerplate) answers _how does such a project
start?_

- **[`contract.ts`](contract.ts)** — three read-only checks: `Format`
  (`prettier --check`), `Types` (`tsc --noEmit`), `Lint` (`eslint`).
- **[`bin/contract.mjs`](bin/contract.mjs)** — the runnable entry point, so a
  consumer's `package.json` only needs
  `"scripts": { "contract": "internal-boilerplate-contract" }`. It loads
  `contract.ts` from this package but runs every check against the consumer's
  working directory.
- **Exported baselines** — `./eslint`, `./prettier`, `./tsconfig` for consumers to
  extend, never copy.
- **[`.github/workflows/contract.yml`](.github/workflows/contract.yml)** — a
  reusable workflow that runs the consumer's contract in CI.
- **Dependencies** — this package owns `repo-contract` and every executor
  (`prettier`, `typescript`, `eslint`, …), so a consuming project installs only
  this one package.

See [`../README.md`](../README.md) for the full model.
