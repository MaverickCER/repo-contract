import type { PolicyResult } from "../../types.js"
import { shownValue } from "./option-checks.js"

/** What `repo-contract npm-script --json` prints. */
export interface NpmScriptReport {
  readonly schemaVersion: 1
  readonly script: string
  /** `missing` when package.json has no such script; the script did not run. */
  readonly state: "ran" | "missing"
  readonly exitCode: number | null
  readonly timedOut: boolean
  /** `mustNotChange` paths whose content the script changed. */
  readonly changed: readonly string[]
  /** The last lines the script printed. */
  readonly output: string
}

/**
 * @param value - the parsed output of `repo-contract npm-script --json`.
 * @returns the report, or `undefined` when it is not one this version reads.
 */
function readReport(value: unknown): NpmScriptReport | undefined {
  // Each field test below rejects a string or a number, so only null and undefined need the `?.`.
  const report = value as Record<string, unknown> | null | undefined
  const wellFormed =
    report?.schemaVersion === 1 &&
    typeof report.script === "string" &&
    (report.state === "ran" || report.state === "missing") &&
    (typeof report.exitCode === "number" || report.exitCode === null) &&
    typeof report.timedOut === "boolean" &&
    Array.isArray(report.changed) &&
    report.changed.every((entry) => typeof entry === "string") &&
    typeof report.output === "string"
  return wellFormed ? (value as NpmScriptReport) : undefined
}

/**
 * @param output - the script's last lines.
 * @returns them indented under a lead-in, or a note that there were none.
 */
function printed(output: string): string {
  return output === ""
    ? " It printed nothing."
    : ` Its last output:\n${output
        .split("\n")
        .map((line) => `  ${line}`)
        .join("\n")}`
}

/**
 * Judges one `repo-contract npm-script` report. A missing script passes as not applicable or
 * fails, as `whenMissing` says. A script that ran fails on a non-zero exit, a timeout, or a
 * change to a `mustNotChange` path; the exit is reported first, because a failed run's changes
 * are its partial output.
 * @param value - the parsed output of `repo-contract npm-script --json`.
 * @param options - how to word and judge it.
 * @param options.label - the name rationales use.
 * @param options.whenMissing - what a missing script means; anything but `"fail"` skips it.
 * @returns the verdict.
 */
export function evaluateNpmScriptReport(
  value: unknown,
  options: { readonly label: string; readonly whenMissing?: "skip" | "fail" | undefined },
): PolicyResult {
  const { label, whenMissing } = options
  const report = readReport(value)
  if (report === undefined) {
    return {
      outcome: "fail",
      rationale: `${label}: \`repo-contract npm-script\` printed a report this version cannot read.`,
    }
  }
  const { script } = report
  const command = `\`npm run ${script}\``

  if (report.state === "missing") {
    return whenMissing === "fail"
      ? {
          outcome: "fail",
          rationale: `${label}: package.json has no \`${script}\` script. Add one so this check can run.`,
        }
      : {
          outcome: "pass",
          rationale: `${label}: package.json has no \`${script}\` script, so this check does not apply.`,
        }
  }
  if (report.timedOut) {
    return {
      outcome: "fail",
      rationale: `${label}: ${command} was stopped when its time budget ran out.${printed(report.output)}`,
    }
  }
  if (report.exitCode === null) {
    return {
      outcome: "fail",
      rationale: `${label}: ${command} did not start or was killed by a signal.${printed(report.output)}`,
    }
  }
  if (report.exitCode !== 0) {
    return {
      outcome: "fail",
      rationale: `${label}: ${command} exited ${String(report.exitCode)}.${printed(report.output)}`,
    }
  }
  if (report.changed.length > 0) {
    return {
      outcome: "fail",
      rationale: [
        `${label}: ${command} changed ${String(report.changed.length)} file(s) it must leave as committed, so the committed copy is stale. Run ${command} and commit the result:`,
        ...report.changed.map((file) => `- ${file}`),
      ].join("\n"),
    }
  }
  return {
    outcome: "pass",
    rationale: `${label}: ${command} exited 0 and changed no watched path.`,
  }
}

/**
 * Whether `value` would reach `repo-contract npm-script` as a usable argument. The command reads a
 * value starting with `-` as an option, so `--x` would fail every run with a usage error.
 * @param value - a script name or a watched path.
 * @returns `true` for a non-empty string that does not start with `-`.
 */
function isArgument(value: unknown): value is string {
  return typeof value === "string" && value !== "" && !value.startsWith("-")
}

/**
 * Checks the `mustNotChange` option. Each entry becomes one `--must-not-change` argument.
 * @param mustNotChange - the option's value; `undefined` means it was left out.
 * @throws {RangeError} when it is given and is not a list of non-empty paths that do not start
 * with `-`.
 */
function checkMustNotChange(mustNotChange: unknown): void {
  if (mustNotChange === undefined) return
  if (!Array.isArray(mustNotChange)) {
    throw new RangeError(
      `npmScript: mustNotChange must be a list of paths, got ${shownValue(mustNotChange)}.`,
    )
  }
  for (const watched of mustNotChange as readonly unknown[]) {
    if (!isArgument(watched)) {
      throw new RangeError(
        `npmScript: each mustNotChange entry must be a non-empty path not starting with "-", got ${shownValue(watched)}.`,
      )
    }
  }
}

/**
 * Checks the script name, watched paths and time budget when the config loads, so a typo fails
 * before npm runs.
 * @param options - the `npmScript` options.
 * @param options.script - the npm script to run.
 * @param options.mustNotChange - the paths the script must leave as they were, if set.
 * @param options.timeoutMs - the time the script may take, if set.
 * @throws {RangeError} when `script` is blank or starts with `-`, `mustNotChange` is not a list of
 * non-empty paths that do not start with `-`, or `timeoutMs` is not a whole number above 0.
 */
export function checkNpmScriptOptions(options: {
  readonly script: string
  readonly mustNotChange?: readonly string[] | undefined
  readonly timeoutMs?: number | undefined
}): void {
  const { script, mustNotChange, timeoutMs } = options
  if (typeof script !== "string" || script.trim() === "") {
    throw new RangeError(`npmScript: script must name an npm script, got ${shownValue(script)}.`)
  }
  if (!isArgument(script)) {
    throw new RangeError(
      `npmScript: script must not start with "-", which the command reads as an option, got ${shownValue(script)}.`,
    )
  }
  checkMustNotChange(mustNotChange)
  // `repo-contract npm-script --timeout` takes digits only, so 1.5 or 1e21 would fail every run.
  if (timeoutMs !== undefined && !(Number.isSafeInteger(timeoutMs) && timeoutMs > 0)) {
    throw new RangeError(
      `npmScript: timeoutMs must be a whole number of milliseconds above 0, got ${shownValue(timeoutMs)}.`,
    )
  }
}
