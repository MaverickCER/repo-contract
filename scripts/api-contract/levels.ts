/**
 * SemVer bump-magnitude arithmetic over `RequiredReleaseLevel`. Extracted from the deleted
 * `changeset-manager.ts` (its `LEVEL_RANK` / `maxLevel`) when versioning moved from Changesets
 * to Conventional Commits -- see specs/decisions/0009-conventional-commits-versioning-and-local-gates.md.
 */

import type { RequiredReleaseLevel } from "./evidence-types.js"

/** Ranks a release level by bump magnitude. `"none"` ranks below `"patch"`. */
const LEVEL_RANK: Record<RequiredReleaseLevel, number> = {
  none: 0,
  patch: 1,
  minor: 2,
  major: 3,
}

/**
 * The higher-magnitude of two release levels. `undefined` is treated as identity
 * (`maxLevel(x, undefined) === x`), so folding an empty list of levels yields `undefined`.
 * @param a - one level, or `undefined`.
 * @param b - the other level, or `undefined`.
 * @returns whichever ranks higher, or the one defined operand, or `undefined` if both are.
 */
export function maxLevel(
  a: RequiredReleaseLevel | undefined,
  b: RequiredReleaseLevel | undefined,
): RequiredReleaseLevel | undefined {
  if (a === undefined) return b
  if (b === undefined) return a
  return LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b
}

/**
 * Whether `declared` is at least as large a bump as `required` -- the api-contract gate's
 * core comparison. Anything satisfies a `"none"` requirement; `"none"` satisfies only `"none"`.
 * @param declared - the level the branch's commits (and PR title) declare.
 * @param required - the minimum level the public-API diff requires.
 * @returns `true` iff `declared` ranks at least as high as `required`.
 */
export function rankAtLeast(
  declared: RequiredReleaseLevel,
  required: RequiredReleaseLevel,
): boolean {
  return LEVEL_RANK[declared] >= LEVEL_RANK[required]
}
