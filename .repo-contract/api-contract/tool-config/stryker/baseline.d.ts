/** The package.json fields the config helpers read. Pass the parsed file. */
declare interface PackageManifest {
    readonly name?: string;
    readonly exports?: unknown;
    readonly main?: string;
    readonly module?: string;
    readonly types?: string;
}

/**
 * The run settings are the ones repo-contract, env-cap and data-cap share today. `ignoreStatic`
 * is on because a static mutant reruns the whole suite under per-test coverage.
 * @param options - the source directory, exclude list and run limits.
 * @returns the Stryker settings.
 * @throws {RangeError} when `concurrency` or `timeoutMS` is not a positive whole number.
 * @beta
 */
export declare function strykerConfig(options?: StrykerConfigOptions): StrykerConfigFragment;

/**
 * The Stryker settings the helper sets. Export it as the config's default. Arrays are mutable
 * copies, as Stryker's options type takes.
 */
export declare interface StrykerConfigFragment {
    readonly testRunner: "vitest";
    readonly coverageAnalysis: "perTest";
    readonly ignoreStatic: boolean;
    readonly incremental: false;
    readonly mutate: string[];
    readonly reporters: string[];
    readonly jsonReporter: {
        readonly fileName: string;
    };
    readonly tempDirName: string;
    readonly concurrency: number;
    readonly timeoutMS: number;
    /** `10`. The first, unmutated run reruns the suite with per-test coverage, and Stryker's 5-minute default aborts it on a loaded machine. */
    readonly dryRunTimeoutMinutes: number;
}

/** Options for {@link strykerConfig}. */
export declare interface StrykerConfigOptions extends Pick<ToolConfigOptions, "srcDir" | "exclude"> {
    /** Defaults to `4`. */
    readonly concurrency?: number;
    /** Per-mutant timeout, in milliseconds. Defaults to `20000`. */
    readonly timeoutMS?: number;
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

export { }
