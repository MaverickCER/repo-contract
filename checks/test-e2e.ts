import { evaluateVitestJsonPolicy } from "../src/presets/shared/vitest-json-policy.js"
import type { CheckDefinitionConfig } from "../src/types.js"

// Package-acceptance/E2E: crosses the package boundary against the real
// built dist/. This needs dist/ freshly rebuilt from current source, not
// whatever happened to already be on disk. A `build` check id does exist
// (checks/build.ts). It is an `isolated: true` full barrier declared before
// this one in repo-contract.config.ts, so a full `npm run contract` run
// always waits on it. That guarantee is scheduling-only, though. It
// disappears for a partial run naming only `test-e2e` (or any subset that
// omits `build`). `resolveCheckDependencies` (src/execution/run-checks.ts)
// follows declared `dependsOn` alone, and this check declares none.
// Freshness for that narrower case is enforced out-of-band via
// package.json's `precontract` lifecycle hook (`npm run build`, which npm
// runs automatically before `contract`). The guarantee therefore holds for
// `npm run contract` and `npm test` (which itself runs through `contract`),
// whichever checks a caller selects. It does not hold for the check
// runner's own `runChecks`/`runRepoContract` invoked directly without that
// npm lifecycle hook in front of it. Never receives --coverage: see the
// coverage-contribution matrix in specs/verification-taxonomy.md for why.
export const testE2e: CheckDefinitionConfig = {
  run: ["node", "scripts/run-test-category.mjs", "e2e", "--reporter=json"],
  output: { format: "json" },
  policy: ({ result }) => evaluateVitestJsonPolicy(result.output),
}
