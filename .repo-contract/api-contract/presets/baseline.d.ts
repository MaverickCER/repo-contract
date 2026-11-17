/**
 * Ready-made checks for common TypeScript and JavaScript tools. Spread a preset into your
 * `checks` record and override what you need, most often `policy`.
 *
 * A preset encodes how to run and read one tool, never what counts as good enough
 * (specs/decisions/0004-public-surface-stays-narrow-no-cli-experimental-presets.md). To change
 * what a factory preset runs, pass it options; overriding `run` directly is the escape hatch.
 *
 * Experimental, and published under its `./presets` subpath. It is never re-exported from the
 * package root, and it re-exports nothing from there.
 * @packageDocumentation
 */

/**
 * An AI review as a check. It runs your agent with a prompt that asks for one fixed JSON shape,
 * {@link AiReviewReply}. Every finding carries a confidence score, and the check gates on them. A
 * model can answer differently on every run, so the policy reads only that structured reply,
 * never prose.
 *
 * The output is read in three steps. The whole output is parsed as JSON. If that fails, the text
 * from its first `{` to its last `}` is parsed. If that fails too, or the JSON is not the
 * requested shape, `fallback` is judged in its place and the reason lists the problems.
 *
 * The verdict is `fail` when an `error` finding scores at or above `errorThreshold`. It is `warn`
 * for any other `warn` or `error` finding, including the default fallback. It is `pass` for `info`
 * findings only. Each reason lists every `warn` and `error` finding with its file, line, rule and
 * confidence.
 * A timeout, a missing agent or a process killed by a signal fails. A non-zero exit code alone
 * does not: a well-formed reply still counts, and an unreadable one names the code. The tests prove
 * the parsing and the policy; they do not prove a model's judgement.
 * @param options - The agent to run and how to judge it; see {@link AiReviewOptions}.
 * @returns The configured check.
 * @throws {TypeError} When `options` is not an object.
 * @example
 * ```ts
 * aiReview: aiReview({
 *   agent: ["claude", "-p", "{prompt}"],
 *   credentials: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY },
 *   errorThreshold: 0.8,
 * }),
 * ```
 * @beta
 */
export declare function aiReview(options: AiReviewOptions): CheckDefinitionConfig;

/**
 * One finding in an AI reviewer's reply.
 * @beta
 */
export declare interface AiReviewFinding {
    /** A short name for the concern, such as `no-logging-in-library`. */
    readonly rule: string;
    /** The file the finding is about, relative to the repository root. `""` when it is about no one file. */
    readonly file: string;
    /** The 1-based line in `file`, or `0` when the finding has no single line. */
    readonly line: number;
    /** `error` for a defect, `warn` for a concern, `info` for a remark. Only `error` can fail the check. */
    readonly severity: "info" | "warn" | "error";
    /** The reviewer's confidence that the finding is real, from 0 to 1. */
    readonly score: number;
    /** What is wrong and why, in the reviewer's words. */
    readonly reason: string;
}

/**
 * Options accepted by {@link aiReview}. Only `agent` is required.
 * @beta
 */
export declare interface AiReviewOptions {
    /**
     * The agent's command line: its executable, then its arguments, for example
     * `["claude", "-p", "{prompt}"]`. Every `{prompt}` inside an argument becomes the prompt. With no
     * `{prompt}`, the prompt is appended as the last argument. The evidence records this command line.
     */
    readonly agent: readonly string[];
    /**
     * What the agent is asked. A string is the prompt text. `{ file }` hands the agent that path in
     * place of the text, for an agent that reads its prompt from a file. The default prompt asks for
     * {@link AiReviewReply} and shows an example of it. A replacement must ask for the same shape, or
     * every reply goes to `fallback`.
     */
    readonly prompt?: string | {
        readonly file: string;
    };
    /** Files the review is limited to, listed at the end of a string prompt. Empty by default: the agent reviews the repository's changes. */
    readonly files?: readonly string[];
    /**
     * Environment variables the agent authenticates with, by name, for example
     * `{ ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY }`. Each value reaches the agent's process
     * through the check's `env`, so it works when the runner sets `inheritEnv: false`. A value never
     * enters the command line, and every occurrence of it in a reason is replaced with `[redacted]`.
     * The evidence keeps the agent's stdout and stderr, so a value the agent prints lands there.
     * A name whose value is `undefined` or `""` is left unset and turns a `pass` into a `warn`.
     */
    readonly credentials?: Readonly<Record<string, string | undefined>>;
    /** An `error` finding at or above this confidence fails the check; below it, the finding warns. From 0 to 1. Defaults to `0.8`. */
    readonly errorThreshold?: number;
    /**
     * The review used when the output cannot be parsed into an {@link AiReviewReply}. Defaults to one
     * `warn` finding (rule `unparsed-output`, score 1) whose reason is "the reviewer's output could
     * not be parsed", so an unusable reply never passes silently. An `error` finding at score 1 here
     * makes an unusable reply fail the check.
     */
    readonly fallback?: AiReviewReply;
    /** How the reasons name the reviewer. Defaults to `"The AI reviewer"`. */
    readonly label?: string;
    /** Milliseconds before the agent's process is stopped and the check fails. Defaults to `600_000` (10 minutes). */
    readonly timeoutMs?: number;
    /** The agent's working directory. Defaults to the runner's. */
    readonly cwd?: string;
}

/**
 * The JSON reply {@link aiReview} asks the reviewer for, and the shape of its `fallback`.
 * @beta
 */
export declare interface AiReviewReply {
    /** Every finding, in any order. Empty when the reviewer found nothing. */
    readonly findings: readonly AiReviewFinding[];
    /** The reviewer's confidence in the change as a whole, from 0 to 1. The policy gates on `findings` only. */
    readonly summary: {
        readonly score: number;
    };
}

/**
 * Published-package type-resolution correctness via `@arethetypeswrong/cli`.
 * @param options - configuration for this check; see {@link ArethetypeswrongOptions}.
 * @returns the configured check.
 * @throws {TypeError} when `options` is not an object.
 * @throws {RangeError} when `ignoreResolutions` names a resolution attw does not use.
 * @beta
 */
export declare function arethetypeswrong(options?: ArethetypeswrongOptions): CheckDefinitionConfig;

/** Options accepted by {@link arethetypeswrong}. */
export declare interface ArethetypeswrongOptions {
    /** Resolutions whose problems are dropped before judging. `["node10"]` suits a package that supports only `exports`-aware resolution. Defaults to none. */
    readonly ignoreResolutions?: readonly AttwResolutionKind[];
}

/** A module resolution attw judges a package under. */
export declare type AttwResolutionKind = "node10" | "node16-cjs" | "node16-esm" | "bundler";

/**
 * Broken-link detection via linkinator, recursing through local files and following both local
 * and remote links. `--skip node_modules` avoids wasting the crawl on vendored files that were
 * never authored content. A link that answered HTTP 429 passes, since a rate limit says nothing
 * about whether the page exists. A local link linkinator could not serve passes when it exists
 * on disk, resolved from the working directory: linkinator reports a bare directory link as
 * broken, though every git host renders it.
 * @param options - configuration for this check; see {@link BrokenLinksOptions}.
 * @returns the configured check.
 * @throws {TypeError} when `options` is not an object.
 * @throws {RangeError} when `start` is an empty list.
 * @beta
 */
export declare function brokenLinks(options?: BrokenLinksOptions): CheckDefinitionConfig;

/** Options accepted by {@link brokenLinks}. */
export declare interface BrokenLinksOptions {
    /**
     * Where the crawl starts. A string is one HTML start point. Defaults to `"."`. A list runs one
     * crawl over every start point, served from the working directory. linkinator's Markdown mode
     * is all or nothing, so one `"markdown"` start turns it on for the whole crawl.
     */
    readonly start?: string | readonly BrokenLinksStart[];
}

/** One place a crawl starts, and how its files are read. */
export declare interface BrokenLinksStart {
    /** A file or directory, relative to the working directory. */
    readonly path: string;
    /** `"markdown"` follows links in Markdown files; `"html"` (the default) reads HTML only. */
    readonly mode?: "html" | "markdown";
}

/**
 * Fails when package.json bundles a package (`bundleDependencies` or `bundledDependencies`) that
 * its `dependencies` do not declare. npm writes each such name into the published registry
 * manifest as `"*"`, and supply-chain scanners such as Socket report the mismatch as manifest
 * confusion. Passes a package that bundles nothing. Reads package.json in the working directory
 * with `node -e`; no external tool.
 * @beta
 */
export declare const bundledDependencies: CheckDefinitionConfig;

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
export declare function commitlint(options?: CommitlintOptions): CheckDefinitionConfig;

/** Options accepted by {@link commitlint}. */
declare interface CommitlintOptions {
    /** The ref commitlint lints commits *from* (exclusive). Defaults to `"origin/main"`. */
    readonly from?: string;
    /** The ref commitlint lints commits *to* (inclusive). Defaults to `"HEAD"`. */
    readonly to?: string;
}

/**
 * Package-wide test coverage, read from the `json-summary` report a test run wrote. It runs no
 * tests: declare `dependsOn` on the check that does. Fails on any judged metric below its
 * threshold, and when the report is missing or unreadable. Warns, not evaluated, when a check it
 * depends on failed: that check is already red, and its coverage would describe a broken run.
 * @param options - configuration for this check; see {@link CoverageOptions}.
 * @returns the configured check.
 * @throws {TypeError} when `options` is not an object.
 * @throws {RangeError} when `thresholds` is not an object of metrics from 0 to 100.
 * @beta
 */
export declare function coverage(options?: CoverageOptions): CheckDefinitionConfig;

/** Options accepted by {@link coverage}. */
export declare interface CoverageOptions {
    /** Defaults to 80 on lines and statements. Given, it replaces the default whole. */
    readonly thresholds?: CoverageThresholds;
    /** The `json-summary` report a test run wrote. Defaults to `"coverage/coverage-summary.json"`. */
    readonly summary?: string;
}

/** Minimum coverage per metric, in percent. A metric left out is not judged. */
export declare interface CoverageThresholds {
    readonly lines?: number;
    readonly statements?: number;
    readonly functions?: number;
    readonly branches?: number;
}

/**
 * No function both complex and poorly covered, via `@danibram/crap4ts`. Fails on a function above
 * the CRAP threshold or the complexity ceiling, and on an unreadable score. Reads the coverage a
 * test run wrote: declare `dependsOn` on that check. Warns, not evaluated, when a check it depends
 * on failed.
 *
 * crap4ts writes its report to a file, not stdout: it exits before a large report drains through a
 * pipe, which cuts the JSON at 64 KiB.
 * @param options - configuration for this check; see {@link CrapOptions}.
 * @returns the configured check.
 * @throws {TypeError} when `options` is not an object.
 * @throws {RangeError} when `threshold` or `maxComplexity` is not a finite number above 0.
 * @beta
 */
export declare function crap(options?: CrapOptions): CheckDefinitionConfig;

/** Options accepted by {@link crap}. */
export declare interface CrapOptions {
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
export declare function deadCode(options?: DeadCodeOptions): CheckDefinitionConfig;

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

/**
 * Fails when any URL (any scheme followed by a colon and two slashes) appears in any file of the
 * build output directory. Supply-chain scanners that flag shipped URLs then have nothing to flag
 * (Socket.dev's "URL strings" alert, for one). Scans every file, sourcemaps and declaration files
 * included. Individual URLs can be allowed with a mandatory, reviewable `reason`; there is no
 * blanket opt-out.
 * @param options - configuration for this check; see {@link DistNoUrlsOptions}.
 * @returns the configured check.
 * @throws {TypeError} when `options` is not an object.
 * @beta
 */
export declare function distNoUrls(options?: DistNoUrlsOptions): CheckDefinitionConfig;

/** One allowlisted URL (glob) and the reviewable reason it may ship. */
export declare interface DistNoUrlsAllowEntry {
    /** A URL, or a glob (`*`, `**`, `?`, `[...]`, `{a,b}`; escape literals with `\`) matched against each whole URL found. */
    readonly url: string;
    /** Why this URL must ship in the build output. Required and non-empty: an allowlist entry without one fails the check. */
    readonly reason: string;
}

/** Options accepted by {@link distNoUrls}. */
export declare interface DistNoUrlsOptions {
    /** Build-output directory to scan, relative to the working directory. Defaults to `"dist"`. */
    readonly dir?: string;
    /** URLs permitted in the output, each with a reason. Empty by default: the strictest policy is the default. */
    readonly allow?: readonly DistNoUrlsAllowEntry[];
}

/**
 * Duplicated-code detection via jscpd.
 * @param options - configuration for this check; see {@link DuplicationOptions}.
 * @returns the configured check.
 * @throws {TypeError} when `options` is not an object.
 * @throws {RangeError} when `maxPercentage` is not a number from 0 to 100.
 * @beta
 */
export declare function duplication(options?: DuplicationOptions): CheckDefinitionConfig;

/** Options accepted by {@link duplication}. */
export declare interface DuplicationOptions {
    /** Directory to scan for duplicated code, passed straight through to jscpd as its positional target. Defaults to `"."`: narrow it (e.g. `"src"`) to scope the scan to your source tree. */
    readonly path?: string;
    /** The largest share of scanned lines that may be duplicated, in percent. A pass still lists every block. Defaults to `0`: any duplicated block fails. */
    readonly maxPercentage?: number;
}

/**
 * End-to-end test execution via Playwright, reading its JSON reporter output.
 * @beta
 */
export declare const e2e: CheckDefinitionConfig;

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

/**
 * Code formatting via Prettier, applied in place.
 * @beta
 */
export declare const format: CheckDefinitionConfig;

/**
 * Dependency license compliance via licensee. The repository's `.licensee.json` is the policy
 * when it exists; otherwise a dependency's license must be OSI-approved (`--osi`).
 * @beta
 */
export declare const license: CheckDefinitionConfig;

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
export declare function lint(options?: LintOptions): CheckDefinitionConfig;

/** Options accepted by {@link lint}. */
declare interface LintOptions {
    /** Path (or glob) passed straight through to ESLint as its positional target. Defaults to `"."`: narrow it (e.g. `"src"`) to scope linting to your source tree. */
    readonly path?: string;
}

/**
 * Markdown structure/style lint via markdownlint-cli2. The default `"json"` verdict reads a
 * report file whose path comes from config, not a CLI flag. markdownlint-cli2 writes JSON only
 * when its config asks for it, so this verdict assumes the consumer's `.markdownlint-cli2.jsonc`
 * includes:
 * ```jsonc
 * "outputFormatters": [["markdownlint-cli2-formatter-json", { "name": "reports/markdownlint.json" }]]
 * ```
 * which also requires the `markdownlint-cli2-formatter-json` package alongside
 * `markdownlint-cli2` itself. The `"exit-code"` verdict needs neither: it reads the exit code and
 * the printed findings.
 * @param options - configuration for this check; see {@link MarkdownlintOptions}.
 * @returns the configured check.
 * @throws {TypeError} when `options` is not an object.
 * @throws {RangeError} when `globs` is an empty list.
 * @beta
 */
export declare function markdownlint(options?: MarkdownlintOptions): CheckDefinitionConfig;

/** Options accepted by {@link markdownlint}. */
export declare interface MarkdownlintOptions {
    /** Glob passed straight through to markdownlint-cli2 as its positional target. Defaults to `"**\/*.md"`. Ignored when `globs` is set. */
    readonly glob?: string;
    /** Globs passed to markdownlint-cli2 in place of `glob`. Explicit globs such as `["*.md", "docs/**\/*.md"]` keep the run out of `node_modules`. */
    readonly globs?: readonly string[];
    /** A markdownlint config file, passed as `--config`. */
    readonly config?: string;
    /** How the verdict is read. `"json"` (the default) reads the JSON formatter's report file. `"exit-code"` reads the exit code and printed output, so no formatter is needed. */
    readonly verdict?: "json" | "exit-code";
}

/**
 * Mutation testing via Stryker, run through `repo-contract mutation run --json`. Fails below
 * `minScore`, on any Timeout still standing after it is re-run alone, and on an incomplete or
 * stale registry record. Killed, RuntimeError and CompileError count as detected; Ignored mutants
 * are left out of the score. A run in which a Survived mutant ran 0 tests fails: it proves nothing.
 *
 * The command always runs Stryker cold: it deletes the incremental file and passes `--force`.
 * @param options - configuration for this check; see {@link MutationOptions}.
 * @returns the configured check.
 * @throws {TypeError} when `options` is not an object.
 * @beta
 */
export declare function mutation(options?: MutationOptions): CheckDefinitionConfig;

/** Options accepted by {@link mutation}. */
export declare interface MutationOptions {
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

/**
 * Runs one of the package's own npm scripts as a check, through `repo-contract npm-script --json`.
 * Fails when the script exits non-zero, runs out of time, or changes a `mustNotChange` path. The
 * paths are hashed before and after, so the verdict does not depend on git state.
 * @param options - configuration for this check; see {@link NpmScriptOptions}.
 * @returns the configured check.
 * @throws {TypeError} when `options` is not an object.
 * @throws {RangeError} when `script` is blank or starts with `-`, a `mustNotChange` entry is not a
 * non-empty path that does not start with `-`, or `timeoutMs` is not a whole number above 0.
 * @beta
 */
export declare function npmScript(options: NpmScriptOptions): CheckDefinitionConfig;

/** Options accepted by {@link npmScript}. */
export declare interface NpmScriptOptions {
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

/**
 * publint has no machine-readable output mode: only a plain-text CLI
 * reporter (see its `src/cli.js` `formatMessages`). Its process exit
 * code reflects only 'error'-level findings; 'warning'/'suggestion'-level
 * findings never affect it. This preset reads the three section headers
 * publint's CLI writes ("Errors:", "Warnings:", "Suggestions:") to tell
 * blocking findings from non-blocking ones. It depends on no per-message
 * structure, which publint doesn't expose. Relevant only to repositories
 * that publish an npm package.
 * @beta
 */
export declare const publint: CheckDefinitionConfig;

/**
 * Runs the README's marked quick start, one line at a time, against the tarball npm would publish.
 * The commands run in an empty project: a directory holding only a package.json. The command that
 * installs this package installs the packed tarball instead. Fails when any command exits non-zero or the time
 * budget runs out, and when the README has no marked block. Mark the block by putting
 * `<!-- quick-start:begin -->` on the line before its fenced `sh` block and
 * `<!-- quick-start:end -->` on the line after it.
 *
 * Runs `repo-contract quick-start`, so the package must be built first, and the commands reach
 * whatever network they reach (an install usually reaches the registry).
 * @param options - configuration for this check; see {@link QuickStartOptions}.
 * @returns the configured check.
 * @throws {TypeError} when `options` is not an object.
 * @beta
 */
export declare function quickStart(options?: QuickStartOptions): CheckDefinitionConfig;

/** Options accepted by {@link quickStart}. */
export declare interface QuickStartOptions {
    /** The Markdown file that holds the marked quick start, relative to the working directory. Defaults to `"README.md"`. */
    readonly readme?: string;
    /** Time all of the quick start's commands together may take, in milliseconds. Defaults to `300000` (five minutes). */
    readonly timeoutMs?: number;
}

/**
 * Keeps a CycloneDX 1.6 SBOM of the package's locked dependencies current. It builds the document
 * from the npm lockfile with no external tool, deterministically: the same lockfile always gives
 * the same document. By default it writes nothing. It fails when a committed document is missing
 * or differs from what the lockfile gives. The comparison ignores only `serialNumber` and
 * `metadata.timestamp`. So a document another tool regenerated, or a reformatted one, still counts
 * as current when its content matches. With `write: true` it writes the documents instead, for a
 * regenerate command.
 *
 * The documents list every package in the lockfile's `packages` map. Each carries its purl, the
 * hashes from `integrity`, the declared license and the resolved URL. The full dependency graph
 * follows. The production document leaves out packages marked `dev`. It describes what the
 * lockfile pins, not what is installed in `node_modules`.
 * @param options - configuration for this check; see {@link SbomOptions}.
 * @returns the configured check.
 * @throws {TypeError} when `options` is not an object.
 * @throws {RangeError} when `lockfile`, `output` or `productionOutput` is not a non-empty path,
 * when `output` or `productionOutput` is spelled as the lockfile's path, or when `write` is not a
 * boolean.
 * @beta
 */
export declare function sbom(options?: SbomOptions): CheckDefinitionConfig;

/**
 * Options for {@link sbom}.
 * @beta
 */
export declare interface SbomOptions {
    /** The npm lockfile the SBOM is built from. It must have a `packages` map (lockfileVersion 2 or 3). Defaults to `"package-lock.json"`. */
    readonly lockfile?: string;
    /** The SBOM of every locked package, dev dependencies included (their `scope` is `"excluded"`). Defaults to `"docs/sbom.cdx.json"`. */
    readonly output?: string;
    /** The SBOM of what installing the package brings in: every locked package not marked `dev`. Defaults to `"docs/sbom.production.cdx.json"`; `null` skips it. */
    readonly productionOutput?: string | null;
    /** Write the documents instead of checking them. Defaults to `false`: the check fails when a committed document is missing or out of date. Write mode refuses a path that is a symbolic link, is not a regular file, or resolves outside the working directory. It also refuses the lockfile: its path, a hard link to it, or a case-variant name on a case-insensitive file system. A refusal writes nothing and exits 1. */
    readonly write?: boolean;
    /** The command a failure message tells the reader to run to regenerate the documents. */
    readonly fix?: string;
}

/**
 * Dependency vulnerability scanning via `npm audit`.
 * @param options - configuration for this check; see {@link SecurityDepsOptions}.
 * @returns the configured check.
 * @throws {TypeError} when `options` is not an object.
 * @beta
 */
export declare function securityDeps(options?: SecurityDepsOptions): CheckDefinitionConfig;

/** Options accepted by {@link securityDeps}. */
export declare interface SecurityDepsOptions {
    /**
     * The exception registry, such as `".repo-contract/exceptions/security-deps.json"`. With one, a
     * `critical` advisory still fails, and a lower one passes only while a complete record accepts
     * it. The check writes a blank record for each new advisory and fails on a record whose advisory
     * is gone. An `info` finding warns and gets no record. Defaults to `false`: no registry,
     * so any low, moderate, high or critical advisory fails.
     */
    readonly registry?: string | false;
}

/**
 * Secret-leak scanning via secretlint.
 * @beta
 */
export declare const securitySecrets: CheckDefinitionConfig;

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
 * CSS/SCSS lint via stylelint, using whatever stylelint config the
 * consumer's repository already has. `severity: "error"` blocks;
 * `severity: "warning"` is reported but never blocks, matching how the
 * `lint` preset treats ESLint's severities.
 * @param options - configuration for this check; see {@link StylelintOptions}.
 * @returns the configured check.
 * @throws {TypeError} when `options` is not an object.
 * @beta
 */
export declare function stylelint(options?: StylelintOptions): CheckDefinitionConfig;

/** Options accepted by {@link stylelint}. */
declare interface StylelintOptions {
    /** Glob passed straight through to stylelint as its positional target. Defaults to `"**\/*.{css,scss}"`: adjust it for your stylesheet file extensions (e.g. `.less`, `.vue`, `.svelte`). */
    readonly glob?: string;
}

/**
 * Unit/integration test execution via Vitest, reading its JSON reporter output.
 * @beta
 */
export declare const test: CheckDefinitionConfig;

/**
 * Type checking via `tsc --noEmit`.
 * @beta
 */
export declare const typecheck: CheckDefinitionConfig;

export { }
