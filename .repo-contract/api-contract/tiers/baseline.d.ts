/**
 * Four tiers of checks, each a function that returns `checks` to spread into
 * `defineRepoContract`: `basic`, `app`, `library` and `strict`. Each tier holds every check of the
 * tier before it. One overrides object, keyed by check id, changes a check's options or turns it
 * off. `explainTier` and `renderExplain` say what a config runs and what it loosened.
 *
 * Built from `repo-contract/presets`, so Experimental like them. Published under its `./tiers`
 * subpath, independent of the other barrels.
 * @packageDocumentation
 */

/**
 * `basic` plus Build, DeadCode, Duplication (2%), Licenses, DocsLinks and Coverage (80% of lines
 * and statements): what built, shipped and maintained code needs. Tests also writes the coverage
 * reports Coverage reads.
 * @param overrides - options per check id, or `false` to turn a check off.
 * @returns the checks and the tier's metadata, to spread into `defineRepoContract`.
 * @throws {TypeError} on overrides that are not an object, an override for a check the tier
 * lacks, or one that is neither `false` nor an options object the check accepts.
 * @beta
 */
export declare function app(overrides?: TierOverrides<AppCheckId>): TierConfig<AppCheckId>;

/** The checks `app` turns on: `basic` plus what built, shipped and maintained code needs. */
export declare type AppCheckId = BasicCheckId | "Build" | "DeadCode" | "Duplication" | "Licenses" | "DocsLinks" | "Coverage";

/** Options accepted by {@link arethetypeswrong}. */
declare interface ArethetypeswrongOptions {
    /** Resolutions whose problems are dropped before judging. `["node10"]` suits a package that supports only `exports`-aware resolution. Defaults to none. */
    readonly ignoreResolutions?: readonly AttwResolutionKind[];
}

/** A module resolution attw judges a package under. */
declare type AttwResolutionKind = "node10" | "node16-cjs" | "node16-esm" | "bundler";

/**
 * Format, Lint, Typecheck, Tests, SecuritySecrets and SecurityDeps: what every codebase with
 * source code needs.
 * @param overrides - options per check id, or `false` to turn a check off.
 * @returns the checks and the tier's metadata, to spread into `defineRepoContract`.
 * @throws {TypeError} on overrides that are not an object, an override for a check the tier
 * lacks, or one that is neither `false` nor an options object the check accepts.
 * @beta
 */
export declare function basic(overrides?: TierOverrides<BasicCheckId>): TierConfig<BasicCheckId>;

/** The checks `basic` turns on: what every codebase with source code needs. */
export declare type BasicCheckId = "Format" | "Lint" | "Typecheck" | "Tests" | "SecuritySecrets" | "SecurityDeps";

/** Options accepted by {@link brokenLinks}. */
declare interface BrokenLinksOptions {
    /**
     * Where the crawl starts. A string is one HTML start point. Defaults to `"."`. A list runs one
     * crawl over every start point, served from the working directory. linkinator's Markdown mode
     * is all or nothing, so one `"markdown"` start turns it on for the whole crawl.
     */
    readonly start?: string | readonly BrokenLinksStart[];
}

/** One place a crawl starts, and how its files are read. */
declare interface BrokenLinksStart {
    /** A file or directory, relative to the working directory. */
    readonly path: string;
    /** `"markdown"` follows links in Markdown files; `"html"` (the default) reads HTML only. */
    readonly mode?: "html" | "markdown";
}

/**
 * One fully configured check. It says how to run the check and how (if at all) to interpret its
 * output. Its policy decides whether its evidence is acceptable.
 * @public
 */
declare interface CheckDefinition extends CheckDefinitionConfig {
    /**
     * Other check ids (from this same `checks` record) that must reach a
     * terminal status (not necessarily a passing policy) before this
     * check's process is spawned. It orders execution only. repo-contract never
     * consults whether a dependency's *policy* passed to decide whether this
     * check spawns. That is for this check's command or policy to decide (see
     * `ctx.dependencies` on `PolicyContext`). Omit, or an empty array, for no dependencies: the
     * default, fully-parallel behavior. Validated before any process spawns.
     * Every named id must exist in `checks`, and a check cannot depend on itself.
     * Declaration order in the `checks` object doubles as the required
     * topological order. So every named id must be declared *earlier* than the
     * check that depends on it, and a forward reference throws
     * `DependencyDeclaredLaterError`. A cycle is impossible, since no
     * edge can point forward. See
     * specs/decisions/0002-dependson-and-isolated-are-two-scheduling-primitives.md.
     */
    readonly dependsOn?: readonly string[];
}

/**
 * One partially configured check. It says how to run the check and how (if at all) to interpret
 * its output. Its policy decides whether its evidence is acceptable.
 * @public
 */
declare interface CheckDefinitionConfig {
    /**
     * The command to run. A `string` is tokenized into executable + arguments
     * without invoking a shell. Shell operators (`;`, `&`, `|`, backticks,
     * `$(`, `<`, `>`, newlines) are rejected with a configuration error, not
     * passed through as literal arguments. A string containing one almost
     * always means its author assumed a shell would interpret it. Glob characters (`*`, `?`, `~`,
     * `[`, `]`, `{`, `}`) are NOT rejected. They are common, legitimate literal argv content
     * (e.g. `eslint "src/**\/*.ts"`) that many CLI tools glob-expand internally. They carry no
     * shell-injection risk when no shell is invoked.
     * An array bypasses tokenization entirely and is used as argv verbatim.
     */
    readonly run: string | readonly string[];
    /**
     * Opt into shell execution instead of the safe argv-only default. This
     * applies when `true`, or when unset with `RepoContractConfig.shell: true`
     * as the run-wide default (see that field). `run` must then be a `string`.
     * It is passed to the platform shell as-is, via the supplied `Spawner`'s
     * `shell` option. Shell metacharacter rejection does not apply. See
     * SECURITY.md before enabling this.
     */
    readonly shell?: boolean;
    /** Working directory for the spawned process. Defaults to the current process's `cwd`. */
    readonly cwd?: string;
    /** Additional environment variables for the spawned process, applied on top of (or, if `inheritEnv` is `false`, instead of) the inherited environment. */
    readonly env?: Readonly<Record<string, string>>;
    /** Whether the spawned process inherits `process.env`. Defaults to `true`: most check commands (npm scripts, locally-installed CLIs) need `PATH` and similar to resolve at all. Set to `false` for a minimal environment containing only `env` (plus whatever the OS itself always provides). */
    readonly inheritEnv?: boolean;
    /** Maximum time to let this check's process run before it is terminated and recorded with `status: "timed_out"`. No timeout by default. */
    readonly timeoutMs?: number;
    /** Request that stdout be parsed as this format. Omit for no parsing: the consumer gets raw stdout/stderr only. */
    readonly output?: {
        readonly format: OutputFormat;
        /**
         * An optional Standard Schema validator: Zod, Valibot, ArkType, or any other
         * implementation of standardschema.dev. It runs once the requested `format` parse
         * itself succeeds. repo-contract never imports a schema library itself.
         * `StandardSchemaV1` is hand-vendored (see `src/standard-schema/types.ts`) as a
         * type-level contract only. So accepting a consumer's schema object adds no runtime or
         * dev dependency (see
         * specs/decisions/0012-hand-vendored-standard-schema-support-for-optional-output-validation.md).
         *
         * A successful `~standard.validate()` result *replaces* the parsed value on
         * `CheckEvidence.output.value`, so a schema can transform its input, not only check it.
         * A failing result becomes an ordinary `ParsedOutputFailure`, the same shape as a
         * malformed-JSON parse failure. Both mean "this check's output isn't what was expected"
         * and are reported as data, never thrown (see `parseOutput`). `validate()` itself
         * throwing or rejecting is a different case: a bug in the supplied schema, not malformed
         * output. It surfaces as `StandardSchemaValidateThrewError` instead (see that error's doc
         * comment).
         *
         * As with every other format's `value`, `schema`'s inferred output type is *not* carried
         * to `CheckEvidence.output.value`'s declared type, which stays `unknown`. The reason is the
         * TypeScript inference limit for heterogeneous checks in one record, documented on
         * `CheckEvidence` above. A policy still narrows or casts `.value` itself, even though
         * `schema` shaped it at runtime.
         */
        readonly schema?: StandardSchemaV1;
    };
    /**
     * A full scheduling barrier at this check's position in the `checks` object. It does not
     * spawn until every check declared *earlier* has reached a terminal status. Every check
     * declared *after* it waits for it in turn, so nothing overlaps it in either direction. When its turn
     * comes, only earlier-declared checks can be in flight, since later ones have not been reached.
     *
     * It is a scheduling primitive only. It suits a check whose tooling spawns concurrent workers
     * that would contend with the rest of the run for machine resources (e.g. Stryker's worker
     * pool). It needs no other check's evidence, only the machine to itself. So by itself it never
     * appears in a policy's `ctx.dependencies` or in a partial `options.checks` run's transitive
     * closure. An explicit `dependsOn` alongside it works as it would on any other check.
     *
     * Defaults to `false`: fully-parallel scheduling in declaration order. Two isolated checks always
     * run one after the other: the one declared second waits for the first, as it does for every
     * earlier check. See specs/decisions/0002-dependson-and-isolated-are-two-scheduling-primitives.md.
     */
    readonly isolated?: boolean;
    /**
     * Marks a check as costly enough to be worth skipping under fail-fast. That applies when the run
     * asked for fail-fast (`RunRepoContractOptions.failFast`) and an unmarked check has already
     * failed. A marked check that has not yet spawned then resolves to `status: "aborted"` evidence
     * with `skipReason: "fail-fast"` instead of running.
     * A check that is already running is never killed, and an `expensive` check failing never skips
     * anything. Skipping is decided when the check's turn comes, so to make it certain, declare the
     * expensive check after (or `dependsOn`) the cheap ones. Does nothing unless the run opts in to
     * fail-fast. Defaults to `false`.
     */
    readonly expensive?: boolean;
    /** Decides whether this check's evidence is acceptable, once its process has finished running. */
    readonly policy: Policy;
}

/**
 * What happened when one configured check ran. `output` is present only if
 * that check's config requested a format; otherwise it is `undefined`. A
 * policy narrows with `ctx.result.output?.success` (or an
 * `if (ctx.result.output) { ... }` guard) before reading `.value`/`.error`.
 *
 * `output.value` is the value the configured `format` parser produced. A check's config may
 * supply `output.schema` (see `CheckDefinitionConfig.output.schema`). The schema then validates
 * the value and may replace it with a transformed one, so it is not always the raw parser result.
 *
 * It is typed `unknown` for every format, including `"text"` (where `parseText` always produces a
 * `string`), with or without a schema. Several checks with different formats can share one
 * `checks` record. TypeScript's generic inference then cannot carry one check's literal
 * `output.format`, or its schema's output type, through to that check's `policy`.
 * specs/decisions/ holds the isolated repro. This is a deliberate tradeoff. A
 * schema still types its author's code through `StandardSchemaV1<Input, Output>`, but not this
 * shared `CheckEvidence` shape. A policy author narrows or casts `.value`, as they already must for
 * `"json"` or `"text"` without a schema.
 * @public
 */
declare interface CheckEvidence {
    /** The executable that was spawned (after tokenization, if `run` was a string). */
    readonly command: string;
    /** The arguments passed to `command`, exactly as spawned. */
    readonly args: readonly string[];
    /** ISO 8601 timestamp of when the process was spawned. */
    readonly startedAt: string;
    /** ISO 8601 timestamp of when the process reached its terminal state. */
    readonly completedAt: string;
    /** Wall-clock time from spawn to termination, in milliseconds. */
    readonly durationMs: number;
    /** `null` when the process never exited normally: see `signal` and `status`. */
    readonly exitCode: number | null;
    /** The signal that terminated the process, if any. `null` for a normal exit or a spawn failure. */
    readonly signal: NodeJS.Signals | null;
    /** The process's raw standard output, captured verbatim up to an internal size cap (10 MiB); content beyond the cap is replaced with a truncation marker. */
    readonly stdout: string;
    /** The process's raw standard error, captured verbatim up to an internal size cap (10 MiB); content beyond the cap is replaced with a truncation marker. */
    readonly stderr: string;
    /** Why the process reached its terminal state; see `CheckStatus`. */
    readonly status: CheckStatus;
    /**
     * Present only when the check never spawned because the run opted in to fail-fast
     * (`RunRepoContractOptions.failFast`) and a cheaper check had already failed (see
     * `CheckDefinitionConfig.expensive`). Such a check has `status: "aborted"`: it did not run, so a
     * policy must never read it as a pass.
     */
    readonly skipReason?: "fail-fast";
    /** Populated only for `status === "spawn_error"`: the underlying Node error message (e.g. "spawn foo ENOENT"). Never populated for any other status. */
    readonly spawnError?: string;
    /** Populated only for `status === "spawn_error"`: the underlying Node `ErrnoException`'s structured `.code` (e.g. `"ENOENT"`, `"EACCES"`), when Node provides one. Never populated for any other status. Distinguishes "the executable does not exist" from other spawn failures (permission denied, invalid executable format, etc.) without parsing `spawnError`'s free-text message. */
    readonly spawnErrorCode?: string;
    /**
     * The parsed interpretation of `stdout`, present only if this check's config requested a
     * `format`. When that config also supplied `output.schema`, that schema validates (and may
     * transform) a successful parse before it lands here. See this interface's doc comment above
     * and `CheckDefinitionConfig.output.schema`.
     */
    readonly output?: ParsedOutput<unknown>;
}

/**
 * The full set of checks in a `RepoContractConfig`, keyed by check id.
 * @public
 */
declare type CheckSchema = Record<string, CheckDefinition>;

/**
 * Why a check's process ended up in its terminal state. `"completed"` means
 * the process ran to exit by itself. The exit code may still be non-zero;
 * the check's policy interprets it, never this package. The other five
 * values all mean the process did not exit by itself. Either repo-contract
 * terminated it, or something else did, for a reason repo-contract can
 * observe but did not cause.
 *
 * `"signaled"` specifically means a signal repo-contract did *not* itself request: an
 * externally-caused termination. A check is instead `"host_terminated"` when the *host* process
 * running repo-contract received its SIGINT/SIGTERM (see `run-checks.ts`'s termination-handler
 * cleanup). In that case repo-contract did request the signal, though not via `options.signal` or
 * `timeoutMs` (see `"aborted"`/`"timed_out"`). So it must not be conflated with an
 * externally-caused `"signaled"`.
 * @public
 */
declare type CheckStatus = "completed" | "timed_out" | "signaled" | "host_terminated" | "spawn_error" | "aborted";

/**
 * Commit-message governance via commitlint, using whatever commitlint
 * config the consumer's repository already has (commitlint ships no
 * rules of its own: e.g. `@commitlint/config-conventional`). It judges the
 * exit code, not `--format json`: commitlint has no broadly-documented,
 * stable JSON CLI output. This preset reads its plain-text report as the
 * `format`/`typecheck` presets do for their tools, instead of relying on an
 * unconfirmed flag.
 * @param options - configuration for this check; see {@link CommitlintOptions}.
 * @returns the configured check.
 * @throws {TypeError} when `options` is not an object.
 * @beta
 */
declare function commitlint(options?: CommitlintOptions): CheckDefinitionConfig;

/** Options accepted by {@link commitlint}. */
declare interface CommitlintOptions {
    /** The ref commitlint lints commits *from* (exclusive). Defaults to `"origin/main"`. */
    readonly from?: string;
    /** The ref commitlint lints commits *to* (inclusive). Defaults to `"HEAD"`. */
    readonly to?: string;
}

/**
 * Compares one setting with its baseline. A value the baseline sets but the config leaves out
 * (a coverage metric no longer judged) is looser; one only the config sets is stricter.
 * @param direction - which way the setting gets stricter.
 * @param baseline - the baseline's value, or `undefined` when the baseline does not judge it.
 * @param value - the config's value, or `undefined` when the config does not judge it.
 * @returns whether the config is stricter, the same or looser.
 */
export declare function compareSetting(direction: LooseningDirection, baseline: number | undefined, value: number | undefined): SettingComparison;

/** Options accepted by {@link coverage}. */
declare interface CoverageOptions {
    /** Defaults to 80 on lines and statements. Given, it replaces the default whole. */
    readonly thresholds?: CoverageThresholds;
    /** The `json-summary` report a test run wrote. Defaults to `"coverage/coverage-summary.json"`. */
    readonly summary?: string;
}

/** Minimum coverage per metric, in percent. A metric left out is not judged. */
declare interface CoverageThresholds {
    readonly lines?: number;
    readonly statements?: number;
    readonly functions?: number;
    readonly branches?: number;
}

/** Options accepted by {@link crap}. */
declare interface CrapOptions {
    /** The source directories to score. Defaults to `"src"`. */
    readonly src?: string | readonly string[];
    /** The Istanbul `coverage-final.json` to score against. Defaults to `"coverage/coverage-final.json"`. */
    readonly coverage?: string;
    /** The highest CRAP score a function may have. Defaults to `30`. */
    readonly threshold?: number;
    /** The highest cyclomatic complexity a function may have, however well covered. Defaults to `20`. */
    readonly maxComplexity?: number;
    /** Globs crap4ts skips. */
    readonly ignore?: readonly string[];
    /** Where crap4ts writes its JSON report. Defaults to `"reports/crap.json"`. */
    readonly report?: string;
}

/**
 * Dead/unused-code detection via knip.
 * @param options - configuration for this check; see {@link DeadCodeOptions}.
 * @returns the configured check.
 * @throws {TypeError} when `options` is not an object.
 * @beta
 */
declare function deadCode(options?: DeadCodeOptions): CheckDefinitionConfig;

/** Options accepted by {@link deadCode}. */
declare interface DeadCodeOptions {
    /**
     * devDependency names to exclude from the "unused devDependency" issue
     * category: e.g. CLI tools knip has no way to see are used, because
     * nothing `import`s them. The list travels through knip's
     * `--reporter-options` flag (see `readReporterOptions`), not a closure. So
     * the exempt list this check ran with is visible on the recorded command
     * line and in persisted evidence, not only in this file's source. Defaults
     * to an empty list: repo-contract ships no built-in exemptions; add your
     * repository's here.
     */
    readonly exemptUnusedDevDependencies?: readonly string[];
}

/** One allowlisted URL (glob) and the reviewable reason it may ship. */
declare interface DistNoUrlsAllowEntry {
    /** A URL, or a glob (`*`, `**`, `?`, `[...]`, `{a,b}`; escape literals with `\`) matched against each whole URL found. */
    readonly url: string;
    /** Why this URL must ship in the build output. Required and non-empty: an allowlist entry without one fails the check. */
    readonly reason: string;
}

/** Options accepted by {@link distNoUrls}. */
declare interface DistNoUrlsOptions {
    /** Build-output directory to scan, relative to the working directory. Defaults to `"dist"`. */
    readonly dir?: string;
    /** URLs permitted in the output, each with a reason. Empty by default: the strictest policy is the default. */
    readonly allow?: readonly DistNoUrlsAllowEntry[];
}

/** Options accepted by {@link duplication}. */
declare interface DuplicationOptions {
    /** Directory to scan for duplicated code, passed straight through to jscpd as its positional target. Defaults to `"."`: narrow it (e.g. `"src"`) to scope the scan to your source tree. */
    readonly path?: string;
    /** The largest share of scanned lines that may be duplicated, in percent. A pass still lists every block. Defaults to `0`: any duplicated block fails. */
    readonly maxPercentage?: number;
}

/**
 * Versioned, immutable record of one complete `runRepoContract` execution:
 * every configured check's evidence, plus timing for the run as a whole.
 * Says nothing about whether any of it was acceptable; see `Verdict`.
 * Adding, removing or changing a direct member of this interface requires
 * bumping `version`. This repository's `api-contract` check fails the change
 * otherwise. It does not compare the members of `CheckEvidence`, so changes
 * there are held to the rule in `VERSIONING.md` by review only.
 * @public
 */
declare interface Evidence<TChecks extends CheckSchema = CheckSchema> {
    /** Schema version of this shape; see `VERSIONING.md`. */
    readonly version: 1;
    /** ISO 8601 timestamp of when the run began. */
    readonly startedAt: string;
    /** ISO 8601 timestamp of when the last check finished. */
    readonly completedAt: string;
    /** Wall-clock time for the run as a whole, in milliseconds. */
    readonly durationMs: number;
    /** Each configured check's evidence, keyed by check id. */
    readonly checks: {
        readonly [K in keyof TChecks]: CheckEvidence;
    };
}

/** The part of a config `explainTier` reads. A config built by a tier carries `tier`. */
export declare interface ExplainableConfig {
    readonly checks: Readonly<Record<string, unknown>>;
    readonly tier?: unknown;
}

/** What a config is compared against: a tier's defaults, or a stricter standard such as IPC's. */
export declare interface ExplainBaseline {
    /** A name for the rendered output, such as `"strict"`. */
    readonly name: string;
    /** The check ids the baseline turns on. */
    readonly checks: readonly string[];
    readonly settings: TierSettings;
    readonly planned: readonly PlannedCheck[];
}

/** One check in the config, as `explain` reports it. */
export declare interface ExplainedCheck {
    readonly id: string;
    /** `"tier"` when the baseline turns the check on; `"added"` when only the config does. */
    readonly source: "tier" | "added";
    /** `false` when the tier's overrides turned the check off. */
    readonly enabled: boolean;
    /** The numeric settings in force, as `explain` knows them from the tier metadata. */
    readonly settings: Readonly<Record<string, number>>;
    readonly loosened: readonly Loosening[];
}

/**
 * Lists what a config runs and every setting looser than the baseline. Without a baseline it
 * compares against the defaults of the tier the config carries. Settings come from the tier
 * metadata alone: a check replaced by hand keeps the metadata's settings, and a config without
 * metadata has its checks compared but not its settings.
 * @param config - a config, usually one spread from a tier.
 * @param baseline - what to compare against; defaults to the config's own tier.
 * @returns the explanation.
 * @beta
 */
export declare function explainTier(config: ExplainableConfig, baseline?: ExplainBaseline): TierExplanation;

/**
 * `app` plus Packaging, TypeResolution, BundledDependencies and QuickStart: what keeps a package
 * working for the people who install it. On a `private: true` package these four pass as not
 * applicable.
 * @param overrides - options per check id, or `false` to turn a check off.
 * @returns the checks and the tier's metadata, to spread into `defineRepoContract`.
 * @throws {TypeError} on overrides that are not an object, an override for a check the tier
 * lacks, or one that is neither `false` nor an options object the check accepts.
 * @beta
 */
export declare function library(overrides?: TierOverrides<LibraryCheckId>): TierConfig<LibraryCheckId>;

/** The checks that only matter to a package someone installs. On a `private: true` package they pass as not applicable. */
export declare const LIBRARY_ONLY_CHECKS: readonly TierCheckId[];

/** The checks `library` turns on: `app` plus what keeps a package working for the people who install it. */
export declare type LibraryCheckId = AppCheckId | "Packaging" | "TypeResolution" | "BundledDependencies" | "QuickStart";

/**
 * Static analysis via ESLint, using whatever `eslint.config.js` the
 * consumer's repository already has. This preset assumes nothing about
 * rule configuration, only how to run the tool and read its JSON output.
 * Severity `2` (error) blocks. Severity `1` (warning) is reported but
 * never blocks. ESLint's severities already encode that distinction, and
 * this preset keeps it instead of treating every finding as blocking.
 * @param options - configuration for this check; see {@link LintOptions}.
 * @returns the configured check.
 * @throws {TypeError} when `options` is not an object.
 * @beta
 */
declare function lint(options?: LintOptions): CheckDefinitionConfig;

/** Options accepted by {@link lint}. */
declare interface LintOptions {
    /** Path (or glob) passed straight through to ESLint as its positional target. Defaults to `"."`: narrow it (e.g. `"src"`) to scope linting to your source tree. */
    readonly path?: string;
}

/** One setting looser than the baseline, or a baseline check turned off (`setting: "enabled"`). */
export declare interface Loosening {
    readonly check: string;
    readonly setting: string;
    readonly baseline: number | boolean | undefined;
    readonly value: number | boolean | undefined;
}

/**
 * Every numeric setting `explain` compares. Coverage and the mutation score are stricter higher.
 * The duplication budget and the CRAP and complexity ceilings are stricter lower. A check turned
 * off is always looser, and needs no rule.
 */
export declare const LOOSENING_RULES: readonly LooseningRule[];

/** Which way a setting gets stricter. */
export declare type LooseningDirection = "higher-is-stricter" | "lower-is-stricter";

/** One numeric setting `explain` compares, and which way it gets stricter. */
export declare interface LooseningRule {
    readonly check: TierCheckId & keyof TierSettings;
    readonly setting: string;
    readonly direction: LooseningDirection;
}

/** Options accepted by {@link markdownlint}. */
declare interface MarkdownlintOptions {
    /** Glob passed straight through to markdownlint-cli2 as its positional target. Defaults to `"**\/*.md"`. Ignored when `globs` is set. */
    readonly glob?: string;
    /** Globs passed to markdownlint-cli2 in place of `glob`. Explicit globs such as `["*.md", "docs/**\/*.md"]` keep the run out of `node_modules`. */
    readonly globs?: readonly string[];
    /** A markdownlint config file, passed as `--config`. */
    readonly config?: string;
    /** How the verdict is read. `"json"` (the default) reads the JSON formatter's report file. `"exit-code"` reads the exit code and printed output, so no formatter is needed. */
    readonly verdict?: "json" | "exit-code";
}

/** Options accepted by {@link mutation}. */
declare interface MutationOptions {
    /** The lowest mutation score that passes, in percent. `100` demands every mutant detected or recorded. Defaults to `80`. */
    readonly minScore?: number;
    /** The registry of hand-verified mutants. Defaults to `".repo-contract/exceptions/mutation.json"`; `false` reads none. */
    readonly registry?: string | false;
    /** Mutate one slice, written `<index>/<total>`. A sharded run cannot call a record stale. */
    readonly shard?: string;
    /** Mutate only these files. An empty list passes with nothing to mutate. */
    readonly mutate?: readonly string[];
    /** Judge this Stryker report and mutate nothing, such as the merged report of a sharded run. */
    readonly report?: string;
    /** Reuse a clean run while nothing it depends on has changed. Defaults to `"off"`; a CI run should keep it off. */
    readonly cache?: "read-write" | "read-only" | "off";
    /** The Stryker config file. Defaults to the first `stryker.config.*` or `stryker.conf.*` found. */
    readonly config?: string;
    /** Re-run at most this many timed-out mutants alone before a timeout counts. Defaults to `5`. */
    readonly confirmTimeouts?: number;
    /** Time the whole run may take, in milliseconds. */
    readonly timeoutMs?: number;
    /**
     * Patch `@stryker-mutator/vitest-runner` when Vitest 5 needs it. Defaults to `true`. The patch
     * changes the runner's test-name separator to Vitest 5's (stryker-js#6210). Without it, every
     * mutant runs 0 tests. Only an install inside the project is patched. `false` passes
     * `--no-patch-vitest-runner`.
     */
    readonly patchVitestRunner?: boolean;
}

/** Options accepted by {@link npmScript}. */
declare interface NpmScriptOptions {
    /** The npm script to run. */
    readonly script: string;
    /** The name rationales use. Defaults to the script name. */
    readonly label?: string;
    /** When package.json has no such script: `"skip"` (the default) passes as not applicable; `"fail"` fails. */
    readonly whenMissing?: "skip" | "fail";
    /** Paths the script must leave byte-identical. Set them for a script that regenerates committed files: a change means the committed copy is stale. */
    readonly mustNotChange?: readonly string[];
    /** Time the script may take, in milliseconds. */
    readonly timeoutMs?: number;
}

/**
 * Output interpretation a check can explicitly request. No format requested means no parsing:
 * the consumer gets raw stdout/stderr only. Other formats (e.g. YAML) are left out on purpose:
 * JSON and plain text cover every check this package or its consumers run. A check whose tool
 * emits another format converts it in its `run` step. Or its `policy` function reads it with a
 * library the check already depends on. That keeps this package free of an optional peer
 * dependency carried on everyone's behalf.
 * @public
 */
declare type OutputFormat = "json" | "text";

/**
 * The result of a check's requested output-format parse: either a successful `ParsedOutputSuccess`, or a `ParsedOutputFailure`.
 * @public
 */
declare type ParsedOutput<T> = ParsedOutputSuccess<T> | ParsedOutputFailure;

/**
 * A requested parse of a check's stdout failed. The raw stdout on the
 * parent `CheckEvidence` is preserved unchanged: a parse failure is never
 * silently reinterpreted or discarded.
 * @public
 */
declare interface ParsedOutputFailure {
    /** The format that was requested (and failed to parse). */
    readonly format: OutputFormat;
    /** Always `false`. */
    readonly success: false;
    /** The parse error's message. */
    readonly error: string;
}

/**
 * A requested parse of a check's stdout succeeded.
 * @public
 */
declare interface ParsedOutputSuccess<T> {
    /** The format that was requested and successfully parsed. */
    readonly format: OutputFormat;
    /** Always `true`. */
    readonly success: true;
    /** The parsed value. */
    readonly value: T;
}

/** A check a tier will turn on later, with the tier it belongs to and why it waits. */
export declare interface PlannedCheck {
    readonly id: PlannedCheckId;
    readonly tier: TierName;
    readonly reason: string;
}

/** General checks a tier will turn on in a later minor release. `explain` lists them so no tier looks more complete than it is. */
export declare type PlannedCheckId = "DocsFragments" | "GithubActions" | "GitHygiene" | "PackedConsumer" | "EngineMatrix" | "Suppressions" | "SecurityDevDeps" | "CleanCheckout";

/**
 * @param name - the tier.
 * @returns the planned checks at this tier and below.
 * @throws {TypeError} when `name` is not one of {@link TIER_NAMES}.
 */
export declare function plannedChecks(name: TierName): readonly PlannedCheck[];

/**
 * A repository-owned decision about whether one check's evidence is
 * acceptable. It returns a `PolicyResult`, never a bare boolean or string.
 * So a policy can communicate more than pass/fail, even when the run is
 * otherwise acceptable (see `PolicyResult`/`PolicyOutcome`). It may be
 * synchronous or return a `Promise`. repo-contract stores and surfaces
 * `rationale` verbatim and does not interpret it. The package has no
 * opinion about what makes a check pass, fail, or warrant a `warn`.
 * @public
 */
declare type Policy<TChecks extends CheckSchema = CheckSchema> = (ctx: PolicyContext<TChecks>) => PolicyResult | Promise<PolicyResult>;

/**
 * What a check's `policy` function is called with. `result` is that check's
 * evidence. `evidence` is the complete run's evidence, including every
 * sibling check, so a policy can make cross-check decisions (e.g. "only
 * enforce the mutation-score threshold if the tests check passed"). Before
 * any policy runs, every check has finished executing and every check's
 * evidence has been assembled. No policy ever observes a partially-populated
 * `evidence` (see specs/architecture.md).
 * @public
 */
declare interface PolicyContext<TChecks extends CheckSchema = CheckSchema> {
    /** This check's evidence. */
    readonly result: CheckEvidence;
    /** The complete run's evidence, including every sibling check. */
    readonly evidence: Evidence<TChecks>;
    /**
     * This check's declared `dependsOn` dependencies' evidence, keyed by
     * check id. It is a convenience view, fully derivable from
     * `evidence.checks` plus this check's `dependsOn`, so no policy has to do
     * that lookup itself. It is `{}` for a check with no `dependsOn`: always
     * an object, never `undefined`. That matches how `evidence.checks` is used
     * (a policy narrows a specific key's presence, never the field itself).
     * It holds evidence only, not policy outcomes. A dependency's policy
     * result stays visible only via the top-level `Verdict`. That keeps
     * policy evaluation fully parallel and unaffected by `dependsOn`.
     */
    readonly dependencies: Readonly<Record<string, CheckEvidence>>;
}

/**
 * `"pass"`: the repository-owned policy evaluated the captured evidence as
 * satisfying its configured requirements. `"fail"`: the evidence did not
 * satisfy them. `"warn"`: the evidence does not violate the policy's
 * blocking requirements, but the policy decided the condition matters and
 * wants it surfaced. It is not a synonym for "minor failure". A `warn` never
 * fails `Verdict.passed` (see `runPolicies` in `src/policy/run-policies.ts`).
 * @public
 */
declare type PolicyOutcome = "pass" | "fail" | "warn";

/**
 * A repository-owned policy's interpretation of one check's captured
 * evidence. It is a plain object of primitives, never an `Error`, class
 * instance, function or tool-specific object. So it can be persisted,
 * transmitted, aggregated across parallel checks, and read by a human or an
 * AI without rerunning anything.
 *
 * `rationale` is mandatory. It must hold enough actionable detail (specific
 * file/line locations, rule ids, test names, counts) to explain *why* the
 * policy reached its outcome. A consumer should need nothing but this value.
 * A rationale like "see output above" or "check the report for details"
 * defeats the purpose. It sends the consumer back to raw command output,
 * which this type exists to avoid. `runPolicies` rejects such a rationale at
 * runtime (`src/policy/run-policies.ts`'s `VAGUE_RATIONALE_PATTERNS`, ADR
 * 0016), the same as any other malformed `PolicyResult`. So a check that
 * regresses to a vague deferral fails loudly instead of shipping silently.
 * specs/architecture.md describes the split this type is built around.
 * Evidence answers "what happened?". `rationale` answers "what does the
 * repository's policy conclude about what happened?". A policy's `outcome`
 * is not the final word: a human or AI consumer still judges using both.
 * @public
 */
declare interface PolicyResult {
    /** The policy's pass/fail/warn decision. */
    readonly outcome: PolicyOutcome;
    /** Why the policy reached `outcome`, in enough detail to act on without rerunning anything. */
    readonly rationale: string;
}

/** Options accepted by {@link quickStart}. */
declare interface QuickStartOptions {
    /** The Markdown file that holds the marked quick start, relative to the working directory. Defaults to `"README.md"`. */
    readonly readme?: string;
    /** Time all of the quick start's commands together may take, in milliseconds. Defaults to `300000` (five minutes). */
    readonly timeoutMs?: number;
}

/**
 * Renders an explanation for a person: each check with its settings, then the loosened settings
 * under their own heading, then the planned checks.
 * @param explanation - what {@link explainTier} returned.
 * @param options - the format and heading.
 * @returns the text, ending in a newline.
 * @beta
 */
export declare function renderExplain(explanation: TierExplanation, options?: RenderExplainOptions): string;

/** Options for {@link renderExplain}. */
export declare interface RenderExplainOptions {
    /** `"text"` for a terminal (the default), `"markdown"` for a report or step summary. */
    readonly format?: "text" | "markdown";
    /** The heading over the loosened settings. Defaults to `"Loosened"`. */
    readonly heading?: string;
}

/** Options accepted by {@link securityDeps}. */
declare interface SecurityDepsOptions {
    /**
     * The exception registry, such as `".repo-contract/exceptions/security-deps.json"`. With one, a
     * `critical` advisory still fails, and a lower one passes only while a complete record accepts
     * it. The check writes a blank record for each new advisory and fails on a record whose advisory
     * is gone. An `info` finding warns and gets no record. Defaults to `false`: no registry,
     * so any low, moderate, high or critical advisory fails.
     */
    readonly registry?: string | false;
}

/** How a configured value compares with its baseline. */
export declare type SettingComparison = "stricter" | "same" | "looser";

/**
 * Hand-vendored from `@standard-schema/spec@1.1.0` (standardschema.dev), pinned
 * 2026-09-04. See specs/decisions/0012-hand-vendored-standard-schema-support-for-optional-output-validation.md
 * for why this is vendored rather than installed, and for the version-pin/re-diff process. Pure
 * type declarations, zero runtime code: assigning a Zod/Valibot/ArkType (etc.) schema to this
 * type costs nothing at runtime. Only `StandardSchemaV1` (validation) is vendored here. The
 * separate, optional `StandardJSONSchemaV1` (JSON Schema conversion) extension
 * (standardschema.dev/json-schema) is out of scope; see the ADR.
 *
 * Upstream's `StandardSchemaV1.Props` extends a shared `StandardTypedV1.Props` base
 * (`version`/`vendor`/`types`). This vendored copy inlines those fields into one flat
 * interface, since repo-contract has no use for the shared base alone. It is structurally
 * identical for any library schema object assigned to it. Re-diff against
 * `@standard-schema/spec`'s published `dist/index.d.ts` whenever this file is touched.
 *
 * Tagged `@public`, not tied to either re-exporting barrel's stability tier. This type is
 * re-exported from the root barrel, for `output.schema`, and from the
 * `repo-contract/helpers` barrel. This vendored copy's shape changes only through a
 * deliberate re-diff against the pinned upstream spec version above. It never changes as a side
 * effect of either barrel's stability classification.
 * @public
 */
declare interface StandardSchemaV1<Input = unknown, Output = Input> {
    /** The Standard Schema properties. */
    readonly "~standard": StandardSchemaV1.Props<Input, Output>;
}

/**
 * Namespaced members of `StandardSchemaV1`: `Props`, `Result`, `SuccessResult`, `FailureResult`,
 * `Issue`, `PathSegment`, `Types`, `InferInput`, `InferOutput`.
 * @public
 */
declare namespace StandardSchemaV1 {
    /** The Standard Schema properties interface. */
    interface Props<Input = unknown, Output = Input> {
        /** The version number of the standard. */
        readonly version: 1;
        /** The vendor name of the schema library. */
        readonly vendor: string;
        /** Validates unknown input values. */
        readonly validate: (value: unknown, options?: Options) => Result<Output> | Promise<Result<Output>>;
        /** Inferred types associated with the schema. */
        readonly types?: Types<Input, Output> | undefined;
    }
    /** Options passable to `validate`. */
    interface Options {
        /** Explicit support for additional vendor-specific parameters, if needed. */
        readonly libraryOptions?: Record<string, unknown> | undefined;
    }
    /** The result interface of the validate function. */
    type Result<Output> = SuccessResult<Output> | FailureResult;
    /** The result interface if validation succeeds. */
    interface SuccessResult<Output> {
        /** The typed output value. */
        readonly value: Output;
        /** A falsy value for `issues` indicates success. */
        readonly issues?: undefined;
    }
    /** The result interface if validation fails. */
    interface FailureResult {
        /** The issues of failed validation. */
        readonly issues: readonly Issue[];
    }
    /** The issue interface of the failure output. */
    interface Issue {
        /** The error message of the issue. */
        readonly message: string;
        /** The path of the issue, if any. */
        readonly path?: readonly (PropertyKey | PathSegment)[] | undefined;
    }
    /** The path segment interface of the issue. */
    interface PathSegment {
        /** The key representing a path segment. */
        readonly key: PropertyKey;
    }
    /** The Standard Schema types interface. */
    interface Types<Input = unknown, Output = Input> {
        /** The input type of the schema. */
        readonly input: Input;
        /** The output type of the schema. */
        readonly output: Output;
    }
    /** Infers the input type of a Standard Schema. */
    type InferInput<Schema extends StandardSchemaV1> = NonNullable<Schema["~standard"]["types"]>["input"];
    /** Infers the output type of a Standard Schema. */
    type InferOutput<Schema extends StandardSchemaV1> = NonNullable<Schema["~standard"]["types"]>["output"];
}

/**
 * `library` plus Crap (30, complexity 20), DistNoUrls, DocsMarkdown, Commits and Mutation (score
 * 80, no unconfirmed Timeout). Coverage rises to 80% on all four metrics and Duplication falls to
 * 0.75%.
 * @param overrides - options per check id, or `false` to turn a check off.
 * @returns the checks and the tier's metadata, to spread into `defineRepoContract`.
 * @throws {TypeError} on overrides that are not an object, or an override that is neither
 * `false` nor an options object the check accepts.
 * @beta
 */
export declare function strict(overrides?: TierOverrides): TierConfig<StrictCheckId>;

/** The checks `strict` turns on: `library` plus general rigor that costs time. */
export declare type StrictCheckId = LibraryCheckId | "Mutation" | "Crap" | "DistNoUrls" | "DocsMarkdown" | "Commits";

/**
 * Builds a tier chosen at run time, as `init --preset <tier>` and `explain` do.
 * @param name - the tier.
 * @param overrides - options per check id, or `false` to turn a check off.
 * @returns the checks and the tier's metadata.
 * @throws {TypeError} on an unknown tier, overrides that are not an object, an override for a
 * check the tier lacks, or one that is neither `false` nor an options object the check accepts.
 * @beta
 */
export declare function tier(name: TierName, overrides?: TierOverrides): TierConfig<TierCheckId>;

/** The tier names, loosest first. */
export declare const TIER_NAMES: readonly TierName[];

/**
 * @param name - a tier.
 * @returns that tier's defaults as a baseline.
 * @beta
 */
export declare function tierBaseline(name: TierName): ExplainBaseline;

/**
 * One check as a tier builds it. `dependsOn` is narrowed to the tier's other ids, which is what
 * lets `defineRepoContract` accept a spread tier.
 */
export declare type TierCheck<Dependency extends string> = CheckDefinitionConfig & {
    readonly dependsOn?: readonly Dependency[];
};

/** Every check id a tier can turn on. The ids are PascalCase so a stricter config can replace one by id. */
export declare type TierCheckId = StrictCheckId;

/**
 * What each check accepts in a tier's overrides object. `never` means the check takes no options,
 * so the only override is `false`.
 */
export declare interface TierCheckOptions {
    readonly Format: never;
    readonly Lint: NonNullable<Parameters<typeof lint>[0]>;
    readonly Typecheck: never;
    readonly Tests: never;
    readonly SecuritySecrets: never;
    readonly SecurityDeps: SecurityDepsOptions;
    readonly Build: Partial<NpmScriptOptions>;
    readonly DeadCode: NonNullable<Parameters<typeof deadCode>[0]>;
    readonly Duplication: DuplicationOptions;
    readonly Licenses: never;
    readonly DocsLinks: BrokenLinksOptions;
    readonly Coverage: CoverageOptions;
    readonly Packaging: never;
    readonly TypeResolution: ArethetypeswrongOptions;
    readonly BundledDependencies: never;
    readonly QuickStart: QuickStartOptions;
    readonly Mutation: MutationOptions;
    readonly Crap: CrapOptions;
    readonly DistNoUrls: DistNoUrlsOptions;
    readonly DocsMarkdown: MarkdownlintOptions;
    readonly Commits: NonNullable<Parameters<typeof commitlint>[0]>;
}

/** Every check of a tier, keyed by id, in schedule order. */
export declare type TierChecks<Id extends TierCheckId> = {
    readonly [K in Id]: TierCheck<Exclude<Id, K>>;
};

/**
 * @param name - the tier.
 * @returns every check the tier turns on, the checks of the tiers below it first, in schedule order.
 * @throws {TypeError} when `name` is not one of {@link TIER_NAMES}.
 */
export declare function tierChecks(name: TierName): readonly TierCheckId[];

/** What a tier function returns. Spread it into `defineRepoContract` next to `spawn` and `env`. */
export declare interface TierConfig<Id extends TierCheckId> {
    readonly checks: TierChecks<Id>;
    readonly tier: TierMetadata;
}

/** One tier's own definition: what it adds to the tier it extends, and its default settings. */
export declare interface TierDefinition {
    readonly name: TierName;
    /** The tier this one builds on; `undefined` for `basic`. */
    readonly extends: TierName | undefined;
    /** The checks this tier adds, in schedule order. */
    readonly adds: readonly TierCheckId[];
    /** The default settings at this tier. */
    readonly settings: TierSettings;
    /** The planned checks that belong to this tier. */
    readonly planned: readonly PlannedCheck[];
}

/**
 * Each tier's own definition. A tier's full check list is its `adds` after every tier it extends.
 * @param name - the tier.
 * @returns its definition.
 * @throws {TypeError} when `name` is not one of {@link TIER_NAMES}.
 */
export declare function tierDefinition(name: TierName): TierDefinition;

/** What `explainTier` returns, and what `repo-contract explain --json` prints. */
export declare interface TierExplanation {
    readonly schemaVersion: 1;
    /** The tier the config was built from, or `undefined` when it carries no tier metadata. */
    readonly tier: TierName | undefined;
    /** The baseline's name, or `undefined` when there was nothing to compare against. */
    readonly baseline: string | undefined;
    readonly checks: readonly ExplainedCheck[];
    /** Baseline checks the config does not contain at all. */
    readonly missing: readonly string[];
    /** Every loosening, in check order. */
    readonly loosened: readonly Loosening[];
    readonly planned: readonly PlannedCheck[];
}

/**
 * What a tier records about itself. It rides along on the config as `tier`, which
 * `validateRepoContractConfig` ignores, so `explain` can read it back.
 */
export declare interface TierMetadata {
    readonly name: TierName;
    /** The overrides object exactly as passed. */
    readonly overrides: TierOverrides;
    /** The ids the tier put in `checks`, in schedule order, turned-off ones included. */
    readonly checks: readonly TierCheckId[];
    /** The ids the overrides turned off. */
    readonly off: readonly TierCheckId[];
    /** The settings in force: the tier's defaults with the overrides applied. */
    readonly settings: TierSettings;
    /** Planned checks at this tier and below. */
    readonly planned: readonly PlannedCheck[];
}

/** The four tiers, loosest first. Each tier holds every check of the tier before it. */
export declare type TierName = "basic" | "app" | "library" | "strict";

/**
 * The one overrides object a tier takes, keyed by check id. Options replace the tier's options for
 * that check. `false` turns the check off: it stays in the config and passes with a rationale that
 * names the override, so the run still shows it.
 */
export declare type TierOverrides<Id extends TierCheckId = TierCheckId> = {
    readonly [K in Id]?: TierCheckOptions[K] | false;
};

/** The numeric settings `explain` compares against a baseline. */
export declare interface TierSettings {
    /** Minimum coverage per metric. A metric left out is not judged. */
    readonly Coverage: {
        readonly lines?: number;
        readonly statements?: number;
        readonly functions?: number;
        readonly branches?: number;
    };
    /** The largest duplicated share of scanned lines, in percent. */
    readonly Duplication: {
        readonly maxPercentage: number;
    };
    /** The CRAP ceiling and the cyclomatic-complexity ceiling per function. */
    readonly Crap: {
        readonly threshold: number;
        readonly maxComplexity: number;
    };
    /** The lowest mutation score that passes, in percent. */
    readonly Mutation: {
        readonly minScore: number;
    };
}

/**
 * A tier's setting for a check it does not run is that preset's own default: what the preset
 * judges when added by hand with no options.
 * @param name - the tier.
 * @returns the tier's default settings.
 * @throws {TypeError} when `name` is not one of {@link TIER_NAMES}.
 */
export declare function tierSettings(name: TierName): TierSettings;

export { }
