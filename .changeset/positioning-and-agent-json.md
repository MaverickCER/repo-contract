---
"repo-contract": minor
---

The runner `init` writes takes `--json`, and the package ships its agent skill.

- **`--json` on `scripts/contract.mjs`.** `npm run --silent contract -- --json` prints one JSON object: `evidence` and `verdict`, the two documents `serializeRun` writes. Each is valid against its `repo-contract/schema` file. The exit code matches the text mode. `--silent` keeps npm's banner out of stdout.
- **Existing runners stay as they are.** `init` never overwrites a file. To get `--json`, copy GUIDE.md's runner block, or delete `scripts/contract.mjs` and run `init` again.
- **`init` repeats your arguments in its tsx hint.** Without tsx, `init --preset strict` now suggests `npx repo-contract init --preset strict` again, then `explain`. Before, the hint dropped `--preset`.
- **Mutation needs `@stryker-mutator/vitest-runner` too.** `strykerConfig()` sets `testRunner: "vitest"`, which Stryker loads only from that plugin. `init --preset strict` now lists it when it is missing.
- **The skill is in the tarball.** `package.json#files` now includes `skills/`, so an agent reads `node_modules/repo-contract/skills/repo-contract/SKILL.md` without a network call.
- **New npm description and keywords.** The description leads with policies and says every governed exception is a reviewable record. The keywords are `quality-gate`, `policy-as-code` and `pre-commit`.
- **README quick start uses a tier.** The marked block runs `init --preset strict` and `explain`, and the `quickStart` check runs it from an empty project. The README adds an Alternatives table under "How it differs".
