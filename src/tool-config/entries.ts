import { existsSync } from "node:fs"
import { normalizeSrcDir } from "./exclude.js"
import type { EntryPoint, PackageManifest } from "./types.js"

/** Options for {@link entries}. */
export interface EntriesOptions {
  /** The source file per `exports` subpath, where the convention does not hold. */
  readonly sources?: Readonly<Record<string, string>>
  /** The source directory. Defaults to `"src"`. */
  readonly srcDir?: string
  /** Whether a file exists, relative to the working directory. Defaults to `node:fs`'s `existsSync`; tests pass their own. */
  readonly exists?: (path: string) => boolean
}

const JAVASCRIPT_FILE = /\.[cm]?jsx?$/

/** How deeply conditions and fallback arrays may nest under one subpath. */
const MAX_TARGET_DEPTH = 32

/**
 * Finds the JavaScript file a target resolves to, walking conditions and fallback arrays in
 * order. A `types` condition points at a declaration file, which never matches, so it needs no
 * special case.
 * @param target - one `exports` value: a path, a conditions object, a fallback array or `null`.
 * @param depth - how many objects or arrays enclose `target`.
 * @returns the first JavaScript path, or `undefined` for a JSON, CSS, declaration-only or blocked target.
 * @throws {Error} when the target nests deeper than {@link MAX_TARGET_DEPTH}.
 */
function javascriptTarget(target: unknown, depth = 0): string | undefined {
  // Bounds the walk, so a target that never bottoms out fails fast instead of recursing forever.
  if (depth > MAX_TARGET_DEPTH) {
    throw new Error(
      `package.json exports nests conditions deeper than ${String(MAX_TARGET_DEPTH)} levels`,
    )
  }
  if (typeof target === "string") {
    return JAVASCRIPT_FILE.test(target) ? target : undefined
  }
  // A number or boolean has no values; `null`, a blocked subpath, becomes an empty object.
  for (const candidate of Object.values(target ?? {})) {
    const found = javascriptTarget(candidate, depth + 1)
    if (found !== undefined) return found
  }
  return undefined
}

/**
 * Node reads an `exports` object whose keys all start with `.` as a subpath map, and one with no
 * such key as the conditions of `"."`. It rejects a mix, and so does this.
 * @param manifest - the parsed package.json.
 * @returns each subpath with its raw target. Without `exports`, `main` (else `module`) stands in for `"."`.
 * @throws {Error} when `exports` mixes subpaths and conditions.
 */
function subpathTargets(manifest: PackageManifest): readonly (readonly [string, unknown])[] {
  const { exports } = manifest
  if (exports === undefined || exports === null) {
    // With neither, the target is `undefined`, which names no JavaScript file and is skipped.
    return [[".", manifest.main ?? manifest.module]]
  }
  // A string or an array has no key that starts with ".", so it lands with the conditions.
  const keyed = Object.entries(exports)
  const subpaths = keyed.filter(([key]) => key.startsWith("."))
  if (subpaths.length === 0) return [[".", exports]]
  if (subpaths.length !== keyed.length) {
    throw new Error("package.json exports mixes subpaths and conditions; Node rejects it too")
  }
  return keyed
}

/**
 * @param target - the built file, such as `"./dist/config/tsup.js"` or `"dist/index.js"`.
 * @returns its path under the build directory without extension, such as `"config/tsup"`.
 */
function builtName(target: string): string {
  const segments = target.split("/").filter((segment) => segment !== ".")
  const underBuildDirectory = segments.length > 1 ? segments.slice(1) : segments
  return underBuildDirectory.join("/").replace(JAVASCRIPT_FILE, "")
}

/**
 * @param subpath - the `exports` key.
 * @param srcDir - the normalized source directory.
 * @param exists - the file-system probe.
 * @returns the conventional source file for the subpath.
 */
function conventionalSource(
  subpath: string,
  srcDir: string,
  exists: (path: string) => boolean,
): string {
  if (subpath === ".") return `${srcDir}/index.ts`
  // Node requires every subpath other than "." to start with "./".
  const rest = subpath.slice(2)
  const directoryIndex = `${srcDir}/${rest}/index.ts`
  return exists(directoryIndex) ? directoryIndex : `${srcDir}/${rest}.ts`
}

/**
 * Lists the package's code entry points from `exports`. The source of `"."` is
 * `<srcDir>/index.ts`; of `"./x"`, `<srcDir>/x/index.ts`, else `<srcDir>/x.ts`. `sources` wins
 * over the convention. A subpath with no JavaScript target, such as a JSON schema or
 * `./package.json`, is skipped. Without `exports`, `main` (else `module`) gives `"."` alone.
 * @param manifest - the parsed package.json.
 * @param options - overrides and the file-system probe.
 * @returns the entry points in `exports` order.
 * @throws {Error} when `sources` names a subpath with no code entry, when a wildcard subpath has
 * a JavaScript target (one entry cannot stand for many files), or when two subpaths build one file.
 */
export function entries(
  manifest: PackageManifest,
  options: EntriesOptions = {},
): readonly EntryPoint[] {
  const { sources = {}, exists = existsSync } = options
  const srcDir = normalizeSrcDir(options.srcDir)
  const found: EntryPoint[] = []
  const subpathByName = new Map<string, string>()

  for (const [subpath, target] of subpathTargets(manifest)) {
    const file = javascriptTarget(target)
    if (file === undefined) continue
    if (subpath.includes("*")) {
      throw new Error(
        `entries cannot expand the wildcard subpath "${subpath}"; list each file in package.json exports`,
      )
    }
    const name = builtName(file)
    const earlier = subpathByName.get(name)
    if (earlier !== undefined) {
      throw new Error(`"${subpath}" and "${earlier}" both build "${name}"; give each its own file`)
    }
    subpathByName.set(name, subpath)
    found.push({
      subpath,
      name,
      source: sources[subpath] ?? conventionalSource(subpath, srcDir, exists),
    })
  }

  const codeSubpaths = new Set(found.map((entry) => entry.subpath))
  for (const subpath of Object.keys(sources)) {
    if (!codeSubpaths.has(subpath)) {
      throw new Error(
        `sources names "${subpath}", which package.json exports does not list as a code entry`,
      )
    }
  }
  return found
}
