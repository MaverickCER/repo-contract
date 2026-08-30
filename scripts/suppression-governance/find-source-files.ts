import { readdir } from "node:fs/promises"
import path from "node:path"

/**
 * Directories this check never walks into, regardless of depth -- build output, tool scratch
 * space, VCS internals, and non-source data. This is suppression-governance's own explicit
 * decision, not inherited from eslint.config.js/.gitignore/.jscpd.json -- each of those excludes
 * things for its own, differently-scoped reason, and treating their union as "the" source
 * universe would be an implicit, undocumented dependency on three unrelated tools staying in
 * sync. See specs/decisions/0006-suppression-governance.md.
 */
export const EXCLUDED_DIRECTORY_NAMES: ReadonlySet<string> = new Set([
  "node_modules", // third-party code, never this repository's own source
  "dist", // build output, not hand-written source
  "coverage", // generated coverage reports
  "reports", // generated tool reports (jscpd, secretlint, mutation, ...)
  // Stryker's own scratch copy of the whole tree -- scanning it would double-count every
  // suppression once per active mutation-testing sandbox.
  ".stryker-tmp",
  ".git", // VCS internals
  ".repo-contract", // generated api-contract snapshots
  ".changeset", // changeset metadata, not source
])

/**
 * Any directory literally named "fixtures", at any depth, is excluded -- a semantic decision this
 * check makes for itself: every fixtures directory in this repository (test/e2e/*\/fixtures,
 * test/unit/architecture/fixtures) holds deliberately-invalid or scratch content fed to *other*
 * tests, never real governed source.
 */
export const EXCLUDED_DIRECTORY_LEAF_NAMES: ReadonlySet<string> = new Set(["fixtures"])

export const INCLUDED_EXTENSIONS: readonly string[] = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
]

/**
 * Whether a directory named `name` is excluded from walking, by either exclusion rule above --
 * case-insensitively, for the same reason `hasIncludedExtension` below lowercases first: a case-
 * preserving filesystem (default macOS/Windows) or a CI step with different casing conventions can
 * produce a differently-cased directory name (`Dist`, `Node_Modules`), and this must still
 * recognize it as excluded or this walker would descend into and scan generated/vendor content it
 * explicitly intends to skip.
 * @param name - The directory's own basename (not a path).
 * @returns `true` if this directory should never be walked into.
 */
function isExcludedDirectory(name: string): boolean {
  const lowerName = name.toLowerCase()
  return EXCLUDED_DIRECTORY_NAMES.has(lowerName) || EXCLUDED_DIRECTORY_LEAF_NAMES.has(lowerName)
}

/**
 * Whether a file named `name` has one of INCLUDED_EXTENSIONS, case-insensitively -- a file system
 * (or a file authored on one) can produce an uppercase or mixed-case extension (`Legacy.TSX`), and
 * tsc/ESLint process those identically to a lowercase one, so this must too or a real suppression
 * comment inside that file would go silently ungoverned.
 * @param name - The file's own basename (not a path).
 * @returns `true` if this file is governed source.
 */
function hasIncludedExtension(name: string): boolean {
  const lowerName = name.toLowerCase()
  return INCLUDED_EXTENSIONS.some((extension) => lowerName.endsWith(extension))
}

/**
 * Converts any backslash-separated path segment to forward slashes -- using the fixed `win32`/
 * `posix` namespaces (not the ambient, host-bound `path.sep`) so this is a pure string transform,
 * testable identically on every host OS rather than only observable on an actual Windows machine.
 * A no-op for a path that's already POSIX-style, since real POSIX filesystems never produce a
 * backslash separator.
 * @param relativePath - A path, possibly using either separator convention.
 * @returns The same path with every separator normalized to `/`.
 */
export function toPosixPath(relativePath: string): string {
  return relativePath.split(path.win32.sep).join(path.posix.sep)
}

/**
 * `path.relative`, then normalized to POSIX separators.
 * @param root - The absolute directory `absolutePath` is made relative to.
 * @param absolutePath - The absolute path to make repo-relative.
 * @returns `absolutePath`, relative to `root`, POSIX-separated.
 */
function toPosixRelative(root: string, absolutePath: string): string {
  return toPosixPath(path.relative(root, absolutePath))
}

/**
 * Recursively walks `dir`, appending every governed source file's repo-relative POSIX path to `out`.
 * @param root - The absolute repository root, used to compute each result's relative path.
 * @param dir - The absolute directory currently being walked.
 * @param out - Accumulates every governed file path found, across the whole recursive walk.
 */
async function walk(root: string, dir: string, out: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    // Never followed -- the only way a walked path could otherwise escape `root` (see
    // registry.ts's independent, defense-in-depth rejection of any `..`/absolute registry path).
    if (entry.isSymbolicLink()) continue

    const absolutePath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      if (isExcludedDirectory(entry.name)) continue
      await walk(root, absolutePath, out)
      continue
    }

    if (entry.isFile() && hasIncludedExtension(entry.name)) {
      out.push(toPosixRelative(root, absolutePath))
    }
  }
}

/**
 * Every source file under `root` this check considers governed, as repo-relative POSIX paths,
 * sorted. See EXCLUDED_DIRECTORY_NAMES/EXCLUDED_DIRECTORY_LEAF_NAMES/INCLUDED_EXTENSIONS above for
 * exactly what "governed" means here.
 * @param root - Absolute path to the repository root to walk.
 * @returns Repo-relative POSIX file paths, sorted.
 */
export async function listSourceFiles(root: string): Promise<string[]> {
  const out: string[] = []
  await walk(root, root, out)
  return out.sort()
}
