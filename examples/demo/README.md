# demo

The tiny, real contract behind the README's opening demo.

Three checks, each a real, published `repo-contract/presets` entry, run against one deliberately
imperfect file (`src/greet.ts`; see its own comment for exactly what's intentional about it):

- `typecheck` passes. The file type-checks cleanly.
- `format` fails. One string uses single quotes; Prettier's default is double. This is the
  published preset, substituted to `prettier --check .` so it can fail instead of silently
  rewriting the file (see `repo-contract.config.ts`'s comment).
- `lint` warns. This demo's own `eslint.config.ts` sets `no-console: "warn"`, and the file has
  one `console.log`.

Nothing here is a mockup. Run it yourself:

```sh
npm install
npm run demo
```

(from this directory, or `npm run demo --workspace demo` from `examples/`). It prints the real
`verdict.checks` output: the exact text captured in the main README.

## The AI review check

`npm run ai-review` runs the same three checks plus the published `aiReview` preset
(`ai-review.config.ts`). `fake-reviewer.mjs` stands in for the model: it receives the preset's
default prompt and replays a recorded reply from `ai-review.responses/`. Set `AI_REVIEW_RESPONSE`
to `unsure`, `clean`, `wrapped`, `off-shape` or `prose` to replay another reply. The GUIDE's
[AI review checks](../../GUIDE.md#ai-review-checks) section lists the outcome of each.
