import { notImplemented } from "../not-implemented.js"
import type { EntryPoint, PackageManifest } from "./types.js"

/** Options for {@link entries}. */
export interface EntriesOptions {
  /** The source file per `exports` subpath, where the convention does not hold. */
  readonly sources?: Readonly<Record<string, string>>
  /** The source directory. Defaults to `"src"`. */
  readonly srcDir?: string
  /** Whether a file exists. Defaults to `node:fs`'s `existsSync`; tests pass their own. */
  readonly exists?: (path: string) => boolean
}

/**
 * Lists the package's code entry points from `exports`. The source of `"."` is
 * `<srcDir>/index.ts`; of `"./x"`, `<srcDir>/x/index.ts`, else `<srcDir>/x.ts`. `sources` wins
 * over the convention. A subpath with no JavaScript target, such as a JSON schema or
 * `./package.json`, is skipped.
 * @param manifest - the parsed package.json.
 * @param options - overrides and the file-system probe.
 * @returns the entry points in `exports` order.
 */
export function entries(
  manifest: PackageManifest,
  options: EntriesOptions = {},
): readonly EntryPoint[] {
  return notImplemented("R3", manifest, options)
}
