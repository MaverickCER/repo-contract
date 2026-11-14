import type { CheckDefinitionConfig } from "../src/types.js"
import { evaluateVitestJsonPolicy } from "../src/presets/shared/vitest-json-policy.js"

// One check per accepted Vitest-based verification category (see
// specs/verification-taxonomy.md). Each independently runs only its own
// test/<category>/** via scripts/run-test-category.mjs. That script is the
// single canonical implementation package.json's test:<category> scripts
// also call. The test-unit/test-integration/test-property checks also pass
// --coverage. That same evidence-producing run creates the category's
// coverage artifact. The `coverage` check only aggregates what these three
// already produced; it never re-runs them.
export const testUnit: CheckDefinitionConfig = {
  run: ["node", "scripts/run-test-category.mjs", "unit", "--coverage", "--reporter=json"],
  output: { format: "json" },
  policy: ({ result }) => evaluateVitestJsonPolicy(result.output),
}
