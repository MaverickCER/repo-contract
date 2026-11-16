import { notImplemented } from "../not-implemented.js"
import { DEFAULT_EXCLUDE } from "./types.js"

/**
 * The one exclude list every helper uses: the defaults plus the package's own, without
 * duplicates.
 * @param exclude - the package's own globs.
 * @returns the merged list.
 */
export function excludeGlobs(exclude: readonly string[] = []): readonly string[] {
  return notImplemented("R3", exclude, DEFAULT_EXCLUDE)
}

/**
 * @param globs - globs to leave out.
 * @returns each glob prefixed with `!`, for Stryker's `mutate` and knip's `project`.
 */
export function negateGlobs(globs: readonly string[]): readonly string[] {
  return notImplemented("R3", globs)
}
