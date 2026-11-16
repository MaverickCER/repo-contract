import { checkTerminatedAbnormally } from "./presets/shared/terminal-status.js"
import type { CheckDefinitionConfig } from "./types.js"

// The redesign skeleton's stubs all call into this file. Integration deletes it: the build then
// fails on any stub a work package left behind.

/**
 * Stands in for a body a work package has not written yet.
 * @param workPackage - the owner, such as `"R1"`.
 * @param _inputs - the body's parameters, passed so the stub reads them.
 * @throws {Error} always: `not implemented: <workPackage>`.
 */
export function notImplemented(workPackage: string, ..._inputs: readonly unknown[]): never {
  throw new Error(`not implemented: ${workPackage}`)
}

/**
 * Stands in for a preset a work package has not written yet. The check builds, so a tier can
 * include it, and its policy fails. It reports an abnormal exit first, as every preset must.
 * @param workPackage - the owner, such as `"R7b"`.
 * @param _inputs - the factory's parameters, passed so the stub reads them.
 * @returns a check whose policy fails with `not implemented: <workPackage>`.
 */
export function notImplementedCheck(
  workPackage: string,
  ..._inputs: readonly unknown[]
): CheckDefinitionConfig {
  return {
    run: ["node", "-e", ""],
    policy: ({ result }) =>
      checkTerminatedAbnormally(result, "node") ?? {
        outcome: "fail",
        rationale: `not implemented: ${workPackage}`,
      },
  }
}
