/**
 * repo-contract's core: write a repository's quality rules as one typed contract, run it, and read
 * the result. `defineRepoContract` types the config, `runRepoContract` runs every check and its
 * policy, and `serializeRun` and `renderMarkdownSummary` turn the result into JSON or Markdown.
 * The `Evidence`, `Verdict` and `Policy` types and the error classes complete the surface.
 *
 * Execution, parsing and policy internals (src/execution/, src/parsing/, src/policy/) stay
 * unexported, so they can change without a breaking release.
 * @packageDocumentation
 */

import type { ChildProcess } from 'node:child_process';
import type { SpawnOptions } from 'node:child_process';
import type { SpawnSyncOptions } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';

/**
 * One fully configured check: how to run it, how (if at all) to interpret its output, and the policy that decides whether its evidence is acceptable.
 * @public
 */
export declare interface CheckDefinition extends CheckDefinitionConfig {
    /**
     * Other check ids (from this same `checks` record) that must reach a
     * terminal status (not necessarily a passing policy) before this
     * check's own process is spawned. Execution ordering only: whether a
     * dependency's *policy* passed is never consulted by repo-contract to
     * decide whether this check's process spawns; that is this check's
     * own command or policy's decision (see `ctx.dependencies` on
     * `PolicyContext`). Omit, or an empty array, for no dependencies: the
     * default, fully-parallel behavior. Validated before any process spawns.
     * Every named id must exist in `checks`, and a check cannot depend on itself.
     * Declaration order in the `checks` object doubles as the required
     * topological order. So every named id must be declared *earlier* than the
     * check that depends on it, and a forward reference throws
     * `DependencyDeclaredLaterError`. A cycle is therefore impossible, since no
     * edge can point forward. See
     * specs/decisions/0002-dependson-and-isolated-are-two-scheduling-primitives.md.
     */
    readonly dependsOn?: readonly string[];
}

/**
 * One partially configured check: how to run it, how (if at all) to interpret its output, and the policy that decides whether its evidence is acceptable.
 * @public
 */
export declare interface CheckDefinitionConfig {
    /**
     * The command to run. A `string` is tokenized into executable + arguments
     * without invoking a shell. Shell operators (`;`, `&`, `|`, backticks,
     * `$(`, `<`, `>`, newlines) are rejected with a configuration error, not
     * passed through as literal arguments. A string containing one almost
     * always means its author assumed a shell would interpret it. Glob characters (`*`, `?`, `~`, `[`, `]`,
     * `{`, `}`) are NOT rejected: they are common, legitimate literal argv
     * content (e.g. `eslint "src/**\/*.ts"`) that many CLI tools glob-expand
     * internally, and carry no shell-injection risk when no shell is invoked.
     * An array bypasses tokenization entirely and is used as argv verbatim.
     */
    readonly run: string | readonly string[];
    /**
     * Opt into real shell execution instead of the safe argv-only default.
     * When `true` (or left unset with `RepoContractConfig.shell: true` as the
     * run-wide default (see that field), `run` must be a `string` and is
     * passed to the platform shell as-is (via the supplied `Spawner`'s own
     * `shell` option)) shell metacharacter rejection does not apply. See
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
         * An optional Standard Schema validator (Zod, Valibot, ArkType, or any other
         * implementation of standardschema.dev), run once the requested `format` parse
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
     * A full scheduling barrier at this check's own position in the `checks` object. It does not
     * spawn until every check declared *earlier* has reached a terminal status. Every check
     * declared *after* it waits for it in turn, so nothing overlaps it in either direction. When its turn
     * comes, only earlier-declared checks can be in flight, since later ones have not been reached.
     *
     * It is a scheduling primitive only, for a check whose tooling spawns concurrent workers that
     * would contend with the rest of the run for machine resources (e.g. Stryker's worker pool). It
     * needs no other check's evidence, only the machine to itself. So on its own it never appears in
     * a policy's `ctx.dependencies` or in a partial `options.checks` run's transitive closure. An
     * explicit `dependsOn` alongside it works as it would on any other check.
     *
     * Defaults to `false`: fully-parallel scheduling in declaration order. Two isolated checks always
     * run one after the other: the one declared second waits for the first, as it does for every
     * earlier check. See specs/decisions/0002-dependson-and-isolated-are-two-scheduling-primitives.md.
     */
    readonly isolated?: boolean;
    /**
     * Marks a check as costly enough to be worth skipping when the run asked for fail-fast
     * (`RunRepoContractOptions.failFast`) and a check that is not marked has already failed. Such a
     * check that has not yet spawned then resolves to `status: "aborted"` evidence with `skipReason: "fail-fast"` instead of running.
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
 * What actually happened when one configured check ran. `output` is present
 * only if that check's config requested a format, and is otherwise
 * `undefined`: a policy narrows with `ctx.result.output?.success` (or an
 * `if (ctx.result.output) { ... }` guard) before reading `.value`/`.error`.
 *
 * `output.value` is the value the configured `format` parser produced. If the check's config
 * supplies `output.schema` (see `CheckDefinitionConfig.output.schema`), the schema validates it and
 * may replace it with a transformed value, so it is not always the raw parser result.
 *
 * It is typed `unknown` for every format, including `"text"` (where `parseText` always produces a
 * `string`), with or without a schema. TypeScript's generic inference cannot carry one check's
 * literal `output.format`, or its schema's output type, through to that check's `policy` once
 * several checks with different formats share one `checks` record. That limit was confirmed during
 * implementation; specs/decisions/ holds the isolated repro. This is a deliberate tradeoff. A
 * schema still types its author's own code through `StandardSchemaV1<Input, Output>`, but not this
 * shared `CheckEvidence` shape. A policy author narrows or casts `.value`, as they already must for
 * `"json"` or `"text"` without a schema.
 * @public
 */
export declare interface CheckEvidence {
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
     * `format`. If that config also supplied `output.schema`, a successful parse is additionally
     * validated (and possibly transformed) by that schema before landing here: see this
     * interface's own doc comment above and `CheckDefinitionConfig.output.schema`.
     */
    readonly output?: ParsedOutput<unknown>;
}

/**
 * The full set of checks in a `RepoContractConfig`, keyed by check id.
 * @public
 */
export declare type CheckSchema = Record<string, CheckDefinition>;

/**
 * Why a check's process ended up in its terminal state. `"completed"` means
 * the process ran to exit on its own: the exit code may still be
 * non-zero, and that is for the check's policy to interpret, never this
 * package. The other five values all mean the process did not exit on its
 * own; repo-contract terminated it, or it was terminated for a reason
 * repo-contract can observe but did not cause.
 *
 * `"signaled"` specifically means a signal repo-contract did *not* itself request: an
 * externally-caused termination. A check is instead `"host_terminated"` when the *host* process
 * running repo-contract received its own SIGINT/SIGTERM (see `run-checks.ts`'s termination-handler
 * cleanup). In that case repo-contract did request the signal, though not via `options.signal` or
 * `timeoutMs` (see `"aborted"`/`"timed_out"`). So it must not be conflated with an
 * externally-caused `"signaled"`.
 * @public
 */
export declare type CheckStatus = "completed" | "timed_out" | "signaled" | "host_terminated" | "spawn_error" | "aborted";

/**
 * Declares a contract with full type inference, and returns it unchanged. Each check's `output`
 * (present or absent, and its format) flows into that check's `policy` parameter type, so a config
 * needs no type annotations. It also checks every `dependsOn` against the sibling check ids at
 * compile time (see `ValidatedCheckSchema`), so a mistyped or self-referencing id fails to compile.
 *
 * It does no other validation and no cloning. `runRepoContract` validates whatever config it is
 * given, whether or not it passed through this function.
 *
 * `const TChecks` (TypeScript 5.0's `const` type parameter modifier) keeps
 * each check's own configuration (notably whether `output` is present at
 * all) from being widened during inference. Without it, TypeScript's
 * inference for a `Record` of heterogeneous generic entries does not
 * reliably preserve that per-check shape once a callback property
 * (`policy`) is also present. See `InferParsedValue` in types.ts for the
 * related limitation this does not fully solve.
 *
 * `TChecks` is inferred from the plain, unwrapped `RepoContractConfig<TChecks>`
 * position: the `ValidatedCheckSchema<TChecks>` constraint on `checks` is
 * intersected in afterward, computed from that already-inferred `TChecks`,
 * rather than substituted in its place. Inferring `TChecks` directly from a
 * mapped/conditional type over itself (as `ValidatedCheckSchema` is) loses
 * the contextual typing every check's `policy` callback otherwise gets:
 * another real, confirmed TypeScript inference limitation, distinct from
 * the `output`-to-`policy` one above.
 * @param config - the config to type-check and return unchanged.
 * @returns the same `config` object, untouched and uncloned.
 * @public
 */
export declare function defineRepoContract<const TChecks extends CheckSchema>(config: RepoContractConfig<TChecks> & {
    readonly checks: ValidatedCheckSchema<TChecks>;
}): RepoContractConfig<TChecks>;

/**
 * A check's `dependsOn` names a check declared *later* in the same `checks` object.
 * `dependsOn` may only reference a check declared earlier: see `CheckDefinition.dependsOn`'s own
 * doc comment. Declaration order doubles as the required topological order, so this is the only
 * way an invalid dependency graph can arise; a real cycle is structurally impossible once every
 * edge points backward. Thrown synchronously, before any check spawns.
 * @public
 */
export declare class DependencyDeclaredLaterError extends RepoContractError {
    /** Always `"REPO_CONTRACT_DEPENDENCY_DECLARED_LATER"`. */
    readonly code = "REPO_CONTRACT_DEPENDENCY_DECLARED_LATER";
    /** The id of the check whose `dependsOn` names a later-declared check. */
    readonly checkId: string;
    /** The later-declared check id named in `checkId`'s `dependsOn`. */
    readonly dependencyId: string;
    constructor(checkId: string, dependencyId: string);
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
export declare interface Evidence<TChecks extends CheckSchema = CheckSchema> {
    /** Schema version of this shape; see `VERSIONING.md`. */
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
 * One check's `CheckDefinition` is structurally invalid: e.g. an empty `run`, a `run` string
 * containing an unquoted shell operator without `shell: true`, or a missing `policy`. Thrown
 * synchronously, before that check (or any other) spawns.
 * @public
 */
export declare class InvalidCheckConfigError extends RepoContractError {
    /** Always `"REPO_CONTRACT_INVALID_CHECK_CONFIG"`. */
    readonly code = "REPO_CONTRACT_INVALID_CHECK_CONFIG";
    /** The id of the check whose configuration was invalid. */
    readonly checkId: string;
    constructor(checkId: string, reason: string);
}

/**
 * The top-level `RepoContractConfig` itself is structurally invalid: e.g. `checks` is not an
 * object, or `concurrency` is not a positive integer. (A `checks` object with zero entries is
 * deliberately valid: the run produces an empty, passing `Verdict`.) Thrown synchronously by
 * `runRepoContract`, before anything spawns; not by `defineRepoContract`, which performs no
 * runtime validation of its own (see its own doc comment).
 * @public
 */
export declare class InvalidRepoContractConfigError extends RepoContractError {
    /** Always `"REPO_CONTRACT_INVALID_CONFIG"`. */
    readonly code = "REPO_CONTRACT_INVALID_CONFIG";
    constructor(reason: string);
}

/**
 * Output interpretation a check can explicitly request. No format requested means no parsing:
 * the consumer gets raw stdout/stderr only. Other formats (e.g. YAML) are left out on purpose:
 * JSON and plain text cover every check this package or its consumers run. A check whose tool
 * emits another format converts it in its own `run` step, or reads it in its `policy` function
 * with a library it already depends on. That keeps this package free of an optional peer
 * dependency carried on everyone's behalf.
 * @public
 */
export declare type OutputFormat = "json" | "text";

/**
 * The result of a check's requested output-format parse: either a successful `ParsedOutputSuccess`, or a `ParsedOutputFailure`.
 * @public
 */
export declare type ParsedOutput<T> = ParsedOutputSuccess<T> | ParsedOutputFailure;

/**
 * A requested parse of a check's stdout failed. The raw stdout on the
 * parent `CheckEvidence` is preserved unchanged: a parse failure is never
 * silently reinterpreted or discarded.
 * @public
 */
export declare interface ParsedOutputFailure {
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
export declare interface ParsedOutputSuccess<T> {
    /** The format that was requested and successfully parsed. */
    readonly format: OutputFormat;
    /** Always `true`. */
    readonly success: true;
    /** The parsed value. */
    readonly value: T;
}

/**
 * A repository-owned decision about whether one check's evidence is
 * acceptable. Returns a `PolicyResult` (never a bare boolean or string)
 * so a policy can communicate more than pass/fail even when the run is
 * otherwise acceptable (see `PolicyResult`/`PolicyOutcome`). May be
 * synchronous or return a `Promise`. repo-contract does not interpret
 * `rationale` beyond storing and surfacing it verbatim; the package has no
 * opinion about what makes a check pass, fail, or warrant a `warn`.
 * @public
 */
export declare type Policy<TChecks extends CheckSchema = CheckSchema> = (ctx: PolicyContext<TChecks>) => PolicyResult | Promise<PolicyResult>;

/**
 * What a check's `policy` function is called with. `result` is that check's
 * own evidence; `evidence` is the complete run's evidence, including every
 * sibling check: present so a policy can make cross-check decisions (e.g.
 * "only enforce the mutation-score threshold if the tests check passed").
 * By the time any policy runs, every check has already finished executing
 * and every check's evidence has already been assembled: no policy ever
 * observes a partially-populated `evidence` (see specs/architecture.md).
 * @public
 */
export declare interface PolicyContext<TChecks extends CheckSchema = CheckSchema> {
    /** This check's own evidence. */
    readonly result: CheckEvidence;
    /** The complete run's evidence, including every sibling check. */
    readonly evidence: Evidence<TChecks>;
    /**
     * This check's own declared `dependsOn` dependencies' evidence, keyed by
     * check id: a convenience view, fully derivable from `evidence.checks`
     * plus this check's own `dependsOn`, provided so no policy has to do that
     * lookup itself. `{}` for a check with no `dependsOn`: always an
     * object, never `undefined`, matching how `evidence.checks` is already
     * used today (a policy narrows a specific key's presence, never the
     * field itself). Evidence only, not policy outcomes: a dependency's
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
 * blocking requirements, but the policy decided the condition matters and
 * wants it surfaced. It is not a synonym for "minor failure". A `warn` never
 * fails `Verdict.passed` (see `runPolicies` in `src/policy/run-policies.ts`).
 * @public
 */
export declare type PolicyOutcome = "pass" | "fail" | "warn";

/**
 * `PolicyThrewError`'s other special case, alongside
 * `PolicyReadUnrequestedOutputError`. This check *did* request
 * `output: { format: ... }`, but that parse failed
 * (`result.output.success === false`). `ParsedOutputFailure` in types.ts has
 * no `value` field, only `error`. The policy still read a property off `result.output.value` without
 * checking `.success` first. `runPolicies` detects it as it does the sibling
 * case: a thrown `TypeError` whose message shows a property read off
 * `undefined`. It then confirms this check's evidence has
 * `output.success === false`. So an unrelated `TypeError`, or a check whose
 * parse succeeded, still becomes a plain `PolicyThrewError`. Unlike `PolicyReadUnrequestedOutputError`, the read property
 * isn't restricted to a known list here (`result.output.value`'s shape is whatever
 * the external tool printed, entirely unknown to repo-contract) so this match is
 * necessarily a little broader. `cause` still holds the original `TypeError`
 * verbatim; the message never repeats `result.output.error`'s own text, which may
 * contain raw stdout content (see SECURITY.md).
 * @public
 */
export declare class PolicyReadFailedParseValueError extends RepoContractError {
    /** Always `"REPO_CONTRACT_POLICY_READ_FAILED_PARSE_VALUE"`. */
    readonly code = "REPO_CONTRACT_POLICY_READ_FAILED_PARSE_VALUE";
    /** The id of the check whose policy read `result.output.value` after a failed parse. */
    readonly checkId: string;
    constructor(checkId: string, property: string, cause: unknown);
}

/**
 * A narrower error `runPolicies` throws instead of `PolicyThrewError`. Two
 * conditions must hold. The thrown `TypeError`'s message shows it came from
 * reading a `result.output` property (`.success`, `.value`, `.error`, or
 * `.format`). And this check's `CheckEvidence.output` really is `undefined`,
 * which happens only when its config never requested
 * `output: { format: ... }` (see `CheckEvidence.output` in types.ts).
 *
 * The first condition is read from V8's exact message ("Cannot read
 * properties of undefined (reading '...')"). So this error is thrown only for
 * a policy that plausibly made this mistake. Any other `TypeError`, or a
 * check that did request a format, still becomes a plain `PolicyThrewError`.
 * This is best-effort inference from message text, not a verified trace back
 * to `result.output`. V8's message carries only the property name. So an
 * unrelated bug that reads the same property name off some other `undefined`
 * value can still be misclassified (see `unrequestedOutputProperty` in
 * run-policies.ts). `cause` still holds the original `TypeError` verbatim, as
 * `PolicyThrewError` guarantees for every policy failure, so the true cause
 * stays recoverable.
 * @public
 */
export declare class PolicyReadUnrequestedOutputError extends RepoContractError {
    /** Always `"REPO_CONTRACT_POLICY_READ_UNREQUESTED_OUTPUT"`. */
    readonly code = "REPO_CONTRACT_POLICY_READ_UNREQUESTED_OUTPUT";
    /** The id of the check whose policy read `result.output` without requesting a format. */
    readonly checkId: string;
    constructor(checkId: string, property: string, cause: unknown);
}

/**
 * A repository-owned policy's interpretation of one check's captured
 * evidence. It is a plain object of primitives, never an `Error`, class
 * instance, function or tool-specific object. So it can be persisted,
 * transmitted, aggregated across parallel checks, and read by a human or an
 * AI without rerunning anything.
 *
 * `rationale` is mandatory. It must hold enough actionable detail (specific
 * file/line locations, rule ids, test names, counts) for a consumer to
 * understand *why* the policy reached its outcome from this value alone. A
 * rationale like "see output above" or "check the report for details"
 * defeats the purpose: it sends the consumer back to raw command output,
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
export declare interface PolicyResult {
    /** The policy's pass/fail/warn decision. */
    readonly outcome: PolicyOutcome;
    /** Why the policy reached `outcome`, in enough detail to act on without rerunning anything. */
    readonly rationale: string;
}

/**
 * A check's `policy` function threw synchronously, or returned a `Promise`
 * that later rejected. Both failure modes are wrapped identically. The
 * original thrown/rejected value is preserved verbatim via the native
 * `Error` `cause` chain (never stringified, summarized, or discarded)
 * so a consumer catching this can still inspect exactly what their own
 * policy code did wrong.
 *
 * A policy throwing never stops any other check's policy from running:
 * every configured check's policy is invoked exactly once regardless of
 * what any other policy does. If more than one policy fails this way in the
 * same run, `runRepoContract()` rejects with a native `AggregateError`
 * instead of surfacing only the first. Its `errors` array holds one error per
 * failing check. Each is a `PolicyThrewError`, or one of its two narrower
 * siblings below when the failure matches their shape
 * (`PolicyReadUnrequestedOutputError`, `PolicyReadFailedParseValueError`).
 * @public
 */
export declare class PolicyThrewError extends RepoContractError {
    /** Always `"REPO_CONTRACT_POLICY_THREW"`. */
    readonly code = "REPO_CONTRACT_POLICY_THREW";
    /** The id of the check whose policy threw or rejected. */
    readonly checkId: string;
    constructor(checkId: string, cause: unknown);
}

/**
 * Renders a run's verdict (and, if given, its evidence) as GitHub-flavored Markdown suitable for
 * `$GITHUB_STEP_SUMMARY`, a pull-request comment or a README badge page. Totals come first. Then
 * every failing check with its complete rationale, so nothing needs re-running to see why. Then
 * every warning and passing check with the first line of its rationale. When the evidence is
 * supplied, the slowest checks follow: the contract's own cost. Pure: it reads nothing and writes
 * nothing.
 * @param verdict - The aggregated verdict of the run.
 * @param evidence - The run's evidence; optional, adds per-check timing.
 * @param options - Heading and list-length options.
 * @returns The Markdown document, ending in a newline.
 * @public
 */
export declare function renderMarkdownSummary<TChecks extends CheckSchema>(verdict: Verdict<TChecks>, evidence?: Evidence<TChecks>, options?: RenderMarkdownSummaryOptions): string;

/**
 * Options for {@link renderMarkdownSummary}.
 * @public
 */
export declare interface RenderMarkdownSummaryOptions {
    /** Heading text; defaults to `"Contract"`. */
    readonly title?: string;
    /** How many of the slowest checks to list when `evidence` is given; defaults to 5. */
    readonly slowest?: number;
}

/**
 * Top-level configuration passed to `defineRepoContract`/`runRepoContract`.
 * @public
 */
export declare interface RepoContractConfig<TChecks extends CheckSchema = CheckSchema> {
    /** Every check to run, keyed by check id. */
    readonly checks: TChecks;
    /** Maximum number of checks to execute concurrently. Defaults to `os.availableParallelism()`. Must be a positive integer. */
    readonly concurrency?: number;
    /**
     * The trusted capability repo-contract calls to spawn every check's
     * process: e.g. `child_process.spawn` (from `"node:child_process"`) or
     * cross-spawn's exported `spawn`. Required: repo-contract never imports a
     * process-spawning implementation itself (see ADR 0011 above `Spawner`).
     * `child_process.spawn` alone does not resolve Windows `.cmd`/`.bat`
     * shims (most npm-installed CLI tools on Windows) without `shell: true`;
     * pass cross-spawn instead for that correctness without enabling shell
     * metacharacter interpretation: cross-spawn is a spawn implementation
     * choice, not a `shell: true` equivalent. See `shell` below.
     */
    readonly spawn: Spawner;
    /**
     * The ambient environment repo-contract treats as inheritable by each
     * check whose `inheritEnv` is not `false` (the default). Typically
     * `process.env`, passed through by reference, never copied. So a consumer
     * that mutates `process.env` mid-run sees the change in later-spawned
     * checks, as if repo-contract had read `process.env` itself. Required: repo-contract never reads
     * `process.env` internally (see ADR 0011 above `Spawner`). Typed as
     * `NodeJS.ProcessEnv` so `env: process.env` needs no casting.
     */
    readonly env: NodeJS.ProcessEnv;
    /**
     * Global default for every check's own `shell` when that check doesn't
     * set one itself (`check.shell ?? shell ?? false`). Defaults to `false`,
     * the safe argv-only mode: unrelated to which `spawn` is supplied; see
     * `spawn`'s own doc comment for that distinction.
     */
    readonly shell?: boolean;
    /**
     * The trusted capability repo-contract calls, on Windows only, to forcibly terminate a check's
     * entire process tree (not just its immediate process) on a timeout, an aborted run, or a
     * host-process SIGINT/SIGTERM: e.g. `child_process.spawnSync` (from `"node:child_process"`) or
     * cross-spawn's exported `sync`. Optional, unlike `spawn`/`env`: when omitted, Windows cleanup
     * falls back to terminating only the check's own immediate process (not any subprocess it spawned
     * internally); correct for the common case, but a check that spawns its own descendants (e.g.
     * `npm test` spawning the real test runner) may leave them running. POSIX cleanup never needs
     * this at all (`process.kill(-pid, signal)` reaches the whole process group directly, no spawning
     * required): see specs/decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md.
     */
    readonly killProcessTree?: SyncSpawner;
}

/**
 * Error hierarchy for repo-contract. Every concrete error carries a stable
 * `code` string for programmatic handling, and never embeds raw
 * stdout/stderr/env values in its message: only check ids and field names
 * (see SECURITY.md).
 *
 * Three distinct failure classes are kept deliberately separate (see
 * specs/architecture.md):
 *   - Structural config problems throw synchronously, before any process
 *     spawns (`InvalidRepoContractConfigError`, `InvalidCheckConfigError`).
 *   - Anything only discoverable by attempting execution becomes evidence,
 *     never a throw (a bad `cwd`, a missing binary: recorded as
 *     `status: "spawn_error"` on that check's `CheckEvidence`).
 *   - A policy function throwing or rejecting is a bug in consumer code, not
 *     a check failing its contract: it propagates as a rejected
 *     `runRepoContract()` promise (`PolicyThrewError`), never silently
 *     turned into a failed verdict entry.
 * @public
 */
export declare abstract class RepoContractError extends Error {
    /** Stable, machine-readable identifier for this error's specific failure mode. */
    abstract readonly code: string;
}

/**
 * Runs every configured check, then every check's policy against the complete evidence, and
 * returns the evidence and the aggregated verdict. A check's output is parsed when it asks for
 * that. It never calls `process.exit()`: the caller decides what to do with `verdict.passed`.
 *
 * Structural configuration problems throw synchronously before any process
 * spawns. Anything only discoverable by attempting execution (a missing
 * binary, a bad `cwd`) becomes evidence on that check (`status:
 * "spawn_error"`), never a throw. A policy function throwing or rejecting
 * rejects this function's own returned promise (`PolicyThrewError`, or an
 * `AggregateError` of them if more than one policy failed this way). That
 * differs from a policy that ran and returned a failing `PolicyResult`. See
 * `src/errors.ts` for the full distinction.
 *
 * Execution and policy evaluation are strictly phased: every check finishes
 * running and every check's evidence is fully assembled before any policy
 * is invoked (see specs/architecture.md); a policy can safely read
 * `ctx.evidence` for any sibling check's result.
 *
 * Deliberately not declared `async`: validation runs and can throw before this function returns
 * anything at all. So a config problem is a genuine synchronous exception to the caller (as
 * documented above and on `InvalidRepoContractConfigError`/`InvalidCheckConfigError`/
 * `DependencyDeclaredLaterError`). An `async function`'s body runs to its first `await` still
 * inside the caller's own call stack. But the language converts any throw before that point into a
 * rejected `Promise`, never a synchronous exception. Splitting
 * validation out into this synchronous wrapper, with the rest of the work in the `async` function
 * below, keeps the documented synchronous-throw guarantee actually true rather than aspirational.
 * @param config - the repo-contract configuration to run: its checks, concurrency, and their policies
 * @param options - run options; `options.checks` restricts execution to specific check ids, `options.signal` allows cancelling the run
 * @returns the assembled `evidence` for every check together with the aggregated `verdict`
 * @public
 */
export declare function runRepoContract<const TChecks extends CheckSchema>(config: RepoContractConfig<TChecks>, options?: RunRepoContractOptions): Promise<{
    evidence: Evidence<TChecks>;
    verdict: Verdict<TChecks>;
}>;

/**
 * Optional per-run controls for `runRepoContract`.
 * @public
 */
export declare interface RunRepoContractOptions {
    /** Abort the entire run. Checks already in flight are terminated; checks not yet started never spawn. Every configured check still receives a well-formed evidence entry (`status: "aborted"`) and still has its policy invoked. */
    readonly signal?: AbortSignal;
    /** Restrict this run to only these check ids (and whatever they `dependsOn`, transitively). Every configured check runs when omitted. */
    readonly checks?: string[];
    /**
     * Opt in to fail-fast: once a check that is not `expensive` has failed (it did not finish, or its
     * process exited non-zero), every `expensive` check that has not spawned yet is recorded as
     * `status: "aborted"` with `skipReason: "fail-fast"` rather than run. Off by default, so a run reports every problem; a skipped
     * check still gets evidence and a policy invocation, and is never a pass.
     */
    readonly failFast?: boolean;
    /**
     * Called once for each check as soon as it has reached a terminal state, before the run's other checks have
     * necessarily finished and before any policy runs. For progress output and for writing a check's raw output
     * somewhere durable while the run is still going. Its return value is ignored, and a hook that throws is
     * ignored too, as is an `async` hook whose promise rejects (an `async` hook is not waited for): reporting can never
     * change what a run does. The hook gets its own top-level copy of the evidence; the nested values are shared and
     * read-only.
     */
    readonly onEvidence?: (checkId: string, evidence: CheckEvidence) => void | Promise<void>;
    /**
     * Called once for each check as soon as its policy has returned a valid result, with that check's own
     * `PolicyResult`. Policies run after every check's evidence is assembled, so this fires once the checks
     * have all finished (the phasing is unchanged), in the order the policies settle, not declaration order. A
     * policy that throws is reported through the run's usual error, never through this hook. Its return value is
     * ignored, and a hook that throws, or an `async` one that rejects, is ignored too: reporting can never change what a
     * run does. The hook gets its own copy of the result.
     */
    readonly onVerdict?: (checkId: string, result: PolicyResult) => void | Promise<void>;
}

/**
 * Serializes a run for storage: stable, indented JSON with a trailing newline, one document per
 * file, matching the published `Evidence` and `Verdict` JSON Schemas (`repo-contract/schema`). The
 * caller decides where to write them; this package never touches the filesystem.
 * A `bigint` anywhere in the run (for example in a check's transformed output) cannot be written as
 * JSON, so it is written as its decimal string rather than making serialization throw.
 * @param run - The result of `runRepoContract`.
 * @param run.evidence - The run's evidence.
 * @param run.verdict - The run's verdict.
 * @returns The two documents as strings.
 * @public
 */
export declare function serializeRun<TChecks extends CheckSchema>(run: {
    readonly evidence: Evidence<TChecks>;
    readonly verdict: Verdict<TChecks>;
}): {
    readonly evidence: string;
    readonly verdict: string;
};

/**
 * Spawns a child process, given a resolved command, argv, and options. It is
 * modeled on `node:child_process`'s own `spawn(command, args, options)`
 * signature. So both `node:child_process.spawn` and cross-spawn's exported
 * `spawn` are drop-in values with no adapter code (see
 * specs/decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md).
 * repo-contract treats the supplied function as a trusted capability. It
 * calls it with a resolved command/argv/options and does not inspect, wrap,
 * or sanitize it. The spawned process's security properties are the
 * supplied function's own.
 * @public
 */
export declare type Spawner = (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;

/**
 * Hand-vendored from `@standard-schema/spec@1.1.0` (standardschema.dev), pinned
 * 2026-09-04: see specs/decisions/0012-hand-vendored-standard-schema-support-for-optional-output-validation.md for why this is
 * vendored rather than an installed dependency, and for the version-pin/re-diff process. Pure type
 * declarations, zero runtime code: assigning any real Zod/Valibot/ArkType (etc.) schema to this
 * type costs nothing at runtime. Only `StandardSchemaV1` (validation) is vendored here: the
 * separate, optional `StandardJSONSchemaV1` (JSON Schema conversion) extension
 * (standardschema.dev/json-schema) is out of scope; see the ADR.
 *
 * Upstream's `StandardSchemaV1.Props` actually extends a shared `StandardTypedV1.Props` base
 * (`version`/`vendor`/`types`). This vendored copy inlines those fields directly into one flat
 * interface, since repo-contract has no use for the shared base on its own. It is structurally
 * identical for any real schema object assigned to it. Re-diff against
 * `@standard-schema/spec`'s published `dist/index.d.ts` if this file is ever touched.
 *
 * Tagged `@public`, not tied to either re-exporting barrel's own stability tier. This type is
 * re-exported from both the Stable root barrel, for `output.schema`, and the Experimental
 * `repo-contract/helpers` barrel. This vendored copy's own shape only ever changes via a
 * deliberate re-diff against the pinned upstream spec version above. It never changes as a side
 * effect of either barrel's own stability classification.
 * @public
 */
export declare interface StandardSchemaV1<Input = unknown, Output = Input> {
    /** The Standard Schema properties. */
    readonly "~standard": StandardSchemaV1.Props<Input, Output>;
}

/**
 * Namespaced members of `StandardSchemaV1`: `Props`, `Result`, `SuccessResult`, `FailureResult`,
 * `Issue`, `PathSegment`, `Types`, `InferInput`, `InferOutput`.
 * @public
 */
export declare namespace StandardSchemaV1 {
    /** The Standard Schema properties interface. */
    export interface Props<Input = unknown, Output = Input> {
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
    export interface Options {
        /** Explicit support for additional vendor-specific parameters, if needed. */
        readonly libraryOptions?: Record<string, unknown> | undefined;
    }
    /** The result interface of the validate function. */
    export type Result<Output> = SuccessResult<Output> | FailureResult;
    /** The result interface if validation succeeds. */
    export interface SuccessResult<Output> {
        /** The typed output value. */
        readonly value: Output;
        /** A falsy value for `issues` indicates success. */
        readonly issues?: undefined;
    }
    /** The result interface if validation fails. */
    export interface FailureResult {
        /** The issues of failed validation. */
        readonly issues: readonly Issue[];
    }
    /** The issue interface of the failure output. */
    export interface Issue {
        /** The error message of the issue. */
        readonly message: string;
        /** The path of the issue, if any. */
        readonly path?: readonly (PropertyKey | PathSegment)[] | undefined;
    }
    /** The path segment interface of the issue. */
    export interface PathSegment {
        /** The key representing a path segment. */
        readonly key: PropertyKey;
    }
    /** The Standard Schema types interface. */
    export interface Types<Input = unknown, Output = Input> {
        /** The input type of the schema. */
        readonly input: Input;
        /** The output type of the schema. */
        readonly output: Output;
    }
    /** Infers the input type of a Standard Schema. */
    export type InferInput<Schema extends StandardSchemaV1> = NonNullable<Schema["~standard"]["types"]>["input"];
    /** Infers the output type of a Standard Schema. */
    export type InferOutput<Schema extends StandardSchemaV1> = NonNullable<Schema["~standard"]["types"]>["output"];
}

/**
 * A check's `output.schema["~standard"].validate()` threw synchronously, or returned a `Promise`
 * that rejected, instead of returning a `Result`. This is a bug in the consumer-supplied schema
 * object, not malformed check output. `PolicyThrewError` below draws the same line for a
 * throwing policy. A schema *returning* failure `issues` becomes an ordinary
 * `ParsedOutputFailure`, reported as data like a malformed-JSON parse failure. A
 * schema *throwing* means the validator itself is broken, so it propagates as a rejected
 * `runRepoContract()` promise instead. The original thrown/rejected value is preserved verbatim
 * via the native `Error` `cause` chain.
 * @public
 */
export declare class StandardSchemaValidateThrewError extends RepoContractError {
    /** Always `"REPO_CONTRACT_STANDARD_SCHEMA_VALIDATE_THREW"`. */
    readonly code = "REPO_CONTRACT_STANDARD_SCHEMA_VALIDATE_THREW";
    /** The id of the check whose `output.schema` threw during validation. */
    readonly checkId: string;
    constructor(checkId: string, cause: unknown);
}

/**
 * Synchronously spawns a child process and waits for it to exit: modeled directly on
 * `node:child_process`'s own `spawnSync(command, args, options)` signature, the same
 * drop-in-compatibility approach as `Spawner`. Used only for `RepoContractConfig.killProcessTree`
 * (Windows process-tree cleanup via `taskkill`, which fundamentally needs to run synchronously from
 * a signal-handling context that cannot `await` anything else: see
 * specs/decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md).
 * `node:child_process.spawnSync` and cross-spawn's exported `sync` are both valid, drop-in values.
 * @public
 */
export declare type SyncSpawner = (command: string, args: readonly string[], options: SpawnSyncOptions) => SpawnSyncReturns<Buffer | string>;

/**
 * `RunRepoContractOptions.checks` (a partial-run request) names a check id that doesn't exist in
 * the configured `checks`. Unlike a `dependsOn` id (already validated to exist by
 * `validateRepoContractConfig` before any run starts), `options.checks` is only ever checked once
 * `runChecks` actually resolves it: there is no earlier structural-validation pass for it.
 * @public
 */
export declare class UnknownCheckIdError extends RepoContractError {
    /** Always `"REPO_CONTRACT_UNKNOWN_CHECK_ID"`. */
    readonly code = "REPO_CONTRACT_UNKNOWN_CHECK_ID";
    /** The unrecognized check id named in `options.checks`. */
    readonly checkId: string;
    constructor(checkId: string);
}

/**
 * Same shape as a check schema `T`, except each check's own `dependsOn` is
 * narrowed from `readonly string[]` to only the *other* keys of that same
 * `T`. So a typo'd or self-referencing id fails to compile, not only at
 * runtime. `validate-config.ts` still enforces this at runtime for a config
 * that reaches `runRepoContract` without `defineRepoContract`'s static
 * checking (e.g. one assembled from untyped data).
 *
 * Used as an additional constraint on `defineRepoContract`'s parameter,
 * intersected with `RepoContractConfig<TChecks>` rather than substituted
 * for it. Inferring `TChecks` from the *unwrapped* `RepoContractConfig<TChecks>`
 * position first keeps every check's own `policy` callback contextually
 * typed. Inferring `TChecks` directly from a mapped or conditional type over
 * itself, as this type is, loses that contextual typing. This TypeScript
 * inference limit was confirmed during implementation.
 * @public
 */
export declare type ValidatedCheckSchema<T> = {
    readonly [K in keyof T]: T[K] extends CheckDefinitionConfig ? Omit<T[K], "dependsOn"> & {
        readonly dependsOn?: readonly (Exclude<keyof T, K> & string)[];
    } : never;
};

/**
 * Versioned, immutable aggregate result of evaluating every configured
 * check's policy against its evidence: each check's own `PolicyResult`,
 * verbatim, keyed by check id. `passed` is `true` only if every check's
 * `outcome` is `"pass"` or `"warn"`: `"fail"` is the only outcome that
 * fails the run; one failing check never collapses into a single generic
 * message, every check remains individually inspectable under `checks`.
 * Versioned independently of `Evidence` (see `VERSIONING.md`'s
 * schema-versioning policy): `version: 2` reflects `checks[id]` changing
 * shape from `{ passed, reason? }` to a full `PolicyResult`
 * (`{ outcome, rationale }`); see ADR 0001.
 * @public
 */
export declare interface Verdict<TChecks extends CheckSchema = CheckSchema> {
    /** Schema version of this shape; see `VERSIONING.md`. */
    readonly version: 2;
    /** `true` only if every check's `outcome` is `"pass"` or `"warn"`. */
    readonly passed: boolean;
    /** Each configured check's own `PolicyResult`, verbatim, keyed by check id. */
    readonly checks: {
        readonly [K in keyof TChecks]: PolicyResult;
    };
}

export { }
