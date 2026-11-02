/**
 * Affected-scope analysis: given a diff, which tests (and mutation targets) can the change
 * affect? Symbol-level -- changed files are diffed against their base to find the exports whose
 * behavior may differ, and those are followed through the import graph -- with every case the
 * analysis cannot reason about widening the answer toward a full run, never narrowing it on a
 * guess. Pure: file contents, the diff and the TypeScript compiler API come in as data and
 * capabilities, so this barrel reads no file and runs no process (see
 * specs/decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md).
 *
 * A third independent public barrel, published under its own `./affected` subpath, like
 * `src/presets/index.ts` and `src/helpers/index.ts`; never re-exported from the package root.
 * @packageDocumentation
 */

import type * as TypeScript from 'typescript';

/** Optional tuning. Every default is the conservative choice. */
export declare interface AffectedOptions {
    /** Globs of non-module files that can never influence a test (default: changesets, changelog, license, codeowners). */
    readonly ignore?: readonly string[];
    /** Globs of files whose change makes everything affected (default: package manifests, lockfiles, tool configs, CI). */
    readonly triggers?: readonly string[];
    /** Globs of test entry files (default: `*.test.*` and `*.spec.*`). */
    readonly tests?: readonly string[];
    /** Globs of files that are never mutation targets (default: tests, test support and declaration files). */
    readonly notMutated?: readonly string[];
    /**
     * Couplings the import graph cannot see: when a changed file matches `when`, every test matching
     * one of `run` is affected. For fixtures, golden files, or anything a test reads without importing.
     */
    readonly links?: readonly LinkRule[];
}

export declare interface AffectedResult {
    readonly scope: AffectedScope;
    /** Present when `scope` is `"full"`: the first reason the narrow path was abandoned. */
    readonly fullBecause?: Widening;
    readonly changedFiles: readonly string[];
    /** `file#export` for every export whose behavior may differ from the base. */
    readonly changedSymbols: readonly string[];
    /** Non-test modules that depend on a changed symbol (plus the changed modules themselves). */
    readonly affectedSources: readonly string[];
    /** Test entry files to run. */
    readonly affectedTests: readonly string[];
    /** Source files whose mutants are worth re-evaluating: changed sources and their direct symbol dependents. */
    readonly mutateTargets: readonly string[];
    readonly widened: readonly Widening[];
    /** Internal provenance for {@link explainAffected}. */
    readonly causes: ReadonlyMap<string, string>;
}

export declare type AffectedScope = "affected" | "full";

/** A file to keep: a safe relative path and its content. */
export declare interface ArtifactInput {
    readonly path: string;
    readonly content: Uint8Array;
}

/** A content-addressed computation cache over a `CacheStore`. */
declare interface Cache_2 {
    readonly mode: CacheMode;
    /** Finds the entry for a key; anything unreadable or inconsistent is a miss, never a replay. */
    lookup<TValue = unknown>(check: string, key: string): Promise<CacheLookup<TValue>>;
    /** Stores a result; resolves to whether it was written (never in `off` or `read-only`). */
    store(input: CacheStoreInput): Promise<boolean>;
    /** Compares inputs with the check's latest entry, to explain a miss. */
    why(check: string, inputs: Readonly<Record<string, string>>): Promise<MissExplanation>;
    /** Counts what is stored. */
    stats(): Promise<CacheStats>;
    /** Removes entries beyond the limits, and every unreadable one; resolves to how many. */
    prune(limits: PruneLimits): Promise<number>;
    /** Removes every entry; resolves to how many. */
    clear(): Promise<number>;
}
export { Cache_2 as Cache }

/** Bumped whenever an entry's shape or the way a key is built changes; an old entry is then never replayed. */
export declare const CACHE_FORMAT = 1;

/** What a check's result was computed from and what it was. */
export declare interface CacheEntry<TValue = unknown> {
    readonly formatVersion: typeof CACHE_FORMAT;
    readonly check: string;
    readonly key: string;
    /** Every input's name and a digest of its content, so a miss can say what changed. */
    readonly inputs: Readonly<Record<string, string>>;
    readonly value: TValue;
    readonly durationMs: number;
    readonly createdAt: string;
}

/**
 * Builds the key a result is stored under: a digest of the check, every input's name and content
 * digest, the tool versions, and the cache format. Anything that can change the result belongs in
 * `inputs` or `tools`; the key says nothing about what is left out.
 * @param input - The check id, its inputs (name to content digest) and the tools' versions.
 * @param input.check - The check id.
 * @param input.inputs - Each input's name and a digest of its content.
 * @param input.tools - Each tool's name and version.
 * @returns A 64-character hex digest.
 */
export declare function cacheKey(input: {
    readonly check: string;
    readonly inputs: Readonly<Record<string, string>>;
    readonly tools: Readonly<Record<string, string>>;
}): string;

/** The result of looking an entry up. */
export declare type CacheLookup<TValue = unknown> = {
    readonly hit: true;
    readonly entry: CacheEntry<TValue>;
} | {
    readonly hit: false;
    readonly reason: "miss" | "corrupt" | "disabled";
};

/** Whether the cache is consulted and written. */
export declare type CacheMode = "read-write" | "read-only" | "off";

/** What is in the cache. */
export declare interface CacheStats {
    readonly entries: number;
    readonly bytes: number;
    readonly corrupt: number;
    readonly checks: Readonly<Record<string, number>>;
}

/**
 * Where entries live. Paths are relative and slash-separated (`index/<check>/<key>.json`); the
 * implementation decides what they map to (a directory, a memory map). It never sees an unsafe
 * path: the cache validates check ids and keys before building one.
 */
export declare interface CacheStore {
    /** The content at a path, or `undefined` if there is none. */
    read(path: string): Promise<string | undefined>;
    /** Writes a path, replacing any content, so that a reader never sees a partial write. */
    write(path: string, content: string): Promise<void>;
    /** Removes a path; absent is not an error. */
    remove(path: string): Promise<void>;
    /** Every path that starts with the prefix. */
    list(prefix: string): Promise<readonly string[]>;
}

/** What to store for a computed result. */
export declare interface CacheStoreInput {
    readonly check: string;
    readonly key: string;
    readonly inputs: Readonly<Record<string, string>>;
    /** The result to replay; it must survive `JSON.stringify`. */
    readonly value: unknown;
    readonly durationMs: number;
}

/** What the canary compares: the affected-scope answer against a full run's failures. */
export declare interface CanaryInput {
    /** The tests the affected analysis said to run. */
    readonly affectedTests: readonly string[];
    /** Every test the full run executed. */
    readonly allTests: readonly string[];
    /** The tests that failed in the full run. */
    readonly failedInFullRun: readonly string[];
}

/** The canary's finding. */
export declare interface CanaryResult {
    /** True when the affected scope would have caught every failure the full run found. */
    readonly clean: boolean;
    /** Tests that failed in the full run although the affected scope left them out, sorted. */
    readonly escapes: readonly string[];
    /** How many tests the full run covered. */
    readonly checked: number;
}

/** One changed path, as reported by the caller (typically from `git diff --name-status -M`). */
export declare interface ChangedFile {
    /** Repo-relative, forward-slash path. */
    readonly path: string;
    readonly kind: ChangeKind;
    /** For `renamed`: the path the file had at the base. */
    readonly renamedFrom?: string;
}

/** How one path differs between the base and the working tree. */
export declare type ChangeKind = "added" | "modified" | "deleted" | "renamed";

/**
 * Computes which tests (and which mutation targets) a change can affect.
 *
 * The analysis is symbol-level: each changed module is diffed against its base to find the exported
 * names whose behavior may differ, and those names are followed through the import graph --
 * including re-exports and `export *` -- to every module that uses them. Anything it cannot reason
 * about does not narrow the result: a changed file the graph cannot place, a global trigger such as
 * a lockfile, or a file that does not parse makes the whole result `"full"`, and a module that loads
 * code dynamically is treated as affected by everything. Narrowing is only ever an optimization of
 * a sound answer, never a guess.
 * @param input - Module contents, the diff, and the TypeScript compiler API.
 * @returns The affected sets, with provenance for every test (see `explainAffected`).
 */
export declare function computeAffected(input: ComputeAffectedInput): AffectedResult;

/**
 * Computes the affected set for the working tree against a base, using git and file reads the
 * caller supplies. Anything git cannot answer makes the result `"full"`.
 * @param input - The TypeScript API, the capabilities and optional tuning.
 * @returns The affected sets, as from `computeAffected`.
 */
export declare function computeAffectedFromGit(input: ComputeAffectedFromGitInput): Promise<AffectedResult>;

export declare interface ComputeAffectedFromGitInput {
    readonly ts: TypeScriptApi;
    readonly capabilities: GitCapabilities;
    /** The ref to compare against. Defaults to the upstream branch, then `origin/main`, then `origin/master`. */
    readonly base?: string;
    /** Compiler options for module resolution. When absent they are read from the tsconfig. */
    readonly compilerOptions?: TypeScript.CompilerOptions;
    /** The tsconfig to read the options from (default `tsconfig.json`, which may be absent). */
    readonly tsconfig?: string;
    readonly options?: AffectedOptions;
}

/** The inputs of {@link computeAffected}. Everything is data: this layer reads no file and runs no process. */
export declare interface ComputeAffectedInput {
    readonly ts: TypeScriptApi;
    /** Current contents of every JS/TS module in the project (sources and tests), keyed by repo-relative path. */
    readonly files: ReadonlyMap<string, string>;
    /** Base contents of every changed module path that existed at the base (modified, deleted and renamed-from paths). */
    readonly baseFiles: ReadonlyMap<string, string>;
    /** Every changed path, module or not. */
    readonly changed: readonly ChangedFile[];
    /** `compilerOptions` for module resolution (`paths`, `baseUrl`, ...). Defaults to bundler resolution. */
    readonly compilerOptions?: TypeScript.CompilerOptions;
    readonly options?: AffectedOptions;
    /** When set, the analysis is skipped and everything is reported affected for this reason. */
    readonly fullBecause?: Widening;
}

/**
 * Creates a cache over a store.
 * @param options - The store, the mode and (for tests) a clock.
 * @param options.store - Where entries live.
 * @param options.mode - Whether to read and write.
 * @param options.now - The clock, for an entry's creation time and for pruning by age.
 * @returns The cache.
 */
export declare function createCache(options: {
    readonly store: CacheStore;
    readonly mode: CacheMode;
    readonly now?: () => Date;
}): Cache_2;

/** Files that cannot influence a test and so are not worth a full run. */
export declare const DEFAULT_IGNORE: readonly string[];

/** Files that are not mutation targets. */
export declare const DEFAULT_NOT_MUTATED: readonly string[];

/** Test entry points: the files a runner is asked to execute. */
export declare const DEFAULT_TESTS: readonly string[];

/** Files whose change can alter how every test behaves, so nothing narrower than a full run is sound. */
export declare const DEFAULT_TRIGGERS: readonly string[];

/**
 * Looks for settings that make the affected-scope feature slower or wrong. Findings are ordered
 * by severity (warnings first), then id, so the most useful change is first.
 * @param snapshot - Facts about the repository.
 * @returns The findings.
 */
export declare function diagnose(snapshot: DoctorSnapshot): DoctorReport;

/** One thing worth changing, and how. */
export declare interface DoctorFinding {
    readonly id: string;
    readonly severity: FindingSeverity;
    readonly message: string;
    readonly hint: string;
    /** Present only when the repair is safe to apply without a human deciding anything. */
    readonly fix?: DoctorFix;
}

/** A mechanical change a finding can be repaired with: text appended to a file. */
export declare interface DoctorFix {
    readonly file: string;
    readonly append: string;
}

export declare interface DoctorReport {
    /** True when there is nothing to report. */
    readonly clean: boolean;
    readonly findings: readonly DoctorFinding[];
}

/** Facts about a repository, gathered by the caller; `diagnose` reads no file itself. */
export declare interface DoctorSnapshot {
    /** The root `.gitignore`'s content, or `undefined` if there is none. */
    readonly gitignore?: string | undefined;
    /** Every vitest config file found, with its content. */
    readonly vitestConfigs: readonly {
        readonly path: string;
        readonly text: string;
    }[];
    /** Every GitHub Actions workflow file, with its content. */
    readonly workflows: readonly {
        readonly path: string;
        readonly text: string;
    }[];
    /** Whether the git hooks that run the contract are installed. */
    readonly hooksInstalled: boolean;
    /** Source files that re-export with `export *`. */
    readonly starExportFiles: readonly string[];
}

/**
 * Explains why each test is in the affected set, as one line per test:
 * `test/b.test.ts <- src/b.ts depends on a changed symbol <- src/a.ts exports a changed \`foo\` <- ...`.
 * @param result - A result from `computeAffected`.
 * @returns One line per affected test (or a single line saying why everything is affected), sorted.
 */
export declare function explainAffected(result: AffectedResult): string[];

/**
 * Proves the affected scope sound against evidence: after a full run on the same change, any test
 * that failed there but was not in the affected set is an escape -- a regression the narrow run
 * would have shipped. Run it on merges to the main branch, where both answers exist.
 * @param input - The affected tests, all tests and the full run's failures.
 * @returns Whether the narrow scope was sound, and which tests escaped it.
 */
export declare function findEscapes(input: CanaryInput): CanaryResult;

export declare type FindingSeverity = "warn" | "info";

/** The two things the collector needs from the machine, supplied by the caller. */
export declare interface GitCapabilities {
    /** Runs `git <args>` in the repository; resolves to stdout, or `undefined` if git exits non-zero. */
    git(args: readonly string[]): Promise<string | undefined>;
    /** Reads a repo-relative file from the working tree; resolves to `undefined` if it cannot be read. */
    readFile(path: string): Promise<string | undefined>;
}

export declare interface LinkRule {
    readonly when: string;
    readonly run: readonly string[];
}

/**
 * Reads the compiler options module resolution depends on (`paths`, `baseUrl`, ...), following
 * `extends` through the repository and `node_modules`. An import written through a path alias
 * looks like a package to the graph, so options that could not be read must widen the answer,
 * not be skipped.
 * @param input - The TypeScript API, a file reader and optionally the config to use.
 * @returns The options (absent when there is no default `tsconfig.json`), or the reason to go full.
 */
export declare function loadCompilerOptions(input: LoadCompilerOptionsInput): Promise<{
    readonly options?: TypeScript.CompilerOptions;
} | {
    readonly because: Widening;
}>;

export declare interface LoadCompilerOptionsInput {
    readonly ts: TypeScriptApi;
    /** Reads a repo-relative file; resolves to `undefined` if it cannot be read. */
    readonly readFile: (path: string) => Promise<string | undefined>;
    /** The config to read. Defaults to `tsconfig.json`, which may be absent; a named one may not. */
    readonly file?: string;
}

/**
 * Combines per-shard Stryker reports into the report an unsharded run would have produced. Never
 * a partial pass: a missing, repeated or out-of-range shard, an unreadable report, a file mutated
 * by two shards, or disagreeing schema versions all fail the merge.
 * @param reports - Each shard's number and parsed report.
 * @param total - How many shards the run was split into.
 * @returns The merged report, or why the shards cannot be merged.
 */
export declare function mergeMutationReports(reports: readonly ShardReport[], total: number): MergeResult;

/** The outcome of {@link mergeMutationReports}. */
export declare type MergeResult = {
    readonly ok: true;
    readonly report: unknown;
} | {
    readonly ok: false;
    readonly error: string;
};

/** Why a computation is not served from the cache, relative to the check's latest entry. */
export declare type MissExplanation = {
    readonly kind: "no-previous";
} | {
    readonly kind: "same-inputs";
} | {
    readonly kind: "changed";
    readonly changed: readonly string[];
    readonly added: readonly string[];
    readonly removed: readonly string[];
    readonly comparedWith: string;
};

/**
 * Packs build output so a cache can hold it and restore it later.
 * @param files - The files to keep, by safe relative path.
 * @returns The files, sorted by path, each with its checksum.
 * @throws {TypeError} If a path could name anything outside the directory it is restored into, or repeats.
 */
export declare function packArtifacts(files: readonly ArtifactInput[]): PackedArtifacts;

/** A packed file: content as base64, with the checksum it must still have when unpacked. */
export declare interface PackedArtifact {
    readonly path: string;
    readonly data: string;
    readonly sha256: string;
}

/** A set of files that survives `JSON.stringify`, so it can be a cache value. */
export declare interface PackedArtifacts {
    readonly format: 1;
    readonly files: readonly PackedArtifact[];
}

/**
 * Validates the `affected` block of a repository's configuration (`package.json`'s
 * `"repo-contract"."affected"`). Strict on purpose: a misspelt key would otherwise silently
 * leave a coupling undeclared, which is the one thing this block exists to prevent.
 * @param value - The parsed block, or `undefined` if the repository has none.
 * @returns The options, or a one-line description of what is wrong.
 */
export declare function parseAffectedConfig(value: unknown): {
    readonly options: AffectedOptions;
} | {
    readonly error: string;
};

/** The scope-related arguments of a command line, and whatever else was given. */
export declare type ParsedScopeArgs = {
    readonly ok: true;
    readonly scope?: RequestedScope;
    readonly base?: string;
    readonly rest: readonly string[];
} | {
    readonly ok: false;
    readonly error: string;
};

/**
 * Pulls `--fail-fast` / `--no-fail-fast` out of a runner's arguments. The last one wins; anything
 * after a `--` terminator is left untouched.
 * @param argv - The runner's arguments.
 * @returns The flag if one was given, and the arguments without it.
 */
export declare function parseFailFastArgs(argv: readonly string[]): {
    readonly failFast?: boolean;
    readonly rest: readonly string[];
};

/**
 * Parses `git diff --name-status -M -z` output.
 * @param output - The NUL-separated output.
 * @returns The changes, or `undefined` if any entry is not understood (never a partial guess).
 */
export declare function parseNameStatus(output: string): ChangedFile[] | undefined;

/**
 * Reads `--scope` and `--base` out of a command line, in both `--flag value` and `--flag=value` forms.
 * @param argv - The arguments, without the executable and script.
 * @returns The requested scope and base, and every other argument in order; or the reason they are unusable.
 */
export declare function parseScopeArgs(argv: readonly string[]): ParsedScopeArgs;

/**
 * @param text - A selector like `2/5`: shard 2 of 5.
 * @returns The one-based index and the total, or what is wrong with the text.
 */
export declare function parseShardSpec(text: string): ShardSpec;

/**
 * Works out what applying the findings' fixes would change, without touching anything: the caller
 * shows the difference, then writes it. Idempotent: text already present is not appended again.
 * @param findings - Findings from {@link diagnose}.
 * @param files - The current content of every file a fix may touch (absent means it does not exist).
 * @returns One change per file that would differ.
 */
export declare function planFixes(findings: readonly DoctorFinding[], files: Readonly<Record<string, string | undefined>>): PlannedChange[];

/** One file a set of fixes would change. */
export declare interface PlannedChange {
    readonly file: string;
    readonly before: string | undefined;
    readonly after: string;
}

/**
 * Splits mutation targets across shards: heaviest first onto the lightest shard, so the shards
 * finish at about the same time. The same targets and timings always give the same plan.
 * @param input - The targets, their recorded timings, and a shard count or a time budget.
 * @returns The plan.
 * @throws {RangeError} If a count or budget is not a positive number.
 */
export declare function planShards(input: ShardPlanInput): ShardPlan;

/** The limits `prune` enforces; an absent limit is not enforced. */
export declare interface PruneLimits {
    /** Entries older than this are removed. */
    readonly maxAgeMs?: number;
    /** Only this many of the newest entries are kept. */
    readonly maxEntries?: number;
}

/** What a caller may ask for; `"auto"` leaves the choice to the environment. */
export declare type RequestedScope = RunScope | "auto";

/**
 * Decides the cache mode of a run. A full run is always cold (the cache is neither read nor
 * written), so a release can never be satisfied by an earlier result; otherwise the command line
 * wins over `REPO_CONTRACT_CACHE` (`off`, `ro` or `rw`), which wins over the default of read-write.
 * @param input - The run's scope, the environment as data, and any mode given on the command line.
 * @param input.scope - The run's scope.
 * @param input.env - The environment, as data.
 * @param input.flag - A mode given on the command line.
 * @returns The mode and why.
 * @throws {Error} If `REPO_CONTRACT_CACHE` is not one of off, ro, rw.
 */
export declare function resolveCacheMode(input: {
    readonly scope: RunScope;
    readonly env: Readonly<Record<string, string | undefined>>;
    readonly flag?: CacheMode;
}): {
    readonly mode: CacheMode;
    readonly reason: string;
};

/**
 * Decides whether a run stops spending time on expensive checks once a cheap one has failed. Off
 * unless asked for, in CI as much as locally, so a run reports every problem by default; and never
 * on for a release, which always runs everything.
 * @param input - The explicit flag and the environment.
 * @param input.flag - `--fail-fast` (true) or `--no-fail-fast` (false), if given.
 * @param input.env - The environment variables to read; this function reads no ambient state.
 * @returns Whether to pass `failFast: true` to the run.
 */
export declare function resolveFailFast(input: {
    readonly flag?: boolean;
    readonly env: Readonly<Record<string, string | undefined>>;
}): boolean;

/**
 * Decides whether a run validates the affected part of the tree or all of it. A release is always
 * full, and `CI_FULL` forces full over anything else; otherwise an explicit request wins, then
 * `REPO_CONTRACT_SCOPE`, then the CI event (a pull request compares with its base, every other
 * event, and a CI system with no pull request, validates everything), and a local run compares
 * with its base branch.
 * @param input - The request and the environment, as data.
 * @returns The scope and why.
 * @throws {Error} If `REPO_CONTRACT_SCOPE` is not one of the three choices.
 */
export declare function resolveScope(input: ResolveScopeInput): ScopeDecision;

/** What `resolveScope` decides from. */
export declare interface ResolveScopeInput {
    /** What the caller asked for; `"auto"` or absent leaves it to the environment. */
    readonly requested?: RequestedScope;
    /** The environment, passed in rather than read (`process.env` works as is). */
    readonly env: Readonly<Record<string, string | undefined>>;
}

/** How much of the repository a run validates. */
export declare type RunScope = "affected" | "full";

/** The scope a run uses and the reason, for the run's own output. */
export declare interface ScopeDecision {
    readonly scope: RunScope;
    readonly source: ScopeSource;
    readonly reason: string;
}

/** Where a scope decision came from. */
export declare type ScopeSource = "flag" | "env" | "ci-full" | "release" | "ci-event" | "default";

/** A GitHub Actions matrix with one entry per shard. */
export declare interface ShardMatrix {
    readonly include: readonly {
        readonly shard: number;
        readonly total: number;
        readonly spec: string;
    }[];
}

/**
 * @param count - The number of shards.
 * @returns A matrix for `strategy.matrix: ${{ fromJSON(...) }}`.
 */
export declare function shardMatrix(count: number): ShardMatrix;

/** How targets are split across shards. */
export declare interface ShardPlan {
    /** The number of shards (at least 1). */
    readonly count: number;
    /** The targets of each shard, sorted; `shards[0]` is shard 1. */
    readonly shards: readonly (readonly string[])[];
    /** The summed expected cost of each shard, in milliseconds. */
    readonly weightsMs: readonly number[];
}

/** The inputs of {@link planShards}. */
export declare interface ShardPlanInput {
    /** The files to split, in any order. */
    readonly targets: readonly string[];
    /** Recorded cost per file in milliseconds; files without one weigh the mean of those with one. */
    readonly timingsMs?: Readonly<Record<string, number>>;
    /** A fixed shard count. Wins over `targetMinutes`. */
    readonly shards?: number;
    /** Size the count so that no shard is expected to take much longer than this many minutes. */
    readonly targetMinutes?: number;
    /** The most shards `targetMinutes` may ask for. */
    readonly max?: number;
}

/** One shard's mutation report, as parsed JSON. */
export declare interface ShardReport {
    /** One-based shard number. */
    readonly shard: number;
    readonly report: unknown;
}

/** A shard selector such as `2/5`, or why the text is not one. */
export declare type ShardSpec = {
    readonly ok: true;
    readonly index: number;
    readonly total: number;
} | {
    readonly ok: false;
    readonly error: string;
};

/** The TypeScript compiler API, supplied by the caller -- this package never imports `typescript` at runtime. */
export declare type TypeScriptApi = typeof TypeScript;

/**
 * Unpacks a cached set of files, trusting nothing: the shape, every path and every checksum are
 * checked, and any problem means the whole set is refused (a cache miss, never a partial restore).
 * @param value - What the cache returned.
 * @returns The files with their content, or why the set cannot be used.
 */
export declare function unpackArtifacts(value: unknown): UnpackResult;

export declare type UnpackResult = {
    readonly ok: true;
    readonly files: readonly {
        readonly path: string;
        readonly content: Uint8Array;
    }[];
} | {
    readonly ok: false;
    readonly error: string;
};

/** Why a run left the narrow path. */
export declare interface Widening {
    readonly reason: WideningReason;
    /** The file (or glob) that caused it. */
    readonly file: string;
    /** What got wider: `"full"` for the whole project, otherwise what the file now drags in. */
    readonly to: "full" | "all-exports" | "always-run";
    readonly detail?: string;
}

export declare type WideningReason = "global-trigger" | "unplaced-file" | "parse-error" | "dynamic-import" | "module-side-effect" | "git-failed" | "tsconfig";

export { }
