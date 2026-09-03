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

/** Output interpretation a check can explicitly request. No format requested means no parsing -- the consumer gets raw stdout/stderr only. */
export type OutputFormat = "json" | "yaml" | "text"

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
export type CheckStatus =
  "completed" | "timed_out" | "signaled" | "host_terminated" | "spawn_error" | "aborted"

/** A requested parse of a check's stdout succeeded. */
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
 * parent `CheckEvidence` is preserved unchanged -- a parse failure is never
 * silently reinterpreted or discarded.
 */
export interface ParsedOutputFailure {
  /** The format that was requested (and failed to parse). */
  readonly format: OutputFormat
  /** Always `false`. */
  readonly success: false
  /** The parse error's message. */
  readonly error: string
}

/** The result of a check's requested output-format parse: either a successful `ParsedOutputSuccess`, or a `ParsedOutputFailure`. */
export type ParsedOutput<T> = ParsedOutputSuccess<T> | ParsedOutputFailure

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
  /** `null` when the process never exited normally -- see `signal` and `status`. */
  readonly exitCode: number | null
  /** The signal that terminated the process, if any. `null` for a normal exit or a spawn failure. */
  readonly signal: NodeJS.Signals | null
  /** The process's raw standard output, captured verbatim up to an internal size cap (10 MiB); content beyond the cap is replaced with a truncation marker. */
  readonly stdout: string
  /** The process's raw standard error, captured verbatim up to an internal size cap (10 MiB); content beyond the cap is replaced with a truncation marker. */
  readonly stderr: string
  /** Why the process reached its terminal state; see `CheckStatus`. */
  readonly status: CheckStatus
  /** Populated only for `status === "spawn_error"` -- the underlying Node error message (e.g. "spawn foo ENOENT"). Never populated for any other status. */
  readonly spawnError?: string
  /** Populated only for `status === "spawn_error"` -- the underlying Node `ErrnoException`'s structured `.code` (e.g. `"ENOENT"`, `"EACCES"`), when Node provides one. Never populated for any other status. Distinguishes "the executable does not exist" from other spawn failures (permission denied, invalid executable format, etc.) without parsing `spawnError`'s free-text message. */
  readonly spawnErrorCode?: string
  /** The parsed interpretation of `stdout`, present only if this check's config requested a `format`. */
  readonly output?: ParsedOutput<unknown>
}

/**
 * Versioned, immutable record of one complete `runRepoContract` execution --
 * every configured check's evidence, plus timing for the run as a whole.
 * Says nothing about whether any of it was acceptable; see `Verdict`.
 * Additive fields are a compatible change; changing or removing an existing
 * field requires bumping this version number (see VERSIONING.md).
 */
export interface Evidence<TChecks extends CheckSchema = CheckSchema> {
  /** Schema version of this shape; see VERSIONING.md. */
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
 * sibling check -- present so a policy can make cross-check decisions (e.g.
 * "only enforce the mutation-score threshold if the tests check passed").
 * By the time any policy runs, every check has already finished executing
 * and every check's evidence has already been assembled -- no policy ever
 * observes a partially-populated `evidence` (see specs/architecture.md).
 */
export interface PolicyContext<TChecks extends CheckSchema = CheckSchema> {
  /** This check's own evidence. */
  readonly result: CheckEvidence
  /** The complete run's evidence, including every sibling check. */
  readonly evidence: Evidence<TChecks>
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
  readonly dependencies: Readonly<Record<string, CheckEvidence>>
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
export type PolicyOutcome = "pass" | "fail" | "warn"

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
export interface PolicyResult {
  /** The policy's pass/fail/warn decision. */
  readonly outcome: PolicyOutcome
  /** Why the policy reached `outcome`, in enough detail to act on without rerunning anything. */
  readonly rationale: string
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
export type Policy<TChecks extends CheckSchema = CheckSchema> = (
  ctx: PolicyContext<TChecks>,
) => PolicyResult | Promise<PolicyResult>

/** One partially configured check: how to run it, how (if at all) to interpret its output, and the policy that decides whether its evidence is acceptable. */
export interface CheckDefinitionConfig {
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
  readonly run: string | readonly string[]
  /**
   * Opt into real shell execution instead of the safe argv-only default.
   * When `true` (or left unset with `RepoContractConfig.shell: true` as the
   * run-wide default -- see that field), `run` must be a `string` and is
   * passed to the platform shell as-is (via the supplied `Spawner`'s own
   * `shell` option) -- shell metacharacter rejection does not apply. See
   * SECURITY.md before enabling this.
   */
  readonly shell?: boolean
  /** Working directory for the spawned process. Defaults to the current process's `cwd`. */
  readonly cwd?: string
  /** Additional environment variables for the spawned process, applied on top of (or, if `inheritEnv` is `false`, instead of) the inherited environment. */
  readonly env?: Readonly<Record<string, string>>
  /** Whether the spawned process inherits `process.env`. Defaults to `true` -- most check commands (npm scripts, locally-installed CLIs) need `PATH` and similar to resolve at all. Set to `false` for a minimal environment containing only `env` (plus whatever the OS itself always provides). */
  readonly inheritEnv?: boolean
  /** Maximum time to let this check's process run before it is terminated and recorded with `status: "timed_out"`. No timeout by default. */
  readonly timeoutMs?: number
  /** Request that stdout be parsed as this format. Omit for no parsing -- the consumer gets raw stdout/stderr only. */
  readonly output?: { readonly format: OutputFormat }
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
  readonly isolated?: boolean
  /** Decides whether this check's evidence is acceptable, once its process has finished running. */
  readonly policy: Policy
}

/** One fully configured check: how to run it, how (if at all) to interpret its output, and the policy that decides whether its evidence is acceptable. */
export interface CheckDefinition extends CheckDefinitionConfig {
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
  readonly dependsOn?: readonly string[]
}

/** The full set of checks in a `RepoContractConfig`, keyed by check id. */
export type CheckSchema = Record<string, CheckDefinition>

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
export type ValidatedCheckSchema<T> = {
  readonly [K in keyof T]: T[K] extends CheckDefinitionConfig
    ? Omit<T[K], "dependsOn"> & {
        readonly dependsOn?: readonly (Exclude<keyof T, K> & string)[]
      }
    : never
}

/**
 * Spawns a child process, given a resolved command, argv, and options --
 * modeled directly on `node:child_process`'s own `spawn(command, args,
 * options)` signature so both `node:child_process.spawn` and cross-spawn's
 * exported `spawn` are valid, drop-in values with no adapter code required
 * (see specs/decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md).
 * repo-contract treats whatever function is supplied as a trusted
 * capability: it calls it with a resolved command/argv/options and does not
 * inspect, wrap, or sanitize it -- the security properties of the spawned
 * process are entirely the supplied function's own.
 */
export type Spawner = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => ChildProcess

/**
 * Synchronously spawns a child process and waits for it to exit -- modeled directly on
 * `node:child_process`'s own `spawnSync(command, args, options)` signature, the same
 * drop-in-compatibility approach as `Spawner`. Used only for `RepoContractConfig.killProcessTree`
 * (Windows process-tree cleanup via `taskkill`, which fundamentally needs to run synchronously from
 * a signal-handling context that cannot `await` anything else -- see
 * specs/decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md).
 * `node:child_process.spawnSync` and cross-spawn's exported `sync` are both valid, drop-in values.
 */
export type SyncSpawner = (
  command: string,
  args: readonly string[],
  options: SpawnSyncOptions,
) => SpawnSyncReturns<Buffer | string>

/** Top-level configuration passed to `defineRepoContract`/`runRepoContract`. */
export interface RepoContractConfig<TChecks extends CheckSchema = CheckSchema> {
  /** Every check to run, keyed by check id. */
  readonly checks: TChecks
  /** Maximum number of checks to execute concurrently. Defaults to `os.availableParallelism()`. Must be a positive integer. */
  readonly concurrency?: number
  /**
   * The trusted capability repo-contract calls to spawn every check's
   * process -- e.g. `child_process.spawn` (from `"node:child_process"`) or
   * cross-spawn's exported `spawn`. Required: repo-contract never imports a
   * process-spawning implementation itself (see ADR 0011 above `Spawner`).
   * `child_process.spawn` alone does not resolve Windows `.cmd`/`.bat`
   * shims (most npm-installed CLI tools on Windows) without `shell: true`;
   * pass cross-spawn instead for that correctness without enabling shell
   * metacharacter interpretation -- cross-spawn is a spawn implementation
   * choice, not a `shell: true` equivalent. See `shell` below.
   */
  readonly spawn: Spawner
  /**
   * The ambient environment repo-contract treats as inheritable by each
   * check whose `inheritEnv` is not `false` (the default) -- typically
   * `process.env`, passed straight through by reference (never copied
   * internally) so a consumer that mutates `process.env` mid-run still sees
   * that reflected in later-spawned checks, exactly as if repo-contract had
   * read `process.env` itself. Required: repo-contract never reads
   * `process.env` internally (see ADR 0011 above `Spawner`). Typed as
   * `NodeJS.ProcessEnv` so `env: process.env` needs no casting.
   */
  readonly env: NodeJS.ProcessEnv
  /**
   * Global default for every check's own `shell` when that check doesn't
   * set one itself (`check.shell ?? shell ?? false`). Defaults to `false`,
   * the safe argv-only mode -- unrelated to which `spawn` is supplied; see
   * `spawn`'s own doc comment for that distinction.
   */
  readonly shell?: boolean
  /**
   * The trusted capability repo-contract calls, on Windows only, to forcibly terminate a check's
   * entire process tree (not just its immediate process) on a timeout, an aborted run, or a
   * host-process SIGINT/SIGTERM -- e.g. `child_process.spawnSync` (from `"node:child_process"`) or
   * cross-spawn's exported `sync`. Optional, unlike `spawn`/`env`: when omitted, Windows cleanup
   * falls back to terminating only the check's own immediate process (not any subprocess it spawned
   * internally) -- correct for the common case, but a check that spawns its own descendants (e.g.
   * `npm test` spawning the real test runner) may leave them running. POSIX cleanup never needs
   * this at all (`process.kill(-pid, signal)` reaches the whole process group directly, no spawning
   * required) -- see specs/decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md.
   */
  readonly killProcessTree?: SyncSpawner
}

/** Optional per-run controls for `runRepoContract`. */
export interface RunRepoContractOptions {
  /** Abort the entire run. Checks already in flight are terminated; checks not yet started never spawn. Every configured check still receives a well-formed evidence entry (`status: "aborted"`) and still has its policy invoked. */
  readonly signal?: AbortSignal
  /** Restrict this run to only these check ids (and whatever they `dependsOn`, transitively). Every configured check runs when omitted. */
  readonly checks?: string[]
}

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
export interface Verdict<TChecks extends CheckSchema = CheckSchema> {
  /** Schema version of this shape; see VERSIONING.md. */
  readonly version: 2
  /** `true` only if every check's `outcome` is `"pass"` or `"warn"`. */
  readonly passed: boolean
  /** Each configured check's own `PolicyResult`, verbatim, keyed by check id. */
  readonly checks: { readonly [K in keyof TChecks]: PolicyResult }
}
