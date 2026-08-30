# boilerplate

A project started from the organization's standard. Trivial by design — the
whole application is one `console.log` ([`src/index.ts`](src/index.ts)). The
point is the wiring, not the code.

- Its **only direct dependency** is
  [`internal-boilerplate-contract`](../internal-boilerplate-contract). It never
  depends on `repo-contract` directly — that arrives transitively.
- [`tsconfig.json`](tsconfig.json), [`eslint.config.ts`](eslint.config.ts), and
  [`prettier.config.ts`](prettier.config.ts) each extend the exported baseline in
  one line, then add only what is project-specific.
- `npm run contract` runs the organization's three checks (`Format`, `Types`,
  `Lint`) against this tree.
- [`.github/workflows/contract.yml`](.github/workflows/contract.yml) calls the
  reusable workflow the standard publishes.

See [`../README.md`](../README.md) for the full model.
