import type { CheckDefinitionConfig } from "../src/types.js"
import { evaluateVitestJsonPolicy } from "../src/presets/shared/vitest-json-policy.js"

// See test-unit.ts for the shared rationale behind this category's shape.
export const testIntegration: CheckDefinitionConfig = {
  run: ["node", "scripts/run-test-category.mjs", "integration", "--coverage", "--reporter=json"],
  output: { format: "json" },
  policy: ({ result }) => evaluateVitestJsonPolicy(result.output),
}
