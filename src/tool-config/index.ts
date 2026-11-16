/**
 * Shared inputs for the tool config helpers: the entry points from package.json `exports`, and
 * one exclude list. Each tool has its own subpath: `repo-contract/config/tsup`, `/typedoc`,
 * `/knip`, `/vitest` and `/stryker`. Each returns a plain object to spread into the tool's config,
 * and imports nothing from the tool itself.
 *
 * Experimental. Published under its `./config` subpath.
 * @packageDocumentation
 */
export { entries } from "./entries.js"
export type { EntriesOptions } from "./entries.js"
export { excludeGlobs, negateGlobs } from "./exclude.js"
export { DEFAULT_EXCLUDE } from "./types.js"
export type { EntryPoint, PackageManifest, ToolConfigOptions } from "./types.js"
