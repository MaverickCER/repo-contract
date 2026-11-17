/**
 * Governed exceptions: let a check waive one finding when a named record justifies it, without
 * weakening the check. A record names its `{ group, category }`, and this barrel resolves that to
 * a policy (exact, then glob, then default) and checks the record's fields against it.
 *
 * The barrel also ships the v2 record every registry shares, its vocabulary of eight exception
 * types and three methods, and the read-reconcile-write sequence. The check stays in charge of
 * what a finding is, of each finding's identity and of which types it accepts. This is the
 * mechanism `scripts/suppression-governance/` built for `disable-comments.json` (ADR 0006),
 * extracted for any check; specs/decisions/0013-reusable-exception-policy-helper.md has the
 * boundary.
 *
 * Published **Stable** (see `VERSIONING.md` and
 * specs/decisions/0019-helpers-promoted-presets-stay-experimental.md). From `1.0` a new export is
 * a minor release and a changed signature or behavior is a major one. While the package is `0.x`,
 * the release tooling deflates a new export to a patch.
 *
 * Published under its `./helpers` subpath, independent of the root and `./presets` barrels.
 * @packageDocumentation
 */

/**
 * Widens typed records to the flat shape `writeExceptionRegistry` takes.
 * @param records - typed records.
 * @returns the same array, typed as flat records.
 */
export declare function asFlatExceptionRecords(records: readonly {
    readonly id: string;
}[]): readonly (Record<string, unknown> & {
    readonly id: string;
})[];

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
 * Stores cache entries as files under a directory. Writes go to a temporary file in the same
 * directory and are renamed into place, so concurrent writers and readers never see a partial
 * entry. A directory that does not exist yet is created by the first write.
 * @param directory - The directory the store lives in.
 * @returns The store.
 */
export declare function createFileCacheStore(directory: string): FileCacheStore;

/**
 * @returns every v2 field blank: what a new stub starts with.
 */
export declare function emptyV2Fields(): ExceptionV2Fields;

/**
 * Evaluates one record against each of its classifications and takes the strictest
 * (`stricterOf`) resolved policy. A record matching a forbidden classification and an
 * otherwise-fine one is forbidden overall. `classifications` is a non-empty tuple by type. Zero
 * classifications would be a caller bug, not a case to guess about at runtime. A required field
 * counts as satisfied once `fieldValue(record, requirement).trim()` is non-empty. An empty field
 * is valid *data* but insufficient for policy, as the `"exception"` mode name implies.
 * `fieldValue` may resolve a dotted path (e.g. `"verification.verifiedBy"`) or anything else a
 * record shape needs. This function never interprets `requirement`; it calls `fieldValue` and
 * trims the result.
 * @param input - The record, its classifications, the policy configuration, the global default and the field-value accessor. See `ExceptionRecordEvaluation` for each field.
 * @returns The record's verdict, and which required fields (if any) are still missing.
 * @public
 */
export declare function evaluateExceptionRecord<TRecord>(input: ExceptionRecordEvaluation<TRecord>): ExceptionDeterminant<TRecord>;

/**
 * A thin batch over already-matched `(record, classifications)` pairs:
 * `inputs.map(evaluateExceptionRecord)`. It saves a caller that evaluates many records against one
 * `config`, `globalDefault` and `fieldValue` from writing the `.map`. Matching a record to a
 * finding stays with each check, which reconciles its findings against its registry. This
 * function takes already-paired inputs and does no matching.
 * @param inputs - Each already-matched record to evaluate, in the shape `evaluateExceptionRecord` takes.
 * @returns Each input's determinant, in the same order as `inputs`.
 * @public
 */
export declare function evaluateExceptionRecords<TRecord>(inputs: readonly ExceptionRecordEvaluation<TRecord>[]): readonly ExceptionDeterminant<TRecord>[];

/**
 * Judges one finding against its reconciled record. A missing record is `"unmatched"`.
 * @param record - the finding's record, or `undefined`.
 * @param classifications - the finding's classifications.
 * @param config - the check's policy config.
 * @param globalDefault - the check's fallback policy.
 * @returns the verdict and the fields still missing.
 */
export declare function evaluateFindingVerdict(record: unknown, classifications: readonly [ExceptionClassification, ...ExceptionClassification[]], config: ExceptionPolicyConfig, globalDefault: ExceptionPolicy): {
    readonly verdict: "forbidden" | "insufficient" | "permitted" | "unmatched";
    readonly missing: readonly string[];
};

/** How an exception's claim was substantiated. `validated-false-positive` needs `mechanical-reverification`. */
export declare const EXCEPTION_METHODS: readonly ["mechanical-reverification", "independent-human-review", "policy-rule"];

/** Where a repository keeps its exception registries. */
export declare const EXCEPTION_REGISTRY_DIRECTORY = ".repo-contract/exceptions";

/**
 * Why an exception is legitimate. A check may accept only some of them.
 * `required-for-package-to-exist` and `dev-only-not-shipped` came from internal-package-contract;
 * consumer registries already use them.
 */
export declare const EXCEPTION_TYPES: readonly ["validated-false-positive", "accepted-risk", "compensating-control", "tooling-limitation", "scheduled-remediation", "platform-or-vendor-constraint", "required-for-package-to-exist", "dev-only-not-shipped"];

/** The six text fields a `version: 2` record adds. With `expires`, they make an exception auditable. */
export declare const EXCEPTION_V2_FIELD_KEYS: readonly ["ruleBroken", "attempted", "constraint", "whyPreferable", "residualRisk", "revisitWhen"];

/**
 * One classification group's policy. `default` is the group's fallback for any `category` with
 * no exact or glob match in `rules`. Omit `default` to fall through to the caller's
 * `globalDefault`. `resolveExceptionPolicy` documents the full precedence: exact, glob, group
 * default, global default. Each key of `rules` is an exact `category` string or a glob pattern.
 * An exact match always wins, so a glob never shadows a more specific exact entry.
 * @public
 */
export declare interface ExceptionCategoryGroup {
    /** This group's fallback policy when `category` matches neither an exact nor a glob key in `rules`. Falls through to the caller's `globalDefault` when omitted. */
    readonly default?: ExceptionPolicy;
    /** Keyed by exact `category` string or glob pattern. A literal `"*"` key is rejected by `validateExceptionPolicyConfig`: see that function's doc comment for why. */
    readonly rules?: Readonly<Record<string, ExceptionPolicy>>;
}

/**
 * One classification a record is evaluated against: only `{ group, category }`, with no
 * consumer vocabulary such as `domain`, `rule`, `severity` or `exceptionType`. A consumer maps its
 * concepts onto this shape at the call site. For example, `suppression-governance` passes
 * `{ group: record.domain, category: rule }` per suppressed rule. `security-socket` passes
 * `{ group: "socket", category: normalizedSeverity }`. The core uses `group` and `category` only
 * as lookup keys into an `ExceptionPolicyConfig`.
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
 * still empty. There is no batch or matched-vs-unmatched shape. Matching a finding to a record
 * stays with each check, which reconciles its findings against its registry via
 * `reconcileExceptions`.
 * @public
 */
export declare interface ExceptionDeterminant<TRecord> {
    /** The record this determinant was computed for, returned verbatim. */
    readonly record: TRecord;
    /** `"forbidden"`: never permitted. `"insufficient"`: exception-eligible, but `missing` is non-empty. `"permitted"`: every required field is filled in (or the resolved policy was `"allowed"`). */
    readonly verdict: ExceptionVerdict;
    /** Every required field (by name) still empty on `record`, in the resolved policy's `requirements` order. Always `[]` for `"forbidden"`/`"permitted"`. */
    readonly missing: readonly string[];
}

/** What `repo-contract exceptions --json` prints. It decides nothing. */
export declare interface ExceptionInventory {
    readonly schemaVersion: 1;
    readonly registries: readonly ExceptionRegistrySummary[];
    readonly total: number;
    readonly legacy: number;
    readonly expired: number;
    readonly incomplete: number;
    readonly errors: readonly ExceptionRegistryError[];
}

export declare type ExceptionMethod = (typeof EXCEPTION_METHODS)[number];

/**
 * A resolved decision for one `{ group, category }` classification. `"forbidden"`: never
 * permitted, whatever the fields hold. `"allowed"`: permitted unconditionally; no field is
 * required. `"exception"`: permitted once every field named in `requirements` is a non-empty
 * (post-`.trim()`) string on the record (see `evaluateExceptionRecord`).
 *
 * It names fields instead of setting a numeric threshold. Generic filler entries satisfy a plain
 * count without the work the count was meant to prove. A named field can be reviewed against a
 * specific question. `scripts/suppression-governance/policy-config.ts`'s `SuppressionPolicy` uses
 * the same design for the disable-comment domain this type generalizes.
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
 * suppression domain). Names such as "domain", "rule", "severity" and "exceptionType" belong to
 * each consumer. The core sees them only as `{ group, category }` (see `ExceptionClassification`).
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
    /** Existing records whose id matched no finding this run. They are surfaced for the policy to fail on and **never removed** here: retiring one is an explicit human edit. */
    readonly staleRecords: readonly TRecord[];
    /** The ids of the stubs created this run: a subset of `activeRecords`' ids. */
    readonly newStubIds: readonly string[];
}

/**
 * The registry-lifecycle half of `repo-contract/helpers`. `reconcileExceptions` diffs a check's
 * raw findings against its already-loaded exception registry. `serializeExceptionRegistry`
 * renders the reconciled records back to their canonical on-disk form. Both are pure; the only
 * I/O is `writeExceptionRegistry`, in a separate module. See
 * specs/decisions/0013-reusable-exception-policy-helper.md's "The exception registry is the review
 * surface" section for the model these serve. A check emits 100% of its findings. Reconciliation
 * maintains one record per finding (a fresh stub for a new one). Stale records are surfaced,
 * never removed.
 */
/**
 * The three fields every exception record in `.repo-contract/exceptions/*.json` carries, whatever
 * the owning check. A registry adds its typed fields on top; this is the shared core the
 * generic machinery (`reconcileExceptions`, `serializeExceptionRegistry`,
 * `validateExceptionRegistry` in `exception-record.ts`) relies on.
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
 * One record to evaluate, with everything `evaluateExceptionRecord` needs to judge it.
 * `evaluateExceptionRecord` and `evaluateExceptionRecords` share it, so the five-field shape is
 * declared once.
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

/** One registry file's records, named by its file name without `.json`. */
export declare interface ExceptionRegistryContents {
    readonly name: string;
    readonly records: readonly unknown[];
}

/** A registry file that could not be read or has no `exceptions` array. */
export declare interface ExceptionRegistryError {
    readonly name: string;
    readonly error: string;
}

/**
 * A per-registry validator plugged into {@link validateExceptionRegistry}. It owns one registry's
 * record shape beyond the core every `.repo-contract/exceptions/*.json` record shares.
 */
export declare interface ExceptionRegistrySchema<TRecord extends {
    readonly id: string;
}> {
    /** The mandatory `id` prefix, such as `"mutation:"`. A record outside it fails validation; it is never called stale. */
    readonly namespace: string;
    /** Every own key a record may carry beyond `id`, `version` and `justification`. Any other key fails validation. */
    readonly metadataKeys: readonly string[];
    /**
     * Validates the registry's own fields and rebuilds the typed record from scratch.
     * @param core - the validated `id`, `version` and `justification`.
     * @param raw - the untrusted parsed object.
     * @param index - the record's index, for messages.
     * @param errors - collects one message per problem.
     * @returns the rebuilt record, or `undefined` when a field is invalid.
     */
    readonly validateRecord: (core: ExceptionRecordCore, raw: Readonly<Record<string, unknown>>, index: number, errors: string[]) => TRecord | undefined;
}

/**
 * Wraps {@link validateExceptionRegistry} as the Standard Schema `loadExceptionRegistry` takes.
 * @param schema - the registry's schema.
 * @returns a Standard Schema whose output is the validated records.
 */
export declare function exceptionRegistryStandardSchema<TRecord extends {
    readonly id: string;
}>(schema: ExceptionRegistrySchema<TRecord>): StandardSchemaV1<unknown, readonly TRecord[]>;

/** One registry's counts. */
export declare interface ExceptionRegistrySummary {
    readonly name: string;
    readonly total: number;
    /** Records per `exceptionType`; a record without one counts as `"(untyped)"`. */
    readonly byType: Readonly<Record<string, number>>;
    /** Records still `version: 1`. */
    readonly legacy: number;
    /** Records whose `expires` is before today. */
    readonly expired: number;
    /** Records with a blank `justification`, or a blank v2 field on a `version: 2` record. */
    readonly incomplete: number;
}

export declare type ExceptionType = (typeof EXCEPTION_TYPES)[number];

/** The fields of a `version: 2` record. Each is `""` on a fresh stub until a person writes it. */
export declare interface ExceptionV2Fields {
    readonly ruleBroken: string;
    readonly attempted: string;
    readonly constraint: string;
    readonly whyPreferable: string;
    readonly residualRisk: string;
    readonly revisitWhen: string;
    /** `YYYY-MM-DD`, or `""` for none. The key must be present. */
    readonly expires: string;
}

/**
 * A resolved judgment about one record, once its `ExceptionPolicy` has been checked against its
 * field values. See `ExceptionDeterminant`.
 * @public
 */
export declare type ExceptionVerdict = "forbidden" | "insufficient" | "permitted";

/**
 * A directory used as a cache store: paths are relative and slash-separated, each maps to a file.
 * Structurally the same as `CacheStore` from `repo-contract/affected`, so it can be passed to
 * `createCache` there; declared here because the two published barrels stay independent.
 */
export declare interface FileCacheStore {
    /** Reads a file by its store-relative path; resolves to `undefined` if there is none. */
    readonly read: (relativePath: string) => Promise<string | undefined>;
    /** Writes atomically: a reader sees the old content or the new, never part of either. */
    readonly write: (relativePath: string, text: string) => Promise<void>;
    /** Deletes a file; one that is already gone is not an error. */
    readonly remove: (relativePath: string) => Promise<void>;
    /** Lists every file whose store-relative path starts with the prefix, sorted. */
    readonly list: (prefix: string) => Promise<readonly string[]>;
}

/**
 * A deterministic digest of some fields' current values on `record`, via `node:crypto`. It is
 * pure and synchronous, with no ambient state. Socket.dev has no alert on `node:crypto`. It is
 * neither `child_process` nor `process.env`, the two capabilities `src/helpers/**` must never
 * touch (see the `AmbientCapabilities` check). The digest makes a verification *content-bound*
 * rather than merely attested. A consumer records this hash when a human or a mechanical re-check
 * approves a record's current prose. Recomputing and comparing it later detects staleness with no
 * separate tracking: edit any field named in `fields` and the hash stops matching. Each field's
 * name is bound into the digest with its value, as a `JSON.stringify`'d `[name, value]` pair.
 * JSON escaping keeps the digest unambiguous whatever characters a name or value holds. Two field
 * sets whose values concatenate to the same plain text cannot collide.
 * @param record - The record to hash fields from.
 * @param fields - Which fields (by name, in this order) to include in the digest: the names `evaluateExceptionRecord` passes to `fieldValue`.
 * @param fieldValue - Resolves one named field's current string value on `record`, like `evaluateExceptionRecord`'s `fieldValue` parameter.
 * @returns A hex-encoded SHA-256 digest of `fields`' current values.
 * @public
 */
export declare function hashRequirementFields<TRecord>(record: TRecord, fields: readonly string[], fieldValue: (record: TRecord, requirement: string) => string): string;

/**
 * @param expires - a record's `expires` (`""` never expires), untrusted.
 * @param now - the clock to compare against.
 * @returns `true` only for a valid date strictly before `now`'s date.
 */
export declare function isExpired(expires: unknown, now?: Date): boolean;

/**
 * @param record - a record of either version.
 * @param record.version - `1` or `2`.
 * @returns whether it is a legacy `version: 1` record.
 */
export declare function isLegacyRecord(record: {
    readonly version: 1 | 2;
}): boolean;

/**
 * @param value - a field value.
 * @param at - its path, for the message.
 * @param errors - collects `"<at> must be a non-empty string."`.
 * @returns whether `value` is a non-empty string.
 */
export declare function isValidNonEmptyStringField(value: unknown, at: string, errors: string[]): value is string;

/** What a `version: 1` record answers for a v2 field it never had. Non-empty, so the record still passes. */
export declare const LEGACY_FIELD_VALUE = "(legacy version 1 record)";

/**
 * Loads a registry, reconciles findings against it and writes it back.
 * @param registryPath - the registry's absolute path.
 * @param registryRelativePath - its repository-relative path, for rationales.
 * @param schema - validates the file's records.
 * @param findings - this run's findings.
 * @param createStub - builds a blank record for a finding.
 * @returns the reconciled registry, or the rationale to fail with.
 */
export declare function loadAndReconcileExceptionRegistry<TFinding extends {
    readonly id: string;
}, TRecord extends {
    readonly id: string;
}>(registryPath: string, registryRelativePath: string, schema: StandardSchemaV1<unknown, readonly TRecord[]>, findings: readonly TFinding[], createStub: (finding: TFinding, id: string) => TRecord): Promise<PersistExceptionRegistryResult<TRecord>>;

/**
 * Reads and validates one exception registry file from disk: `path -> { "$schema"?: string,
 * "exceptions": T[] }`, in two independently-validated layers. This function owns only the
 * envelope. The file exists or is absent (a normal empty-registry state), parses as JSON, and is
 * an object carrying an `"exceptions"` field. It never inspects what is inside `exceptions`.
 * `schema` (a `StandardSchemaV1`, hand-written or from a library; see
 * `src/standard-schema/types.ts`) owns every field-level concern for the caller's record shape.
 * That is the same "consumer supplies a trusted capability, this package calls it without
 * owning its internals" relationship `RepoContractConfig.spawn`/`env` already establish (see
 * `specs/decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md`).
 *
 * `readFile` defaults to `node:fs/promises`' `readFile`. `src/presets/security-secrets.ts`
 * already uses it, so this introduces no new filesystem-access surface. A missing file is a normal
 * "no exceptions recorded yet" state, not an error (`{ ok: true, records: [] }`). That matches
 * `scripts/suppression-governance/check.ts`'s `loadExistingRegistry` precedent for the same
 * first-run case. Every other failure returns `{ ok: false, errors }` rather than throwing:
 * unreadable for another reason, malformed JSON, a missing/malformed envelope, or a schema
 * validation failure. A bad registry is reported as data for a check's policy to fail on, never an
 * uncaught exception that crashes the run. The one exception is a throwing or rejecting
 * `schema.validate()`. That is a bug in the *caller-supplied schema*, not malformed registry data.
 * It propagates as a rejected `Promise`, as a throwing `output.schema` does in
 * `src/parsing/parse-output.ts`.
 * @param input - Where to read the registry from, the schema that validates its `exceptions` array, and (for tests, or a non-`node:fs` environment) an override for how to read `path`.
 * @param input.path - The registry file's path, passed to `input.readFile` verbatim.
 * @param input.schema - Validates (and may transform) the envelope's `exceptions` array once the envelope checks pass.
 * @param input.readFile - Reads `input.path`'s content. Defaults to `node:fs/promises`' `readFile(path, "utf8")`.
 * @param input.isSymlink - Whether `input.path` is a symbolic link. Defaults to `lstat`, with a missing path not a link. A link is refused, never followed: it could lead out of the registry directory.
 * @returns Every valid record (`ok: true`), or every problem found reading/parsing/validating the file (`ok: false`).
 * @public
 */
export declare function loadExceptionRegistry<T>(input: {
    readonly path: string;
    readonly schema: StandardSchemaV1<unknown, readonly T[]>;
    readonly readFile?: (path: string) => Promise<string>;
    readonly isSymlink?: (path: string) => Promise<boolean>;
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

/** A registry after a batch of findings was reconciled against it and written back. */
export declare interface PersistedExceptionRegistry<TRecord> {
    readonly activeRecords: readonly TRecord[];
    readonly staleRecords: readonly TRecord[];
    readonly newStubIds: readonly string[];
}

/** The reconciled registry, or the rationale a check fails with when it cannot be read or written. */
export declare type PersistExceptionRegistryResult<TRecord> = {
    readonly ok: true;
    readonly registry: PersistedExceptionRegistry<TRecord>;
} | {
    readonly ok: false;
    readonly rationale: string;
};

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
 * Reads every `*.json` registry in a directory. A file that cannot be read becomes an error row,
 * never a throw: the check that owns the registry fails on it. A symbolic link is listed as
 * skipped and never followed, since it could lead out of the directory.
 * @param directory - the registry directory, usually {@link EXCEPTION_REGISTRY_DIRECTORY}.
 * @returns the registries in file-name order, and the files that could not be read.
 */
export declare function readExceptionRegistries(directory: string): Promise<{
    readonly registries: readonly ExceptionRegistryContents[];
    readonly errors: readonly ExceptionRegistryError[];
}>;

/**
 * Reconciles findings against existing records and writes the registry back: a blank stub for
 * each new finding, a stale record kept for the policy to fail on.
 * @param registryPath - the registry's absolute path.
 * @param registryRelativePath - its repository-relative path, for rationales.
 * @param existing - the records already loaded.
 * @param findings - this run's findings.
 * @param createStub - builds a blank record for a finding.
 * @returns the reconciled registry, or the rationale to fail with.
 */
export declare function reconcileAndPersistExceptionRegistry<TFinding extends {
    readonly id: string;
}, TRecord extends {
    readonly id: string;
}>(registryPath: string, registryRelativePath: string, existing: readonly TRecord[], findings: readonly TFinding[], createStub: (finding: TFinding, id: string) => TRecord): Promise<PersistExceptionRegistryResult<TRecord>>;

/**
 * Reconciles this run's raw findings against the check's already-loaded, already-validated
 * exception registry. Pure and add-only: it never mutates a matched record and never removes a
 * stale one.
 *
 * `deriveId` must be **injective** over `findings`: every independently-governable finding needs
 * a distinct id, or the mechanism cannot tell which finding a record's `justification` belongs to.
 * A collision is returned as `{ ok: false }`, naming both finding indices so the check can point a
 * developer at them. It is a condition a check must surface: the source holds two identical
 * directives.
 *
 * `createStub(finding, id)` is handed the canonical id, and its result's `id` is asserted equal to
 * it. A `createStub` that derives its identity differently gets a `{ ok: false }` bug report, never
 * a silently-mismatched record.
 *
 * Precondition: `existing` has already passed the check's registry validator (unique ids, correct
 * namespace). This function does not re-validate it.
 * @param input - The already-loaded registry, this run's findings, and the check-owned identity + stub callbacks.
 * @param input.existing - The validated records currently on disk.
 * @param input.findings - Every raw finding this run produced: nothing filtered.
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
 * The `fieldValue` accessor `evaluateExceptionRecord` takes. A legacy record answers
 * {@link LEGACY_FIELD_VALUE} for a v2 field.
 * @param record - a flat record.
 * @param requirement - the field name.
 * @returns the field's text, or `""`.
 */
export declare function recordFieldValue(record: unknown, requirement: string): string;

/**
 * @param inventory - what {@link summarizeExceptionRegistries} returned.
 * @returns one line per registry under a total line, ending in a newline.
 */
export declare function renderExceptionInventory(inventory: ExceptionInventory): string;

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
 * The file operations the logs use; each defaults to its `node:fs/promises` counterpart. For
 * tests, or a non-`node:fs` environment.
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
 * Resolves the policy one `{ group, category }` classification is subject to. This comment is the
 * single source of truth for the precedence order. The function generalizes
 * `scripts/suppression-governance/resolve-policy.ts`'s `resolveRequirement`, which it is meant to
 * replace:
 *
 * 0. **No entry for `group`** (`config[group] === undefined`) resolves to `globalDefault` before
 *    `category` is inspected. A blanket `category === "*"` against an unconfigured group also
 *    returns `globalDefault`, never an empty-array reduce.
 * 1. **Blanket category**: `category === "*"` means every category this group could apply to was
 *    matched at once. It is not one category literally named `"*"`. It resolves to the strictest
 *    (`stricterOf`) policy across every entry in `group.rules` plus the group's default (or
 *    `globalDefault`). It skips the glob matcher. `globMatch("*", pattern)` tests the literal
 *    string `"*"` against `pattern`, so it does not match a pattern like `"security/*"`. As an
 *    ordinary pattern match, a blanket match would skip a group's `forbidden` rules and land on
 *    its more lenient default.
 * 2. **Exact match**: `group.rules[category]`, if present. No glob is consulted once an exact entry
 *    exists for `category`.
 * 3. **Glob match**: the strictest (`stricterOf`) policy among the `group.rules` keys that match
 *    `category` as a glob (e.g. `"security/*"` matching `"security/detect-object-injection"`).
 * 4. **Group default**: `group.default`, when `group` has an entry in `config` (whether or not
 *    that entry defines `default`).
 * 5. **Global default**: `globalDefault`, when `group` has no entry in `config`, or when no exact
 *    match, glob match or `group.default` applies.
 *
 * Assumes `config` has already passed `validateExceptionPolicyConfig`.
 * @param classification - The `{ group, category }` pair to resolve a policy for.
 * @param config - The exception policy configuration to resolve against.
 * @param globalDefault - The policy to fall back to when `classification.group` has no entry in `config` at all.
 * @returns The resolved policy for `classification`.
 * @public
 */
export declare function resolveExceptionPolicy(classification: ExceptionClassification, config: ExceptionPolicyConfig, globalDefault: ExceptionPolicy): ExceptionPolicy;

/** The {@link SecurityExceptionFields} keys, in canonical order, for a schema's `metadataKeys`. */
export declare const SECURITY_EXCEPTION_FIELD_KEYS: readonly ["alternatives", "remediation", "method", "exceptionType"];

/** The four fields a security-family record adds. Each is `""` on a fresh stub. */
export declare interface SecurityExceptionFields {
    readonly alternatives: string;
    readonly remediation: string;
    readonly method: "" | ExceptionMethod;
    readonly exceptionType: "" | ExceptionType;
}

/**
 * The canonical on-disk form of one exception registry: `{ "exceptions": [ ... ] }`. Records are
 * sorted ascending by `id` (code-unit order, locale-independent), with each record's keys in
 * `canonicalRecord` order. It uses a 2-space indent, `\n` line endings and a trailing newline. The
 * same records always serialize to identical bytes. A reconcile that changes nothing produces no
 * diff, and `writeExceptionRegistry` writes nothing.
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
 * Counts every registry's records by type, legacy, expired and incomplete.
 * @param registries - the registries' records.
 * @param now - the date `expires` is compared with.
 * @param errors - files that could not be read, carried into the inventory.
 * @returns the inventory.
 */
export declare function summarizeExceptionRegistries(registries: readonly ExceptionRegistryContents[], now: Date, errors?: readonly ExceptionRegistryError[]): ExceptionInventory;

/**
 * Validates an `ExceptionPolicyConfig`'s shape. Every group's `default` and every entry in its
 * `rules` must be a well-formed `ExceptionPolicy` (see `validateExceptionPolicyValue`). No group's
 * `rules` may use the literal `"*"` as a key, because that key is never a blanket policy.
 * `resolveExceptionPolicy` applies the blanket policy when the *input* `category` is `"*"`. A
 * `"*"` rules key is consulted only as an ordinary glob, which matches no category containing a
 * `/`. See `resolveExceptionPolicy`'s doc comment, case 1, for the failure mode this prevents.
 * @param config - The exception policy configuration to validate.
 * @param validRequirements - The complete set of field names this consumer's policy may require, if the consumer wants that checked. Omit to skip that check entirely.
 * @returns Every configuration problem found; empty if `config` is valid.
 * @public
 */
export declare function validateExceptionPolicyConfig(config: ExceptionPolicyConfig, validRequirements?: readonly string[]): readonly string[];

/**
 * Validates an untrusted `exceptions` array: the core, the id namespace, unknown keys, duplicate
 * ids, the v2 fields of a `version: 2` record, then `schema.validateRecord`. Reports every
 * problem. A blank field is valid data; completeness is the check's policy.
 * @param value - the parsed `exceptions` value.
 * @param schema - the registry's schema.
 * @returns every rebuilt record, or every problem found.
 */
export declare function validateExceptionRegistry<TRecord extends {
    readonly id: string;
}>(value: unknown, schema: ExceptionRegistrySchema<TRecord>): {
    readonly ok: true;
    readonly records: readonly TRecord[];
} | {
    readonly ok: false;
    readonly errors: readonly string[];
};

/**
 * Validates the four security fields. Each must be a string; `method` and `exceptionType` must be
 * `""` or a known member. A filled `validated-false-positive` needs `mechanical-reverification`.
 * @param raw - the untrusted record.
 * @param index - its index, for messages.
 * @param allowedExceptionTypes - the types this registry accepts.
 * @param errors - collects one message per problem.
 * @returns the four fields, or `undefined` when one is invalid.
 */
export declare function validateSecurityExceptionFields(raw: Readonly<Record<string, unknown>>, index: number, allowedExceptionTypes: readonly ExceptionType[], errors: string[]): SecurityExceptionFields | undefined;

/** A record of either version. A registry can migrate one record at a time. */
export declare interface VersionedExceptionRecord {
    readonly id: string;
    readonly version: 1 | 2;
}

/**
 * Writes one exception registry to disk in its canonical form (`serializeExceptionRegistry`),
 * atomically and idempotently: the sole filesystem-writing primitive in `repo-contract/helpers`.
 *
 * - **A record that is not an object with a string `id`** -> `{ ok: false }` naming its index.
 *   Nothing is read or written.
 * - **Symlinked target** -> `{ ok: false }`: a governance registry is never a symlink, and writing
 *   through one would escape `.repo-contract/exceptions/`.
 * - **No file yet** -> written.
 * - **On-disk bytes already equal the canonical form** -> `{ ok: true, written: false }`, no
 *   write. A reconcile that changed nothing never dirties the working tree.
 * - **Different** -> the canonical bytes go to a sibling temp file (`<path>.<uuid>.tmp`), which is
 *   `rename`d over the target. The target is replaced atomically and never holds partial content.
 *   A `rename` failure (e.g. a Windows lock on the target) returns `{ ok: false }`. The temp file
 *   stays in place: it has a uuid name and the run has already failed. `.gitignore` covers
 *   `.repo-contract/exceptions/*.tmp`.
 *
 * Path containment is the caller's responsibility: repo-contract's checks always pass
 * `.repo-contract/exceptions/<name>.json`. `readFile`/`writeFile`/`rename`/`isSymlink` default to
 * `node:fs/promises` and are overridable for tests or a non-`node:fs` environment, mirroring
 * `loadExceptionRegistry`'s `readFile` parameter.
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
