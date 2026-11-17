/**
 * A knip config built from package.json `exports`: every code entry point is an entry, and the
 * exclude list leaves the same files out of `project`.
 * @packageDocumentation
 */
import { entries } from "./entries.js"
import { excludeGlobs, negateGlobs, sourceGlob } from "./exclude.js"
import type { ToolConfigOptions } from "./types.js"

/** Options for {@link knipConfig}. */
export interface KnipConfigOptions extends ToolConfigOptions {
  /** More entry files, such as scripts and bins. */
  readonly extraEntries?: readonly string[]
}

/** The knip settings the helper sets. Arrays are mutable copies, as knip's configuration type takes. */
export interface KnipConfigFragment {
  readonly entry: string[]
  readonly project: string[]
}

/**
 * @param options - the manifest and overrides.
 * @returns the knip settings, with each entry listed once.
 * @beta
 */
export function knipConfig(options: KnipConfigOptions): KnipConfigFragment {
  const sources = entries(options.manifest, options).map((entry) => entry.source)
  return {
    entry: [...new Set([...sources, ...(options.extraEntries ?? [])])],
    project: [sourceGlob(options.srcDir), ...negateGlobs(excludeGlobs(options.exclude))],
  }
}
