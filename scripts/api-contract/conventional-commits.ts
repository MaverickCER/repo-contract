/**
 * Derives the SemVer bump a set of Conventional Commit messages declares. This must agree with
 * release-please's own bump logic (it is the tool that actually applies the version) -- ADR 0008
 * makes that a stated invariant and `test/unit/api-contract/conventional-commits.test.ts` pins it
 * against the Conventional Commits spec's own worked examples. Hand-rolled rather than pulling in
 * `conventional-commits-parser`, for the same reason `semver.ts` is hand-rolled: the surface used
 * here is tiny and fully specified.
 */

import type { RequiredReleaseLevel } from "./evidence-types.js"
import { maxLevel } from "./levels.js"

// A footer note token, at the very start of a line (per the spec).
const BREAKING_FOOTER = /^BREAKING[ -]CHANGE(?:!)?:\s/

/**
 * Parses a Conventional Commits 1.0.0 header line (`type(scope)!: subject`, `type!: subject`, or
 * `type: subject`). commitlint's config-conventional enforces a lowercase type, so a
 * non-conforming header returns `undefined` and is treated as declaring nothing (fail-safe: the
 * gate then asks the author to fix the commit, which commitlint also flags). Hand-parsed rather
 * than one regex so no sub-pattern nests a quantifier inside another (`security/detect-unsafe-regex`).
 * @param line - the first line of a commit message.
 * @returns the header's `type` and whether it declares a breaking change, or `undefined`.
 */
function parseHeader(
  line: string,
): { readonly type: string; readonly breaking: boolean } | undefined {
  let end = 0
  while (end < line.length) {
    const code = line.charCodeAt(end)
    if (code < 97 || code > 122) break // outside 'a'..'z'
    end += 1
  }
  if (end === 0) return undefined
  const type = line.slice(0, end)

  let rest = line.slice(end)
  if (rest.startsWith("(")) {
    const close = rest.indexOf(")")
    if (close === -1) return undefined
    const scope = rest.slice(1, close)
    if (scope.includes("\r") || scope.includes("\n")) return undefined
    rest = rest.slice(close + 1)
  }

  const breaking = rest.startsWith("!")
  if (breaking) rest = rest.slice(1)

  // ":" followed by one whitespace character.
  if (!rest.startsWith(":") || !/\s/.test(rest.charAt(1))) return undefined

  return { type, breaking }
}

/**
 * The SemVer bump one full commit message declares:
 * - `!` in the header, or a `BREAKING CHANGE:` / `BREAKING-CHANGE:` footer on any line → `"major"`
 * - header type `feat` → `"minor"`
 * - header type `fix` / `perf` → `"patch"`
 * - anything else (`chore`, `docs`, `refactor`, `test`, `ci`, `build`, `style`, `revert`, or a
 *   header that doesn't conform) → `"none"`
 * @param message - the full, multi-line commit message.
 * @returns the declared release level.
 */
export function parseCommitLevel(message: string): RequiredReleaseLevel {
  const lines = message.split(/\r?\n/)
  const header = parseHeader(lines[0] ?? "")
  const hasBreakingFooter = lines.slice(1).some((line) => BREAKING_FOOTER.test(line))

  if (header?.breaking === true || hasBreakingFooter) return "major"
  if (!header) return "none"

  if (header.type === "feat") return "minor"
  if (header.type === "fix" || header.type === "perf") return "patch"
  return "none"
}

/**
 * The largest bump declared across a set of commit messages.
 * @param messages - full commit messages (a CI-supplied PR title can be one of them).
 * @returns the max declared level, or `"none"` if nothing releasable was declared.
 */
export function declaredLevelFromCommits(messages: readonly string[]): RequiredReleaseLevel {
  let level: RequiredReleaseLevel = "none"
  for (const message of messages) {
    level = maxLevel(level, parseCommitLevel(message)) ?? "none"
  }
  return level
}
