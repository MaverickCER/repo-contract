/**
 * A TypeDoc config built from package.json `exports`: one entry point per code subpath.
 * @packageDocumentation
 */
import { entries } from "./entries.js"
import { excludeGlobs } from "./exclude.js"
import type { ToolConfigOptions } from "./types.js"

/** The TypeDoc settings the helper sets. Arrays are mutable copies, as TypeDoc's options type takes. */
export interface TypedocConfigFragment {
  readonly entryPoints: string[]
  readonly exclude: string[]
}

/**
 * @param options - the manifest and overrides.
 * @returns the TypeDoc settings.
 * @beta
 */
export function typedocConfig(options: ToolConfigOptions): TypedocConfigFragment {
  return {
    entryPoints: entries(options.manifest, options).map((entry) => entry.source),
    exclude: [...excludeGlobs(options.exclude)],
  }
}
