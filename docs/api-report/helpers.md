# helpers

A reusable, generic exception-policy primitive -- the mechanism
`scripts/suppression-governance/` already built for `disable-comments.json`
(ADR 0006), extracted so any check can gate a finding on a named,
non-empty-prose exception instead of hand-rolling the same
exact/glob/default precedence and field-completeness logic again. Deciding
nothing and matching nothing: this barrel resolves a `{ group,
category }` classification to a policy and checks a record's own field
values against it -- it never decides what a "finding" is, never matches a
record to one, and never owns a canonical-identity concept. Those stay
entirely check-owned (see `checks/shared/`, unpublished) -- see
specs/decisions/0013-reusable-exception-policy-helper.md for the full
rationale and the boundary this barrel deliberately does not cross.

Published **Experimental** (see `VERSIONING.md`): its TypeScript signature
and runtime behavior may both change in a minor or patch release, the same
classification `repo-contract/presets` already carries (see
specs/decisions/0004-public-surface-stays-narrow-no-cli-experimental-presets.md)
-- neither has been through a real feedback cycle yet.

Never re-exported from the package root (`src/index.ts`) -- this is a
second, independent public barrel, published under its own `./helpers`
subpath, exactly like `src/presets/index.ts`; the two stay independent of
each other and of the root barrel.

## Interfaces

### ExceptionCategoryGroup

**`Beta`**

One classification group's own policy -- `default` is this group's fallback for any `category`
with no exact or glob match in `rules` (see `resolveExceptionPolicy` for the full exact > glob >
group-default > global-default precedence). Omit `default` to fall through to the caller-supplied
`globalDefault` instead. Each key of `rules` is either an exact `category` string or a
glob pattern -- `resolveExceptionPolicy` tries an exact match first and only
consults glob matching once no exact key exists, so a glob can never shadow a more specific
exact entry.

#### Properties

##### default?

```ts
readonly optional default?: ExceptionPolicy;
```

**`Beta`**

This group's fallback policy when `category` matches neither an exact nor a glob key in `rules`. Falls through to the caller's `globalDefault` when omitted.

##### rules?

```ts
readonly optional rules?: Readonly<Record<string, ExceptionPolicy>>;
```

**`Beta`**

Keyed by exact `category` string or glob pattern. A literal `"*"` key is rejected by `validateExceptionPolicyConfig` -- see that function's own doc comment for why.

***

### ExceptionClassification

**`Beta`**

One classification a record is evaluated against -- deliberately just `{ group, category }`,
never `domain`/`rule`/`severity`/`exceptionType` or any other consumer-specific vocabulary. A
consumer maps its own domain concepts onto this shape at the call site (e.g.
`suppression-governance`'s `{ group: record.domain, category: rule }` per suppressed rule;
`security-socket`'s `{ group: "socket", category: normalizedSeverity }`) -- the core itself
never interprets `group`/`category` beyond using them as lookup keys into an
`ExceptionPolicyConfig`.

#### Properties

##### category

```ts
readonly category: string;
```

**`Beta`**

The `rules` key (exact or glob-matched) this classification resolves against within `group`.

##### group

```ts
readonly group: string;
```

**`Beta`**

The top-level key this classification resolves against in an `ExceptionPolicyConfig`.

***

### ExceptionDeterminant

**`Beta`**

One record's resolved policy verdict, and (for `"insufficient"`) which required fields are
still empty. Never published as a batch/matched-vs-unmatched shape -- matching a finding to a
record stays entirely check-owned (each check reconciles its own findings against its own
registry via `reconcileExceptions`).

#### Type Parameters

| Type Parameter |
| ------ |
| `TRecord` |

#### Properties

##### missing

```ts
readonly missing: readonly string[];
```

**`Beta`**

Every required field (by name) still empty on `record`, in the resolved policy's own `requirements` order. Always `[]` for `"forbidden"`/`"permitted"`.

##### record

```ts
readonly record: TRecord;
```

**`Beta`**

The record this determinant was computed for, returned verbatim.

##### verdict

```ts
readonly verdict: ExceptionVerdict;
```

**`Beta`**

`"forbidden"`: never permitted. `"insufficient"`: exception-eligible, but `missing` is non-empty. `"permitted"`: every required field is filled in (or the resolved policy was `"allowed"`).

***

### ExceptionReconciliation

**`Beta`**

The outcome of reconciling one run's findings against one exception registry.

#### Type Parameters

| Type Parameter |
| ------ |
| `TFinding` |
| `TRecord` |

#### Properties

##### activeRecords

```ts
readonly activeRecords: readonly TRecord[];
```

**`Beta`**

Every record to persist as live: matched records verbatim, plus one fresh `createStub` per unmatched finding. Never contains a stale record.

##### matchedPairs

```ts
readonly matchedPairs: readonly {
  finding: TFinding;
  record: TRecord;
}[];
```

**`Beta`**

Each finding paired with the existing record it matched, in `findings` order.

##### newStubIds

```ts
readonly newStubIds: readonly string[];
```

**`Beta`**

The ids of the stubs created this run -- a subset of `activeRecords`' ids.

##### staleRecords

```ts
readonly staleRecords: readonly TRecord[];
```

**`Beta`**

Existing records whose id matched no finding this run -- surfaced for the policy to fail on, **never removed** by this function (retiring one is an explicit human edit).

***

### ExceptionRecordCore

**`Beta`**

The three fields every exception record in `.repo-contract/exceptions/*.json` carries, whatever
the owning check. A registry adds its own typed fields on top; this is the shared core the
generic machinery (`reconcileExceptions`, `serializeExceptionRegistry`,
`validateExceptionRegistry` in the check-owned layer) relies on.

#### Properties

##### id

```ts
readonly id: string;
```

**`Beta`**

The check-namespaced semantic identity of the finding this record waives (e.g. `"suppression:eslint:no-console:src/foo.ts:<module>"`). Equals the finding id; a record whose id matches no current finding is stale. Never derived from prose.

##### justification

```ts
readonly justification: string;
```

**`Beta`**

The one human-authored field: why this guardrail is deliberately bypassed, and what was checked to confirm the finding is real. `""` in a freshly scaffolded stub (the policy, not the validator, rejects a blank/placeholder value).

##### version

```ts
readonly version: number;
```

**`Beta`**

Record-schema version.

***

### ExceptionRecordEvaluation

**`Beta`**

One record to evaluate, paired with everything `evaluateExceptionRecord` needs to judge it --
shared by `evaluateExceptionRecord` and `evaluateExceptionRecords` (whose own `inputs` is just
`readonly ExceptionRecordEvaluation<TRecord>[]`) so the same five-field shape isn't declared
twice.

#### Type Parameters

| Type Parameter |
| ------ |
| `TRecord` |

#### Properties

##### classifications

```ts
readonly classifications: readonly [ExceptionClassification, ExceptionClassification];
```

**`Beta`**

Every classification this record is subject to; the strictest resolved policy across all of them wins.

##### config

```ts
readonly config: ExceptionPolicyConfig;
```

**`Beta`**

The exception policy configuration to resolve `classifications` against.

##### fieldValue

```ts
readonly fieldValue: (record, requirement) => string;
```

**`Beta`**

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

**`Beta`**

The policy to fall back to for any classification whose `group` has no entry in `config` at all.

##### record

```ts
readonly record: TRecord;
```

**`Beta`**

The record to evaluate.

## Type Aliases

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

**`Beta`**

A resolved decision for one `{ group, category }` classification. `"forbidden"`: never
permitted, regardless of any field's content. `"allowed"`: permitted unconditionally -- no
field is required. `"exception"`: permitted only once every field named in `requirements` is a
non-empty (post-`.trim()`) string on the record being evaluated (see `evaluateExceptionRecord`).

Deliberately not a numeric "how many details are required" threshold -- a plain count is
trivially satisfied by generating that many generic-sounding filler entries without doing any of
the underlying work the count was meant to prove happened. Naming exactly which fields must be
filled in makes each one individually reviewable against a specific question instead. This is
the same design `scripts/suppression-governance/policy-config.ts`'s `SuppressionPolicy`
establishes for the disable-comment domain this type generalizes.

***

### ExceptionPolicyConfig

```ts
type ExceptionPolicyConfig = Readonly<Record<string, ExceptionCategoryGroup>>;
```

**`Beta`**

A full exception-policy configuration, keyed by classification `group` (e.g. a tool name, or a
suppression domain). The core never invents the names "domain"/"rule"/"severity"/
"exceptionType" -- those are every consumer's own vocabulary, expressed here purely as
`{ group, category }` (see `ExceptionClassification`).

***

### ExceptionVerdict

```ts
type ExceptionVerdict = "forbidden" | "insufficient" | "permitted";
```

**`Beta`**

A resolved judgment about one record, once its `ExceptionPolicy` has been checked against its
own field values. See `ExceptionDeterminant`.

## Functions

### evaluateExceptionRecord()

```ts
function evaluateExceptionRecord<TRecord>(input): ExceptionDeterminant<TRecord>;
```

**`Beta`**

Evaluates one record against every one of its own classifications, taking the strictest
(`stricterOf`) of each classification's resolved policy -- a record matching both a forbidden
classification and an otherwise-fine one is forbidden overall. `classifications` is a non-empty
tuple by type: zero classifications would be a caller bug (which classification would silently
fall back to `globalDefault`?), never a case this function has to guess about at runtime. A
required field only counts as satisfied once `fieldValue(record, requirement).trim()` is
non-empty -- an empty field is valid *data*, but policy-insufficient, exactly as `"exception"`
mode's name implies. `fieldValue` may resolve a dotted path (e.g. `"verification.verifiedBy"`)
or anything else a consumer's own record shape needs -- this function never interprets
`requirement` itself, it only ever calls `fieldValue(record, requirement)` and trims the result.

#### Type Parameters

| Type Parameter |
| ------ |
| `TRecord` |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `input` | [`ExceptionRecordEvaluation`](#exceptionrecordevaluation)\<`TRecord`\> | The record to evaluate, its classifications, the policy configuration and global default to resolve them against, and the field-value accessor -- see `ExceptionRecordEvaluation`'s own per-field doc comments. |

#### Returns

[`ExceptionDeterminant`](#exceptiondeterminant)\<`TRecord`\>

The record's verdict, and which required fields (if any) are still missing.

***

### evaluateExceptionRecords()

```ts
function evaluateExceptionRecords<TRecord>(inputs): readonly ExceptionDeterminant<TRecord>[];
```

**`Beta`**

A thin batch over already-matched `(record, classifications)` pairs -- exactly
`inputs.map(evaluateExceptionRecord)`, provided so a caller evaluating many records against the
same `config`/`globalDefault`/`fieldValue` doesn't have to write that `.map` itself. Matching a
record to a finding in the first place stays entirely check-owned (each check reconciles its own
findings against its own registry) -- this function takes already-paired inputs, it never does
any matching of its own.

#### Type Parameters

| Type Parameter |
| ------ |
| `TRecord` |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `inputs` | readonly [`ExceptionRecordEvaluation`](#exceptionrecordevaluation)\<`TRecord`\>[] | Each already-matched record to evaluate, in the same shape `evaluateExceptionRecord` itself takes. |

#### Returns

readonly [`ExceptionDeterminant`](#exceptiondeterminant)\<`TRecord`\>[]

Each input's own determinant, in the same order as `inputs`.

***

### hashRequirementFields()

```ts
function hashRequirementFields<TRecord>(
   record, 
   fields, 
   fieldValue
): string;
```

**`Beta`**

A deterministic digest of a set of fields' current values on `record`, via `node:crypto` --
pure, synchronous, no ambient state (Socket.dev has no alert on `node:crypto`; it is not
`child_process`/`process.env`, the two capabilities `src/helpers/**` must never touch -- see
`scripts/verify-no-ambient-capabilities.mjs`). This is what makes a "verification" *content-bound*
rather than merely attested: a consumer records this hash (see `ExceptionVerification` in
`checks/shared/exception-record.ts`) at the moment a human or a mechanical re-check approved a
record's current prose; recomputing it later and comparing is how staleness is detected with no
separate tracking logic -- edit any field named in `fields` and the hash silently stops matching.
Each field's name is bound into the digest alongside its value, both serialized via
`JSON.stringify` as a `[name, value]` pair -- JSON's own escaping makes the digest unambiguous
regardless of what characters a field's name or value contains, so two different field sets
whose values happen to concatenate identically as plain text can never collide here.

#### Type Parameters

| Type Parameter |
| ------ |
| `TRecord` |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `record` | `TRecord` | The record to hash fields from. |
| `fields` | readonly `string`[] | Which fields (by name, in this exact order) to include in the digest -- the same names `fieldValue` would be called with by `evaluateExceptionRecord`. |
| `fieldValue` | (`record`, `requirement`) => `string` | Resolves one named field's current string value on `record`, exactly like `evaluateExceptionRecord`'s own `fieldValue` parameter. |

#### Returns

`string`

A hex-encoded SHA-256 digest of `fields`' current values.

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

**`Beta`**

Reads and validates one exception registry file from disk -- `path -> { "$schema"?: string,
"exceptions": T[] }`, in two independently-validated layers. This function owns only the
envelope: that the file exists (or is absent, a normal empty-registry state), parses as JSON,
and is an object carrying an `"exceptions"` field at all. It never inspects what is inside
`exceptions` beyond that -- `schema` (a `StandardSchemaV1`, hand-written or from a real library;
see `src/standard-schema/types.ts`) owns every field-level concern for the caller's own record
shape, exactly the same "consumer supplies a trusted capability, this package calls it without
owning its internals" relationship `RepoContractConfig.spawn`/`env` already establish (see
`specs/decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md`).

`readFile` defaults to `node:fs/promises`' own `readFile` -- already used by
`src/presets/security-secrets.ts`, so this introduces no new filesystem-access surface; a
missing file is a normal "no exceptions recorded yet" state, not an error (`{ ok: true, records:
[] }`), matching `scripts/suppression-governance/check.ts`'s own `loadExistingRegistry`
precedent for the same first-run case. Every other failure -- unreadable-for-another-reason,
malformed JSON, a missing/malformed envelope, or a schema validation failure -- returns `{ ok:
false, errors }` rather than throwing: a bad registry is reported as data for a check's policy to
fail on, never an uncaught exception that crashes the run. The one exception is `schema`'s own
`validate()` throwing or rejecting -- a bug in the *caller-supplied schema*, not malformed
registry data -- which is deliberately left to propagate as a rejected `Promise`, mirroring
`src/parsing/parse-output.ts`'s identical treatment of a throwing `output.schema`.

#### Type Parameters

| Type Parameter |
| ------ |
| `T` |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `input` | \{ `path`: `string`; `readFile?`: (`path`) => `Promise`\<`string`\>; `schema`: [`StandardSchemaV1`](index/README.md#standardschemav1)\<`unknown`, readonly `T`[]\>; \} | Where to read the registry from, the schema that validates its `exceptions` array, and (for tests, or a non-`node:fs` environment) an override for how to read `path`. |
| `input.path` | `string` | The registry file's path, passed to `input.readFile` verbatim. |
| `input.readFile?` | (`path`) => `Promise`\<`string`\> | Reads `input.path`'s content. Defaults to `node:fs/promises`' own `readFile(path, "utf8")`. |
| `input.schema` | [`StandardSchemaV1`](index/README.md#standardschemav1)\<`unknown`, readonly `T`[]\> | Validates (and may transform) the envelope's `exceptions` array once this function's own envelope checks pass. |

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

**`Beta`**

Reconciles this run's raw findings against the check's already-loaded, already-validated
exception registry. Pure and add-only: it never mutates a matched record and never removes a
stale one.

`deriveId` must be **injective** over `findings` -- every independently-governable finding needs
a distinct id, or the mechanism cannot tell which finding a record's `justification` belongs to.
A collision is returned as `{ ok: false }` (a real condition a check must surface: the source
genuinely holds two identical directives), naming both finding indices so the check can point a
developer at them.

`createStub(finding, id)` is handed the canonical id and its result's `id` is asserted equal to
it -- a `createStub` that derives its own identity differently is a `{ ok: false }` bug report,
never a silently-mismatched record.

Precondition: `existing` has already passed the check's registry validator (unique ids, correct
namespace). This function does not re-validate it.

#### Type Parameters

| Type Parameter |
| ------ |
| `TFinding` |
| `TRecord` *extends* \{ `id`: `string`; \} |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `input` | \{ `createStub`: (`finding`, `id`) => `TRecord`; `deriveId`: (`finding`) => `string`; `existing`: readonly `TRecord`[]; `findings`: readonly `TFinding`[]; \} | The already-loaded registry, this run's findings, and the check-owned identity + stub callbacks. |
| `input.createStub` | (`finding`, `id`) => `TRecord` | Builds a fresh record for an unmatched finding; receives the canonical id and must return a record carrying it. |
| `input.deriveId` | (`finding`) => `string` | The finding's check-namespaced semantic id. Must be injective over `findings`. |
| `input.existing` | readonly `TRecord`[] | The validated records currently on disk. |
| `input.findings` | readonly `TFinding`[] | Every raw finding this run produced -- nothing filtered. |

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

### resolveExceptionPolicy()

```ts
function resolveExceptionPolicy(
   classification, 
   config, 
   globalDefault
): ExceptionPolicy;
```

**`Beta`**

Resolves the policy one `{ group, category }` classification is subject to, in strict precedence
order -- documented here as this function's one authoritative source of truth for that order
(generalized from `scripts/suppression-governance/resolve-policy.ts`'s own `resolveRequirement`,
which this function's future retrofit replaces):

0. **No entry for `group`** -- `config[group] === undefined` -- resolves to `globalDefault`
   immediately, before `category` is even inspected (so a blanket `category === "*"` against an
   unconfigured group still just returns `globalDefault`, never an empty-array reduce).
1. **Blanket category** -- `category === "*"` means every category this group could ever apply
   to was matched at once, not one specific category literally named `"*"`. It resolves as the
   strictest (`stricterOf`) policy across every entry in `group.rules` plus the group's own
   default (or `globalDefault`) -- never via the glob matcher: `globMatch("*", pattern)` tests the
   literal one-character string `"*"` as a path against `pattern`, which does not glob-match a
   pattern like `"security/*"` (that would require the *pattern*, not the *target*, to be `"*"`),
   so treating this case as an ordinary pattern match would silently let a blanket match fall
   through a group's `forbidden` rules into its far more lenient default.
2. **Exact match** -- `group.rules[category]`, if present. A glob is never even consulted once an
   exact entry exists for `category`.
3. **Glob match** -- the strictest (`stricterOf`) policy among every key in `group.rules` that is
   not itself an exact match for `category` but does match it as a glob (e.g.
   `"security/*"` matching `"security/detect-object-injection"`).
4. **Group default** -- `group.default`, if `group` itself has an entry in `config` (whether or
   not that entry defines its own `default`).
5. **Global default** -- `globalDefault`, used only when `group` itself has no entry in `config`
   at all, or when neither an exact/glob match nor a `group.default` applies.

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

**`Beta`**

The canonical on-disk form of one exception registry: `{ "exceptions": [ ... ] }`, records
sorted ascending by `id` (code-unit order, locale-independent), each record's keys in
`canonicalRecord` order, 2-space indent, `\n` line endings, a trailing newline. Fully
deterministic: the same records always serialize byte-for-byte identically, so a reconcile that
changes nothing produces no diff and `writeExceptionRegistry` writes nothing.

Assumes `records` have unique ids (the caller reconciled them and validated its registry).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `records` | readonly `Record`\<`string`, `unknown`\> & \{ `id`: `string`; \}[] | The reconciled records (`activeRecords` plus any `staleRecords`, in any order). |

#### Returns

`string`

The exact file contents to persist.

***

### validateExceptionPolicyConfig()

```ts
function validateExceptionPolicyConfig(config, validRequirements?): readonly string[];
```

**`Beta`**

Validates an entire `ExceptionPolicyConfig`'s shape -- every group's `default` and every entry
in its `rules` must be a well-formed `ExceptionPolicy` (see `validateExceptionPolicyValue`), and
no group's `rules` may use the literal `"*"` as a key. A literal `"*"` key is always a mistake,
never an intentional blanket policy: `resolveExceptionPolicy`'s own blanket-category handling is
triggered by the *input* `category` being `"*"`, not by a `"*"` entry in `rules` -- a `"*"` rules
key would instead be consulted only as an ordinary glob, which matches the literal
one-character string `"*"` as a *target*, not as a wildcard pattern matching every real category
name (`globMatch("*", pattern)` truthiness depends on `pattern`, not the other way around) --
see `resolveExceptionPolicy`'s own doc comment, case 1, for the failure mode this prevents.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `config` | [`ExceptionPolicyConfig`](#exceptionpolicyconfig) | The exception policy configuration to validate. |
| `validRequirements?` | readonly `string`[] | The complete set of field names this consumer's policy may require, if the consumer wants that checked. Omit to skip that check entirely. |

#### Returns

readonly `string`[]

Every configuration problem found; empty if `config` is valid.

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

**`Beta`**

Writes one exception registry to disk in its canonical form (`serializeExceptionRegistry`),
atomically and idempotently -- the sole filesystem-writing primitive in `repo-contract/helpers`.

- **Symlinked target** -> `{ ok: false }`: a governance registry is never a symlink, and writing
  through one would escape `.repo-contract/exceptions/`.
- **No file yet** -> written.
- **On-disk bytes already equal the canonical form** -> `{ ok: true, written: false }`, no
  write. A reconcile that changed nothing therefore never dirties the working tree.
- **Different** -> the canonical bytes are written to a sibling temp file (`<path>.<uuid>.tmp`)
  and `rename`d over the target -- the target is replaced atomically, and partial serialized
  content is never written to the target path. A `rename` failure (e.g. a Windows lock on the
  target) returns `{ ok: false }` deterministically; the temp file is left in place (harmless, a
  uuid name, and the run has already failed) -- `.gitignore` covers `.repo-contract/exceptions/*.tmp`.

Path containment is the caller's responsibility: repo-contract's own checks always pass
`.repo-contract/exceptions/<name>.json`. `readFile`/`writeFile`/`rename`/`isSymlink` default to
`node:fs/promises` and are overridable for tests or a non-`node:fs` environment, mirroring
`loadExceptionRegistry`'s own `readFile` parameter.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `input` | \{ `isSymlink?`: (`path`) => `Promise`\<`boolean`\>; `path`: `string`; `readFile?`: (`path`) => `Promise`\<`string`\>; `records`: readonly `Record`\<`string`, `unknown`\> & \{ `id`: `string`; \}[]; `rename?`: (`from`, `to`) => `Promise`\<`void`\>; `writeFile?`: (`path`, `data`) => `Promise`\<`void`\>; \} | The target path, the records to persist, and (optional) filesystem-capability overrides. |
| `input.isSymlink?` | (`path`) => `Promise`\<`boolean`\> | Whether `path` is a symlink. Default: `lstat(path).isSymbolicLink()`, treating a missing path as not a symlink. |
| `input.path` | `string` | Where to write. Passed verbatim to every capability. |
| `input.readFile?` | (`path`) => `Promise`\<`string`\> | Reads the current file. Default: `node:fs/promises` `readFile(path, "utf8")`. |
| `input.records` | readonly `Record`\<`string`, `unknown`\> & \{ `id`: `string`; \}[] | The reconciled records; serialized via `serializeExceptionRegistry`. |
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
