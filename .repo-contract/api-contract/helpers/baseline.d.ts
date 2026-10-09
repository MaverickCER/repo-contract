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
 * @beta
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
 * @beta
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
 * @beta
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
 * @beta
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
 * @beta
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
 * @beta
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
 * @beta
 */
export declare type ExceptionPolicyConfig = Readonly<Record<string, ExceptionCategoryGroup>>;

/**
 * The outcome of reconciling one run's findings against one exception registry.
 * @beta
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
 * @beta
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
 * @beta
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
 * @beta
 */
export declare type ExceptionVerdict = "forbidden" | "insufficient" | "permitted";

/**
 * A deterministic digest of a set of fields' current values on `record`, via `node:crypto` --
 * pure, synchronous, no ambient state (Socket.dev has no alert on `node:crypto`; it is not
 * `child_process`/`process.env`, the two capabilities `src/helpers/**` must never touch -- see
 * `scripts/verify-no-ambient-capabilities.mjs`). This is what makes a "verification" *content-bound*
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
 * @beta
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
 * @beta
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
 * @beta
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
 * @beta
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
 * @beta
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
 * @beta
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
 * @beta
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
