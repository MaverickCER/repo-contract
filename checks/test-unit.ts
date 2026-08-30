import type { CheckDefinitionConfig } from "../src/types.js"
import { evaluateVitestJsonPolicy } from "../src/presets/shared/vitest-json-policy.js"

// One check per accepted Vitest-based verification category (see
// specs/verification-taxonomy.md) -- each independently runs only its own
// test/<category>/** via scripts/run-test-category.mjs, the single canonical
// implementation package.json's test:<category> scripts also call.
// test-unit/test-integration/test-property additionally pass --coverage:
// that same evidence-producing run is what creates that category's coverage
// artifact -- see the `coverage` check, which only aggregates what these
// three already produced, never re-running them.
export const testUnit: CheckDefinitionConfig = {
  run: ["node", "scripts/run-test-category.mjs", "unit", "--coverage", "--reporter=json"],
  output: { format: "json" },
  policy: ({ result }) => evaluateVitestJsonPolicy(result.output),
}
