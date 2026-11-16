/**
 * A Vitest config whose coverage writes what the `coverage` and `crap` presets read, over the
 * source directory minus the exclude list.
 * @packageDocumentation
 */
import { notImplemented } from "../not-implemented.js"
import type { ToolConfigOptions } from "./types.js"

/** Options for {@link vitestConfig}. */
export interface VitestConfigOptions extends Omit<ToolConfigOptions, "manifest"> {
  /** Test file globs. Defaults to `["test/**\/*.test.ts"]`. */
  readonly include?: readonly string[]
}

/** The Vitest settings the helper sets. Pass it to `defineConfig` or `mergeConfig`. */
export interface VitestConfigFragment {
  readonly test: {
    readonly include: readonly string[]
    readonly coverage: {
      readonly provider: "v8"
      /** Includes `json-summary` and `json`, which the presets read. */
      readonly reporter: readonly string[]
      readonly reportOnFailure: boolean
      readonly include: readonly string[]
      readonly exclude: readonly string[]
    }
  }
}

/**
 * @param options - the source directory, test globs and exclude list.
 * @returns the Vitest settings.
 * @beta
 */
export function vitestConfig(options: VitestConfigOptions = {}): VitestConfigFragment {
  return notImplemented("R3", options)
}
