/**
 * A TypeDoc config built from package.json `exports`: one entry point per code subpath.
 * @packageDocumentation
 */
import { notImplemented } from "../not-implemented.js"
import type { ToolConfigOptions } from "./types.js"

/** The TypeDoc settings the helper sets. */
export interface TypedocConfigFragment {
  readonly entryPoints: readonly string[]
  readonly exclude: readonly string[]
}

/**
 * @param options - the manifest and overrides.
 * @returns the TypeDoc settings.
 * @beta
 */
export function typedocConfig(options: ToolConfigOptions): TypedocConfigFragment {
  return notImplemented("R3", options)
}
