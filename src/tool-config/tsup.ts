/**
 * A tsup config built from package.json `exports`: one entry per code subpath.
 * @packageDocumentation
 */
import { entries } from "./entries.js"
import type { ToolConfigOptions } from "./types.js"

/** Options for {@link tsupConfig}. */
export interface TsupConfigOptions extends ToolConfigOptions {
  /** Defaults to `["esm", "cjs"]`. */
  readonly format?: readonly ("esm" | "cjs")[]
  /** Defaults to `"node"`. */
  readonly platform?: "node" | "neutral" | "browser"
  /** Defaults to `"node22"`. */
  readonly target?: string
}

/**
 * The tsup settings the helper sets. Spread it into `defineConfig`. Arrays are mutable copies
 * because tsup's `Options` type takes mutable arrays.
 */
export interface TsupConfigFragment {
  /** Built file name to source file, from {@link entries}. */
  readonly entry: Record<string, string>
  readonly format: ("esm" | "cjs")[]
  readonly platform: "node" | "neutral" | "browser"
  readonly target: string
  readonly sourcemap: boolean
  readonly treeshake: boolean
}

/**
 * The defaults are what repo-contract, env-cap and data-cap build with today. Declarations are
 * left to the caller: all three emit them with `tsc`, so the fragment sets no `dts`.
 * @param options - the manifest and overrides.
 * @returns the tsup settings.
 * @throws {RangeError} when `format` is empty.
 * @beta
 */
export function tsupConfig(options: TsupConfigOptions): TsupConfigFragment {
  const { format = ["esm", "cjs"], platform = "node", target = "node22" } = options
  if (format.length === 0) {
    throw new RangeError("format needs at least one of esm and cjs")
  }
  return {
    entry: Object.fromEntries(
      entries(options.manifest, options).map((entry) => [entry.name, entry.source]),
    ),
    format: [...format],
    platform,
    target,
    sourcemap: true,
    treeshake: true,
  }
}
