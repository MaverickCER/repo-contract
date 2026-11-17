/**
 * A Stryker config that mutates the source directory minus the exclude list, with the settings the
 * `mutation` preset expects. Incremental mode is off: the preset judges full, cold runs.
 * @packageDocumentation
 */
import { excludeGlobs, negateGlobs, sourceGlob } from "./exclude.js"
import type { ToolConfigOptions } from "./types.js"

/** Options for {@link strykerConfig}. */
export interface StrykerConfigOptions extends Pick<ToolConfigOptions, "srcDir" | "exclude"> {
  /** Defaults to `4`. */
  readonly concurrency?: number
  /** Per-mutant timeout, in milliseconds. Defaults to `20000`. */
  readonly timeoutMS?: number
}

/**
 * The Stryker settings the helper sets. Export it as the config's default. Arrays are mutable
 * copies, as Stryker's options type takes.
 */
export interface StrykerConfigFragment {
  readonly testRunner: "vitest"
  readonly coverageAnalysis: "perTest"
  readonly ignoreStatic: boolean
  readonly incremental: false
  readonly mutate: string[]
  readonly reporters: string[]
  readonly jsonReporter: { readonly fileName: string }
  readonly tempDirName: string
  readonly concurrency: number
  readonly timeoutMS: number
  /** `10`. The first, unmutated run reruns the suite with per-test coverage, and Stryker's 5-minute default aborts it on a loaded machine. */
  readonly dryRunTimeoutMinutes: number
}

/**
 * @param name - the option's name, for the message.
 * @param value - the value to check.
 * @returns the value.
 * @throws {RangeError} unless it is a positive whole number.
 */
function positiveWholeNumber(name: string, value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive whole number; got ${String(value)}`)
  }
  return value
}

/**
 * The run settings are the ones repo-contract, env-cap and data-cap share today. `ignoreStatic`
 * is on because a static mutant reruns the whole suite under per-test coverage.
 * @param options - the source directory, exclude list and run limits.
 * @returns the Stryker settings.
 * @throws {RangeError} when `concurrency` or `timeoutMS` is not a positive whole number.
 * @beta
 */
export function strykerConfig(options: StrykerConfigOptions = {}): StrykerConfigFragment {
  return {
    testRunner: "vitest",
    coverageAnalysis: "perTest",
    ignoreStatic: true,
    incremental: false,
    mutate: [sourceGlob(options.srcDir), ...negateGlobs(excludeGlobs(options.exclude))],
    reporters: ["json", "progress", "clear-text"],
    jsonReporter: { fileName: "reports/mutation/mutation.json" },
    tempDirName: ".stryker-tmp",
    concurrency: positiveWholeNumber("concurrency", options.concurrency ?? 4),
    timeoutMS: positiveWholeNumber("timeoutMS", options.timeoutMS ?? 20_000),
    dryRunTimeoutMinutes: 10,
  }
}
