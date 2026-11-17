/** A coverage report format the fragment names. */
export declare type CoverageReporterName = "text" | "html" | "lcov" | "json" | "json-summary";

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
 * `reportOnFailure` is on so a failing run still leaves a summary for the `coverage` preset to
 * judge, rather than a stale one from an earlier run.
 * @param options - the source directory, test globs and exclude list.
 * @returns the Vitest settings.
 * @beta
 */
export declare function vitestConfig(options?: VitestConfigOptions): VitestConfigFragment;

/**
 * The Vitest settings the helper sets. Pass it to `defineConfig` or `mergeConfig`. Arrays are
 * mutable copies, as Vitest's config type takes.
 */
export declare interface VitestConfigFragment {
    readonly test: {
        readonly include: string[];
        readonly coverage: {
            readonly provider: "v8";
            /** Includes `json-summary` and `json`, which the presets read. */
            readonly reporter: CoverageReporterName[];
            /** `coverage`: the presets read `coverage/coverage-summary.json` and `coverage/coverage-final.json`. */
            readonly reportsDirectory: string;
            readonly reportOnFailure: boolean;
            readonly include: string[];
            readonly exclude: string[];
        };
    };
}

/** Options for {@link vitestConfig}. */
export declare interface VitestConfigOptions extends Pick<ToolConfigOptions, "srcDir" | "exclude"> {
    /** Test file globs. Defaults to `["test/**\/*.test.ts"]`. */
    readonly include?: readonly string[];
}

export { }
