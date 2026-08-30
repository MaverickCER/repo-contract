import { evaluateVitestJsonPolicy } from "../src/presets/shared/vitest-json-policy.js"
import type { CheckDefinitionConfig } from "../src/types.js"

// Package-acceptance/E2E: crosses the package boundary against the real
// built dist/ -- this needs dist/ freshly rebuilt from current source, not
// whatever happened to already be on disk. A `build` check id does exist
// (checks/build.ts) and, as an `isolated: true` full barrier declared before
// this one in repo-contract.config.ts, is always waited on during a full
// `npm run contract` run -- but that guarantee is scheduling-only and
// disappears entirely for a partial run naming only `test-e2e` (or any
// subset that omits `build`), since `resolveCheckDependencies`
// (src/execution/run-checks.ts) follows declared `dependsOn` alone and this
// check declares none. Freshness for that narrower case is enforced
// out-of-band via package.json's `precontract` lifecycle hook (`npm run
// build`, which npm runs automatically before `contract`), so the guarantee
// holds for `npm run contract`/`npm test` (which itself runs through
// `contract`) regardless of which checks a caller selects, but not for the
// check runner's own `runChecks`/`runRepoContract` invoked directly without
// that npm lifecycle hook in front of it. Never receives
// --coverage: see the coverage-contribution matrix in
// specs/verification-taxonomy.md for why.
export const testE2e: CheckDefinitionConfig = {
  run: ["node", "scripts/run-test-category.mjs", "e2e", "--reporter=json"],
  output: { format: "json" },
  policy: ({ result }) => evaluateVitestJsonPolicy(result.output),
}
