/** The package.json fields the config helpers read. Pass the parsed file. */
declare interface PackageManifest {
    readonly name?: string;
    readonly exports?: unknown;
    readonly main?: string;
    readonly module?: string;
    readonly types?: string;
}

/** What every config helper takes. */
declare interface ToolConfigOptions {
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

/**
 * The defaults are what repo-contract, env-cap and data-cap build with today. Declarations are
 * left to the caller: all three emit them with `tsc`, so the fragment sets no `dts`.
 * @param options - the manifest and overrides.
 * @returns the tsup settings.
 * @throws {RangeError} when `format` is empty.
 * @beta
 */
export declare function tsupConfig(options: TsupConfigOptions): TsupConfigFragment;

/**
 * The tsup settings the helper sets. Spread it into `defineConfig`. Arrays are mutable copies
 * because tsup's `Options` type takes mutable arrays.
 */
export declare interface TsupConfigFragment {
    /** Built file name to source file, from {@link entries}. */
    readonly entry: Record<string, string>;
    readonly format: ("esm" | "cjs")[];
    readonly platform: "node" | "neutral" | "browser";
    readonly target: string;
    readonly sourcemap: boolean;
    readonly treeshake: boolean;
}

/** Options for {@link tsupConfig}. */
export declare interface TsupConfigOptions extends ToolConfigOptions {
    /** Defaults to `["esm", "cjs"]`. */
    readonly format?: readonly ("esm" | "cjs")[];
    /** Defaults to `"node"`. */
    readonly platform?: "node" | "neutral" | "browser";
    /** Defaults to `"node22"`. */
    readonly target?: string;
}

export { }
