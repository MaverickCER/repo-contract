import { exitCodeFailRationale } from "../src/presets/shared/exit-code-fail-rationale.js"
import type { CheckDefinitionConfig } from "../src/types.js"

/**
 * Runs the same build pipeline `precontract` already runs before any `npm run contract`
 * invocation (`npm run clean && tsup && tsc -p tsconfig.build.json && node
 * scripts/emit-dts-shims.mjs`). Here it is an explicit check with its own evidence and policy,
 * not a side effect with no verdict of its own. It is declared `isolated: true` and positioned
 * right after every file-writing check in repo-contract.config.ts's own `checks` object. An
 * isolated check is a full scheduling barrier at its own declared position (see
 * specs/decisions/0002-dependson-and-isolated-are-two-scheduling-primitives.md). This check
 * therefore waits for every writer to finish, and every read/report-only check declared after it
 * waits for this one. Neither side needs per-check `dependsOn` wiring.
 */
export const build: CheckDefinitionConfig = {
  run: ["npm", "run", "build"],
  policy: ({ result }) => {
    if (result.exitCode === 0) {
      return { outcome: "pass", rationale: "The build completed successfully." }
    }

    return {
      outcome: "fail",
      rationale: exitCodeFailRationale(result, "The build failed"),
    }
  },
}
