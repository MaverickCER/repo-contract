/**
 * A knip config built from package.json `exports`: every code entry point is an entry, and the
 * exclude list leaves the same files out of `project`.
 * @packageDocumentation
 */
import { notImplemented } from "../not-implemented.js"
import type { ToolConfigOptions } from "./types.js"

/** Options for {@link knipConfig}. */
export interface KnipConfigOptions extends ToolConfigOptions {
  /** More entry files, such as scripts and bins. */
  readonly extraEntries?: readonly string[]
}

/** The knip settings the helper sets. */
export interface KnipConfigFragment {
  readonly entry: readonly string[]
  readonly project: readonly string[]
}

/**
 * @param options - the manifest and overrides.
 * @returns the knip settings.
 * @beta
 */
export function knipConfig(options: KnipConfigOptions): KnipConfigFragment {
  return notImplemented("R3", options)
}
