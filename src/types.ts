/**
 * Public type surface for repo-contract. Evidence describes what happened;
 * Verdict describes whether it was acceptable. They are deliberately
 * separate concepts (see specs/architecture.md) even though
 * `runRepoContract` returns both together.
 */

import type {
  ChildProcess,
  SpawnOptions,
  SpawnSyncOptions,
  SpawnSyncReturns,
} from "node:child_process"

import type { StandardSchemaV1 } from "./standard-schema/types.js"

/**
 * Output interpretation a check can explicitly request. No format requested means no parsing:
 * the consumer gets raw stdout/stderr only. Other formats (e.g. YAML) are left out on purpose:
 * JSON and plain text cover every check this package or its consumers run. A check whose tool
 * emits another format converts it in its own `run` step, or reads it in its `policy` function
 * with a library it already depends on. That keeps this package free of an optional peer
 * dependency carried on everyone's behalf.
 * @public
 */
export type OutputFormat = "json" | "text"

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
export type CheckStatus =
  "completed" | "timed_out" | "signaled" | "host_terminated" | "spawn_error" | "aborted"

/**
 * A requested parse of a check's stdout succeeded.
 * @public
 */
export interface ParsedOutputSuccess<T> {
  /** The format that was requested and successfully parsed. */
  readonly format: OutputFormat
  /** Always `true`. */
  readonly success: true
  /** The parsed value. */
  readonly value: T
}

/**
 * A requested parse of a check's stdout failed. The raw stdout on the
 * parent `CheckEvidence` is preserved unchanged: a parse failure is never
 * silently reinterpreted or discarded.
 * @public
 */
export interface ParsedOutputFailure {
  /** The format that was requested (and failed to parse). */
  readonly format: OutputFormat
  /** Always `false`. */
  readonly success: false
  /** The parse error's message. */
  readonly error: string
}

/**
 * The result of a check's requested output-format parse: either a successful `ParsedOutputSuccess`, or a `ParsedOutputFailure`.
 * @public
 */
export type ParsedOutput<T> = ParsedOutputSuccess<T> | ParsedOutputFailure

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
export interface CheckEvidence {
  /** The executable that was actually spawned (after tokenization, if `run` was a string). */
  readonly command: string
  /** The arguments passed to `command`, exactly as spawned. */
  readonly args: readonly string[]
  /** ISO 8601 timestamp of when the process was spawned. */
  readonly startedAt: string
  /** ISO 8601 timestamp of when the process reached its terminal state. */
  readonly completedAt: string
  /** Wall-clock time from spawn to termination, in milliseconds. */
  readonly durationMs: number
  /** `null` when the process never exited normally: see `signal` and `status`. */
  readonly exitCode: number | null
  /** The signal that terminated the process, if any. `null` for a normal exit or a spawn failure. */
  readonly signal: NodeJS.Signals | null
  /** The process's raw standard output, captured verbatim up to an internal size cap (10 MiB); content beyond the cap is replaced with a truncation marker. */
  readonly stdout: string
  /** The process's raw standard error, captured verbatim up to an internal size cap (10 MiB); content beyond the cap is replaced with a truncation marker. */
  readonly stderr: string
  /** Why the process reached its terminal state; see `CheckStatus`. */
  readonly status: CheckStatus
  /**
   * Present only when the check never spawned because the run opted in to fail-fast
   * (`RunRepoContractOptions.failFast`) and a cheaper check had already failed (see
   * `CheckDefinitionConfig.expensive`). Such a check has `status: "aborted"`: it did not run, so a
   * policy must never read it as a pass.
   */
  readonly skipReason?: "fail-fast"
  /** Populated only for `status === "spawn_error"`: the underlying Node error message (e.g. "spawn foo ENOENT"). Never populated for any other status. */
  readonly spawnError?: string
  /** Populated only for `status === "spawn_error"`: the underlying Node `ErrnoException`'s structured `.code` (e.g. `"ENOENT"`, `"EACCES"`), when Node provides one. Never populated for any other status. Distinguishes "the executable does not exist" from other spawn failures (permission denied, invalid executable format, etc.) without parsing `spawnError`'s free-text message. */
  readonly spawnErrorCode?: string
  /**
   * The parsed interpretation of `stdout`, present only if this check's config requested a
   * `format`. If that config also supplied `output.schema`, a successful parse is additionally
   * validated (and possibly transformed) by that schema before landing here: see this
   * interface's own doc comment above and `CheckDefinitionConfig.output.schema`.
   */
  readonly output?: ParsedOutput<unknown>
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
export interface Evidence<TChecks extends CheckSchema = CheckSchema> {
  /** Schema version of this shape; see `VERSIONING.md`. */
  readonly version: 1
  /** ISO 8601 timestamp of when the run began. */
  readonly startedAt: string
  /** ISO 8601 timestamp of when the last check finished. */
  readonly completedAt: string
  /** Wall-clock time for the run as a whole, in milliseconds. */
  readonly durationMs: number
  /** Each configured check's own evidence, keyed by check id. */
  readonly checks: { readonly [K in keyof TChecks]: CheckEvidence }
}

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
export interface PolicyContext<TChecks extends CheckSchema = CheckSchema> {
  /** This check's own evidence. */
  readonly result: CheckEvidence
  /** The complete run's evidence, including every sibling check. */
  readonly evidence: Evidence<TChecks>
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
  readonly dependencies: Readonly<Record<string, CheckEvidence>>
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
export type PolicyOutcome = "pass" | "fail" | "warn"

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
export interface PolicyResult {
  /** The policy's pass/fail/warn decision. */
  readonly outcome: PolicyOutcome
  /** Why the policy reached `outcome`, in enough detail to act on without rerunning anything. */
  readonly rationale: string
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
export type Policy<TChecks extends CheckSchema = CheckSchema> = (
  ctx: PolicyContext<TChecks>,
) => PolicyResult | Promise<PolicyResult>

/**
 * One partially configured check: how to run it, how (if at all) to interpret its output, and the policy that decides whether its evidence is acceptable.
 * @public
 */
export interface CheckDefinitionConfig {
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
  readonly run: string | readonly string[]
  /**
   * Opt into real shell execution instead of the safe argv-only default.
   * When `true` (or left unset with `RepoContractConfig.shell: true` as the
   * run-wide default (see that field), `run` must be a `string` and is
   * passed to the platform shell as-is (via the supplied `Spawner`'s own
   * `shell` option)) shell metacharacter rejection does not apply. See
   * SECURITY.md before enabling this.
   */
  readonly shell?: boolean
  /** Working directory for the spawned process. Defaults to the current process's `cwd`. */
  readonly cwd?: string
  /** Additional environment variables for the spawned process, applied on top of (or, if `inheritEnv` is `false`, instead of) the inherited environment. */
  readonly env?: Readonly<Record<string, string>>
  /** Whether the spawned process inherits `process.env`. Defaults to `true`: most check commands (npm scripts, locally-installed CLIs) need `PATH` and similar to resolve at all. Set to `false` for a minimal environment containing only `env` (plus whatever the OS itself always provides). */
  readonly inheritEnv?: boolean
  /** Maximum time to let this check's process run before it is terminated and recorded with `status: "timed_out"`. No timeout by default. */
  readonly timeoutMs?: number
  /** Request that stdout be parsed as this format. Omit for no parsing: the consumer gets raw stdout/stderr only. */
  readonly output?: {
    readonly format: OutputFormat
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
    readonly schema?: StandardSchemaV1
  }
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
  readonly isolated?: boolean
  /**
   * Marks a check as costly enough to be worth skipping when the run asked for fail-fast
   * (`RunRepoContractOptions.failFast`) and a check that is not marked has already failed. Such a
   * check that has not yet spawned then resolves to `status: "aborted"` evidence with `skipReason: "fail-fast"` instead of running.
   * A check that is already running is never killed, and an `expensive` check failing never skips
   * anything. Skipping is decided when the check's turn comes, so to make it certain, declare the
   * expensive check after (or `dependsOn`) the cheap ones. Does nothing unless the run opts in to
   * fail-fast. Defaults to `false`.
   */
  readonly expensive?: boolean
  /** Decides whether this check's evidence is acceptable, once its process has finished running. */
  readonly policy: Policy
}

/**
 * One fully configured check: how to run it, how (if at all) to interpret its output, and the policy that decides whether its evidence is acceptable.
 * @public
 */
export interface CheckDefinition extends CheckDefinitionConfig {
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
  readonly dependsOn?: readonly string[]
}

/**
 * The full set of checks in a `RepoContractConfig`, keyed by check id.
 * @public
 */
export type CheckSchema = Record<string, CheckDefinition>

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
export type ValidatedCheckSchema<T> = {
  readonly [K in keyof T]: T[K] extends CheckDefinitionConfig
    ? Omit<T[K], "dependsOn"> & {
        readonly dependsOn?: readonly (Exclude<keyof T, K> & string)[]
      }
    : never
}

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
export type Spawner = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => ChildProcess

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
export type SyncSpawner = (
  command: string,
  args: readonly string[],
  options: SpawnSyncOptions,
) => SpawnSyncReturns<Buffer | string>

/**
 * Top-level configuration passed to `defineRepoContract`/`runRepoContract`.
 * @public
 */
export interface RepoContractConfig<TChecks extends CheckSchema = CheckSchema> {
  /** Every check to run, keyed by check id. */
  readonly checks: TChecks
  /** Maximum number of checks to execute concurrently. Defaults to `os.availableParallelism()`. Must be a positive integer. */
  readonly concurrency?: number
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
  readonly spawn: Spawner
  /**
   * The ambient environment repo-contract treats as inheritable by each
   * check whose `inheritEnv` is not `false` (the default). Typically
   * `process.env`, passed through by reference, never copied. So a consumer
   * that mutates `process.env` mid-run sees the change in later-spawned
   * checks, as if repo-contract had read `process.env` itself. Required: repo-contract never reads
   * `process.env` internally (see ADR 0011 above `Spawner`). Typed as
   * `NodeJS.ProcessEnv` so `env: process.env` needs no casting.
   */
  readonly env: NodeJS.ProcessEnv
  /**
   * Global default for every check's own `shell` when that check doesn't
   * set one itself (`check.shell ?? shell ?? false`). Defaults to `false`,
   * the safe argv-only mode: unrelated to which `spawn` is supplied; see
   * `spawn`'s own doc comment for that distinction.
   */
  readonly shell?: boolean
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
  readonly killProcessTree?: SyncSpawner
}

/**
 * Optional per-run controls for `runRepoContract`.
 * @public
 */
export interface RunRepoContractOptions {
  /** Abort the entire run. Checks already in flight are terminated; checks not yet started never spawn. Every configured check still receives a well-formed evidence entry (`status: "aborted"`) and still has its policy invoked. */
  readonly signal?: AbortSignal
  /** Restrict this run to only these check ids (and whatever they `dependsOn`, transitively). Every configured check runs when omitted. */
  readonly checks?: string[]
  /**
   * Opt in to fail-fast: once a check that is not `expensive` has failed (it did not finish, or its
   * process exited non-zero), every `expensive` check that has not spawned yet is recorded as
   * `status: "aborted"` with `skipReason: "fail-fast"` rather than run. Off by default, so a run reports every problem; a skipped
   * check still gets evidence and a policy invocation, and is never a pass.
   */
  readonly failFast?: boolean
  /**
   * Called once for each check as soon as it has reached a terminal state, before the run's other checks have
   * necessarily finished and before any policy runs. For progress output and for writing a check's raw output
   * somewhere durable while the run is still going. Its return value is ignored, and a hook that throws is
   * ignored too, as is an `async` hook whose promise rejects (an `async` hook is not waited for): reporting can never
   * change what a run does. The hook gets its own top-level copy of the evidence; the nested values are shared and
   * read-only.
   */
  readonly onEvidence?: (checkId: string, evidence: CheckEvidence) => void | Promise<void>
  /**
   * Called once for each check as soon as its policy has returned a valid result, with that check's own
   * `PolicyResult`. Policies run after every check's evidence is assembled, so this fires once the checks
   * have all finished (the phasing is unchanged), in the order the policies settle, not declaration order. A
   * policy that throws is reported through the run's usual error, never through this hook. Its return value is
   * ignored, and a hook that throws, or an `async` one that rejects, is ignored too: reporting can never change what a
   * run does. The hook gets its own copy of the result.
   */
  readonly onVerdict?: (checkId: string, result: PolicyResult) => void | Promise<void>
}

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
export interface Verdict<TChecks extends CheckSchema = CheckSchema> {
  /** Schema version of this shape; see `VERSIONING.md`. */
  readonly version: 2
  /** `true` only if every check's `outcome` is `"pass"` or `"warn"`. */
  readonly passed: boolean
  /** Each configured check's own `PolicyResult`, verbatim, keyed by check id. */
  readonly checks: { readonly [K in keyof TChecks]: PolicyResult }
}
