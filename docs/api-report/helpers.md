# helpers

Governed exceptions: let a check waive one finding when a named record justifies it, without
weakening the check. A record names its `{ group, category }`, and this barrel resolves that to
a policy (exact, then glob, then default) and checks the record's fields against it.

The barrel also ships the v2 record every registry shares, its vocabulary of eight exception
types and three methods, and the read-reconcile-write sequence. The check stays in charge of
what a finding is, of each finding's identity and of which types it accepts. This is the
mechanism `scripts/suppression-governance/` built for `disable-comments.json` (ADR 0006),
extracted for any check; specs/decisions/0013-reusable-exception-policy-helper.md has the
boundary.

Published **Stable** (see `VERSIONING.md` and
specs/decisions/0019-helpers-promoted-presets-stay-experimental.md). From `1.0` a new export is
a minor release and a changed signature or behavior is a major one. While the package is `0.x`,
the release tooling deflates a new export to a patch.

Published under its `./helpers` subpath, independent of the root and `./presets` barrels.

## Interfaces

### ExceptionCategoryGroup

One classification group's policy. `default` is the group's fallback for any `category` with
no exact or glob match in `rules`. Omit `default` to fall through to the caller's
`globalDefault`. `resolveExceptionPolicy` documents the full precedence: exact, glob, group
default, global default. Each key of `rules` is an exact `category` string or a glob pattern.
An exact match always wins, so a glob never shadows a more specific exact entry.

#### Properties

##### default?

```ts
readonly default?: ExceptionPolicy;
```

This group's fallback policy when `category` matches neither an exact nor a glob key in `rules`. Falls through to the caller's `globalDefault` when omitted.

##### rules?

```ts
readonly rules?: Readonly<Record<string, ExceptionPolicy>>;
```

Keyed by exact `category` string or glob pattern. A literal `"*"` key is rejected by `validateExceptionPolicyConfig`: see that function's doc comment for why.

***

### ExceptionClassification

One classification a record is evaluated against: only `{ group, category }`, with no
consumer vocabulary such as `domain`, `rule`, `severity` or `exceptionType`. A consumer maps its
concepts onto this shape at the call site. For example, `suppression-governance` passes
`{ group: record.domain, category: rule }` per suppressed rule. `security-socket` passes
`{ group: "socket", category: normalizedSeverity }`. The core uses `group` and `category` only
as lookup keys into an `ExceptionPolicyConfig`.

#### Properties

##### category

```ts
readonly category: string;
```

The `rules` key (exact or glob-matched) this classification resolves against within `group`.

##### group

```ts
readonly group: string;
```

The top-level key this classification resolves against in an `ExceptionPolicyConfig`.

***

### ExceptionDeterminant

One record's resolved policy verdict, and (for `"insufficient"`) which required fields are
still empty. There is no batch or matched-vs-unmatched shape. Matching a finding to a record
stays with each check, which reconciles its findings against its registry via
`reconcileExceptions`.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-trecord"></a> `TRecord` |

#### Properties

##### missing

```ts
readonly missing: readonly string[];
```

Every required field (by name) still empty on `record`, in the resolved policy's `requirements` order. Always `[]` for `"forbidden"`/`"permitted"`.

##### record

```ts
readonly record: TRecord;
```

The record this determinant was computed for, returned verbatim.

##### verdict

```ts
readonly verdict: ExceptionVerdict;
```

`"forbidden"`: never permitted. `"insufficient"`: exception-eligible, but `missing` is non-empty. `"permitted"`: every required field is filled in (or the resolved policy was `"allowed"`).

***

### ExceptionInventory

What `repo-contract exceptions --json` prints. It decides nothing.

#### Properties

##### errors

```ts
readonly errors: readonly ExceptionRegistryError[];
```

##### expired

```ts
readonly expired: number;
```

##### incomplete

```ts
readonly incomplete: number;
```

##### legacy

```ts
readonly legacy: number;
```

##### registries

```ts
readonly registries: readonly ExceptionRegistrySummary[];
```

##### schemaVersion

```ts
readonly schemaVersion: 1;
```

##### total

```ts
readonly total: number;
```

***

### ExceptionReconciliation

The outcome of reconciling one run's findings against one exception registry.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-tfinding"></a> `TFinding` |
| <a id="type-parameter-trecord-1"></a> `TRecord` |

#### Properties

##### activeRecords

```ts
readonly activeRecords: readonly TRecord[];
```

Every record to persist as live: matched records verbatim, plus one fresh `createStub` per unmatched finding. Never contains a stale record.

##### matchedPairs

```ts
readonly matchedPairs: readonly {
  finding: TFinding;
  record: TRecord;
}[];
```

Each finding paired with the existing record it matched, in `findings` order.

##### newStubIds

```ts
readonly newStubIds: readonly string[];
```

The ids of the stubs created this run: a subset of `activeRecords`' ids.

##### staleRecords

```ts
readonly staleRecords: readonly TRecord[];
```

Existing records whose id matched no finding this run. They are surfaced for the policy to fail on and **never removed** here: retiring one is an explicit human edit.

***

### ExceptionRecordCore

The three fields every exception record in `.repo-contract/exceptions/*.json` carries, whatever
the owning check. A registry adds its typed fields on top; this is the shared core the
generic machinery (`reconcileExceptions`, `serializeExceptionRegistry`,
`validateExceptionRegistry` in `exception-record.ts`) relies on.

#### Properties

##### id

```ts
readonly id: string;
```

The check-namespaced semantic identity of the finding this record waives (e.g. `"suppression:eslint:no-console:src/foo.ts:<module>"`). Equals the finding id; a record whose id matches no current finding is stale. Never derived from prose.

##### justification

```ts
readonly justification: string;
```

The one human-authored field: why this guardrail is deliberately bypassed, and what was checked to confirm the finding is real. `""` in a freshly scaffolded stub (the policy, not the validator, rejects a blank/placeholder value).

##### version

```ts
readonly version: number;
```

Record-schema version.

***

### ExceptionRecordEvaluation

One record to evaluate, with everything `evaluateExceptionRecord` needs to judge it.
`evaluateExceptionRecord` and `evaluateExceptionRecords` share it, so the five-field shape is
declared once.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-trecord-2"></a> `TRecord` |

#### Properties

##### classifications

```ts
readonly classifications: readonly [ExceptionClassification, ExceptionClassification];
```

Every classification this record is subject to; the strictest resolved policy across all of them wins.

##### config

```ts
readonly config: ExceptionPolicyConfig;
```

The exception policy configuration to resolve `classifications` against.

##### fieldValue

```ts
readonly fieldValue: (record, requirement) => string;
```

Resolves one named required field's current string value on `record`.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `record` | `TRecord` |
| `requirement` | `string` |

###### Returns

`string`

##### globalDefault

```ts
readonly globalDefault: ExceptionPolicy;
```

The policy to fall back to for any classification whose `group` has no entry in `config` at all.

##### record

```ts
readonly record: TRecord;
```

The record to evaluate.

***

### ExceptionRegistryContents

One registry file's records, named by its file name without `.json`.

#### Properties

##### name

```ts
readonly name: string;
```

##### records

```ts
readonly records: readonly unknown[];
```

***

### ExceptionRegistryError

A registry file that could not be read or has no `exceptions` array.

#### Properties

##### error

```ts
readonly error: string;
```

##### name

```ts
readonly name: string;
```

***

### ExceptionRegistrySchema

A per-registry validator plugged into [validateExceptionRegistry](#validateexceptionregistry). It owns one registry's
record shape beyond the core every `.repo-contract/exceptions/*.json` record shares.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-trecord-3"></a> `TRecord` *extends* \{ `id`: `string`; \} |

#### Properties

##### metadataKeys

```ts
readonly metadataKeys: readonly string[];
```

Every own key a record may carry beyond `id`, `version` and `justification`. Any other key fails validation.

##### namespace

```ts
readonly namespace: string;
```

The mandatory `id` prefix, such as `"mutation:"`. A record outside it fails validation; it is never called stale.

##### validateRecord

```ts
readonly validateRecord: (core, raw, index, errors) => TRecord | undefined;
```

Validates the registry's own fields and rebuilds the typed record from scratch.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `core` | [`ExceptionRecordCore`](#exceptionrecordcore) | the validated `id`, `version` and `justification`. |
| `raw` | `Readonly`\<`Record`\<`string`, `unknown`\>\> | the untrusted parsed object. |
| `index` | `number` | the record's index, for messages. |
| `errors` | `string`[] | collects one message per problem. |

###### Returns

`TRecord` \| `undefined`

the rebuilt record, or `undefined` when a field is invalid.

***

### ExceptionRegistrySummary

One registry's counts.

#### Properties

##### byType

```ts
readonly byType: Readonly<Record<string, number>>;
```

Records per `exceptionType`; a record without one counts as `"(untyped)"`.

##### expired

```ts
readonly expired: number;
```

Records whose `expires` is before today.

##### incomplete

```ts
readonly incomplete: number;
```

Records with a blank `justification`, or a blank v2 field on a `version: 2` record.

##### legacy

```ts
readonly legacy: number;
```

Records still `version: 1`.

##### name

```ts
readonly name: string;
```

##### total

```ts
readonly total: number;
```

***

### ExceptionV2Fields

The fields of a `version: 2` record. Each is `""` on a fresh stub until a person writes it.

#### Properties

##### attempted

```ts
readonly attempted: string;
```

##### constraint

```ts
readonly constraint: string;
```

##### expires

```ts
readonly expires: string;
```

`YYYY-MM-DD`, or `""` for none. The key must be present.

##### residualRisk

```ts
readonly residualRisk: string;
```

##### revisitWhen

```ts
readonly revisitWhen: string;
```

##### ruleBroken

```ts
readonly ruleBroken: string;
```

##### whyPreferable

```ts
readonly whyPreferable: string;
```

***

### FileCacheStore

A directory used as a cache store: paths are relative and slash-separated, each maps to a file.
Structurally the same as `CacheStore` from `repo-contract/affected`, so it can be passed to
`createCache` there; declared here because the two published barrels stay independent.

#### Properties

##### list

```ts
readonly list: (prefix) => Promise<readonly string[]>;
```

Lists every file whose store-relative path starts with the prefix, sorted.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `prefix` | `string` |

###### Returns

`Promise`\<readonly `string`[]\>

##### read

```ts
readonly read: (relativePath) => Promise<string | undefined>;
```

Reads a file by its store-relative path; resolves to `undefined` if there is none.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `relativePath` | `string` |

###### Returns

`Promise`\<`string` \| `undefined`\>

##### remove

```ts
readonly remove: (relativePath) => Promise<void>;
```

Deletes a file; one that is already gone is not an error.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `relativePath` | `string` |

###### Returns

`Promise`\<`void`\>

##### write

```ts
readonly write: (relativePath, text) => Promise<void>;
```

Writes atomically: a reader sees the old content or the new, never part of either.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `relativePath` | `string` |
| `text` | `string` |

###### Returns

`Promise`\<`void`\>

***

### PersistedExceptionRegistry

A registry after a batch of findings was reconciled against it and written back.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-trecord-4"></a> `TRecord` |

#### Properties

##### activeRecords

```ts
readonly activeRecords: readonly TRecord[];
```

##### newStubIds

```ts
readonly newStubIds: readonly string[];
```

##### staleRecords

```ts
readonly staleRecords: readonly TRecord[];
```

***

### RepoContractLogs

**`Beta`**

Where the log of a check lives, and what is written to it. No function throws.

#### Properties

##### begin

```ts
readonly begin: () => void;
```

**`Beta`**

Removes the `.log` files of an earlier run and starts empty.

###### Returns

`void`

##### count

```ts
readonly count: () => number;
```

**`Beta`**

How many logs exist this run.

###### Returns

`number`

the count.

##### directory

```ts
readonly directory: string;
```

**`Beta`**

The folder the logs are in, relative to the repository root.

##### flush

```ts
readonly flush: () => Promise<void>;
```

**`Beta`**

Waits for every write asked for so far.

###### Returns

`Promise`\<`void`\>

a promise that settles once they have finished; it never rejects.

##### has

```ts
readonly has: (checkId) => boolean;
```

**`Beta`**

Whether a log for a check has been written this run.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `checkId` | `string` | the check. |

###### Returns

`boolean`

`true` when its log exists.

##### prependVerdict

```ts
readonly prependVerdict: (checkId, label, rationale, passed) => void;
```

**`Beta`**

Puts a verdict at the top of a check's log, replacing one already there. With the `"failing"` mode, a passing
check's log is removed instead.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `checkId` | `string` | the check. |
| `label` | `string` | what to call the result, for example `FAIL (advisory)`. |
| `rationale` | `string` | the verdict's whole reason. |
| `passed` | `boolean` | whether the check passed. |

###### Returns

`void`

##### saveEvidence

```ts
readonly saveEvidence: (checkId, evidence) => void;
```

**`Beta`**

Writes (or overwrites) a check's log with its evidence.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `checkId` | `string` |
| `evidence` | [`CheckEvidence`](index/README.md#checkevidence) |

###### Returns

`void`

***

### RepoContractLogsFileSystem

**`Beta`**

The file operations the logs use; each defaults to its `node:fs/promises` counterpart. For
tests, or a non-`node:fs` environment.

#### Properties

##### mkdir

```ts
readonly mkdir: (folder) => Promise<void>;
```

**`Beta`**

Creates the folder, and any missing parents, if it does not exist.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `folder` | `string` |

###### Returns

`Promise`\<`void`\>

##### readdir

```ts
readonly readdir: (folder) => Promise<readonly string[]>;
```

**`Beta`**

Lists the names of the entries in a folder.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `folder` | `string` |

###### Returns

`Promise`\<readonly `string`[]\>

##### readFile

```ts
readonly readFile: (file) => Promise<string>;
```

**`Beta`**

Reads a file as text.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `file` | `string` |

###### Returns

`Promise`\<`string`\>

##### rm

```ts
readonly rm: (file) => Promise<void>;
```

**`Beta`**

Removes a file; a file that is already gone is not an error.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `file` | `string` |

###### Returns

`Promise`\<`void`\>

##### writeFile

```ts
readonly writeFile: (file, text) => Promise<void>;
```

**`Beta`**

Writes (or overwrites) a file with the text.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `file` | `string` |
| `text` | `string` |

###### Returns

`Promise`\<`void`\>

***

### RepoContractLogsOptions

**`Beta`**

Where and how logs are written.

#### Properties

##### cwd?

```ts
readonly cwd?: string;
```

**`Beta`**

The repository root the folder is resolved against. Defaults to the current working directory.

##### directory?

```ts
readonly directory?: string;
```

**`Beta`**

The folder, relative to `cwd`. Defaults to `reports/contract/logs`.

##### fs?

```ts
readonly fs?: Partial<RepoContractLogsFileSystem>;
```

**`Beta`**

Overrides how files are read and written. A store with its own file operations is not shared with other hooks: wire its `saveEvidence` and `prependVerdict` yourself.

##### mode?

```ts
readonly mode?: RepoContractLogMode;
```

**`Beta`**

Which logs to keep. Defaults to `"failing"`: a log for a check that passed is removed once its verdict is known.

##### onProblem?

```ts
readonly onProblem?: (message) => void;
```

**`Beta`**

Told once, with the reason, the first time a log cannot be written. Defaults to ignoring it.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `message` | `string` |

###### Returns

`void`

***

### SecurityExceptionFields

The four fields a security-family record adds. Each is `""` on a fresh stub.

#### Properties

##### alternatives

```ts
readonly alternatives: string;
```

##### exceptionType

```ts
readonly exceptionType: 
  | ""
  | "validated-false-positive"
  | "accepted-risk"
  | "compensating-control"
  | "tooling-limitation"
  | "scheduled-remediation"
  | "platform-or-vendor-constraint"
  | "required-for-package-to-exist"
  | "dev-only-not-shipped";
```

##### method

```ts
readonly method: 
  | ""
  | "mechanical-reverification"
  | "independent-human-review"
  | "policy-rule";
```

##### remediation

```ts
readonly remediation: string;
```

***

### VersionedExceptionRecord

A record of either version. A registry can migrate one record at a time.

#### Properties

##### id

```ts
readonly id: string;
```

##### version

```ts
readonly version: 1 | 2;
```

## Type Aliases

### ExceptionMethod

```ts
type ExceptionMethod = typeof EXCEPTION_METHODS[number];
```

***

### ExceptionPolicy

```ts
type ExceptionPolicy = 
  | {
  mode: "forbidden";
}
  | {
  mode: "allowed";
}
  | {
  mode: "exception";
  requirements: readonly string[];
};
```

A resolved decision for one `{ group, category }` classification. `"forbidden"`: never
permitted, whatever the fields hold. `"allowed"`: permitted unconditionally; no field is
required. `"exception"`: permitted once every field named in `requirements` is a non-empty
(post-`.trim()`) string on the record (see `evaluateExceptionRecord`).

It names fields instead of setting a numeric threshold. Generic filler entries satisfy a plain
count without the work the count was meant to prove. A named field can be reviewed against a
specific question. `scripts/suppression-governance/policy-config.ts`'s `SuppressionPolicy` uses
the same design for the disable-comment domain this type generalizes.

***

### ExceptionPolicyConfig

```ts
type ExceptionPolicyConfig = Readonly<Record<string, ExceptionCategoryGroup>>;
```

A full exception-policy configuration, keyed by classification `group` (e.g. a tool name, or a
suppression domain). Names such as "domain", "rule", "severity" and "exceptionType" belong to
each consumer. The core sees them only as `{ group, category }` (see `ExceptionClassification`).

***

### ExceptionType

```ts
type ExceptionType = typeof EXCEPTION_TYPES[number];
```

***

### ExceptionVerdict

```ts
type ExceptionVerdict = "forbidden" | "insufficient" | "permitted";
```

A resolved judgment about one record, once its `ExceptionPolicy` has been checked against its
field values. See `ExceptionDeterminant`.

***

### PersistExceptionRegistryResult

```ts
type PersistExceptionRegistryResult<TRecord> = 
  | {
  ok: true;
  registry: PersistedExceptionRegistry<TRecord>;
}
  | {
  ok: false;
  rationale: string;
};
```

The reconciled registry, or the rationale a check fails with when it cannot be read or written.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-trecord-5"></a> `TRecord` |

***

### RepoContractLogMode

```ts
type RepoContractLogMode = "all" | "failing" | "off";
```

**`Beta`**

Which logs are kept: every check's, only the checks that did not pass, or none.

## Variables

### EXCEPTION\_METHODS

```ts
const EXCEPTION_METHODS: readonly ["mechanical-reverification", "independent-human-review", "policy-rule"];
```

How an exception's claim was substantiated. `validated-false-positive` needs `mechanical-reverification`.

***

### EXCEPTION\_REGISTRY\_DIRECTORY

```ts
const EXCEPTION_REGISTRY_DIRECTORY: ".repo-contract/exceptions" = ".repo-contract/exceptions";
```

Where a repository keeps its exception registries.

***

### EXCEPTION\_TYPES

```ts
const EXCEPTION_TYPES: readonly ["validated-false-positive", "accepted-risk", "compensating-control", "tooling-limitation", "scheduled-remediation", "platform-or-vendor-constraint", "required-for-package-to-exist", "dev-only-not-shipped"];
```

Why an exception is legitimate. A check may accept only some of them.
`required-for-package-to-exist` and `dev-only-not-shipped` came from internal-package-contract;
consumer registries already use them.

***

### EXCEPTION\_V2\_FIELD\_KEYS

```ts
const EXCEPTION_V2_FIELD_KEYS: readonly ["ruleBroken", "attempted", "constraint", "whyPreferable", "residualRisk", "revisitWhen"];
```

The six text fields a `version: 2` record adds. With `expires`, they make an exception auditable.

***

### LEGACY\_FIELD\_VALUE

```ts
const LEGACY_FIELD_VALUE: "(legacy version 1 record)" = "(legacy version 1 record)";
```

What a `version: 1` record answers for a v2 field it never had. Non-empty, so the record still passes.

***

### REPO\_CONTRACT\_LOG\_DIRECTORY

```ts
const REPO_CONTRACT_LOG_DIRECTORY: string;
```

**`Beta`**

The default folder, relative to the repository root.

***

### REPO\_CONTRACT\_LOG\_EVIDENCE\_MARKER

```ts
const REPO_CONTRACT_LOG_EVIDENCE_MARKER: "=== evidence ===" = "=== evidence ===";
```

**`Beta`**

Starts the part of a log that is the check's evidence, so the verdict above it can be rewritten alone.

***

### SECURITY\_EXCEPTION\_FIELD\_KEYS

```ts
const SECURITY_EXCEPTION_FIELD_KEYS: readonly ["alternatives", "remediation", "method", "exceptionType"];
```

The [SecurityExceptionFields](#securityexceptionfields) keys, in canonical order, for a schema's `metadataKeys`.

## Functions

### asFlatExceptionRecords()

```ts
function asFlatExceptionRecords(records): readonly (Record<string, unknown> & {
  id: string;
})[];
```

Widens typed records to the flat shape `writeExceptionRegistry` takes.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `records` | readonly \{ `id`: `string`; \}[] | typed records. |

#### Returns

readonly (`Record`\<`string`, `unknown`\> & \{
  `id`: `string`;
\})[]

the same array, typed as flat records.

***

### createFileCacheStore()

```ts
function createFileCacheStore(directory): FileCacheStore;
```

Stores cache entries as files under a directory. Writes go to a temporary file in the same
directory and are renamed into place, so concurrent writers and readers never see a partial
entry. A directory that does not exist yet is created by the first write.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `directory` | `string` | The directory the store lives in. |

#### Returns

[`FileCacheStore`](#filecachestore)

The store.

***

### emptyV2Fields()

```ts
function emptyV2Fields(): ExceptionV2Fields;
```

#### Returns

[`ExceptionV2Fields`](#exceptionv2fields)

every v2 field blank: what a new stub starts with.

***

### evaluateExceptionRecord()

```ts
function evaluateExceptionRecord<TRecord>(input): ExceptionDeterminant<TRecord>;
```

Evaluates one record against each of its classifications and takes the strictest
(`stricterOf`) resolved policy. A record matching a forbidden classification and an
otherwise-fine one is forbidden overall. `classifications` is a non-empty tuple by type. Zero
classifications would be a caller bug, not a case to guess about at runtime. A required field
counts as satisfied once `fieldValue(record, requirement).trim()` is non-empty. An empty field
is valid *data* but insufficient for policy, as the `"exception"` mode name implies.
`fieldValue` may resolve a dotted path (e.g. `"verification.verifiedBy"`) or anything else a
record shape needs. This function never interprets `requirement`; it calls `fieldValue` and
trims the result.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-trecord-6"></a> `TRecord` |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `input` | [`ExceptionRecordEvaluation`](#exceptionrecordevaluation)\<`TRecord`\> | The record, its classifications, the policy configuration, the global default and the field-value accessor. See `ExceptionRecordEvaluation` for each field. |

#### Returns

[`ExceptionDeterminant`](#exceptiondeterminant)\<`TRecord`\>

The record's verdict, and which required fields (if any) are still missing.

***

### evaluateExceptionRecords()

```ts
function evaluateExceptionRecords<TRecord>(inputs): readonly ExceptionDeterminant<TRecord>[];
```

A thin batch over already-matched `(record, classifications)` pairs:
`inputs.map(evaluateExceptionRecord)`. It saves a caller that evaluates many records against one
`config`, `globalDefault` and `fieldValue` from writing the `.map`. Matching a record to a
finding stays with each check, which reconciles its findings against its registry. This
function takes already-paired inputs and does no matching.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-trecord-7"></a> `TRecord` |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `inputs` | readonly [`ExceptionRecordEvaluation`](#exceptionrecordevaluation)\<`TRecord`\>[] | Each already-matched record to evaluate, in the shape `evaluateExceptionRecord` takes. |

#### Returns

readonly [`ExceptionDeterminant`](#exceptiondeterminant)\<`TRecord`\>[]

Each input's determinant, in the same order as `inputs`.

***

### evaluateFindingVerdict()

```ts
function evaluateFindingVerdict(
   record, 
   classifications, 
   config, 
   globalDefault
): {
  missing: readonly string[];
  verdict: "forbidden" | "insufficient" | "permitted" | "unmatched";
};
```

Judges one finding against its reconciled record. A missing record is `"unmatched"`.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `record` | `unknown` | the finding's record, or `undefined`. |
| `classifications` | readonly \[[`ExceptionClassification`](#exceptionclassification), [`ExceptionClassification`](#exceptionclassification)\] | the finding's classifications. |
| `config` | [`ExceptionPolicyConfig`](#exceptionpolicyconfig) | the check's policy config. |
| `globalDefault` | [`ExceptionPolicy`](#exceptionpolicy) | the check's fallback policy. |

#### Returns

```ts
{
  missing: readonly string[];
  verdict: "forbidden" | "insufficient" | "permitted" | "unmatched";
}
```

the verdict and the fields still missing.

##### missing

```ts
readonly missing: readonly string[];
```

##### verdict

```ts
readonly verdict: "forbidden" | "insufficient" | "permitted" | "unmatched";
```

***

### exceptionRegistryStandardSchema()

```ts
function exceptionRegistryStandardSchema<TRecord>(schema): StandardSchemaV1<unknown, readonly TRecord[]>;
```

Wraps [validateExceptionRegistry](#validateexceptionregistry) as the Standard Schema `loadExceptionRegistry` takes.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-trecord-8"></a> `TRecord` *extends* \{ `id`: `string`; \} |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `schema` | [`ExceptionRegistrySchema`](#exceptionregistryschema)\<`TRecord`\> | the registry's schema. |

#### Returns

[`StandardSchemaV1`](index/README.md#standardschemav1)\<`unknown`, readonly `TRecord`[]\>

a Standard Schema whose output is the validated records.

***

### hashRequirementFields()

```ts
function hashRequirementFields<TRecord>(
   record, 
   fields, 
   fieldValue
): string;
```

A deterministic digest of some fields' current values on `record`, via `node:crypto`. It is
pure and synchronous, with no ambient state. Socket.dev has no alert on `node:crypto`. It is
neither `child_process` nor `process.env`, the two capabilities `src/helpers/**` must never
touch (see the `AmbientCapabilities` check). The digest makes a verification *content-bound*
rather than merely attested. A consumer records this hash when a human or a mechanical re-check
approves a record's current prose. Recomputing and comparing it later detects staleness with no
separate tracking: edit any field named in `fields` and the hash stops matching. Each field's
name is bound into the digest with its value, as a `JSON.stringify`'d `[name, value]` pair.
JSON escaping keeps the digest unambiguous whatever characters a name or value holds. Two field
sets whose values concatenate to the same plain text cannot collide.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-trecord-9"></a> `TRecord` |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `record` | `TRecord` | The record to hash fields from. |
| `fields` | readonly `string`[] | Which fields (by name, in this order) to include in the digest: the names `evaluateExceptionRecord` passes to `fieldValue`. |
| `fieldValue` | (`record`, `requirement`) => `string` | Resolves one named field's current string value on `record`, like `evaluateExceptionRecord`'s `fieldValue` parameter. |

#### Returns

`string`

A hex-encoded SHA-256 digest of `fields`' current values.

***

### isExpired()

```ts
function isExpired(expires, now?): boolean;
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `expires` | `unknown` | a record's `expires` (`""` never expires), untrusted. |
| `now?` | `Date` | the clock to compare against. |

#### Returns

`boolean`

`true` only for a valid date strictly before `now`'s date.

***

### isLegacyRecord()

```ts
function isLegacyRecord(record): boolean;
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `record` | \{ `version`: `1` \| `2`; \} | a record of either version. |
| `record.version` | `1` \| `2` | `1` or `2`. |

#### Returns

`boolean`

whether it is a legacy `version: 1` record.

***

### isValidNonEmptyStringField()

```ts
function isValidNonEmptyStringField(
   value, 
   at, 
   errors
): value is string;
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `unknown` | a field value. |
| `at` | `string` | its path, for the message. |
| `errors` | `string`[] | collects `"<at> must be a non-empty string."`. |

#### Returns

`value is string`

whether `value` is a non-empty string.

***

### loadAndReconcileExceptionRegistry()

```ts
function loadAndReconcileExceptionRegistry<TFinding, TRecord>(
   registryPath, 
   registryRelativePath, 
   schema, 
   findings, 
   createStub
): Promise<PersistExceptionRegistryResult<TRecord>>;
```

Loads a registry, reconciles findings against it and writes it back.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-tfinding-1"></a> `TFinding` *extends* \{ `id`: `string`; \} |
| <a id="type-parameter-trecord-10"></a> `TRecord` *extends* \{ `id`: `string`; \} |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `registryPath` | `string` | the registry's absolute path. |
| `registryRelativePath` | `string` | its repository-relative path, for rationales. |
| `schema` | [`StandardSchemaV1`](index/README.md#standardschemav1)\<`unknown`, readonly `TRecord`[]\> | validates the file's records. |
| `findings` | readonly `TFinding`[] | this run's findings. |
| `createStub` | (`finding`, `id`) => `TRecord` | builds a blank record for a finding. |

#### Returns

`Promise`\<[`PersistExceptionRegistryResult`](#persistexceptionregistryresult)\<`TRecord`\>\>

the reconciled registry, or the rationale to fail with.

***

### loadExceptionRegistry()

```ts
function loadExceptionRegistry<T>(input): Promise<
  | {
  ok: true;
  records: readonly T[];
}
  | {
  errors: readonly string[];
  ok: false;
}>;
```

Reads and validates one exception registry file from disk: `path -> { "$schema"?: string,
"exceptions": T[] }`, in two independently-validated layers. This function owns only the
envelope. The file exists or is absent (a normal empty-registry state), parses as JSON, and is
an object carrying an `"exceptions"` field. It never inspects what is inside `exceptions`.
`schema` (a `StandardSchemaV1`, hand-written or from a library; see
`src/standard-schema/types.ts`) owns every field-level concern for the caller's record shape.
That is the same "consumer supplies a trusted capability, this package calls it without
owning its internals" relationship `RepoContractConfig.spawn`/`env` already establish (see
`specs/decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md`).

`readFile` defaults to `node:fs/promises`' `readFile`. `src/presets/security-secrets.ts`
already uses it, so this introduces no new filesystem-access surface. A missing file is a normal
"no exceptions recorded yet" state, not an error (`{ ok: true, records: [] }`). That matches
`scripts/suppression-governance/check.ts`'s `loadExistingRegistry` precedent for the same
first-run case. Every other failure returns `{ ok: false, errors }` rather than throwing:
unreadable for another reason, malformed JSON, a missing/malformed envelope, or a schema
validation failure. A bad registry is reported as data for a check's policy to fail on, never an
uncaught exception that crashes the run. The one exception is a throwing or rejecting
`schema.validate()`. That is a bug in the *caller-supplied schema*, not malformed registry data.
It propagates as a rejected `Promise`, as a throwing `output.schema` does in
`src/parsing/parse-output.ts`.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `input` | \{ `isSymlink?`: (`path`) => `Promise`\<`boolean`\>; `path`: `string`; `readFile?`: (`path`) => `Promise`\<`string`\>; `schema`: [`StandardSchemaV1`](index/README.md#standardschemav1)\<`unknown`, readonly `T`[]\>; \} | Where to read the registry from, the schema that validates its `exceptions` array, and (for tests, or a non-`node:fs` environment) an override for how to read `path`. |
| `input.isSymlink?` | (`path`) => `Promise`\<`boolean`\> | Whether `input.path` is a symbolic link. Defaults to `lstat`, with a missing path not a link. A link is refused, never followed: it could lead out of the registry directory. |
| `input.path` | `string` | The registry file's path, passed to `input.readFile` verbatim. |
| `input.readFile?` | (`path`) => `Promise`\<`string`\> | Reads `input.path`'s content. Defaults to `node:fs/promises`' `readFile(path, "utf8")`. |
| `input.schema` | [`StandardSchemaV1`](index/README.md#standardschemav1)\<`unknown`, readonly `T`[]\> | Validates (and may transform) the envelope's `exceptions` array once the envelope checks pass. |

#### Returns

`Promise`\<
  \| \{
  `ok`: `true`;
  `records`: readonly `T`[];
\}
  \| \{
  `errors`: readonly `string`[];
  `ok`: `false`;
\}\>

Every valid record (`ok: true`), or every problem found reading/parsing/validating the file (`ok: false`).

***

### onEvidenceSaveToRepoContractLogs()

```ts
function onEvidenceSaveToRepoContractLogs(options?): (checkId, evidence) => void;
```

**`Beta`**

The `onEvidence` hook that saves each check's raw output to its log. Creating it removes the logs of an
earlier run.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`RepoContractLogsOptions`](#repocontractlogsoptions) | where and how to write. |

#### Returns

the hook to pass as `onEvidence`.

(`checkId`, `evidence`) => `void`

***

### onVerdictPrependRepoContractLogs()

```ts
function onVerdictPrependRepoContractLogs(options?): (checkId, result) => void;
```

**`Beta`**

The `onVerdict` hook that puts each check's verdict at the top of its log. With the default `"failing"` mode, the
log of a check that passed is removed.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`RepoContractLogsOptions`](#repocontractlogsoptions) | where and how to write; the same options as [onEvidenceSaveToRepoContractLogs](#onevidencesavetorepocontractlogs). |

#### Returns

the hook to pass as `onVerdict`.

(`checkId`, `result`) => `void`

***

### readExceptionRegistries()

```ts
function readExceptionRegistries(directory): Promise<{
  errors: readonly ExceptionRegistryError[];
  registries: readonly ExceptionRegistryContents[];
}>;
```

Reads every `*.json` registry in a directory. A file that cannot be read becomes an error row,
never a throw: the check that owns the registry fails on it. A symbolic link is listed as
skipped and never followed, since it could lead out of the directory.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `directory` | `string` | the registry directory, usually [EXCEPTION\_REGISTRY\_DIRECTORY](#exception_registry_directory). |

#### Returns

`Promise`\<\{
  `errors`: readonly [`ExceptionRegistryError`](#exceptionregistryerror)[];
  `registries`: readonly [`ExceptionRegistryContents`](#exceptionregistrycontents)[];
\}\>

the registries in file-name order, and the files that could not be read.

***

### reconcileAndPersistExceptionRegistry()

```ts
function reconcileAndPersistExceptionRegistry<TFinding, TRecord>(
   registryPath, 
   registryRelativePath, 
   existing, 
   findings, 
   createStub
): Promise<PersistExceptionRegistryResult<TRecord>>;
```

Reconciles findings against existing records and writes the registry back: a blank stub for
each new finding, a stale record kept for the policy to fail on.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-tfinding-2"></a> `TFinding` *extends* \{ `id`: `string`; \} |
| <a id="type-parameter-trecord-11"></a> `TRecord` *extends* \{ `id`: `string`; \} |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `registryPath` | `string` | the registry's absolute path. |
| `registryRelativePath` | `string` | its repository-relative path, for rationales. |
| `existing` | readonly `TRecord`[] | the records already loaded. |
| `findings` | readonly `TFinding`[] | this run's findings. |
| `createStub` | (`finding`, `id`) => `TRecord` | builds a blank record for a finding. |

#### Returns

`Promise`\<[`PersistExceptionRegistryResult`](#persistexceptionregistryresult)\<`TRecord`\>\>

the reconciled registry, or the rationale to fail with.

***

### reconcileExceptions()

```ts
function reconcileExceptions<TFinding, TRecord>(input): 
  | {
  ok: true;
  reconciliation: ExceptionReconciliation<TFinding, TRecord>;
}
  | {
  error: string;
  ok: false;
};
```

Reconciles this run's raw findings against the check's already-loaded, already-validated
exception registry. Pure and add-only: it never mutates a matched record and never removes a
stale one.

`deriveId` must be **injective** over `findings`: every independently-governable finding needs
a distinct id, or the mechanism cannot tell which finding a record's `justification` belongs to.
A collision is returned as `{ ok: false }`, naming both finding indices so the check can point a
developer at them. It is a condition a check must surface: the source holds two identical
directives.

`createStub(finding, id)` is handed the canonical id, and its result's `id` is asserted equal to
it. A `createStub` that derives its identity differently gets a `{ ok: false }` bug report, never
a silently-mismatched record.

Precondition: `existing` has already passed the check's registry validator (unique ids, correct
namespace). This function does not re-validate it.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-tfinding-3"></a> `TFinding` |
| <a id="type-parameter-trecord-12"></a> `TRecord` *extends* \{ `id`: `string`; \} |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `input` | \{ `createStub`: (`finding`, `id`) => `TRecord`; `deriveId`: (`finding`) => `string`; `existing`: readonly `TRecord`[]; `findings`: readonly `TFinding`[]; \} | The already-loaded registry, this run's findings, and the check-owned identity + stub callbacks. |
| `input.createStub` | (`finding`, `id`) => `TRecord` | Builds a fresh record for an unmatched finding; receives the canonical id and must return a record carrying it. |
| `input.deriveId` | (`finding`) => `string` | The finding's check-namespaced semantic id. Must be injective over `findings`. |
| `input.existing` | readonly `TRecord`[] | The validated records currently on disk. |
| `input.findings` | readonly `TFinding`[] | Every raw finding this run produced: nothing filtered. |

#### Returns

  \| \{
  `ok`: `true`;
  `reconciliation`: [`ExceptionReconciliation`](#exceptionreconciliation)\<`TFinding`, `TRecord`\>;
\}
  \| \{
  `error`: `string`;
  `ok`: `false`;
\}

The reconciliation, or the first integrity problem found.

***

### recordFieldValue()

```ts
function recordFieldValue(record, requirement): string;
```

The `fieldValue` accessor `evaluateExceptionRecord` takes. A legacy record answers
[LEGACY\_FIELD\_VALUE](#legacy_field_value) for a v2 field.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `record` | `unknown` | a flat record. |
| `requirement` | `string` | the field name. |

#### Returns

`string`

the field's text, or `""`.

***

### renderExceptionInventory()

```ts
function renderExceptionInventory(inventory): string;
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `inventory` | [`ExceptionInventory`](#exceptioninventory) | what [summarizeExceptionRegistries](#summarizeexceptionregistries) returned. |

#### Returns

`string`

one line per registry under a total line, ending in a newline.

***

### repoContractLogs()

```ts
function repoContractLogs(options?): RepoContractLogs;
```

**`Beta`**

The logs for one folder. The same options give the same logs, so a hook created here and another created
elsewhere agree on which files exist.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`RepoContractLogsOptions`](#repocontractlogsoptions) | where and how to write. |

#### Returns

[`RepoContractLogs`](#repocontractlogs)

the log store.

***

### resolveExceptionPolicy()

```ts
function resolveExceptionPolicy(
   classification, 
   config, 
   globalDefault
): ExceptionPolicy;
```

Resolves the policy one `{ group, category }` classification is subject to. This comment is the
single source of truth for the precedence order. The function generalizes
`scripts/suppression-governance/resolve-policy.ts`'s `resolveRequirement`, which it is meant to
replace:

0. **No entry for `group`** (`config[group] === undefined`) resolves to `globalDefault` before
   `category` is inspected. A blanket `category === "*"` against an unconfigured group also
   returns `globalDefault`, never an empty-array reduce.
1. **Blanket category**: `category === "*"` means every category this group could apply to was
   matched at once. It is not one category literally named `"*"`. It resolves to the strictest
   (`stricterOf`) policy across every entry in `group.rules` plus the group's default (or
   `globalDefault`). It skips the glob matcher. `globMatch("*", pattern)` tests the literal
   string `"*"` against `pattern`, so it does not match a pattern like `"security/*"`. As an
   ordinary pattern match, a blanket match would skip a group's `forbidden` rules and land on
   its more lenient default.
2. **Exact match**: `group.rules[category]`, if present. No glob is consulted once an exact entry
   exists for `category`.
3. **Glob match**: the strictest (`stricterOf`) policy among the `group.rules` keys that match
   `category` as a glob (e.g. `"security/*"` matching `"security/detect-object-injection"`).
4. **Group default**: `group.default`, when `group` has an entry in `config` (whether or not
   that entry defines `default`).
5. **Global default**: `globalDefault`, when `group` has no entry in `config`, or when no exact
   match, glob match or `group.default` applies.

Assumes `config` has already passed `validateExceptionPolicyConfig`.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `classification` | [`ExceptionClassification`](#exceptionclassification) | The `{ group, category }` pair to resolve a policy for. |
| `config` | [`ExceptionPolicyConfig`](#exceptionpolicyconfig) | The exception policy configuration to resolve against. |
| `globalDefault` | [`ExceptionPolicy`](#exceptionpolicy) | The policy to fall back to when `classification.group` has no entry in `config` at all. |

#### Returns

[`ExceptionPolicy`](#exceptionpolicy)

The resolved policy for `classification`.

***

### serializeExceptionRegistry()

```ts
function serializeExceptionRegistry(records): string;
```

The canonical on-disk form of one exception registry: `{ "exceptions": [ ... ] }`. Records are
sorted ascending by `id` (code-unit order, locale-independent), with each record's keys in
`canonicalRecord` order. It uses a 2-space indent, `\n` line endings and a trailing newline. The
same records always serialize to identical bytes. A reconcile that changes nothing produces no
diff, and `writeExceptionRegistry` writes nothing.

Assumes `records` have unique ids (the caller reconciled them and validated its registry).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `records` | readonly (`Record`\<`string`, `unknown`\> & \{ `id`: `string`; \})[] | The reconciled records (`activeRecords` plus any `staleRecords`, in any order). |

#### Returns

`string`

The exact file contents to persist.

***

### summarizeExceptionRegistries()

```ts
function summarizeExceptionRegistries(
   registries, 
   now, 
   errors?
): ExceptionInventory;
```

Counts every registry's records by type, legacy, expired and incomplete.

#### Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `registries` | readonly [`ExceptionRegistryContents`](#exceptionregistrycontents)[] | `undefined` | the registries' records. |
| `now` | `Date` | `undefined` | the date `expires` is compared with. |
| `errors?` | readonly [`ExceptionRegistryError`](#exceptionregistryerror)[] | `[]` | files that could not be read, carried into the inventory. |

#### Returns

[`ExceptionInventory`](#exceptioninventory)

the inventory.

***

### validateExceptionPolicyConfig()

```ts
function validateExceptionPolicyConfig(config, validRequirements?): readonly string[];
```

Validates an `ExceptionPolicyConfig`'s shape. Every group's `default` and every entry in its
`rules` must be a well-formed `ExceptionPolicy` (see `validateExceptionPolicyValue`). No group's
`rules` may use the literal `"*"` as a key, because that key is never a blanket policy.
`resolveExceptionPolicy` applies the blanket policy when the *input* `category` is `"*"`. A
`"*"` rules key is consulted only as an ordinary glob, which matches no category containing a
`/`. See `resolveExceptionPolicy`'s doc comment, case 1, for the failure mode this prevents.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `config` | [`ExceptionPolicyConfig`](#exceptionpolicyconfig) | The exception policy configuration to validate. |
| `validRequirements?` | readonly `string`[] | The complete set of field names this consumer's policy may require, if the consumer wants that checked. Omit to skip that check entirely. |

#### Returns

readonly `string`[]

Every configuration problem found; empty if `config` is valid.

***

### validateExceptionRegistry()

```ts
function validateExceptionRegistry<TRecord>(value, schema): 
  | {
  ok: true;
  records: readonly TRecord[];
}
  | {
  errors: readonly string[];
  ok: false;
};
```

Validates an untrusted `exceptions` array: the core, the id namespace, unknown keys, duplicate
ids, the v2 fields of a `version: 2` record, then `schema.validateRecord`. Reports every
problem. A blank field is valid data; completeness is the check's policy.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-trecord-13"></a> `TRecord` *extends* \{ `id`: `string`; \} |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `unknown` | the parsed `exceptions` value. |
| `schema` | [`ExceptionRegistrySchema`](#exceptionregistryschema)\<`TRecord`\> | the registry's schema. |

#### Returns

  \| \{
  `ok`: `true`;
  `records`: readonly `TRecord`[];
\}
  \| \{
  `errors`: readonly `string`[];
  `ok`: `false`;
\}

every rebuilt record, or every problem found.

***

### validateSecurityExceptionFields()

```ts
function validateSecurityExceptionFields(
   raw, 
   index, 
   allowedExceptionTypes, 
   errors
): SecurityExceptionFields | undefined;
```

Validates the four security fields. Each must be a string; `method` and `exceptionType` must be
`""` or a known member. A filled `validated-false-positive` needs `mechanical-reverification`.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `raw` | `Readonly`\<`Record`\<`string`, `unknown`\>\> | the untrusted record. |
| `index` | `number` | its index, for messages. |
| `allowedExceptionTypes` | readonly ( \| `"validated-false-positive"` \| `"accepted-risk"` \| `"compensating-control"` \| `"tooling-limitation"` \| `"scheduled-remediation"` \| `"platform-or-vendor-constraint"` \| `"required-for-package-to-exist"` \| `"dev-only-not-shipped"`)[] | the types this registry accepts. |
| `errors` | `string`[] | collects one message per problem. |

#### Returns

[`SecurityExceptionFields`](#securityexceptionfields) \| `undefined`

the four fields, or `undefined` when one is invalid.

***

### writeExceptionRegistry()

```ts
function writeExceptionRegistry(input): Promise<
  | {
  ok: true;
  written: boolean;
}
  | {
  error: string;
  ok: false;
}>;
```

Writes one exception registry to disk in its canonical form (`serializeExceptionRegistry`),
atomically and idempotently: the sole filesystem-writing primitive in `repo-contract/helpers`.

- **A record that is not an object with a string `id`** -> `{ ok: false }` naming its index.
  Nothing is read or written.
- **Symlinked target** -> `{ ok: false }`: a governance registry is never a symlink, and writing
  through one would escape `.repo-contract/exceptions/`.
- **No file yet** -> written.
- **On-disk bytes already equal the canonical form** -> `{ ok: true, written: false }`, no
  write. A reconcile that changed nothing never dirties the working tree.
- **Different** -> the canonical bytes go to a sibling temp file (`<path>.<uuid>.tmp`), which is
  `rename`d over the target. The target is replaced atomically and never holds partial content.
  A `rename` failure (e.g. a Windows lock on the target) returns `{ ok: false }`. The temp file
  stays in place: it has a uuid name and the run has already failed. `.gitignore` covers
  `.repo-contract/exceptions/*.tmp`.

Path containment is the caller's responsibility: repo-contract's checks always pass
`.repo-contract/exceptions/<name>.json`. `readFile`/`writeFile`/`rename`/`isSymlink` default to
`node:fs/promises` and are overridable for tests or a non-`node:fs` environment, mirroring
`loadExceptionRegistry`'s `readFile` parameter.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `input` | \{ `isSymlink?`: (`path`) => `Promise`\<`boolean`\>; `path`: `string`; `readFile?`: (`path`) => `Promise`\<`string`\>; `records`: readonly (`Record`\<`string`, `unknown`\> & \{ `id`: `string`; \})[]; `rename?`: (`from`, `to`) => `Promise`\<`void`\>; `writeFile?`: (`path`, `data`) => `Promise`\<`void`\>; \} | The target path, the records to persist, and (optional) filesystem-capability overrides. |
| `input.isSymlink?` | (`path`) => `Promise`\<`boolean`\> | Whether `path` is a symlink. Default: `lstat(path).isSymbolicLink()`, treating a missing path as not a symlink. |
| `input.path` | `string` | Where to write. Passed verbatim to every capability. |
| `input.readFile?` | (`path`) => `Promise`\<`string`\> | Reads the current file. Default: `node:fs/promises` `readFile(path, "utf8")`. |
| `input.records` | readonly (`Record`\<`string`, `unknown`\> & \{ `id`: `string`; \})[] | The reconciled records; serialized via `serializeExceptionRegistry`. |
| `input.rename?` | (`from`, `to`) => `Promise`\<`void`\> | Replaces the target with the temp file. Default: `node:fs/promises` `rename`. |
| `input.writeFile?` | (`path`, `data`) => `Promise`\<`void`\> | Writes the temp file. Default: `node:fs/promises` `writeFile(path, data, "utf8")`. |

#### Returns

`Promise`\<
  \| \{
  `ok`: `true`;
  `written`: `boolean`;
\}
  \| \{
  `error`: `string`;
  `ok`: `false`;
\}\>

`{ ok: true, written }` on success, or `{ ok: false, error }` for a symlink, an unreadable target, or a failed write/rename.

## References

### StandardSchemaV1

Re-exports [StandardSchemaV1](index/README.md#standardschemav1)
