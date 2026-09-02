/** One fully configured check: how to run it, how (if at all) to interpret its output, and the policy that decides whether its evidence is acceptable. */
export declare interface CheckDefinition extends CheckDefinitionConfig {
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

/** One partially configured check: how to run it, how (if at all) to interpret its output, and the policy that decides whether its evidence is acceptable. */
export declare interface CheckDefinitionConfig {
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
     * When `true`, `run` must be a `string` and is passed to the platform
     * shell as-is (via cross-spawn's own `shell` option) -- shell metacharacter
     * rejection does not apply. See SECURITY.md before enabling this.
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
 * `output.value` is typed `unknown` for every format, including `"text"`
 * (even though `parseText` always produces a `string` at runtime) --
 * neither repo-contract nor TypeScript's generic inference can reliably
 * carry a specific check's own literal `output.format` through to that
 * same check's `policy` parameter once several checks with heterogeneous
 * formats live together in one `checks` record (a real TypeScript
 * inference limitation hit and confirmed during implementation, not a
 * hypothetical -- see specs/decisions/ for the isolated repro). A policy
 * author narrows or casts `.value` themselves, exactly as they already must
 * for `"json"`/`"yaml"` where no schema knowledge exists either way.
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
    /** The parsed interpretation of `stdout`, present only if this check's config requested a `format`. */
    readonly output?: ParsedOutput<unknown>;
}

/** The full set of checks in a `RepoContractConfig`, keyed by check id. */
export declare type CheckSchema = Record<string, CheckDefinition>;

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
 */
export declare type CheckStatus = "completed" | "timed_out" | "signaled" | "host_terminated" | "spawn_error" | "aborted";

/**
 * Identity function whose only job is type inference: authoring a config
 * through `defineRepoContract` lets each check's `output` (present or
 * absent, and which format) flow into that same check's `policy` parameter
 * type, without the consumer writing any type annotations themselves. It
 * also statically validates every check's `dependsOn` against its sibling
 * check ids (see `ValidatedCheckSchema`) -- a typo'd or self-referencing id
 * fails to compile here rather than only failing at runtime. Performs no
 * other validation and no cloning -- `runRepoContract` validates whatever
 * config it is ultimately given, whether or not it passed through this
 * function first.
 *
 * `const TChecks` (TypeScript 5.0's `const` type parameter modifier) keeps
 * each check's own configuration -- notably whether `output` is present at
 * all -- from being widened during inference; without it, TypeScript's
 * inference for a `Record` of heterogeneous generic entries does not
 * reliably preserve that per-check shape once a callback property
 * (`policy`) is also present. See `InferParsedValue` in types.ts for the
 * related limitation this does not fully solve.
 *
 * `TChecks` is inferred from the plain, unwrapped `RepoContractConfig<TChecks>`
 * position -- the `ValidatedCheckSchema<TChecks>` constraint on `checks` is
 * intersected in afterward, computed from that already-inferred `TChecks`,
 * rather than substituted in its place. Inferring `TChecks` directly from a
 * mapped/conditional type over itself (as `ValidatedCheckSchema` is) loses
 * the contextual typing every check's `policy` callback otherwise gets --
 * another real, confirmed TypeScript inference limitation, distinct from
 * the `output`-to-`policy` one above.
 * @param config - the config to type-check and return unchanged.
 * @returns the same `config` object, untouched and uncloned.
 */
export declare function defineRepoContract<const TChecks extends CheckSchema>(config: RepoContractConfig<TChecks> & {
    readonly checks: ValidatedCheckSchema<TChecks>;
}): RepoContractConfig<TChecks>;

/**
 * A check's `dependsOn` names a check declared *later* in the same `checks` object.
 * `dependsOn` may only reference a check declared earlier -- see `CheckDefinition.dependsOn`'s own
 * doc comment. Declaration order doubles as the required topological order, so this is the only
 * way an invalid dependency graph can arise; a real cycle is structurally impossible once every
 * edge points backward. Thrown synchronously, before any check spawns.
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
 * Versioned, immutable record of one complete `runRepoContract` execution --
 * every configured check's evidence, plus timing for the run as a whole.
 * Says nothing about whether any of it was acceptable; see `Verdict`.
 * Additive fields are a compatible change; changing or removing an existing
 * field requires bumping this version number (see VERSIONING.md).
 */
export declare interface Evidence<TChecks extends CheckSchema = CheckSchema> {
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

/** One check's `CheckDefinition` is structurally invalid -- e.g. an empty `run`, a `run` string containing an unquoted shell operator without `shell: true`, or a missing `policy`. Thrown synchronously, before that check (or any other) spawns. */
export declare class InvalidCheckConfigError extends RepoContractError {
    /** Always `"REPO_CONTRACT_INVALID_CHECK_CONFIG"`. */
    readonly code = "REPO_CONTRACT_INVALID_CHECK_CONFIG";
    /** The id of the check whose configuration was invalid. */
    readonly checkId: string;
    constructor(checkId: string, reason: string);
}

/** The top-level `RepoContractConfig` itself is structurally invalid -- e.g. `checks` is not an object, or `concurrency` is not a positive integer. (A `checks` object with zero entries is deliberately valid: the run produces an empty, passing `Verdict`.) Thrown synchronously by `runRepoContract`, before anything spawns -- not by `defineRepoContract`, which performs no runtime validation of its own (see its own doc comment). */
export declare class InvalidRepoContractConfigError extends RepoContractError {
    /** Always `"REPO_CONTRACT_INVALID_CONFIG"`. */
    readonly code = "REPO_CONTRACT_INVALID_CONFIG";
    constructor(reason: string);
}

/**
 * Public type surface for repo-contract. Evidence describes what happened;
 * Verdict describes whether it was acceptable. They are deliberately
 * separate concepts (see specs/architecture.md) even though
 * `runRepoContract` returns both together.
 */
/** Output interpretation a check can explicitly request. No format requested means no parsing -- the consumer gets raw stdout/stderr only. */
export declare type OutputFormat = "json" | "yaml" | "text";

declare type OutputFormatForError = "yaml";

/** The result of a check's requested output-format parse: either a successful `ParsedOutputSuccess`, or a `ParsedOutputFailure`. */
export declare type ParsedOutput<T> = ParsedOutputSuccess<T> | ParsedOutputFailure;

/**
 * A requested parse of a check's stdout failed. The raw stdout on the
 * parent `CheckEvidence` is preserved unchanged -- a parse failure is never
 * silently reinterpreted or discarded.
 */
export declare interface ParsedOutputFailure {
    /** The format that was requested (and failed to parse). */
    readonly format: OutputFormat;
    /** Always `false`. */
    readonly success: false;
    /** The parse error's message. */
    readonly error: string;
}

/** A requested parse of a check's stdout succeeded. */
export declare interface ParsedOutputSuccess<T> {
    /** The format that was requested and successfully parsed. */
    readonly format: OutputFormat;
    /** Always `true`. */
    readonly success: true;
    /** The parsed value. */
    readonly value: T;
}

/** A check requested `output: { format: "yaml" }` but the optional `yaml` peer dependency is not installed. Thrown when that check's output is parsed, not at config-validation time (parsing only happens after the process has already run). */
export declare class ParserDependencyMissingError extends RepoContractError {
    /** Always `"REPO_CONTRACT_PARSER_DEPENDENCY_MISSING"`. */
    readonly code = "REPO_CONTRACT_PARSER_DEPENDENCY_MISSING";
    /** The id of the check whose output could not be parsed. */
    readonly checkId: string;
    /** The output format that was requested but whose optional peer dependency is missing. */
    readonly format: OutputFormatForError;
    constructor(checkId: string, format: OutputFormatForError, cause: unknown);
}

/**
 * A repository-owned decision about whether one check's evidence is
 * acceptable. Returns a `PolicyResult` -- never a bare boolean or string --
 * so a policy can communicate more than pass/fail even when the run is
 * otherwise acceptable (see `PolicyResult`/`PolicyOutcome`). May be
 * synchronous or return a `Promise`. repo-contract does not interpret
 * `rationale` beyond storing and surfacing it verbatim; the package has no
 * opinion about what makes a check pass, fail, or warrant a `warn`.
 */
export declare type Policy<TChecks extends CheckSchema = CheckSchema> = (ctx: PolicyContext<TChecks>) => PolicyResult | Promise<PolicyResult>;

/**
 * What a check's `policy` function is called with. `result` is that check's
 * own evidence; `evidence` is the complete run's evidence, including every
 * sibling check -- present so a policy can make cross-check decisions (e.g.
 * "only enforce the mutation-score threshold if the tests check passed").
 * By the time any policy runs, every check has already finished executing
 * and every check's evidence has already been assembled -- no policy ever
 * observes a partially-populated `evidence` (see specs/architecture.md).
 */
export declare interface PolicyContext<TChecks extends CheckSchema = CheckSchema> {
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
 */
export declare type PolicyOutcome = "pass" | "fail" | "warn";

/**
 * `PolicyThrewError`'s other special case, alongside
 * `PolicyReadUnrequestedOutputError`: this check *did* request
 * `output: { format: ... }`, but that parse itself failed
 * (`result.output.success === false` -- see `ParsedOutputFailure` in types.ts, which
 * has no `value` field, only `error`), and the policy read a property off
 * `result.output.value` anyway without checking `.success` first. Detected the same
 * way `runPolicies` detects the sibling case -- a thrown `TypeError` whose own
 * message shows a property read off `undefined` -- cross-checked against this
 * check's own evidence having `output.success === false`, so a genuinely unrelated
 * `TypeError`, or a check whose parse actually succeeded, still becomes a plain
 * `PolicyThrewError`. Unlike `PolicyReadUnrequestedOutputError`, the read property
 * isn't restricted to a known list here -- `result.output.value`'s shape is whatever
 * the external tool printed, entirely unknown to repo-contract -- so this match is
 * necessarily a little broader. `cause` still holds the original `TypeError`
 * verbatim; the message never repeats `result.output.error`'s own text, which may
 * contain raw stdout content (see SECURITY.md).
 */
export declare class PolicyReadFailedParseValueError extends RepoContractError {
    /** Always `"REPO_CONTRACT_POLICY_READ_FAILED_PARSE_VALUE"`. */
    readonly code = "REPO_CONTRACT_POLICY_READ_FAILED_PARSE_VALUE";
    /** The id of the check whose policy read `result.output.value` after a failed parse. */
    readonly checkId: string;
    constructor(checkId: string, property: string, cause: unknown);
}

/**
 * A narrower `runPolicies` throws instead of `PolicyThrewError` when the
 * thrown `TypeError`'s own message shows it came from reading a
 * `result.output` property (`.success`, `.value`, `.error`, or `.format`),
 * and this check's `CheckEvidence.output` really is `undefined` -- which
 * happens only when its config never requested `output: { format: ... }` in
 * the first place (see `CheckEvidence.output` in types.ts). Detected from
 * the `TypeError`'s exact V8-produced message ("Cannot read properties of
 * undefined (reading '...')") cross-checked against that `undefined` fact,
 * so it is thrown only for a policy that plausibly hit this exact mistake --
 * any other `TypeError`, or a check that did request a format, still becomes
 * a plain `PolicyThrewError`. This is best-effort inference from the
 * `TypeError`'s message text, not a verified trace back to `result.output`
 * itself -- V8's message carries only the property name, so an unrelated
 * bug that happens to read the same property name off some other
 * `undefined` value can still be misclassified this way (see
 * `unrequestedOutputProperty` in run-policies.ts). `cause` still holds the
 * original `TypeError` verbatim, exactly as `PolicyThrewError` guarantees
 * for every other policy failure, so the true cause remains recoverable
 * either way.
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
 * unstructured command output, exactly what this type exists to avoid. See
 * specs/architecture.md for the evidence/rationale/judgment distinction this
 * type is built around: evidence answers "what happened?", `rationale`
 * answers "what does the repository's policy conclude about what
 * happened?", and a policy's `outcome` is not the final word -- a human or
 * AI consumer still makes the final judgment call using both.
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
 * `Error` `cause` chain -- never stringified, summarized, or discarded --
 * so a consumer catching this can still inspect exactly what their own
 * policy code did wrong.
 *
 * A policy throwing never stops any other check's policy from running --
 * every configured check's policy is invoked exactly once regardless of
 * what any other policy does. If more than one policy fails this way in the
 * same run, `runRepoContract()` rejects with a native `AggregateError` whose
 * `errors` array holds one error per failing check -- `PolicyThrewError`,
 * or one of its two narrower siblings below (`PolicyReadUnrequestedOutputError`,
 * `PolicyReadFailedParseValueError`) when the failure matches one of their
 * more specific shapes -- rather than surfacing only the first one found.
 */
export declare class PolicyThrewError extends RepoContractError {
    /** Always `"REPO_CONTRACT_POLICY_THREW"`. */
    readonly code = "REPO_CONTRACT_POLICY_THREW";
    /** The id of the check whose policy threw or rejected. */
    readonly checkId: string;
    constructor(checkId: string, cause: unknown);
}

/** Top-level configuration passed to `defineRepoContract`/`runRepoContract`. */
export declare interface RepoContractConfig<TChecks extends CheckSchema = CheckSchema> {
    /** Every check to run, keyed by check id. */
    readonly checks: TChecks;
    /** Maximum number of checks to execute concurrently. Defaults to `os.availableParallelism()`. Must be a positive integer. */
    readonly concurrency?: number;
}

/**
 * Error hierarchy for repo-contract. Every concrete error carries a stable
 * `code` string for programmatic handling, and never embeds raw
 * stdout/stderr/env values in its message -- only check ids and field names
 * (see SECURITY.md).
 *
 * Three distinct failure classes are kept deliberately separate (see
 * specs/architecture.md):
 *   - Structural config problems throw synchronously, before any process
 *     spawns (`InvalidRepoContractConfigError`, `InvalidCheckConfigError`).
 *   - Anything only discoverable by attempting execution becomes evidence,
 *     never a throw (a bad `cwd`, a missing binary -- recorded as
 *     `status: "spawn_error"` on that check's `CheckEvidence`).
 *   - A policy function throwing or rejecting is a bug in consumer code, not
 *     a check failing its contract -- it propagates as a rejected
 *     `runRepoContract()` promise (`PolicyThrewError`), never silently
 *     turned into a failed verdict entry.
 */
export declare abstract class RepoContractError extends Error {
    /** Stable, machine-readable identifier for this error's specific failure mode. */
    abstract readonly code: string;
}

/**
 * Executes every configured check, collects its evidence, optionally parses
 * its output, evaluates every check's repository-owned policy against the
 * complete evidence, and aggregates a verdict. Never calls `process.exit()`
 * -- returns data; the caller decides what to do with `verdict.passed`.
 *
 * Structural configuration problems throw synchronously before any process
 * spawns. Anything only discoverable by attempting execution (a missing
 * binary, a bad `cwd`) becomes evidence on that check (`status:
 * "spawn_error"`), never a throw. A policy function throwing or rejecting
 * rejects this function's own returned promise (`PolicyThrewError`, or an
 * `AggregateError` of them if more than one policy failed this way) --
 * distinct from a policy that ran fine and simply returned a failure
 * string. See `src/errors.ts` for the full distinction.
 *
 * Execution and policy evaluation are strictly phased: every check finishes
 * running and every check's evidence is fully assembled before any policy
 * is invoked (see specs/architecture.md) -- a policy can safely read
 * `ctx.evidence` for any sibling check's result.
 *
 * Deliberately not declared `async`: validation runs and can throw before this function returns
 * anything at all, so a config problem is a genuine synchronous exception to the caller (as
 * documented above and on `InvalidRepoContractConfigError`/`InvalidCheckConfigError`/
 * `DependencyDeclaredLaterError`) -- an `async function`'s body runs to its first `await` still
 * inside the caller's own call stack, but any throw before that point is nonetheless converted by
 * the language into a rejected `Promise`, never surfaced as a synchronous exception. Splitting
 * validation out into this synchronous wrapper, with the rest of the work in the `async` function
 * below, keeps the documented synchronous-throw guarantee actually true rather than aspirational.
 * @param config - the repo-contract configuration to run: its checks, concurrency, and their policies
 * @param options - run options; `options.checks` restricts execution to specific check ids, `options.signal` allows cancelling the run
 * @returns the assembled `evidence` for every check together with the aggregated `verdict`
 */
export declare function runRepoContract<const TChecks extends CheckSchema>(config: RepoContractConfig<TChecks>, options?: RunRepoContractOptions): Promise<{
    evidence: Evidence<TChecks>;
    verdict: Verdict<TChecks>;
}>;

/** Optional per-run controls for `runRepoContract`. */
export declare interface RunRepoContractOptions {
    /** Abort the entire run. Checks already in flight are terminated; checks not yet started never spawn. Every configured check still receives a well-formed evidence entry (`status: "aborted"`) and still has its policy invoked. */
    readonly signal?: AbortSignal;
    /** Restrict this run to only these check ids (and whatever they `dependsOn`, transitively). Every configured check runs when omitted. */
    readonly checks?: string[];
}

/**
 * `RunRepoContractOptions.checks` (a partial-run request) names a check id that doesn't exist in
 * the configured `checks`. Unlike a `dependsOn` id (already validated to exist by
 * `validateRepoContractConfig` before any run starts), `options.checks` is only ever checked once
 * `runChecks` actually resolves it -- there is no earlier structural-validation pass for it.
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
 * `T` -- so a typo'd or self-referencing id fails to compile instead of
 * only failing at runtime (`validate-config.ts` still enforces this at
 * runtime too, for any config that reaches `runRepoContract` without having
 * gone through `defineRepoContract`'s static checking first, e.g. one
 * assembled dynamically from untyped data).
 *
 * Used as an additional constraint on `defineRepoContract`'s parameter,
 * intersected with `RepoContractConfig<TChecks>` rather than substituted
 * for it -- inferring `TChecks` from the *unwrapped* `RepoContractConfig<TChecks>`
 * position first is what keeps every check's own `policy` callback
 * contextually typed (a real TypeScript inference limitation: inferring
 * `TChecks` directly from a mapped/conditional type over itself, as this
 * type is, loses that contextual typing -- confirmed during implementation,
 * not a hypothetical).
 */
export declare type ValidatedCheckSchema<T> = {
    readonly [K in keyof T]: T[K] extends CheckDefinitionConfig ? Omit<T[K], "dependsOn"> & {
        readonly dependsOn?: readonly (Exclude<keyof T, K> & string)[];
    } : never;
};

/**
 * Versioned, immutable aggregate result of evaluating every configured
 * check's policy against its evidence -- each check's own `PolicyResult`,
 * verbatim, keyed by check id. `passed` is `true` only if every check's
 * `outcome` is `"pass"` or `"warn"` -- `"fail"` is the only outcome that
 * fails the run; one failing check never collapses into a single generic
 * message, every check remains individually inspectable under `checks`.
 * Versioned independently of `Evidence` (see VERSIONING.md's
 * schema-versioning policy) -- `version: 2` reflects `checks[id]` changing
 * shape from `{ passed, reason? }` to a full `PolicyResult`
 * (`{ outcome, rationale }`); see ADR 0001.
 */
export declare interface Verdict<TChecks extends CheckSchema = CheckSchema> {
    /** Schema version of this shape; see VERSIONING.md. */
    readonly version: 2;
    /** `true` only if every check's `outcome` is `"pass"` or `"warn"`. */
    readonly passed: boolean;
    /** Each configured check's own `PolicyResult`, verbatim, keyed by check id. */
    readonly checks: {
        readonly [K in keyof TChecks]: PolicyResult;
    };
}

export { }
