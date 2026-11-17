/**
 * Shared inputs for the tool config helpers: the entry points from package.json `exports`, and
 * one exclude list. Each tool has its own subpath: `repo-contract/config/tsup`, `/typedoc`,
 * `/knip`, `/vitest` and `/stryker`. Each returns a plain object to spread into the tool's config,
 * and imports nothing from the tool itself.
 *
 * Experimental. Published under its `./config` subpath.
 * @packageDocumentation
 */

/**
 * Globs every helper leaves out: tests, mocks, fixtures and declarations. Each starts with `**`
 * so it matches under any source directory.
 */
export declare const DEFAULT_EXCLUDE: readonly string[];

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
export declare function entries(manifest: PackageManifest, options?: EntriesOptions): readonly EntryPoint[];

/** Options for {@link entries}. */
export declare interface EntriesOptions {
    /** The source file per `exports` subpath, where the convention does not hold. */
    readonly sources?: Readonly<Record<string, string>>;
    /** The source directory. Defaults to `"src"`. */
    readonly srcDir?: string;
    /** Whether a file exists, relative to the working directory. Defaults to `node:fs`'s `existsSync`; tests pass their own. */
    readonly exists?: (path: string) => boolean;
}

/** One code entry point, from one `exports` subpath. */
export declare interface EntryPoint {
    /** The `exports` key, such as `"."` or `"./helpers"`. */
    readonly subpath: string;
    /** The built file's path under the build directory, without extension, such as `"index"` or `"config/tsup"`. */
    readonly name: string;
    /** The source file that builds it, such as `"src/helpers/index.ts"`. */
    readonly source: string;
}

/**
 * The one exclude list every helper uses: the defaults plus the package's own, without
 * duplicates.
 * @param exclude - the package's own globs.
 * @returns the merged list, a new array on every call.
 * @throws {TypeError} on a blank glob or one that starts with `!`.
 */
export declare function excludeGlobs(exclude?: readonly string[]): readonly string[];

/**
 * @param globs - globs to leave out.
 * @returns each glob prefixed with `!`, for Stryker's `mutate` and knip's `project`.
 * @throws {TypeError} on a blank glob or one that already starts with `!`.
 */
export declare function negateGlobs(globs: readonly string[]): readonly string[];

/** The package.json fields the config helpers read. Pass the parsed file. */
export declare interface PackageManifest {
    readonly name?: string;
    readonly exports?: unknown;
    readonly main?: string;
    readonly module?: string;
    readonly types?: string;
}

/** What every config helper takes. */
export declare interface ToolConfigOptions {
    /** The parsed package.json. Its `exports` decide the entry points. */
    readonly manifest: PackageManifest;
    /** The source file per `exports` subpath, where the convention does not hold, such as `{ ".": "src/runtime/index.ts" }`. */
    readonly sources?: Readonly<Record<string, string>>;
    /** The source directory. Defaults to `"src"`. */
    readonly srcDir?: string;
    /** Globs left out of the build's checks: mutation targets, coverage and dead-code analysis. Added to {@link DEFAULT_EXCLUDE}. */
    readonly exclude?: readonly string[];
    /** Whether a file exists, relative to the working directory. Defaults to `node:fs`'s `existsSync`; tests pass their own. */
    readonly exists?: (path: string) => boolean;
}

export { }
