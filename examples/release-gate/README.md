# release-gate

One policy that reads the evidence of several checks to decide whether a release is permitted.

It uses the same three real, published `repo-contract/presets` entries as [`demo`](../demo) --
`typecheck`, `format` and `lint` -- against the same deliberately imperfect `src/greet.ts`. The new part
is the fourth check, `release`. It runs no command of its own. Its policy receives the evidence of every
other check (`ctx.evidence.checks`) and decides what the combination means:

- `typecheck` and `format` are required: either failing blocks the release.
- `lint` is advisory: warnings are counted and reported, and only errors block.

A script that ran the three commands could report three results. The contract reports one decision, says
which check caused it, and says what passed and what was only a warning.

Nothing here is a mockup. Run it yourself:

```sh
npm install
npm run demo
```

The output is a single verdict. With `src/greet.ts` as it is, `format` fails, so `release` fails and names
it:

```text
[FAIL] release
  Release blocked by format. Passing: typecheck. lint: 0 error(s), 1 warning(s); warnings do not block a release.
```

Fix the file (`npx prettier --write src/greet.ts`) and the same policy returns `pass` with the reason
"Release permitted".
