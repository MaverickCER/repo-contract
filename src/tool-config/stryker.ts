/**
 * A Stryker config that mutates the source directory minus the exclude list, with the settings the
 * `mutation` preset expects. Incremental mode is off: the preset judges full, cold runs.
 * @packageDocumentation
 */
import { notImplemented } from "../not-implemented.js"
import type { ToolConfigOptions } from "./types.js"

/** Options for {@link strykerConfig}. */
export interface StrykerConfigOptions extends Omit<ToolConfigOptions, "manifest"> {
  /** Defaults to `4`. */
  readonly concurrency?: number
  /** Per-mutant timeout, in milliseconds. Defaults to `20000`. */
  readonly timeoutMS?: number
}

/** The Stryker settings the helper sets. Export it as the config's default. */
export interface StrykerConfigFragment {
  readonly testRunner: "vitest"
  readonly coverageAnalysis: "perTest"
  readonly ignoreStatic: boolean
  readonly incremental: false
  readonly mutate: readonly string[]
  readonly reporters: readonly string[]
  readonly jsonReporter: { readonly fileName: string }
  readonly tempDirName: string
  readonly concurrency: number
  readonly timeoutMS: number
}

/**
 * @param options - the source directory, exclude list and run limits.
 * @returns the Stryker settings.
 * @beta
 */
export function strykerConfig(options: StrykerConfigOptions = {}): StrykerConfigFragment {
  return notImplemented("R3", options)
}
