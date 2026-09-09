# demo

The tiny, real contract behind the README's opening demo.

Three checks, each a real, published `repo-contract/presets` entry, run against one deliberately
imperfect file (`src/greet.ts` -- see its own comment for exactly what's intentional about it):

- `typecheck` -- passes. The file type-checks cleanly.
- `format` (the published preset, substituted to `prettier --check .` so it can actually fail
  instead of silently rewriting the file -- see `repo-contract.config.ts`'s comment) -- fails. One
  string uses single quotes; Prettier's default is double.
- `lint` -- warns. This demo's own `eslint.config.ts` sets `no-console: "warn"`, and the file has
  one `console.log`.

Nothing here is a mockup. Run it yourself:

```sh
npm install
npm run demo
```

(from this directory, or `npm run demo --workspace demo` from `examples/`). It prints the real
`verdict.checks` output -- the exact text captured in the main README.
