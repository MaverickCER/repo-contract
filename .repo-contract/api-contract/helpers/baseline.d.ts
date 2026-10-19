/**
 * A reusable, generic exception-policy primitive -- the mechanism
 * `scripts/suppression-governance/` already built for `disable-comments.json`
 * (ADR 0006), extracted so any check can gate a finding on a named,
 * non-empty-prose exception instead of hand-rolling the same
 * exact/glob/default precedence and field-completeness logic again. Deciding
 * nothing and matching nothing: this barrel resolves a `{ group,
 * category }` classification to a policy and checks a record's own field
 * values against it -- it never decides what a "finding" is, never matches a
 * record to one, and never owns a canonical-identity concept. Those stay
 * entirely check-owned (see `checks/shared/`, unpublished) -- see
 * specs/decisions/0013-reusable-exception-policy-helper.md for the full
 * rationale and the boundary this barrel deliberately does not cross.
 *
 * Published **Stable** (see `VERSIONING.md` and
 * specs/decisions/0019-helpers-promoted-presets-stay-experimental.md): a new export is a minor release
 * from `1.0` on (while the package is `0.x` the release tooling deflates it to a patch), a changed
 * signature or behavior is a breaking change.
 *
 * Never re-exported from the package root (`src/index.ts`) -- this is a
 * second, independent public barrel, published under its own `./helpers`
 * subpath, exactly like `src/presets/index.ts`; the two stay independent of
 * each other and of the root barrel.
 * @packageDocumentation
 */

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
 * Evaluates one record against every one of its own classifications, taking the strictest
 * (`stricterOf`) of each classification's resolved policy -- a record matching both a forbidden
 * classification and an otherwise-fine one is forbidden overall. `classifications` is a non-empty
 * tuple by type: zero classifications would be a caller bug (which classification would silently
 * fall back to `globalDefault`?), never a case this function has to guess about at runtime. A
 * required field only counts as satisfied once `fieldValue(record, requirement).trim()` is
 * non-empty -- an empty field is valid *data*, but policy-insufficient, exactly as `"exception"`
 * mode's name implies. `fieldValue` may resolve a dotted path (e.g. `"verification.verifiedBy"`)
 * or anything else a consumer's own record shape needs -- this function never interprets
 * `requirement` itself, it only ever calls `fieldValue(record, requirement)` and trims the result.
 * @param input - The record to evaluate, its classifications, the policy configuration and global default to resolve them against, and the field-value accessor -- see `ExceptionRecordEvaluation`'s own per-field doc comments.
 * @returns The record's verdict, and which required fields (if any) are still missing.
 * @public
 */
export declare function evaluateExceptionRecord<TRecord>(input: ExceptionRecordEvaluation<TRecord>): ExceptionDeterminant<TRecord>;

/**
 * A thin batch over already-matched `(record, classifications)` pairs -- exactly
 * `inputs.map(evaluateExceptionRecord)`, provided so a caller evaluating many records against the
 * same `config`/`globalDefault`/`fieldValue` doesn't have to write that `.map` itself. Matching a
 * record to a finding in the first place stays entirely check-owned (each check reconciles its own
 * findings against its own registry) -- this function takes already-paired inputs, it never does
 * any matching of its own.
 * @param inputs - Each already-matched record to evaluate, in the same shape `evaluateExceptionRecord` itself takes.
 * @returns Each input's own determinant, in the same order as `inputs`.
 * @public
 */
export declare function evaluateExceptionRecords<TRecord>(inputs: readonly ExceptionRecordEvaluation<TRecord>[]): readonly ExceptionDeterminant<TRecord>[];

/**
 * One classification group's own policy -- `default` is this group's fallback for any `category`
 * with no exact or glob match in `rules` (see `resolveExceptionPolicy` for the full exact > glob >
 * group-default > global-default precedence). Omit `default` to fall through to the caller-supplied
 * `globalDefault` instead. Each key of `rules` is either an exact `category` string or a
 * glob pattern -- `resolveExceptionPolicy` tries an exact match first and only
 * consults glob matching once no exact key exists, so a glob can never shadow a more specific
 * exact entry.
 * @public
 */
export declare interface ExceptionCategoryGroup {
    /** This group's fallback policy when `category` matches neither an exact nor a glob key in `rules`. Falls through to the caller's `globalDefault` when omitted. */
    readonly default?: ExceptionPolicy;
    /** Keyed by exact `category` string or glob pattern. A literal `"*"` key is rejected by `validateExceptionPolicyConfig` -- see that function's own doc comment for why. */
    readonly rules?: Readonly<Record<string, ExceptionPolicy>>;
}

/**
 * One classification a record is evaluated against -- deliberately just `{ group, category }`,
 * never `domain`/`rule`/`severity`/`exceptionType` or any other consumer-specific vocabulary. A
 * consumer maps its own domain concepts onto this shape at the call site (e.g.
 * `suppression-governance`'s `{ group: record.domain, category: rule }` per suppressed rule;
 * `security-socket`'s `{ group: "socket", category: normalizedSeverity }`) -- the core itself
 * never interprets `group`/`category` beyond using them as lookup keys into an
 * `ExceptionPolicyConfig`.
 * @public
 */
export declare interface ExceptionClassification {
    /** The top-level key this classification resolves against in an `ExceptionPolicyConfig`. */
    readonly group: string;
    /** The `rules` key (exact or glob-matched) this classification resolves against within `group`. */
    readonly category: string;
}

/**
 * One record's resolved policy verdict, and (for `"insufficient"`) which required fields are
 * still empty. Never published as a batch/matched-vs-unmatched shape -- matching a finding to a
 * record stays entirely check-owned (each check reconciles its own findings against its own
 * registry via `reconcileExceptions`).
 * @public
 */
export declare interface ExceptionDeterminant<TRecord> {
    /** The record this determinant was computed for, returned verbatim. */
    readonly record: TRecord;
    /** `"forbidden"`: never permitted. `"insufficient"`: exception-eligible, but `missing` is non-empty. `"permitted"`: every required field is filled in (or the resolved policy was `"allowed"`). */
    readonly verdict: ExceptionVerdict;
    /** Every required field (by name) still empty on `record`, in the resolved policy's own `requirements` order. Always `[]` for `"forbidden"`/`"permitted"`. */
    readonly missing: readonly string[];
}

/**
 * A resolved decision for one `{ group, category }` classification. `"forbidden"`: never
 * permitted, regardless of any field's content. `"allowed"`: permitted unconditionally -- no
 * field is required. `"exception"`: permitted only once every field named in `requirements` is a
 * non-empty (post-`.trim()`) string on the record being evaluated (see `evaluateExceptionRecord`).
 *
 * Deliberately not a numeric "how many details are required" threshold -- a plain count is
 * trivially satisfied by generating that many generic-sounding filler entries without doing any of
 * the underlying work the count was meant to prove happened. Naming exactly which fields must be
 * filled in makes each one individually reviewable against a specific question instead. This is
 * the same design `scripts/suppression-governance/policy-config.ts`'s `SuppressionPolicy`
 * establishes for the disable-comment domain this type generalizes.
 * @public
 */
export declare type ExceptionPolicy = {
    readonly mode: "forbidden";
} | {
    readonly mode: "allowed";
} | {
    readonly mode: "exception";
    readonly requirements: readonly string[];
};

/**
 * A full exception-policy configuration, keyed by classification `group` (e.g. a tool name, or a
 * suppression domain). The core never invents the names "domain"/"rule"/"severity"/
 * "exceptionType" -- those are every consumer's own vocabulary, expressed here purely as
 * `{ group, category }` (see `ExceptionClassification`).
 * @public
 */
export declare type ExceptionPolicyConfig = Readonly<Record<string, ExceptionCategoryGroup>>;

/**
 * The outcome of reconciling one run's findings against one exception registry.
 * @public
 */
export declare interface ExceptionReconciliation<TFinding, TRecord> {
    /** Each finding paired with the existing record it matched, in `findings` order. */
    readonly matchedPairs: readonly {
        readonly finding: TFinding;
        readonly record: TRecord;
    }[];
    /** Every record to persist as live: matched records verbatim, plus one fresh `createStub` per unmatched finding. Never contains a stale record. */
    readonly activeRecords: readonly TRecord[];
    /** Existing records whose id matched no finding this run -- surfaced for the policy to fail on, **never removed** by this function (retiring one is an explicit human edit). */
    readonly staleRecords: readonly TRecord[];
    /** The ids of the stubs created this run -- a subset of `activeRecords`' ids. */
    readonly newStubIds: readonly string[];
}

/**
 * The registry-lifecycle half of `repo-contract/helpers` -- `reconcileExceptions` diffs a check's
 * raw findings against its already-loaded exception registry, and `serializeExceptionRegistry`
 * renders the reconciled records back to their canonical on-disk form. Both are pure; the only
 * I/O is `writeExceptionRegistry` in its own module. See
 * specs/decisions/0013-reusable-exception-policy-helper.md's "The exception registry is the review
 * surface" section for the model these serve: a check emits 100% of its findings, reconciliation
 * maintains one record per finding (a fresh stub for a new one), and stale records are surfaced,
 * never removed.
 */
/**
 * The three fields every exception record in `.repo-contract/exceptions/*.json` carries, whatever
 * the owning check. A registry adds its own typed fields on top; this is the shared core the
 * generic machinery (`reconcileExceptions`, `serializeExceptionRegistry`,
 * `validateExceptionRegistry` in the check-owned layer) relies on.
 * @public
 */
export declare interface ExceptionRecordCore {
    /** The check-namespaced semantic identity of the finding this record waives (e.g. `"suppression:eslint:no-console:src/foo.ts:<module>"`). Equals the finding id; a record whose id matches no current finding is stale. Never derived from prose. */
    readonly id: string;
    /** Record-schema version. */
    readonly version: number;
    /** The one human-authored field: why this guardrail is deliberately bypassed, and what was checked to confirm the finding is real. `""` in a freshly scaffolded stub (the policy, not the validator, rejects a blank/placeholder value). */
    readonly justification: string;
}

/**
 * One record to evaluate, paired with everything `evaluateExceptionRecord` needs to judge it --
 * shared by `evaluateExceptionRecord` and `evaluateExceptionRecords` (whose own `inputs` is just
 * `readonly ExceptionRecordEvaluation<TRecord>[]`) so the same five-field shape isn't declared
 * twice.
 * @public
 */
export declare interface ExceptionRecordEvaluation<TRecord> {
    /** The record to evaluate. */
    readonly record: TRecord;
    /** Every classification this record is subject to; the strictest resolved policy across all of them wins. */
    readonly classifications: readonly [ExceptionClassification, ...ExceptionClassification[]];
    /** The exception policy configuration to resolve `classifications` against. */
    readonly config: ExceptionPolicyConfig;
    /** The policy to fall back to for any classification whose `group` has no entry in `config` at all. */
    readonly globalDefault: ExceptionPolicy;
    /** Resolves one named required field's current string value on `record`. */
    readonly fieldValue: (record: TRecord, requirement: string) => string;
}

/**
 * A resolved judgment about one record, once its `ExceptionPolicy` has been checked against its
 * own field values. See `ExceptionDeterminant`.
 * @public
 */
export declare type ExceptionVerdict = "forbidden" | "insufficient" | "permitted";

/**
 * A deterministic digest of a set of fields' current values on `record`, via `node:crypto` --
 * pure, synchronous, no ambient state (Socket.dev has no alert on `node:crypto`; it is not
 * `child_process`/`process.env`, the two capabilities `src/helpers/**` must never touch -- see
 * the `AmbientCapabilities` check). This is what makes a "verification" *content-bound*
 * rather than merely attested: a consumer records this hash (see `ExceptionVerification` in
 * `checks/shared/exception-record.ts`) at the moment a human or a mechanical re-check approved a
 * record's current prose; recomputing it later and comparing is how staleness is detected with no
 * separate tracking logic -- edit any field named in `fields` and the hash silently stops matching.
 * Each field's name is bound into the digest alongside its value, both serialized via
 * `JSON.stringify` as a `[name, value]` pair -- JSON's own escaping makes the digest unambiguous
 * regardless of what characters a field's name or value contains, so two different field sets
 * whose values happen to concatenate identically as plain text can never collide here.
 * @param record - The record to hash fields from.
 * @param fields - Which fields (by name, in this exact order) to include in the digest -- the same names `fieldValue` would be called with by `evaluateExceptionRecord`.
 * @param fieldValue - Resolves one named field's current string value on `record`, exactly like `evaluateExceptionRecord`'s own `fieldValue` parameter.
 * @returns A hex-encoded SHA-256 digest of `fields`' current values.
 * @public
 */
export declare function hashRequirementFields<TRecord>(record: TRecord, fields: readonly string[], fieldValue: (record: TRecord, requirement: string) => string): string;

/**
 * Reads and validates one exception registry file from disk -- `path -> { "$schema"?: string,
 * "exceptions": T[] }`, in two independently-validated layers. This function owns only the
 * envelope: that the file exists (or is absent, a normal empty-registry state), parses as JSON,
 * and is an object carrying an `"exceptions"` field at all. It never inspects what is inside
 * `exceptions` beyond that -- `schema` (a `StandardSchemaV1`, hand-written or from a real library;
 * see `src/standard-schema/types.ts`) owns every field-level concern for the caller's own record
 * shape, exactly the same "consumer supplies a trusted capability, this package calls it without
 * owning its internals" relationship `RepoContractConfig.spawn`/`env` already establish (see
 * `specs/decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md`).
 *
 * `readFile` defaults to `node:fs/promises`' own `readFile` -- already used by
 * `src/presets/security-secrets.ts`, so this introduces no new filesystem-access surface; a
 * missing file is a normal "no exceptions recorded yet" state, not an error (`{ ok: true, records:
 * [] }`), matching `scripts/suppression-governance/check.ts`'s own `loadExistingRegistry`
 * precedent for the same first-run case. Every other failure -- unreadable-for-another-reason,
 * malformed JSON, a missing/malformed envelope, or a schema validation failure -- returns `{ ok:
 * false, errors }` rather than throwing: a bad registry is reported as data for a check's policy to
 * fail on, never an uncaught exception that crashes the run. The one exception is `schema`'s own
 * `validate()` throwing or rejecting -- a bug in the *caller-supplied schema*, not malformed
 * registry data -- which is deliberately left to propagate as a rejected `Promise`, mirroring
 * `src/parsing/parse-output.ts`'s identical treatment of a throwing `output.schema`.
 * @param input - Where to read the registry from, the schema that validates its `exceptions` array, and (for tests, or a non-`node:fs` environment) an override for how to read `path`.
 * @param input.path - The registry file's path, passed to `input.readFile` verbatim.
 * @param input.schema - Validates (and may transform) the envelope's `exceptions` array once this function's own envelope checks pass.
 * @param input.readFile - Reads `input.path`'s content. Defaults to `node:fs/promises`' own `readFile(path, "utf8")`.
 * @returns Every valid record (`ok: true`), or every problem found reading/parsing/validating the file (`ok: false`).
 * @public
 */
export declare function loadExceptionRegistry<T>(input: {
    readonly path: string;
    readonly schema: StandardSchemaV1<unknown, readonly T[]>;
    readonly readFile?: (path: string) => Promise<string>;
}): Promise<{
    ok: true;
    records: readonly T[];
} | {
    ok: false;
    errors: readonly string[];
}>;

/**
 * The `onEvidence` hook that saves each check's raw output to its log. Creating it removes the logs of an
 * earlier run.
 * @param options - where and how to write.
 * @returns the hook to pass as `onEvidence`.
 * @beta
 */
export declare function onEvidenceSaveToRepoContractLogs(options?: RepoContractLogsOptions): (checkId: string, evidence: CheckEvidence) => void;

/**
 * The `onVerdict` hook that puts each check's verdict at the top of its log. With the default `"failing"` mode, the
 * log of a check that passed is removed.
 * @param options - where and how to write; the same options as {@link onEvidenceSaveToRepoContractLogs}.
 * @returns the hook to pass as `onVerdict`.
 * @beta
 */
export declare function onVerdictPrependRepoContractLogs(options?: RepoContractLogsOptions): (checkId: string, result: PolicyResult) => void;

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
 * Reconciles this run's raw findings against the check's already-loaded, already-validated
 * exception registry. Pure and add-only: it never mutates a matched record and never removes a
 * stale one.
 *
 * `deriveId` must be **injective** over `findings` -- every independently-governable finding needs
 * a distinct id, or the mechanism cannot tell which finding a record's `justification` belongs to.
 * A collision is returned as `{ ok: false }` (a real condition a check must surface: the source
 * genuinely holds two identical directives), naming both finding indices so the check can point a
 * developer at them.
 *
 * `createStub(finding, id)` is handed the canonical id and its result's `id` is asserted equal to
 * it -- a `createStub` that derives its own identity differently is a `{ ok: false }` bug report,
 * never a silently-mismatched record.
 *
 * Precondition: `existing` has already passed the check's registry validator (unique ids, correct
 * namespace). This function does not re-validate it.
 * @param input - The already-loaded registry, this run's findings, and the check-owned identity + stub callbacks.
 * @param input.existing - The validated records currently on disk.
 * @param input.findings - Every raw finding this run produced -- nothing filtered.
 * @param input.deriveId - The finding's check-namespaced semantic id. Must be injective over `findings`.
 * @param input.createStub - Builds a fresh record for an unmatched finding; receives the canonical id and must return a record carrying it.
 * @returns The reconciliation, or the first integrity problem found.
 * @public
 */
export declare function reconcileExceptions<TFinding, TRecord extends {
    readonly id: string;
}>(input: {
    readonly existing: readonly TRecord[];
    readonly findings: readonly TFinding[];
    readonly deriveId: (finding: TFinding) => string;
    readonly createStub: (finding: TFinding, id: string) => TRecord;
}): {
    readonly ok: true;
    readonly reconciliation: ExceptionReconciliation<TFinding, TRecord>;
} | {
    readonly ok: false;
    readonly error: string;
};

/**
 * The default folder, relative to the repository root.
 * @beta
 */
export declare const REPO_CONTRACT_LOG_DIRECTORY: string;

/**
 * Starts the part of a log that is the check's evidence, so the verdict above it can be rewritten alone.
 * @beta
 */
export declare const REPO_CONTRACT_LOG_EVIDENCE_MARKER = "=== evidence ===";

/**
 * Which logs are kept: every check's, only the checks that did not pass, or none.
 * @beta
 */
export declare type RepoContractLogMode = "all" | "failing" | "off";

/**
 * Where the log of a check lives, and what is written to it. No function throws.
 * @beta
 */
export declare interface RepoContractLogs {
    /** The folder the logs are in, relative to the repository root. */
    readonly directory: string;
    /** Removes the `.log` files of an earlier run and starts empty. */
    readonly begin: () => void;
    /** Writes (or overwrites) a check's log with its evidence. */
    readonly saveEvidence: (checkId: string, evidence: CheckEvidence) => void;
    /**
     * Puts a verdict at the top of a check's log, replacing one already there. With the `"failing"` mode, a passing
     * check's log is removed instead.
     * @param checkId - the check.
     * @param label - what to call the result, for example `FAIL (advisory)`.
     * @param rationale - the verdict's whole reason.
     * @param passed - whether the check passed.
     */
    readonly prependVerdict: (checkId: string, label: string, rationale: string, passed: boolean) => void;
    /**
     * Whether a log for a check has been written this run.
     * @param checkId - the check.
     * @returns `true` when its log exists.
     */
    readonly has: (checkId: string) => boolean;
    /**
     * How many logs exist this run.
     * @returns the count.
     */
    readonly count: () => number;
    /**
     * Waits for every write asked for so far.
     * @returns a promise that settles once they have finished; it never rejects.
     */
    readonly flush: () => Promise<void>;
}

/**
 * The logs for one folder. The same options give the same logs, so a hook created here and another created
 * elsewhere agree on which files exist.
 * @param options - where and how to write.
 * @returns the log store.
 * @beta
 */
export declare function repoContractLogs(options?: RepoContractLogsOptions): RepoContractLogs;

/**
 * The file operations the logs use; every one defaults to `node:fs/promises`' own. For tests, or a non-`node:fs` environment.
 * @beta
 */
export declare interface RepoContractLogsFileSystem {
    /** Creates the folder, and any missing parents, if it does not exist. */
    readonly mkdir: (folder: string) => Promise<void>;
    /** Lists the names of the entries in a folder. */
    readonly readdir: (folder: string) => Promise<readonly string[]>;
    /** Reads a file as text. */
    readonly readFile: (file: string) => Promise<string>;
    /** Removes a file; a file that is already gone is not an error. */
    readonly rm: (file: string) => Promise<void>;
    /** Writes (or overwrites) a file with the text. */
    readonly writeFile: (file: string, text: string) => Promise<void>;
}

/**
 * Where and how logs are written.
 * @beta
 */
export declare interface RepoContractLogsOptions {
    /** The repository root the folder is resolved against. Defaults to the current working directory. */
    readonly cwd?: string;
    /** The folder, relative to `cwd`. Defaults to `reports/contract/logs`. */
    readonly directory?: string;
    /** Which logs to keep. Defaults to `"failing"`: a log for a check that passed is removed once its verdict is known. */
    readonly mode?: RepoContractLogMode;
    /** Told once, with the reason, the first time a log cannot be written. Defaults to ignoring it. */
    readonly onProblem?: (message: string) => void;
    /** Overrides how files are read and written. A store with its own file operations is not shared with other hooks: wire its `saveEvidence` and `prependVerdict` yourself. */
    readonly fs?: Partial<RepoContractLogsFileSystem>;
}

/**
 * Resolves the policy one `{ group, category }` classification is subject to, in strict precedence
 * order -- documented here as this function's one authoritative source of truth for that order
 * (generalized from `scripts/suppression-governance/resolve-policy.ts`'s own `resolveRequirement`,
 * which this function's future retrofit replaces):
 *
 * 0. **No entry for `group`** -- `config[group] === undefined` -- resolves to `globalDefault`
 *    immediately, before `category` is even inspected (so a blanket `category === "*"` against an
 *    unconfigured group still just returns `globalDefault`, never an empty-array reduce).
 * 1. **Blanket category** -- `category === "*"` means every category this group could ever apply
 *    to was matched at once, not one specific category literally named `"*"`. It resolves as the
 *    strictest (`stricterOf`) policy across every entry in `group.rules` plus the group's own
 *    default (or `globalDefault`) -- never via the glob matcher: `globMatch("*", pattern)` tests the
 *    literal one-character string `"*"` as a path against `pattern`, which does not glob-match a
 *    pattern like `"security/*"` (that would require the *pattern*, not the *target*, to be `"*"`),
 *    so treating this case as an ordinary pattern match would silently let a blanket match fall
 *    through a group's `forbidden` rules into its far more lenient default.
 * 2. **Exact match** -- `group.rules[category]`, if present. A glob is never even consulted once an
 *    exact entry exists for `category`.
 * 3. **Glob match** -- the strictest (`stricterOf`) policy among every key in `group.rules` that is
 *    not itself an exact match for `category` but does match it as a glob (e.g.
 *    `"security/*"` matching `"security/detect-object-injection"`).
 * 4. **Group default** -- `group.default`, if `group` itself has an entry in `config` (whether or
 *    not that entry defines its own `default`).
 * 5. **Global default** -- `globalDefault`, used only when `group` itself has no entry in `config`
 *    at all, or when neither an exact/glob match nor a `group.default` applies.
 *
 * Assumes `config` has already passed `validateExceptionPolicyConfig`.
 * @param classification - The `{ group, category }` pair to resolve a policy for.
 * @param config - The exception policy configuration to resolve against.
 * @param globalDefault - The policy to fall back to when `classification.group` has no entry in `config` at all.
 * @returns The resolved policy for `classification`.
 * @public
 */
export declare function resolveExceptionPolicy(classification: ExceptionClassification, config: ExceptionPolicyConfig, globalDefault: ExceptionPolicy): ExceptionPolicy;

/**
 * The canonical on-disk form of one exception registry: `{ "exceptions": [ ... ] }`, records
 * sorted ascending by `id` (code-unit order, locale-independent), each record's keys in
 * `canonicalRecord` order, 2-space indent, `\n` line endings, a trailing newline. Fully
 * deterministic: the same records always serialize byte-for-byte identically, so a reconcile that
 * changes nothing produces no diff and `writeExceptionRegistry` writes nothing.
 *
 * Assumes `records` have unique ids (the caller reconciled them and validated its registry).
 * @param records - The reconciled records (`activeRecords` plus any `staleRecords`, in any order).
 * @returns The exact file contents to persist.
 * @public
 */
export declare function serializeExceptionRegistry(records: readonly (Record<string, unknown> & {
    readonly id: string;
})[]): string;

/**
 * Hand-vendored from `@standard-schema/spec@1.1.0` (standardschema.dev), pinned
 * 2026-09-04 -- see specs/decisions/0012-hand-vendored-standard-schema-support-for-optional-output-validation.md for why this is
 * vendored rather than an installed dependency, and for the version-pin/re-diff process. Pure type
 * declarations, zero runtime code -- assigning any real Zod/Valibot/ArkType (etc.) schema to this
 * type costs nothing at runtime. Only `StandardSchemaV1` (validation) is vendored here -- the
 * separate, optional `StandardJSONSchemaV1` (JSON Schema conversion) extension
 * (standardschema.dev/json-schema) is out of scope; see the ADR.
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
 * Validates an entire `ExceptionPolicyConfig`'s shape -- every group's `default` and every entry
 * in its `rules` must be a well-formed `ExceptionPolicy` (see `validateExceptionPolicyValue`), and
 * no group's `rules` may use the literal `"*"` as a key. A literal `"*"` key is always a mistake,
 * never an intentional blanket policy: `resolveExceptionPolicy`'s own blanket-category handling is
 * triggered by the *input* `category` being `"*"`, not by a `"*"` entry in `rules` -- a `"*"` rules
 * key would instead be consulted only as an ordinary glob, which matches the literal
 * one-character string `"*"` as a *target*, not as a wildcard pattern matching every real category
 * name (`globMatch("*", pattern)` truthiness depends on `pattern`, not the other way around) --
 * see `resolveExceptionPolicy`'s own doc comment, case 1, for the failure mode this prevents.
 * @param config - The exception policy configuration to validate.
 * @param validRequirements - The complete set of field names this consumer's policy may require, if the consumer wants that checked. Omit to skip that check entirely.
 * @returns Every configuration problem found; empty if `config` is valid.
 * @public
 */
export declare function validateExceptionPolicyConfig(config: ExceptionPolicyConfig, validRequirements?: readonly string[]): readonly string[];

/**
 * Writes one exception registry to disk in its canonical form (`serializeExceptionRegistry`),
 * atomically and idempotently -- the sole filesystem-writing primitive in `repo-contract/helpers`.
 *
 * - **Symlinked target** -> `{ ok: false }`: a governance registry is never a symlink, and writing
 *   through one would escape `.repo-contract/exceptions/`.
 * - **No file yet** -> written.
 * - **On-disk bytes already equal the canonical form** -> `{ ok: true, written: false }`, no
 *   write. A reconcile that changed nothing therefore never dirties the working tree.
 * - **Different** -> the canonical bytes are written to a sibling temp file (`<path>.<uuid>.tmp`)
 *   and `rename`d over the target -- the target is replaced atomically, and partial serialized
 *   content is never written to the target path. A `rename` failure (e.g. a Windows lock on the
 *   target) returns `{ ok: false }` deterministically; the temp file is left in place (harmless, a
 *   uuid name, and the run has already failed) -- `.gitignore` covers `.repo-contract/exceptions/*.tmp`.
 *
 * Path containment is the caller's responsibility: repo-contract's own checks always pass
 * `.repo-contract/exceptions/<name>.json`. `readFile`/`writeFile`/`rename`/`isSymlink` default to
 * `node:fs/promises` and are overridable for tests or a non-`node:fs` environment, mirroring
 * `loadExceptionRegistry`'s own `readFile` parameter.
 * @param input - The target path, the records to persist, and (optional) filesystem-capability overrides.
 * @param input.path - Where to write. Passed verbatim to every capability.
 * @param input.records - The reconciled records; serialized via `serializeExceptionRegistry`.
 * @param input.readFile - Reads the current file. Default: `node:fs/promises` `readFile(path, "utf8")`.
 * @param input.writeFile - Writes the temp file. Default: `node:fs/promises` `writeFile(path, data, "utf8")`.
 * @param input.rename - Replaces the target with the temp file. Default: `node:fs/promises` `rename`.
 * @param input.isSymlink - Whether `path` is a symlink. Default: `lstat(path).isSymbolicLink()`, treating a missing path as not a symlink.
 * @returns `{ ok: true, written }` on success, or `{ ok: false, error }` for a symlink, an unreadable target, or a failed write/rename.
 * @public
 */
export declare function writeExceptionRegistry(input: {
    readonly path: string;
    readonly records: readonly (Record<string, unknown> & {
        readonly id: string;
    })[];
    readonly readFile?: (path: string) => Promise<string>;
    readonly writeFile?: (path: string, data: string) => Promise<void>;
    readonly rename?: (from: string, to: string) => Promise<void>;
    readonly isSymlink?: (path: string) => Promise<boolean>;
}): Promise<{
    readonly ok: true;
    readonly written: boolean;
} | {
    readonly ok: false;
    readonly error: string;
}>;

export { }
