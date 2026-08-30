import type { CheckDefinitionConfig } from "../types.js"
import { checkDependencyInstalled } from "./shared/missing-dependency.js"
import { checkTerminatedAbnormally } from "./shared/terminal-status.js"
import { exitCodeFailRationale } from "./shared/exit-code-fail-rationale.js"

/** Code formatting via Prettier, applied in place. */
export const format: CheckDefinitionConfig = {
  run: ["prettier", "--write", "."],
  policy: ({ result }) => {
    const missing = checkDependencyInstalled(result, "prettier")
    if (missing) return missing

    const terminated = checkTerminatedAbnormally(result, "Prettier")
    if (terminated) return terminated

    if (result.exitCode === 0) {
      return { outcome: "pass", rationale: "Prettier reported no formatting failures." }
    }

    return {
      outcome: "fail",
      rationale: exitCodeFailRationale(result, "Prettier reported formatting failures"),
    }
  },
}
