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
 * @param options - the manifest and overrides.
 * @returns the TypeDoc settings.
 * @beta
 */
export declare function typedocConfig(options: ToolConfigOptions): TypedocConfigFragment;

/** The TypeDoc settings the helper sets. Arrays are mutable copies, as TypeDoc's options type takes. */
export declare interface TypedocConfigFragment {
    readonly entryPoints: string[];
    readonly exclude: string[];
}

export { }
