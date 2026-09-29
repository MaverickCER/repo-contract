/**
 * Curated, growing catalog of preset checks for tools common across
 * TypeScript/JavaScript repositories -- each preset encodes how to execute
 * and interpret a common tool, never a repository's definition of quality
 * (see specs/decisions/0004-public-surface-stays-narrow-no-cli-experimental-presets.md). Import a preset,
 * spread it into your own `checks` record, and override whatever you need
 * -- most often `policy`; a factory preset's options are the preferred way
 * to change what it executes, a direct `run` override is an escape hatch.
 * Never re-exported from the package root (`src/index.ts`) -- presets are
 * an opt-in extra, not part of the core execution/evidence/policy surface
 * those exports describe, and this barrel never re-exports anything from
 * there either; the two stay independent.
 * @packageDocumentation
 */

/**
 * Published-package type-resolution correctness via `@arethetypeswrong/cli`.
 * @beta
 */
export declare const arethetypeswrong: CheckDefinitionConfig;

/**
 * Broken-link detection via linkinator, recursing through local files and
 * following both local and remote links. `--skip node_modules` avoids
 * wasting the crawl on vendored files that were never authored content.
 * @param options - configuration for this check; see {@link BrokenLinksOptions}.
 * @returns the configured check.
 * @beta
 */
export declare function brokenLinks(options?: BrokenLinksOptions): CheckDefinitionConfig;

/** Options accepted by {@link brokenLinks}. */
declare interface BrokenLinksOptions {
    /** File or directory passed straight through to linkinator as its positional target. Defaults to `"."`. */
    readonly start?: string;
}

/**
 * One fully configured check: how to run it, how (if at all) to interpret its output, and the policy that decides whether its evidence is acceptable.
 * @public
 */
declare interface CheckDefinition extends CheckDefinitionConfig {
    /**
     * Other check ids (from this same `checks` record) that must reach a
     * terminal status -- not necessarily a passing policy -- before this
     * check's own process is spawned. Execution ordering only: whether a
     * dependency's *policy* passed is never consulted by repo-contract to
     * decide whether this check's process spawns -- that is this check's
     * own command or policy's decision (see `ctx.dependencies` on
     * `PolicyContext`). Omit, or an empty array, for no dependencies -- the
     * default, fully-parallel behavior, unchanged. Validated before any
     * process spawns: every named id must exist in `checks`, a check cannot
     * depend on itself, and -- since declaration order in the `checks` object
     * doubles as the required topological order -- every named id must be
     * declared *earlier* than the check declaring `dependsOn` on it (a
     * forward reference throws `DependencyDeclaredLaterError`; a cycle is
     * consequently impossible, since no edge can ever point forward). See
     * specs/decisions/0002-dependson-and-isolated-are-two-scheduling-primitives.md.
     */
    readonly dependsOn?: readonly string[];
}

/**
 * One partially configured check: how to run it, how (if at all) to interpret its output, and the policy that decides whether its evidence is acceptable.
 * @public
 */
declare interface CheckDefinitionConfig {
    /**
     * The command to run. A `string` is tokenized into executable + arguments
     * without invoking a shell -- shell operators (`;`, `&`, `|`, backticks,
     * `$(`, `<`, `>`, newlines) are rejected with a configuration error rather
     * than silently passed through as literal arguments, since a string
     * containing one almost always reflects a mistaken assumption that shell
     * interpretation is happening. Glob characters (`*`, `?`, `~`, `[`, `]`,
     * `{`, `}`) are NOT rejected -- they are common, legitimate literal argv
     * content (e.g. `eslint "src/**\/*.ts"`) that many CLI tools glob-expand
     * internally, and carry no shell-injection risk when no shell is invoked.
     * An array bypasses tokenization entirely and is used as argv verbatim.
     */
    readonly run: string | readonly string[];
    /**
     * Opt into real shell execution instead of the safe argv-only default.
     * When `true` (or left unset with `RepoContractConfig.shell: true` as the
     * run-wide default -- see that field), `run` must be a `string` and is
     * passed to the platform shell as-is (via the supplied `Spawner`'s own
     * `shell` option) -- shell metacharacter rejection does not apply. See
     * SECURITY.md before enabling this.
     */
    readonly shell?: boolean;
    /** Working directory for the spawned process. Defaults to the current process's `cwd`. */
    readonly cwd?: string;
    /** Additional environment variables for the spawned process, applied on top of (or, if `inheritEnv` is `false`, instead of) the inherited environment. */
    readonly env?: Readonly<Record<string, string>>;
    /** Whether the spawned process inherits `process.env`. Defaults to `true` -- most check commands (npm scripts, locally-installed CLIs) need `PATH` and similar to resolve at all. Set to `false` for a minimal environment containing only `env` (plus whatever the OS itself always provides). */
    readonly inheritEnv?: boolean;
    /** Maximum time to let this check's process run before it is terminated and recorded with `status: "timed_out"`. No timeout by default. */
    readonly timeoutMs?: number;
    /** Request that stdout be parsed as this format. Omit for no parsing -- the consumer gets raw stdout/stderr only. */
    readonly output?: {
        readonly format: OutputFormat;
        /**
         * An optional Standard Schema-compliant validator (Zod, Valibot, ArkType, or any other
         * implementation of https://standardschema.dev), run once the requested `format` parse
         * itself succeeds. repo-contract never imports a schema library itself --
         * `StandardSchemaV1` is hand-vendored (see `src/standard-schema/types.ts`) purely as a
         * type-level contract, so accepting any consumer's own schema object costs zero new
         * runtime or dev dependencies (see
         * specs/decisions/0012-hand-vendored-standard-schema-support-for-optional-output-validation.md). A successful
         * `~standard.validate()` result *replaces* the parsed value on `CheckEvidence.output.value`
         * (letting a schema transform, not just check, its input); a failing result becomes an
         * ordinary `ParsedOutputFailure`, indistinguishable in shape from a malformed-JSON/YAML
         * parse failure -- both are "this check's output isn't what was expected," reported as
         * data, never a throw (see `parseOutput`). `validate()` itself throwing or rejecting is a
         * different case -- a bug in the supplied schema, not malformed output -- and surfaces as
         * `StandardSchemaValidateThrewError` instead (see that error's own doc comment). Like every
         * other format's `value`, `schema`'s inferred output type is *not* threaded to
         * `CheckEvidence.output.value`'s declared type -- it stays `unknown`, for the same
         * heterogeneous-checks-in-one-record TypeScript inference limitation already documented on
         * `CheckEvidence` above; a policy still narrows or casts `.value` itself, now
         * shaped/transformed by `schema` at runtime even though the type alone doesn't say so.
         */
        readonly schema?: StandardSchemaV1;
    };
    /**
     * A full scheduling barrier at this check's own position in the `checks` object: it does not
     * spawn until every check declared *earlier* has reached a terminal status (nothing "currently in
     * flight" when its turn comes can be anything other than an earlier-declared check, since nothing
     * declared later has even been reached yet), and every check declared *after* it waits for it in
     * turn -- so nothing overlaps it in either direction. Purely a scheduling primitive for a check
     * whose own tooling spawns concurrent workers that would otherwise contend with the rest of the
     * run for machine resources (e.g. Stryker's own worker pool); it expresses no need for any other
     * check's evidence, only for the machine to itself, and never appears in a policy's
     * `ctx.dependencies` or in a partial `options.checks` run's transitive closure on its own (an
     * explicit `dependsOn` alongside it still works exactly as it would on any other check). Defaults
     * to `false` -- unaffected, fully-parallel scheduling in declaration order, unchanged. Two
     * isolated checks are always sequential relative to each other (whichever is declared second
     * waits for the first, as one of the "every check declared earlier" it's barred behind). See
     * specs/decisions/0002-dependson-and-isolated-are-two-scheduling-primitives.md.
     */
    readonly isolated?: boolean;
    /** Decides whether this check's evidence is acceptable, once its process has finished running. */
    readonly policy: Policy;
}

/**
 * What actually happened when one configured check ran. `output` is present
 * only if that check's config requested a format, and is otherwise
 * `undefined` -- a policy narrows with `ctx.result.output?.success` (or an
 * `if (ctx.result.output) { ... }` guard) before reading `.value`/`.error`.
 *
 * `output.value` is the value produced by the configured `format` parser, optionally validated
 * and (if a schema transforms/coerces it) replaced by `output.schema` (see
 * `CheckDefinitionConfig.output.schema`) -- so it is not necessarily the raw parser result once a
 * check's config supplies a schema. It is typed `unknown` for every format regardless, including
 * `"text"` (even though `parseText` always produces a `string` at runtime) and regardless of
 * whether a schema was supplied -- neither repo-contract nor TypeScript's generic inference can
 * reliably carry a specific check's own literal `output.format` (or a specific `schema`'s own
 * inferred output type) through to that same check's `policy` parameter once several checks with
 * heterogeneous formats live together in one `checks` record (a real TypeScript inference
 * limitation hit and confirmed during implementation, not a hypothetical -- see specs/decisions/
 * for the isolated repro). This is a deliberate, acknowledged tradeoff, not a gap this package
 * is attempting to close: a schema still gives its own author real compile-time input/output
 * typing via `StandardSchemaV1<Input, Output>` for their own code, just not threaded through this
 * shared `CheckEvidence` shape. A policy author narrows or casts `.value` themselves, exactly as
 * they already must for `"json"`/`"text"` with no schema supplied.
 * @public
 */
declare interface CheckEvidence {
    /** The executable that was actually spawned (after tokenization, if `run` was a string). */
    readonly command: string;
    /** The arguments passed to `command`, exactly as spawned. */
    readonly args: readonly string[];
    /** ISO 8601 timestamp of when the process was spawned. */
    readonly startedAt: string;
    /** ISO 8601 timestamp of when the process reached its terminal state. */
    readonly completedAt: string;
    /** Wall-clock time from spawn to termination, in milliseconds. */
    readonly durationMs: number;
    /** `null` when the process never exited normally -- see `signal` and `status`. */
    readonly exitCode: number | null;
    /** The signal that terminated the process, if any. `null` for a normal exit or a spawn failure. */
    readonly signal: NodeJS.Signals | null;
    /** The process's raw standard output, captured verbatim up to an internal size cap (10 MiB); content beyond the cap is replaced with a truncation marker. */
    readonly stdout: string;
    /** The process's raw standard error, captured verbatim up to an internal size cap (10 MiB); content beyond the cap is replaced with a truncation marker. */
    readonly stderr: string;
    /** Why the process reached its terminal state; see `CheckStatus`. */
    readonly status: CheckStatus;
    /** Populated only for `status === "spawn_error"` -- the underlying Node error message (e.g. "spawn foo ENOENT"). Never populated for any other status. */
    readonly spawnError?: string;
    /** Populated only for `status === "spawn_error"` -- the underlying Node `ErrnoException`'s structured `.code` (e.g. `"ENOENT"`, `"EACCES"`), when Node provides one. Never populated for any other status. Distinguishes "the executable does not exist" from other spawn failures (permission denied, invalid executable format, etc.) without parsing `spawnError`'s free-text message. */
    readonly spawnErrorCode?: string;
    /**
     * The parsed interpretation of `stdout`, present only if this check's config requested a
     * `format`. If that config also supplied `output.schema`, a successful parse is additionally
     * validated (and possibly transformed) by that schema before landing here -- see this
     * interface's own doc comment above and `CheckDefinitionConfig.output.schema`.
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
 * the process ran to exit on its own -- the exit code may still be
 * non-zero, and that is for the check's policy to interpret, never this
 * package. The other five values all mean the process did not exit on its
 * own; repo-contract terminated it, or it was terminated for a reason
 * repo-contract can observe but did not cause.
 *
 * `"signaled"` specifically means a signal repo-contract did *not* itself request -- an
 * externally-caused termination. A check killed because the *host* process running repo-contract
 * received its own SIGINT/SIGTERM (see `run-checks.ts`'s termination-handler cleanup) is instead
 * `"host_terminated"`: repo-contract did request that signal, just not via `options.signal` or
 * `timeoutMs` (see `"aborted"`/`"timed_out"`), so it must not be conflated with an externally-caused
 * `"signaled"`.
 * @public
 */
declare type CheckStatus = "completed" | "timed_out" | "signaled" | "host_terminated" | "spawn_error" | "aborted";

/**
 * Commit-message governance via commitlint, using whatever commitlint
 * config the consumer's own repository already has (commitlint ships no
 * rules of its own -- e.g. `@commitlint/config-conventional`). Exit-code
 * based rather than `--format json`: commitlint has no broadly-documented,
 * stable JSON CLI output, so this preset reads its plain-text report the
 * same way the `format`/`typecheck` presets already do for their tools,
 * rather than relying on an unconfirmed flag.
 * @param options - configuration for this check; see {@link CommitlintOptions}.
 * @returns the configured check.
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
 * Dead/unused-code detection via knip.
 * @param options - configuration for this check; see {@link DeadCodeOptions}.
 * @returns the configured check.
 * @beta
 */
export declare function deadCode(options?: DeadCodeOptions): CheckDefinitionConfig;

/** Options accepted by {@link deadCode}. */
declare interface DeadCodeOptions {
    /**
     * devDependency names to exclude from the "unused devDependency" issue
     * category -- e.g. CLI tools knip has no way to see are used, because
     * nothing `import`s them. Round-tripped through knip's own
     * `--reporter-options` flag (see `readReporterOptions`) rather than kept in
     * a closure, so the exempt list this check actually ran with is visible on
     * the recorded command line and in persisted evidence, not just in this
     * file's source. Defaults to an empty list -- repo-contract ships no
     * built-in exemptions; add your own repository's here.
     */
    readonly exemptUnusedDevDependencies?: readonly string[];
}

/**
 * Duplicated-code detection via jscpd.
 * @param options - configuration for this check; see {@link DuplicationOptions}.
 * @returns the configured check.
 * @beta
 */
export declare function duplication(options?: DuplicationOptions): CheckDefinitionConfig;

/** Options accepted by {@link duplication}. */
declare interface DuplicationOptions {
    /** Directory to scan for duplicated code, passed straight through to jscpd as its positional target. Defaults to `"."` -- narrow it (e.g. `"src"`) to scope the scan to your own source tree. */
    readonly path?: string;
}

/**
 * End-to-end test execution via Playwright, reading its JSON reporter output.
 * @beta
 */
export declare const e2e: CheckDefinitionConfig;

/**
 * Versioned, immutable record of one complete `runRepoContract` execution --
 * every configured check's evidence, plus timing for the run as a whole.
 * Says nothing about whether any of it was acceptable; see `Verdict`.
 * Additive fields are a compatible change; changing or removing an existing
 * field requires bumping this version number (see VERSIONING.md).
 * @public
 */
declare interface Evidence<TChecks extends CheckSchema = CheckSchema> {
    /** Schema version of this shape; see VERSIONING.md. */
    readonly version: 1;
    /** ISO 8601 timestamp of when the run began. */
    readonly startedAt: string;
    /** ISO 8601 timestamp of when the last check finished. */
    readonly completedAt: string;
    /** Wall-clock time for the run as a whole, in milliseconds. */
    readonly durationMs: number;
    /** Each configured check's own evidence, keyed by check id. */
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
 * Dependency license compliance via licensee.
 * @beta
 */
export declare const license: CheckDefinitionConfig;

/**
 * Static analysis via ESLint, using whatever `eslint.config.js` the
 * consumer's own repository already has -- this preset makes no assumption
 * about rule configuration, only about how to run the tool and interpret
 * its JSON output. Severity `2` (error) blocks; severity `1` (warning) is
 * reported but never blocks -- ESLint's own severities already encode that
 * distinction, so this preset just respects it rather than treating every
 * finding as equally blocking.
 * @param options - configuration for this check; see {@link LintOptions}.
 * @returns the configured check.
 * @beta
 */
export declare function lint(options?: LintOptions): CheckDefinitionConfig;

/** Options accepted by {@link lint}. */
declare interface LintOptions {
    /** Path (or glob) passed straight through to ESLint as its positional target. Defaults to `"."` -- narrow it (e.g. `"src"`) to scope linting to your own source tree. */
    readonly path?: string;
}

/**
 * Markdown structure/style lint via markdownlint-cli2. Unlike this
 * package's other file-based-report presets, the report path is
 * config-driven rather than a CLI flag -- markdownlint-cli2 only writes
 * JSON when its own config file requests it. This preset assumes the
 * consumer's `.markdownlint-cli2.jsonc` includes:
 * ```jsonc
 * "outputFormatters": [["markdownlint-cli2-formatter-json", { "name": "reports/markdownlint.json" }]]
 * ```
 * which also requires the `markdownlint-cli2-formatter-json` package
 * alongside `markdownlint-cli2` itself.
 * @param options - configuration for this check; see {@link MarkdownlintOptions}.
 * @returns the configured check.
 * @beta
 */
export declare function markdownlint(options?: MarkdownlintOptions): CheckDefinitionConfig;

/** Options accepted by {@link markdownlint}. */
declare interface MarkdownlintOptions {
    /** Glob passed straight through to markdownlint-cli2 as its positional target. Defaults to `"**\/*.md"`. */
    readonly glob?: string;
}

/**
 * Output interpretation a check can explicitly request. No format requested means no parsing --
 * the consumer gets raw stdout/stderr only. Format conversion (e.g. YAML) is deliberately not a
 * core concern of this package -- JSON and plain text cover every check this package or its
 * consumers actually run; a check whose tool emits another format converts it in its own `run`
 * step or reads it directly in its `policy` function, using whatever library it already depends
 * on, rather than this package carrying an optional peer dependency on everyone's behalf.
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
 * parent `CheckEvidence` is preserved unchanged -- a parse failure is never
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
 * acceptable. Returns a `PolicyResult` -- never a bare boolean or string --
 * so a policy can communicate more than pass/fail even when the run is
 * otherwise acceptable (see `PolicyResult`/`PolicyOutcome`). May be
 * synchronous or return a `Promise`. repo-contract does not interpret
 * `rationale` beyond storing and surfacing it verbatim; the package has no
 * opinion about what makes a check pass, fail, or warrant a `warn`.
 * @public
 */
declare type Policy<TChecks extends CheckSchema = CheckSchema> = (ctx: PolicyContext<TChecks>) => PolicyResult | Promise<PolicyResult>;

/**
 * What a check's `policy` function is called with. `result` is that check's
 * own evidence; `evidence` is the complete run's evidence, including every
 * sibling check -- present so a policy can make cross-check decisions (e.g.
 * "only enforce the mutation-score threshold if the tests check passed").
 * By the time any policy runs, every check has already finished executing
 * and every check's evidence has already been assembled -- no policy ever
 * observes a partially-populated `evidence` (see specs/architecture.md).
 * @public
 */
declare interface PolicyContext<TChecks extends CheckSchema = CheckSchema> {
    /** This check's own evidence. */
    readonly result: CheckEvidence;
    /** The complete run's evidence, including every sibling check. */
    readonly evidence: Evidence<TChecks>;
    /**
     * This check's own declared `dependsOn` dependencies' evidence, keyed by
     * check id -- a convenience view, fully derivable from `evidence.checks`
     * plus this check's own `dependsOn`, provided so no policy has to do that
     * lookup itself. `{}` for a check with no `dependsOn` -- always an
     * object, never `undefined`, matching how `evidence.checks` is already
     * used today (a policy narrows a specific key's presence, never the
     * field itself). Evidence only, not policy outcomes -- a dependency's
     * policy result stays visible only via the top-level `Verdict`, exactly
     * as today; this keeps policy evaluation itself fully parallel and
     * unaffected by `dependsOn`.
     */
    readonly dependencies: Readonly<Record<string, CheckEvidence>>;
}

/**
 * `"pass"`: the repository-owned policy evaluated the captured evidence as
 * satisfying its configured requirements. `"fail"`: the evidence did not
 * satisfy them. `"warn"`: the evidence does not violate the policy's
 * blocking requirements, but the policy has intentionally decided the
 * condition is materially relevant and wants it surfaced -- not a synonym
 * for "minor failure"; a `warn` never fails `Verdict.passed` (see
 * `runPolicies` in `src/policy/run-policies.ts`).
 * @public
 */
declare type PolicyOutcome = "pass" | "fail" | "warn";

/**
 * A repository-owned policy's interpretation of one check's captured
 * evidence -- fully JSON-serializable (a plain object of primitives only,
 * never an `Error`, class instance, function, or tool-specific object) so it
 * can be persisted, transmitted, aggregated across parallel checks, and
 * consumed directly by a human or an AI without rerunning anything.
 *
 * `rationale` is mandatory and must contain enough actionable detail --
 * specific file/line locations, rule ids, test names, counts -- for a
 * consumer to understand *why* the policy reached its outcome from this
 * value alone. A rationale like "see output above" or "check the report for
 * details" defeats the purpose: it forces the consumer back to raw,
 * unstructured command output, exactly what this type exists to avoid.
 * That specific anti-pattern is not just documented here -- `runPolicies`
 * (`src/policy/run-policies.ts`'s `VAGUE_RATIONALE_PATTERNS`, ADR 0016) rejects a
 * rationale matching it at runtime, the same as any other malformed
 * `PolicyResult`, so a check (repo-contract's own, or a consumer's) that
 * regresses to a vague deferral fails loudly instead of silently shipping.
 * See specs/architecture.md for the evidence/rationale/judgment distinction this
 * type is built around: evidence answers "what happened?", `rationale`
 * answers "what does the repository's policy conclude about what
 * happened?", and a policy's `outcome` is not the final word -- a human or
 * AI consumer still makes the final judgment call using both.
 * @public
 */
declare interface PolicyResult {
    /** The policy's pass/fail/warn decision. */
    readonly outcome: PolicyOutcome;
    /** Why the policy reached `outcome`, in enough detail to act on without rerunning anything. */
    readonly rationale: string;
}

/**
 * publint has no machine-readable output mode -- only a plain-text CLI
 * reporter (see its own `src/cli.js` `formatMessages`). Its process exit
 * code reflects only 'error'-level findings; 'warning'/'suggestion'-level
 * findings never affect it. This preset reads the same three section
 * headers publint's own CLI writes ("Errors:", "Warnings:", "Suggestions:")
 * to distinguish blocking findings from non-blocking ones, without
 * depending on any per-message structure publint doesn't expose. Relevant
 * only to repositories that publish an npm package.
 * @beta
 */
export declare const publint: CheckDefinitionConfig;

/**
 * Dependency vulnerability scanning via `npm audit`.
 * @beta
 */
export declare const securityDeps: CheckDefinitionConfig;

/**
 * Secret-leak scanning via secretlint.
 * @beta
 */
export declare const securitySecrets: CheckDefinitionConfig;

/**
 * Hand-vendored from `@standard-schema/spec@1.1.0` (https://standardschema.dev), pinned
 * 2026-09-04 -- see specs/decisions/0012-hand-vendored-standard-schema-support-for-optional-output-validation.md for why this is
 * vendored rather than an installed dependency, and for the version-pin/re-diff process. Pure type
 * declarations, zero runtime code -- assigning any real Zod/Valibot/ArkType (etc.) schema to this
 * type costs nothing at runtime. Only `StandardSchemaV1` (validation) is vendored here -- the
 * separate, optional `StandardJSONSchemaV1` (JSON Schema conversion) extension
 * (https://standardschema.dev/json-schema) is out of scope; see the ADR.
 *
 * Upstream's `StandardSchemaV1.Props` actually extends a shared `StandardTypedV1.Props` base
 * (`version`/`vendor`/`types`); this vendored copy inlines those fields directly into one flat
 * interface, since repo-contract has no use for the shared base on its own -- structurally
 * identical for any real schema object assigned to it. Re-diff against
 * `@standard-schema/spec`'s published `dist/index.d.ts` if this file is ever touched.
 *
 * Tagged `@public`, not tied to either re-exporting barrel's own stability tier (this type is
 * re-exported from both the Stable root barrel, for `output.schema`, and the Experimental
 * `repo-contract/helpers` barrel): this vendored copy's own shape only ever changes via a
 * deliberate re-diff against the pinned upstream spec version above, never as a side effect of
 * either barrel's own stability classification.
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
 * consumer's own repository already has. `severity: "error"` blocks;
 * `severity: "warning"` is reported but never blocks, matching how the
 * `lint` preset treats ESLint's own severities.
 * @param options - configuration for this check; see {@link StylelintOptions}.
 * @returns the configured check.
 * @beta
 */
export declare function stylelint(options?: StylelintOptions): CheckDefinitionConfig;

/** Options accepted by {@link stylelint}. */
declare interface StylelintOptions {
    /** Glob passed straight through to stylelint as its positional target. Defaults to `"**\/*.{css,scss}"` -- adjust it for your own stylesheet file extensions (e.g. `.less`, `.vue`, `.svelte`). */
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
