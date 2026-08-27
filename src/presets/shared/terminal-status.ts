import type { CheckEvidence, PolicyResult } from "../../types.js"
import { combinedOutput } from "./exit-code-fail-rationale.js"

/**
 * The guard every preset needs immediately after `checkDependencyInstalled`
 * and before its own pass/fail logic: a check whose process did not run to a
 * normal exit on its own -- it timed out, was aborted via `options.signal`,
 * was killed by a host `SIGINT`/`SIGTERM`, received an external signal, or
 * failed to spawn for a reason other than a missing executable -- has a
 * `null` `exitCode` and only whatever partial output the tool managed before
 * termination. Interpreting that with an exit-code comparison or a JSON
 * parse would present an operational failure to the consumer as a fabricated
 * tool-specific verdict ("TypeScript reported type errors (exit code null)",
 * "ESLint output could not be parsed as JSON"). This reports the real
 * terminal cause instead.
 *
 * `"completed"` returns `undefined` -- the process reached its own exit and
 * the preset interprets the (possibly non-zero) exit code itself. The
 * ENOENT `"spawn_error"` case is already handled by `checkDependencyInstalled`;
 * this catches the remaining spawn failures (`EACCES`, `ENOEXEC`) that
 * `missing-dependency.ts` documents as falling through.
 * @param result - the check's raw execution evidence to inspect.
 * @param toolName - the tool's own display name for the rationale (e.g. "ESLint", "TypeScript").
 * @returns a fail `PolicyResult` describing the abnormal termination, or `undefined` if the process ran to its own exit and the caller should proceed.
 */
export function checkTerminatedAbnormally(
  result: CheckEvidence,
  toolName: string,
): PolicyResult | undefined {
  if (result.status === "completed") {
    return undefined
  }

  const detail = combinedOutput(result)
  const suffix = detail.length > 0 ? `\n${detail}` : ""

  switch (result.status) {
    case "timed_out":
      return {
        outcome: "fail",
        rationale: `${toolName} did not finish: its process exceeded the configured timeout and was terminated.${suffix}`,
      }
    case "aborted":
      return {
        outcome: "fail",
        rationale: `${toolName} did not finish: the run was aborted before its process completed.${suffix}`,
      }
    case "host_terminated":
      return {
        outcome: "fail",
        rationale: `${toolName} did not finish: the host process received a termination signal and killed it.${suffix}`,
      }
    case "signaled":
      return {
        outcome: "fail",
        rationale: `${toolName} was terminated by signal ${result.signal ?? "unknown"} before it completed.${suffix}`,
      }
    case "spawn_error":
      return {
        outcome: "fail",
        rationale: `${toolName} could not be started: ${result.spawnError ?? "the process failed to spawn"}.`,
      }
  }
}
