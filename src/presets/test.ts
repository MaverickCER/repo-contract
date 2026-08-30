import type { CheckDefinitionConfig } from "../types.js"
import { checkDependencyInstalled } from "./shared/missing-dependency.js"
import { checkTerminatedAbnormally } from "./shared/terminal-status.js"
import { evaluateVitestJsonPolicy } from "./shared/vitest-json-policy.js"

/** Unit/integration test execution via Vitest, reading its JSON reporter output. */
export const test: CheckDefinitionConfig = {
  run: ["vitest", "run", "--reporter=json"],
  output: { format: "json" },
  policy: ({ result }) => {
    const missing = checkDependencyInstalled(result, "vitest")
    if (missing) return missing

    const terminated = checkTerminatedAbnormally(result, "Vitest")
    if (terminated) return terminated

    return evaluateVitestJsonPolicy(result.output)
  },
}
