import { exitCodeFailRationale } from "../src/presets/shared/exit-code-fail-rationale.js"
import type { CheckDefinitionConfig } from "../src/types.js"

/**
 * Runs the same build pipeline `precontract` already runs before any `npm run contract`
 * invocation (`npm run clean && tsup && tsc -p tsconfig.build.json && node
 * scripts/emit-dts-shims.mjs`), but as an explicit check with its own evidence and policy rather
 * than a side effect with no verdict of its own. Declared `isolated: true` and positioned right
 * after every file-writing check in repo-contract.config.ts's own `checks` object: an isolated
 * check is a full scheduling barrier at its own declared position (see
 * specs/decisions/0003-dependson-and-isolated-are-two-scheduling-primitives.md), so this automatically waits for
 * every writer to finish and every read/report-only check declared after it automatically waits
 * for this to finish -- zero per-check `dependsOn` wiring needed on either side.
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
