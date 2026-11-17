import type { CheckDefinitionConfig, PolicyResult } from "../types.js"
import { checkDependencyInstalled } from "./shared/missing-dependency.js"
import { checkTerminatedAbnormally } from "./shared/terminal-status.js"
import { checkOptionsObject } from "./rules/option-checks.js"

/** Options accepted by {@link quickStart}. */
export interface QuickStartOptions {
  /** The Markdown file that holds the marked quick start, relative to the working directory. Defaults to `"README.md"`. */
  readonly readme?: string
  /** Time all of the quick start's commands together may take, in milliseconds. Defaults to `300000` (five minutes). */
  readonly timeoutMs?: number
}

/** Time `npm pack` and cleanup may take beyond the commands' own budget before the run is stopped. */
const PACK_ALLOWANCE_MS = 120_000

const MESSAGE_STATES: ReadonlySet<unknown> = new Set(["no-block", "invalid", "no-install", "error"])

interface CommandResult {
  readonly command: string
  readonly exitCode: number | null
  readonly timedOut: boolean
}

/** The report, read into what the policy needs. */
type QuickStartReport =
  | { readonly state: "passed"; readonly readme: string; readonly count: number }
  | {
      readonly state: "failed"
      readonly readme: string
      readonly count: number
      readonly failed: CommandResult
      readonly output: string
    }
  | { readonly state: "stopped"; readonly message: string }

/**
 * Whether `value` is one entry of the report's `commands`.
 * @param value - one parsed entry.
 * @returns `true` when it names a command and how it ended.
 */
function isCommandResult(value: unknown): value is CommandResult {
  // Parsed JSON is never `undefined`, and any other non-object fails the field checks below.
  if (value === null) return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.command === "string" &&
    (typeof entry.exitCode === "number" || entry.exitCode === null) &&
    typeof entry.timedOut === "boolean"
  )
}

/**
 * Reads what `repo-contract quick-start --json` prints.
 * @param value - the parsed output.
 * @returns the report, or `undefined` when it is not well formed.
 */
function readReport(value: unknown): QuickStartReport | undefined {
  // Parsed JSON is never `undefined`, and any other non-object fails the field checks below.
  if (value === null) return undefined
  const report = value as Record<string, unknown>
  const { readme, state, commands, output, message } = report
  if (report.schemaVersion !== 1 || typeof readme !== "string") return undefined
  if (MESSAGE_STATES.has(state)) {
    return typeof message === "string" ? { state: "stopped", message } : undefined
  }
  if (!Array.isArray(commands) || !commands.every(isCommandResult)) return undefined
  if (state === "passed") return { state, readme, count: commands.length }
  const failed = commands.at(-1)
  return state === "failed" && failed !== undefined && typeof output === "string"
    ? { state, readme, count: commands.length, failed, output }
    : undefined
}

/**
 * @param command - the command that failed.
 * @param timeoutMs - the time budget.
 * @returns how it ended, as a clause.
 */
function howItEnded(command: CommandResult, timeoutMs: number): string {
  return command.timedOut
    ? `it was stopped when the ${String(timeoutMs)} ms budget ran out`
    : `it exited ${String(command.exitCode)}`
}

/**
 * Runs the README's marked quick start, one line at a time, against the tarball npm would publish.
 * The commands run in an empty project: a directory holding only a package.json. The command that
 * installs this package installs the packed tarball instead. Fails when any command exits non-zero or the time
 * budget runs out, and when the README has no marked block. Mark the block by putting
 * `<!-- quick-start:begin -->` on the line before its fenced `sh` block and
 * `<!-- quick-start:end -->` on the line after it.
 *
 * Runs `repo-contract quick-start`, so the package must be built first, and the commands reach
 * whatever network they reach (an install usually reaches the registry).
 * @param options - configuration for this check; see {@link QuickStartOptions}.
 * @returns the configured check.
 * @throws {TypeError} when `options` is not an object.
 * @beta
 */
export function quickStart(options: QuickStartOptions = {}): CheckDefinitionConfig {
  checkOptionsObject("quickStart", options)
  const { readme = "README.md", timeoutMs = 300_000 } = options

  return {
    run: [
      "repo-contract",
      "quick-start",
      "--json",
      "--readme",
      readme,
      "--timeout",
      String(timeoutMs),
    ],
    output: { format: "json" },
    timeoutMs: timeoutMs + PACK_ALLOWANCE_MS,
    policy: ({ result }): PolicyResult => {
      const missing = checkDependencyInstalled(result, "repo-contract")
      if (missing) return missing

      const terminated = checkTerminatedAbnormally(result, "The quick-start command")
      if (terminated) return terminated

      if (!result.output?.success) {
        return {
          outcome: "fail",
          rationale: `The quick-start command's output could not be parsed as JSON.\n${result.stderr.trim()}`,
        }
      }
      const report = readReport(result.output.value)
      if (report === undefined) {
        return { outcome: "fail", rationale: "The quick-start command produced an invalid report." }
      }
      if (report.state === "stopped") return { outcome: "fail", rationale: report.message }
      if (report.state === "passed") {
        return {
          outcome: "pass",
          rationale: `${report.readme}'s quick start ran ${String(report.count)} command(s) against the packed tarball in an empty project.`,
        }
      }
      const output = report.output === "" ? "(none)" : report.output
      return {
        outcome: "fail",
        rationale: [
          `${report.readme}'s quick start failed at command ${String(report.count)}, \`${report.failed.command}\`: ${howItEnded(report.failed, timeoutMs)}. Its last output:`,
          ...output.split("\n").map((line) => `  ${line}`),
        ].join("\n"),
      }
    },
  }
}
