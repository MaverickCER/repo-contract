import { DEFAULT_EXCLUDE } from "./types.js"

/**
 * @param globs - globs a caller means to leave out.
 * @throws {TypeError} on a blank glob, or one that starts with `!`: negating it again would
 * put the files back in.
 */
function assertPlainGlobs(globs: readonly string[]): void {
  for (const glob of globs) {
    if (glob.trim() === "") {
      throw new TypeError("exclude takes plain globs; got a blank one")
    }
    if (glob.startsWith("!")) {
      throw new TypeError(`exclude takes plain globs; drop the leading "!" from "${glob}"`)
    }
  }
}

/**
 * The one exclude list every helper uses: the defaults plus the package's own, without
 * duplicates.
 * @param exclude - the package's own globs.
 * @returns the merged list, a new array on every call.
 * @throws {TypeError} on a blank glob or one that starts with `!`.
 */
export function excludeGlobs(exclude: readonly string[] = []): readonly string[] {
  assertPlainGlobs(exclude)
  return [...new Set([...DEFAULT_EXCLUDE, ...exclude])]
}

/**
 * @param globs - globs to leave out.
 * @returns each glob prefixed with `!`, for Stryker's `mutate` and knip's `project`.
 * @throws {TypeError} on a blank glob or one that already starts with `!`.
 */
export function negateGlobs(globs: readonly string[]): readonly string[] {
  assertPlainGlobs(globs)
  return globs.map((glob) => `!${glob}`)
}

/**
 * @param srcDir - the source directory, such as `"src"`, `"./lib/"` or `"lib"`.
 * @returns the directory without a leading `./` or trailing `/`.
 * @throws {TypeError} when nothing is left: the source glob would then start at the file-system root.
 */
export function normalizeSrcDir(srcDir = "src"): string {
  const normalized = (srcDir.startsWith("./") ? srcDir.slice(2) : srcDir).replace(/\/+$/, "")
  if (normalized === "") {
    throw new TypeError(`srcDir must name a directory; got "${srcDir}"`)
  }
  return normalized
}

/**
 * @param srcDir - the source directory.
 * @returns the glob of every TypeScript source file under it.
 */
export function sourceGlob(srcDir?: string): string {
  return `${normalizeSrcDir(srcDir)}/**/*.{ts,tsx}`
}
