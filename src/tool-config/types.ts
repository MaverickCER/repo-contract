/** The package.json fields the config helpers read. Pass the parsed file. */
export interface PackageManifest {
  readonly name?: string
  readonly exports?: unknown
  readonly main?: string
  readonly module?: string
  readonly types?: string
}

/** One code entry point, from one `exports` subpath. */
export interface EntryPoint {
  /** The `exports` key, such as `"."` or `"./helpers"`. */
  readonly subpath: string
  /** The built file's path under the build directory, without extension, such as `"index"` or `"config/tsup"`. */
  readonly name: string
  /** The source file that builds it, such as `"src/helpers/index.ts"`. */
  readonly source: string
}

/** What every config helper takes. */
export interface ToolConfigOptions {
  /** The parsed package.json. Its `exports` decide the entry points. */
  readonly manifest: PackageManifest
  /** The source file per `exports` subpath, where the convention does not hold, such as `{ ".": "src/runtime/index.ts" }`. */
  readonly sources?: Readonly<Record<string, string>>
  /** The source directory. Defaults to `"src"`. */
  readonly srcDir?: string
  /** Globs left out of the build's checks: mutation targets, coverage and dead-code analysis. Added to {@link DEFAULT_EXCLUDE}. */
  readonly exclude?: readonly string[]
}

/** Globs every helper leaves out: tests, declarations and fixtures. */
export const DEFAULT_EXCLUDE: readonly string[] = []
