import type { CheckDefinitionConfig } from "../types.js"
import { checkDependencyInstalled } from "./shared/missing-dependency.js"
import { checkTerminatedAbnormally } from "./shared/terminal-status.js"
import { exitCodeFailRationale } from "./shared/exit-code-fail-rationale.js"

/** Type checking via `tsc --noEmit`. */
export const typecheck: CheckDefinitionConfig = {
  run: ["tsc", "--noEmit", "-p", "tsconfig.json"],
  policy: ({ result }) => {
    const missing = checkDependencyInstalled(result, "typescript")
    if (missing) return missing

    const terminated = checkTerminatedAbnormally(result, "TypeScript")
    if (terminated) return terminated

    if (result.exitCode === 0) {
      return { outcome: "pass", rationale: "tsc reported no type errors." }
    }

    return {
      outcome: "fail",
      rationale: exitCodeFailRationale(result, "TypeScript reported type errors"),
    }
  },
}
