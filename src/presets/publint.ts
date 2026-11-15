import type { CheckDefinitionConfig } from "../types.js"
import { combinedOutput, exitCodeFailRationale } from "./shared/exit-code-fail-rationale.js"
import { checkDependencyInstalled } from "./shared/missing-dependency.js"
import { checkTerminatedAbnormally } from "./shared/terminal-status.js"

/**
 * publint has no machine-readable output mode: only a plain-text CLI
 * reporter (see its `src/cli.js` `formatMessages`). Its process exit
 * code reflects only 'error'-level findings; 'warning'/'suggestion'-level
 * findings never affect it. This preset reads the three section headers
 * publint's CLI writes ("Errors:", "Warnings:", "Suggestions:") to tell
 * blocking findings from non-blocking ones. It depends on no per-message
 * structure, which publint doesn't expose. Relevant only to repositories
 * that publish an npm package.
 * @beta
 */
export const publint: CheckDefinitionConfig = {
  run: ["publint", "run"],
  policy: ({ result }) => {
    const missing = checkDependencyInstalled(result, "publint")
    if (missing) return missing

    const terminated = checkTerminatedAbnormally(result, "publint")
    if (terminated) return terminated

    const output = combinedOutput(result)

    if (result.exitCode === 0) {
      return output.includes("Warnings:") || output.includes("Suggestions:")
        ? { outcome: "warn", rationale: `publint reported non-blocking finding(s):\n${output}` }
        : { outcome: "pass", rationale: "publint reported no packaging errors." }
    }

    return {
      outcome: "fail",
      rationale: exitCodeFailRationale(result, "publint reported packaging error(s)"),
    }
  },
}
