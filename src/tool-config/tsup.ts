/**
 * A tsup config built from package.json `exports`: one entry per code subpath.
 * @packageDocumentation
 */
import { notImplemented } from "../not-implemented.js"
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

/** The tsup settings the helper sets. Spread it into `defineConfig`. */
export interface TsupConfigFragment {
  /** Built file name to source file, from {@link entries}. */
  readonly entry: Readonly<Record<string, string>>
  readonly format: readonly ("esm" | "cjs")[]
  readonly platform: "node" | "neutral" | "browser"
  readonly target: string
  readonly sourcemap: boolean
  readonly treeshake: boolean
}

/**
 * @param options - the manifest and overrides.
 * @returns the tsup settings.
 * @beta
 */
export function tsupConfig(options: TsupConfigOptions): TsupConfigFragment {
  return notImplemented("R3", options)
}
