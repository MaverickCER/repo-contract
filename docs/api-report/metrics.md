# metrics

Run records and what they show: a file-based, append-only log of what each run did, summaries of
speed and trust over it, which of the six pillars the configured checks cover, and a maturity
level computed from those facts. Pure: records come in as data and go out as text, so this
barrel reads no file and runs no process (see
specs/decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md).

A fourth independent public barrel, published under its own `./metrics` subpath; never
re-exported from the package root.

## Interfaces

### CheckRecord

One check's part in a run.

#### Properties

##### cache?

```ts
readonly optional cache?: CacheOutcome;
```

##### durationMs

```ts
readonly durationMs: number;
```

##### id

```ts
readonly id: string;
```

##### pillar?

```ts
readonly optional pillar?: 
  | "correctness"
  | "security"
  | "performance"
  | "accessibility"
  | "compliance"
  | "maintainability";
```

##### shard?

```ts
readonly optional shard?: number;
```

One-based shard the check ran as, when the run was sharded.

##### verdict

```ts
readonly verdict: Verdict;
```

***

### EvidenceManifest

A signed-by-digest statement that a package version passed the full contract.

#### Extends

- `ManifestFacts`

#### Properties

##### cache

```ts
readonly cache: "bypassed";
```

Always `"bypassed"`: nothing was replayed from the cache.

###### Inherited from

```ts
ManifestFacts.cache
```

##### checks

```ts
readonly checks: readonly {
  evidenceSha256: string;
  id: string;
  verdict: Verdict;
}[];
```

##### createdAt

```ts
readonly createdAt: string;
```

ISO 8601 time the manifest was made.

###### Inherited from

```ts
ManifestFacts.createdAt
```

##### inputHash

```ts
readonly inputHash: string;
```

A digest of the inputs the run was computed from.

###### Inherited from

```ts
ManifestFacts.inputHash
```

##### package

```ts
readonly package: {
  name: string;
  version: string;
};
```

###### name

```ts
readonly name: string;
```

###### version

```ts
readonly version: string;
```

###### Inherited from

```ts
ManifestFacts.package
```

##### schemaVersion

```ts
readonly schemaVersion: 1;
```

##### scope

```ts
readonly scope: "full";
```

Always `"full"`: a manifest vouches only for a run that checked everything.

###### Inherited from

```ts
ManifestFacts.scope
```

##### sha256

```ts
readonly sha256: string;
```

A digest of every other field, so an edit to any of them is detectable.

##### tools

```ts
readonly tools: Readonly<Record<string, string>>;
```

Each tool's version.

###### Inherited from

```ts
ManifestFacts.tools
```

***

### ManifestInput

What a release's full run is built from.

#### Extends

- `ManifestFacts`

#### Properties

##### cache

```ts
readonly cache: "bypassed";
```

Always `"bypassed"`: nothing was replayed from the cache.

###### Inherited from

```ts
ManifestFacts.cache
```

##### checks

```ts
readonly checks: readonly {
  evidence: unknown;
  id: string;
  verdict: Verdict;
}[];
```

##### createdAt

```ts
readonly createdAt: string;
```

ISO 8601 time the manifest was made.

###### Inherited from

```ts
ManifestFacts.createdAt
```

##### inputHash

```ts
readonly inputHash: string;
```

A digest of the inputs the run was computed from.

###### Inherited from

```ts
ManifestFacts.inputHash
```

##### package

```ts
readonly package: {
  name: string;
  version: string;
};
```

###### name

```ts
readonly name: string;
```

###### version

```ts
readonly version: string;
```

###### Inherited from

```ts
ManifestFacts.package
```

##### scope

```ts
readonly scope: "full";
```

Always `"full"`: a manifest vouches only for a run that checked everything.

###### Inherited from

```ts
ManifestFacts.scope
```

##### tools

```ts
readonly tools: Readonly<Record<string, string>>;
```

Each tool's version.

###### Inherited from

```ts
ManifestFacts.tools
```

***

### ManifestVerification

What checking a manifest found.

#### Properties

##### ok

```ts
readonly ok: boolean;
```

##### problems

```ts
readonly problems: readonly string[];
```

***

### MaturityInput

Facts a maturity level is computed from.

#### Properties

##### canaryClean?

```ts
readonly optional canaryClean?: boolean;
```

Whether the soundness canary has found no escapes; `undefined` if it has not run.

##### exceptions

```ts
readonly exceptions: {
  budget: number;
  count: number;
};
```

###### budget

```ts
readonly budget: number;
```

###### count

```ts
readonly count: number;
```

##### hasRuns

```ts
readonly hasRuns: boolean;
```

Whether any run has been recorded.

##### lastFullRunPassed?

```ts
readonly optional lastFullRunPassed?: boolean;
```

Whether the most recent full-scope run passed; `undefined` if there has been none.

##### manifestPresent

```ts
readonly manifestPresent: boolean;
```

##### pillars

```ts
readonly pillars: Readonly<Record<Pillar, number>>;
```

How many enabled checks cover each pillar.

##### zeroTolerance

```ts
readonly zeroTolerance: boolean;
```

Whether the zero-tolerance policies (mutation, suppressions) are on.

***

### MaturityResult

A maturity level, 0 to 4, and what the next one needs.

#### Properties

##### level

```ts
readonly level: 0 | 1 | 2 | 3 | 4;
```

##### next?

```ts
readonly optional next?: {
  level: 1 | 2 | 3 | 4;
  missing: readonly string[];
};
```

Absent at level 4.

###### level

```ts
readonly level: 1 | 2 | 3 | 4;
```

###### missing

```ts
readonly missing: readonly string[];
```

***

### PillarCoverage

The pillars a set of checks covers.

#### Properties

##### counts

```ts
readonly counts: Readonly<Record<Pillar, number>>;
```

##### missing

```ts
readonly missing: readonly (
  | "correctness"
  | "security"
  | "performance"
  | "accessibility"
  | "compliance"
  | "maintainability")[];
```

Pillars no check covers, in the canonical order.

##### unclassified

```ts
readonly unclassified: readonly string[];
```

Checks that declare no pillar.

***

### RunLogError

What went wrong reading one line of a run log.

#### Properties

##### line

```ts
readonly line: number;
```

##### message

```ts
readonly message: string;
```

***

### RunRecord

One line of the run log.

#### Extends

- [`RunRecordInput`](#runrecordinput)

#### Properties

##### actor?

```ts
readonly optional actor?: "human" | "agent";
```

Who produced the change: set by the caller from its own configuration, never inferred.

###### Inherited from

[`RunRecordInput`](#runrecordinput).[`actor`](#actor-1)

##### affectedTests?

```ts
readonly optional affectedTests?: number;
```

###### Inherited from

[`RunRecordInput`](#runrecordinput).[`affectedTests`](#affectedtests-1)

##### base?

```ts
readonly optional base?: string;
```

###### Inherited from

[`RunRecordInput`](#runrecordinput).[`base`](#base-1)

##### change?

```ts
readonly optional change?: string;
```

Groups the runs of one change (a pull request, a branch) so a first pass can be told.

###### Inherited from

[`RunRecordInput`](#runrecordinput).[`change`](#change-1)

##### changedFiles?

```ts
readonly optional changedFiles?: number;
```

###### Inherited from

[`RunRecordInput`](#runrecordinput).[`changedFiles`](#changedfiles-1)

##### checks

```ts
readonly checks: readonly CheckRecord[];
```

###### Inherited from

[`RunRecordInput`](#runrecordinput).[`checks`](#checks-3)

##### coverage?

```ts
readonly optional coverage?: number;
```

###### Inherited from

[`RunRecordInput`](#runrecordinput).[`coverage`](#coverage-1)

##### durationMs

```ts
readonly durationMs: number;
```

###### Inherited from

[`RunRecordInput`](#runrecordinput).[`durationMs`](#durationms-2)

##### exceptions?

```ts
readonly optional exceptions?: number;
```

###### Inherited from

[`RunRecordInput`](#runrecordinput).[`exceptions`](#exceptions-2)

##### mutationScore?

```ts
readonly optional mutationScore?: number;
```

###### Inherited from

[`RunRecordInput`](#runrecordinput).[`mutationScore`](#mutationscore-1)

##### schemaVersion

```ts
readonly schemaVersion: 1;
```

##### scope

```ts
readonly scope: "full" | "affected";
```

###### Inherited from

[`RunRecordInput`](#runrecordinput).[`scope`](#scope-3)

##### startedAt

```ts
readonly startedAt: string;
```

ISO 8601 start time.

###### Inherited from

[`RunRecordInput`](#runrecordinput).[`startedAt`](#startedat-1)

##### suppressions?

```ts
readonly optional suppressions?: number;
```

###### Inherited from

[`RunRecordInput`](#runrecordinput).[`suppressions`](#suppressions-1)

##### totalTests?

```ts
readonly optional totalTests?: number;
```

###### Inherited from

[`RunRecordInput`](#runrecordinput).[`totalTests`](#totaltests-1)

##### widenings?

```ts
readonly optional widenings?: readonly string[];
```

The reasons the affected analysis widened.

###### Inherited from

[`RunRecordInput`](#runrecordinput).[`widenings`](#widenings-1)

***

### RunRecordInput

The fields of a run record before they are validated.

#### Extended by

- [`RunRecord`](#runrecord)

#### Properties

##### actor?

```ts
readonly optional actor?: "human" | "agent";
```

Who produced the change: set by the caller from its own configuration, never inferred.

##### affectedTests?

```ts
readonly optional affectedTests?: number;
```

##### base?

```ts
readonly optional base?: string;
```

##### change?

```ts
readonly optional change?: string;
```

Groups the runs of one change (a pull request, a branch) so a first pass can be told.

##### changedFiles?

```ts
readonly optional changedFiles?: number;
```

##### checks

```ts
readonly checks: readonly CheckRecord[];
```

##### coverage?

```ts
readonly optional coverage?: number;
```

##### durationMs

```ts
readonly durationMs: number;
```

##### exceptions?

```ts
readonly optional exceptions?: number;
```

##### mutationScore?

```ts
readonly optional mutationScore?: number;
```

##### scope

```ts
readonly scope: "full" | "affected";
```

##### startedAt

```ts
readonly startedAt: string;
```

ISO 8601 start time.

##### suppressions?

```ts
readonly optional suppressions?: number;
```

##### totalTests?

```ts
readonly optional totalTests?: number;
```

##### widenings?

```ts
readonly optional widenings?: readonly string[];
```

The reasons the affected analysis widened.

***

### RunSummary

What a set of runs shows about speed and trust. Ratios are absent when nothing supports them.

#### Properties

##### affectedRatio?

```ts
readonly optional affectedRatio?: number;
```

Affected tests as a share of all tests, over affected-scope runs that recorded both.

##### cacheHitRatio?

```ts
readonly optional cacheHitRatio?: number;
```

Of the checks that consulted the cache, the share it answered.

##### failed

```ts
readonly failed: number;
```

##### failuresByCheck

```ts
readonly failuresByCheck: Readonly<Record<string, number>>;
```

##### failuresByPillar

```ts
readonly failuresByPillar: Readonly<Record<string, number>>;
```

##### firstPassRate?

```ts
readonly optional firstPassRate?: number;
```

The share of changes whose earliest recorded run passed.

##### latestExceptions?

```ts
readonly optional latestExceptions?: number;
```

##### latestSuppressions?

```ts
readonly optional latestSuppressions?: number;
```

##### minutesSaved?

```ts
readonly optional minutesSaved?: number;
```

Estimated minutes affected runs saved against the mean full run.

##### mutationScore?

```ts
readonly optional mutationScore?: {
  delta: number;
  first: number;
  latest: number;
};
```

###### delta

```ts
readonly delta: number;
```

###### first

```ts
readonly first: number;
```

###### latest

```ts
readonly latest: number;
```

##### passed

```ts
readonly passed: number;
```

##### passRate?

```ts
readonly optional passRate?: number;
```

##### runs

```ts
readonly runs: number;
```

##### totalDurationMs

```ts
readonly totalDurationMs: number;
```

##### wideningsByReason

```ts
readonly wideningsByReason: Readonly<Record<string, number>>;
```

***

### SummaryFilter

Which runs to count.

#### Properties

##### actor?

```ts
readonly optional actor?: "human" | "agent";
```

##### since?

```ts
readonly optional since?: string;
```

Only runs started at or after this ISO 8601 time.

## Type Aliases

### CacheOutcome

```ts
type CacheOutcome = "hit" | "miss" | "off";
```

***

### Pillar

```ts
type Pillar = typeof PILLARS[number];
```

***

### Verdict

```ts
type Verdict = "pass" | "warn" | "fail";
```

## Variables

### PILLARS

```ts
const PILLARS: readonly ["correctness", "security", "performance", "accessibility", "compliance", "maintainability"];
```

What a check protects, so a report can show which of them a repository covers.

## Functions

### buildEvidenceManifest()

```ts
function buildEvidenceManifest(input): EvidenceManifest;
```

Records that a release passed the full contract: every check's verdict with a hash of its
evidence, the inputs and tool versions, and a digest over all of it.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `input` | [`ManifestInput`](#manifestinput) | The run's facts. |

#### Returns

[`EvidenceManifest`](#evidencemanifest)

The manifest.

#### Throws

If the run was not a full, cache-bypassing one, or a check id repeats.

***

### createRunRecord()

```ts
function createRunRecord(input): RunRecord;
```

Validates a run and stamps it with the schema version. Unknown fields are dropped, so a log only
ever holds what this version understands.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `input` | [`RunRecordInput`](#runrecordinput) | The run's fields. |

#### Returns

[`RunRecord`](#runrecord)

The record.

#### Throws

If a field is missing or out of range.

***

### maturityLevel()

```ts
function maturityLevel(input): MaturityResult;
```

Computes a maturity level deterministically from recorded facts: 1 once there are runs and
correctness is covered; 2 with the security and maintainability pillars and a passing full run;
3 with every pillar, exceptions within budget and zero-tolerance policies; 4 with a clean
soundness canary and an evidence manifest.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `input` | [`MaturityInput`](#maturityinput) | The facts to judge. |

#### Returns

[`MaturityResult`](#maturityresult)

The level, and what the next one needs.

***

### parseRunLog()

```ts
function parseRunLog(text): {
  errors: readonly RunLogError[];
  records: readonly RunRecord[];
};
```

Reads a run log. A line that cannot be read is reported with its number and skipped, so one bad
line never hides the rest.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `text` | `string` | The log's content, one JSON record per line. |

#### Returns

```ts
{
  errors: readonly RunLogError[];
  records: readonly RunRecord[];
}
```

The records, and what was wrong with the lines that were skipped.

##### errors

```ts
readonly errors: readonly RunLogError[];
```

##### records

```ts
readonly records: readonly RunRecord[];
```

***

### pillarCoverage()

```ts
function pillarCoverage(checks): PillarCoverage;
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `checks` | readonly \{ `id`: `string`; `pillar?`: \| `"correctness"` \| `"security"` \| `"performance"` \| `"accessibility"` \| `"compliance"` \| `"maintainability"`; \}[] | The configured checks and the pillar each declares, if any. |

#### Returns

[`PillarCoverage`](#pillarcoverage)

Per pillar, how many checks cover it; which pillars nothing covers; which checks declare none.

***

### serializeRunRecord()

```ts
function serializeRunRecord(record): string;
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `record` | [`RunRecord`](#runrecord) | A run record. |

#### Returns

`string`

The record as one JSON line, newline included, ready to append to the log.

***

### summarizeRuns()

```ts
function summarizeRuns(records, filter?): RunSummary;
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `records` | readonly [`RunRecord`](#runrecord)[] | Run records, in any order. |
| `filter?` | [`SummaryFilter`](#summaryfilter) | Which runs to count. |

#### Returns

[`RunSummary`](#runsummary)

The summary.

***

### verifyEvidenceManifest()

```ts
function verifyEvidenceManifest(value, evidence?): ManifestVerification;
```

Checks a manifest: its digest still matches its content, it describes a full cache-bypassing
run, and no check failed. Given the evidence of some checks, also that each still hashes to
what the manifest recorded.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `unknown` | The manifest, as parsed JSON. |
| `evidence?` | `Readonly`\<`Record`\<`string`, `unknown`\>\> | Optionally, the evidence of some checks by id, to check against their hashes. |

#### Returns

[`ManifestVerification`](#manifestverification)

Whether it holds, and every problem found.
