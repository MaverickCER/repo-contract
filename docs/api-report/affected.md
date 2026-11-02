# affected

Affected-scope analysis: given a diff, which tests (and mutation targets) can the change
affect? Symbol-level -- changed files are diffed against their base to find the exports whose
behavior may differ, and those are followed through the import graph -- with every case the
analysis cannot reason about widening the answer toward a full run, never narrowing it on a
guess. Pure: file contents, the diff and the TypeScript compiler API come in as data and
capabilities, so this barrel reads no file and runs no process (see
specs/decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md).

A third independent public barrel, published under its own `./affected` subpath, like
`src/presets/index.ts` and `src/helpers/index.ts`; never re-exported from the package root.

## Interfaces

### AffectedOptions

Optional tuning. Every default is the conservative choice.

#### Properties

##### ignore?

```ts
readonly optional ignore?: readonly string[];
```

Globs of non-module files that can never influence a test (default: changesets, changelog, license, codeowners).

##### links?

```ts
readonly optional links?: readonly LinkRule[];
```

Couplings the import graph cannot see: when a changed file matches `when`, every test matching
one of `run` is affected. For fixtures, golden files, or anything a test reads without importing.

##### notMutated?

```ts
readonly optional notMutated?: readonly string[];
```

Globs of files that are never mutation targets (default: tests, test support and declaration files).

##### tests?

```ts
readonly optional tests?: readonly string[];
```

Globs of test entry files (default: `*.test.*` and `*.spec.*`).

##### triggers?

```ts
readonly optional triggers?: readonly string[];
```

Globs of files whose change makes everything affected (default: package manifests, lockfiles, tool configs, CI).

***

### AffectedResult

#### Properties

##### affectedSources

```ts
readonly affectedSources: readonly string[];
```

Non-test modules that depend on a changed symbol (plus the changed modules themselves).

##### affectedTests

```ts
readonly affectedTests: readonly string[];
```

Test entry files to run.

##### causes

```ts
readonly causes: ReadonlyMap<string, string>;
```

Internal provenance for [explainAffected](#explainaffected).

##### changedFiles

```ts
readonly changedFiles: readonly string[];
```

##### changedSymbols

```ts
readonly changedSymbols: readonly string[];
```

`file#export` for every export whose behavior may differ from the base.

##### fullBecause?

```ts
readonly optional fullBecause?: Widening;
```

Present when `scope` is `"full"`: the first reason the narrow path was abandoned.

##### mutateTargets

```ts
readonly mutateTargets: readonly string[];
```

Source files whose mutants are worth re-evaluating: changed sources and their direct symbol dependents.

##### scope

```ts
readonly scope: AffectedScope;
```

##### widened

```ts
readonly widened: readonly Widening[];
```

***

### ArtifactInput

A file to keep: a safe relative path and its content.

#### Properties

##### content

```ts
readonly content: Uint8Array;
```

##### path

```ts
readonly path: string;
```

***

### Cache

A content-addressed computation cache over a `CacheStore`.

#### Properties

##### mode

```ts
readonly mode: CacheMode;
```

#### Methods

##### clear()

```ts
clear(): Promise<number>;
```

Removes every entry; resolves to how many.

###### Returns

`Promise`\<`number`\>

##### lookup()

```ts
lookup<TValue>(check, key): Promise<CacheLookup<TValue>>;
```

Finds the entry for a key; anything unreadable or inconsistent is a miss, never a replay.

###### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-tvalue"></a> `TValue` | `unknown` |

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `check` | `string` |
| `key` | `string` |

###### Returns

`Promise`\<[`CacheLookup`](#cachelookup-1)\<`TValue`\>\>

##### prune()

```ts
prune(limits): Promise<number>;
```

Removes entries beyond the limits, and every unreadable one; resolves to how many.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `limits` | [`PruneLimits`](#prunelimits) |

###### Returns

`Promise`\<`number`\>

##### stats()

```ts
stats(): Promise<CacheStats>;
```

Counts what is stored.

###### Returns

`Promise`\<[`CacheStats`](#cachestats-1)\>

##### store()

```ts
store(input): Promise<boolean>;
```

Stores a result; resolves to whether it was written (never in `off` or `read-only`).

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `input` | [`CacheStoreInput`](#cachestoreinput) |

###### Returns

`Promise`\<`boolean`\>

##### why()

```ts
why(check, inputs): Promise<MissExplanation>;
```

Compares inputs with the check's latest entry, to explain a miss.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `check` | `string` |
| `inputs` | `Readonly`\<`Record`\<`string`, `string`\>\> |

###### Returns

`Promise`\<[`MissExplanation`](#missexplanation)\>

***

### CacheEntry

What a check's result was computed from and what it was.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-tvalue-1"></a> `TValue` | `unknown` |

#### Properties

##### check

```ts
readonly check: string;
```

##### createdAt

```ts
readonly createdAt: string;
```

##### durationMs

```ts
readonly durationMs: number;
```

##### formatVersion

```ts
readonly formatVersion: 1;
```

##### inputs

```ts
readonly inputs: Readonly<Record<string, string>>;
```

Every input's name and a digest of its content, so a miss can say what changed.

##### key

```ts
readonly key: string;
```

##### value

```ts
readonly value: TValue;
```

***

### CacheStats

What is in the cache.

#### Properties

##### bytes

```ts
readonly bytes: number;
```

##### checks

```ts
readonly checks: Readonly<Record<string, number>>;
```

##### corrupt

```ts
readonly corrupt: number;
```

##### entries

```ts
readonly entries: number;
```

***

### CacheStore

Where entries live. Paths are relative and slash-separated (`index/<check>/<key>.json`); the
implementation decides what they map to (a directory, a memory map). It never sees an unsafe
path: the cache validates check ids and keys before building one.

#### Methods

##### list()

```ts
list(prefix): Promise<readonly string[]>;
```

Every path that starts with the prefix.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `prefix` | `string` |

###### Returns

`Promise`\<readonly `string`[]\>

##### read()

```ts
read(path): Promise<string | undefined>;
```

The content at a path, or `undefined` if there is none.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `path` | `string` |

###### Returns

`Promise`\<`string` \| `undefined`\>

##### remove()

```ts
remove(path): Promise<void>;
```

Removes a path; absent is not an error.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `path` | `string` |

###### Returns

`Promise`\<`void`\>

##### write()

```ts
write(path, content): Promise<void>;
```

Writes a path, replacing any content, so that a reader never sees a partial write.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `path` | `string` |
| `content` | `string` |

###### Returns

`Promise`\<`void`\>

***

### CacheStoreInput

What to store for a computed result.

#### Properties

##### check

```ts
readonly check: string;
```

##### durationMs

```ts
readonly durationMs: number;
```

##### inputs

```ts
readonly inputs: Readonly<Record<string, string>>;
```

##### key

```ts
readonly key: string;
```

##### value

```ts
readonly value: unknown;
```

The result to replay; it must survive `JSON.stringify`.

***

### CanaryInput

What the canary compares: the affected-scope answer against a full run's failures.

#### Properties

##### affectedTests

```ts
readonly affectedTests: readonly string[];
```

The tests the affected analysis said to run.

##### allTests

```ts
readonly allTests: readonly string[];
```

Every test the full run executed.

##### failedInFullRun

```ts
readonly failedInFullRun: readonly string[];
```

The tests that failed in the full run.

***

### CanaryResult

The canary's finding.

#### Properties

##### checked

```ts
readonly checked: number;
```

How many tests the full run covered.

##### clean

```ts
readonly clean: boolean;
```

True when the affected scope would have caught every failure the full run found.

##### escapes

```ts
readonly escapes: readonly string[];
```

Tests that failed in the full run although the affected scope left them out, sorted.

***

### ChangedFile

One changed path, as reported by the caller (typically from `git diff --name-status -M`).

#### Properties

##### kind

```ts
readonly kind: ChangeKind;
```

##### path

```ts
readonly path: string;
```

Repo-relative, forward-slash path.

##### renamedFrom?

```ts
readonly optional renamedFrom?: string;
```

For `renamed`: the path the file had at the base.

***

### ComputeAffectedFromGitInput

#### Properties

##### base?

```ts
readonly optional base?: string;
```

The ref to compare against. Defaults to the upstream branch, then `origin/main`, then `origin/master`.

##### capabilities

```ts
readonly capabilities: GitCapabilities;
```

##### compilerOptions?

```ts
readonly optional compilerOptions?: CompilerOptions;
```

Compiler options for module resolution. When absent they are read from the tsconfig.

##### options?

```ts
readonly optional options?: AffectedOptions;
```

##### ts

```ts
readonly ts: typeof ts;
```

##### tsconfig?

```ts
readonly optional tsconfig?: string;
```

The tsconfig to read the options from (default `tsconfig.json`, which may be absent).

***

### ComputeAffectedInput

The inputs of [computeAffected](#computeaffected). Everything is data: this layer reads no file and runs no process.

#### Properties

##### baseFiles

```ts
readonly baseFiles: ReadonlyMap<string, string>;
```

Base contents of every changed module path that existed at the base (modified, deleted and renamed-from paths).

##### changed

```ts
readonly changed: readonly ChangedFile[];
```

Every changed path, module or not.

##### compilerOptions?

```ts
readonly optional compilerOptions?: CompilerOptions;
```

`compilerOptions` for module resolution (`paths`, `baseUrl`, ...). Defaults to bundler resolution.

##### files

```ts
readonly files: ReadonlyMap<string, string>;
```

Current contents of every JS/TS module in the project (sources and tests), keyed by repo-relative path.

##### fullBecause?

```ts
readonly optional fullBecause?: Widening;
```

When set, the analysis is skipped and everything is reported affected for this reason.

##### options?

```ts
readonly optional options?: AffectedOptions;
```

##### ts

```ts
readonly ts: typeof ts;
```

***

### DoctorFinding

One thing worth changing, and how.

#### Properties

##### fix?

```ts
readonly optional fix?: DoctorFix;
```

Present only when the repair is safe to apply without a human deciding anything.

##### hint

```ts
readonly hint: string;
```

##### id

```ts
readonly id: string;
```

##### message

```ts
readonly message: string;
```

##### severity

```ts
readonly severity: FindingSeverity;
```

***

### DoctorFix

A mechanical change a finding can be repaired with: text appended to a file.

#### Properties

##### append

```ts
readonly append: string;
```

##### file

```ts
readonly file: string;
```

***

### DoctorReport

#### Properties

##### clean

```ts
readonly clean: boolean;
```

True when there is nothing to report.

##### findings

```ts
readonly findings: readonly DoctorFinding[];
```

***

### DoctorSnapshot

Facts about a repository, gathered by the caller; `diagnose` reads no file itself.

#### Properties

##### gitignore?

```ts
readonly optional gitignore?: string;
```

The root `.gitignore`'s content, or `undefined` if there is none.

##### hooksInstalled

```ts
readonly hooksInstalled: boolean;
```

Whether the git hooks that run the contract are installed.

##### starExportFiles

```ts
readonly starExportFiles: readonly string[];
```

Source files that re-export with `export *`.

##### vitestConfigs

```ts
readonly vitestConfigs: readonly {
  path: string;
  text: string;
}[];
```

Every vitest config file found, with its content.

##### workflows

```ts
readonly workflows: readonly {
  path: string;
  text: string;
}[];
```

Every GitHub Actions workflow file, with its content.

***

### GitCapabilities

The two things the collector needs from the machine, supplied by the caller.

#### Methods

##### git()

```ts
git(args): Promise<string | undefined>;
```

Runs `git <args>` in the repository; resolves to stdout, or `undefined` if git exits non-zero.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `args` | readonly `string`[] |

###### Returns

`Promise`\<`string` \| `undefined`\>

##### readFile()

```ts
readFile(path): Promise<string | undefined>;
```

Reads a repo-relative file from the working tree; resolves to `undefined` if it cannot be read.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `path` | `string` |

###### Returns

`Promise`\<`string` \| `undefined`\>

***

### LinkRule

#### Properties

##### run

```ts
readonly run: readonly string[];
```

##### when

```ts
readonly when: string;
```

***

### LoadCompilerOptionsInput

#### Properties

##### file?

```ts
readonly optional file?: string;
```

The config to read. Defaults to `tsconfig.json`, which may be absent; a named one may not.

##### readFile

```ts
readonly readFile: (path) => Promise<string | undefined>;
```

Reads a repo-relative file; resolves to `undefined` if it cannot be read.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `path` | `string` |

###### Returns

`Promise`\<`string` \| `undefined`\>

##### ts

```ts
readonly ts: typeof ts;
```

***

### PackedArtifact

A packed file: content as base64, with the checksum it must still have when unpacked.

#### Properties

##### data

```ts
readonly data: string;
```

##### path

```ts
readonly path: string;
```

##### sha256

```ts
readonly sha256: string;
```

***

### PackedArtifacts

A set of files that survives `JSON.stringify`, so it can be a cache value.

#### Properties

##### files

```ts
readonly files: readonly PackedArtifact[];
```

##### format

```ts
readonly format: 1;
```

***

### PlannedChange

One file a set of fixes would change.

#### Properties

##### after

```ts
readonly after: string;
```

##### before

```ts
readonly before: string | undefined;
```

##### file

```ts
readonly file: string;
```

***

### PruneLimits

The limits `prune` enforces; an absent limit is not enforced.

#### Properties

##### maxAgeMs?

```ts
readonly optional maxAgeMs?: number;
```

Entries older than this are removed.

##### maxEntries?

```ts
readonly optional maxEntries?: number;
```

Only this many of the newest entries are kept.

***

### ResolveScopeInput

What `resolveScope` decides from.

#### Properties

##### env

```ts
readonly env: Readonly<Record<string, string | undefined>>;
```

The environment, passed in rather than read (`process.env` works as is).

##### requested?

```ts
readonly optional requested?: RequestedScope;
```

What the caller asked for; `"auto"` or absent leaves it to the environment.

***

### ScopeDecision

The scope a run uses and the reason, for the run's own output.

#### Properties

##### reason

```ts
readonly reason: string;
```

##### scope

```ts
readonly scope: RunScope;
```

##### source

```ts
readonly source: ScopeSource;
```

***

### ShardMatrix

A GitHub Actions matrix with one entry per shard.

#### Properties

##### include

```ts
readonly include: readonly {
  shard: number;
  spec: string;
  total: number;
}[];
```

***

### ShardPlan

How targets are split across shards.

#### Properties

##### count

```ts
readonly count: number;
```

The number of shards (at least 1).

##### shards

```ts
readonly shards: readonly (readonly string[])[];
```

The targets of each shard, sorted; `shards[0]` is shard 1.

##### weightsMs

```ts
readonly weightsMs: readonly number[];
```

The summed expected cost of each shard, in milliseconds.

***

### ShardPlanInput

The inputs of [planShards](#planshards).

#### Properties

##### max?

```ts
readonly optional max?: number;
```

The most shards `targetMinutes` may ask for.

##### shards?

```ts
readonly optional shards?: number;
```

A fixed shard count. Wins over `targetMinutes`.

##### targetMinutes?

```ts
readonly optional targetMinutes?: number;
```

Size the count so that no shard is expected to take much longer than this many minutes.

##### targets

```ts
readonly targets: readonly string[];
```

The files to split, in any order.

##### timingsMs?

```ts
readonly optional timingsMs?: Readonly<Record<string, number>>;
```

Recorded cost per file in milliseconds; files without one weigh the mean of those with one.

***

### ShardReport

One shard's mutation report, as parsed JSON.

#### Properties

##### report

```ts
readonly report: unknown;
```

##### shard

```ts
readonly shard: number;
```

One-based shard number.

***

### Widening

Why a run left the narrow path.

#### Properties

##### detail?

```ts
readonly optional detail?: string;
```

##### file

```ts
readonly file: string;
```

The file (or glob) that caused it.

##### reason

```ts
readonly reason: WideningReason;
```

##### to

```ts
readonly to: "full" | "all-exports" | "always-run";
```

What got wider: `"full"` for the whole project, otherwise what the file now drags in.

## Type Aliases

### AffectedScope

```ts
type AffectedScope = "affected" | "full";
```

***

### CacheLookup

```ts
type CacheLookup<TValue> = 
  | {
  entry: CacheEntry<TValue>;
  hit: true;
}
  | {
  hit: false;
  reason: "miss" | "corrupt" | "disabled";
};
```

The result of looking an entry up.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-tvalue-2"></a> `TValue` | `unknown` |

***

### CacheMode

```ts
type CacheMode = "read-write" | "read-only" | "off";
```

Whether the cache is consulted and written.

***

### ChangeKind

```ts
type ChangeKind = "added" | "modified" | "deleted" | "renamed";
```

How one path differs between the base and the working tree.

***

### FindingSeverity

```ts
type FindingSeverity = "warn" | "info";
```

***

### MergeResult

```ts
type MergeResult = 
  | {
  ok: true;
  report: unknown;
}
  | {
  error: string;
  ok: false;
};
```

The outcome of [mergeMutationReports](#mergemutationreports).

***

### MissExplanation

```ts
type MissExplanation = 
  | {
  kind: "no-previous";
}
  | {
  kind: "same-inputs";
}
  | {
  added: readonly string[];
  changed: readonly string[];
  comparedWith: string;
  kind: "changed";
  removed: readonly string[];
};
```

Why a computation is not served from the cache, relative to the check's latest entry.

***

### ParsedScopeArgs

```ts
type ParsedScopeArgs = 
  | {
  base?: string;
  ok: true;
  rest: readonly string[];
  scope?: RequestedScope;
}
  | {
  error: string;
  ok: false;
};
```

The scope-related arguments of a command line, and whatever else was given.

***

### RequestedScope

```ts
type RequestedScope = RunScope | "auto";
```

What a caller may ask for; `"auto"` leaves the choice to the environment.

***

### RunScope

```ts
type RunScope = "affected" | "full";
```

How much of the repository a run validates.

***

### ScopeSource

```ts
type ScopeSource = "flag" | "env" | "ci-full" | "release" | "ci-event" | "default";
```

Where a scope decision came from.

***

### ShardSpec

```ts
type ShardSpec = 
  | {
  index: number;
  ok: true;
  total: number;
}
  | {
  error: string;
  ok: false;
};
```

A shard selector such as `2/5`, or why the text is not one.

***

### TypeScriptApi

```ts
type TypeScriptApi = typeof TypeScript;
```

The TypeScript compiler API, supplied by the caller -- this package never imports `typescript` at runtime.

***

### UnpackResult

```ts
type UnpackResult = 
  | {
  files: readonly {
     content: Uint8Array;
     path: string;
  }[];
  ok: true;
}
  | {
  error: string;
  ok: false;
};
```

***

### WideningReason

```ts
type WideningReason = 
  | "global-trigger"
  | "unplaced-file"
  | "parse-error"
  | "dynamic-import"
  | "module-side-effect"
  | "git-failed"
  | "tsconfig";
```

## Variables

### CACHE\_FORMAT

```ts
const CACHE_FORMAT: 1 = 1;
```

Bumped whenever an entry's shape or the way a key is built changes; an old entry is then never replayed.

***

### DEFAULT\_IGNORE

```ts
const DEFAULT_IGNORE: readonly string[];
```

Files that cannot influence a test and so are not worth a full run.

***

### DEFAULT\_NOT\_MUTATED

```ts
const DEFAULT_NOT_MUTATED: readonly string[];
```

Files that are not mutation targets.

***

### DEFAULT\_TESTS

```ts
const DEFAULT_TESTS: readonly string[];
```

Test entry points: the files a runner is asked to execute.

***

### DEFAULT\_TRIGGERS

```ts
const DEFAULT_TRIGGERS: readonly string[];
```

Files whose change can alter how every test behaves, so nothing narrower than a full run is sound.

## Functions

### cacheKey()

```ts
function cacheKey(input): string;
```

Builds the key a result is stored under: a digest of the check, every input's name and content
digest, the tool versions, and the cache format. Anything that can change the result belongs in
`inputs` or `tools`; the key says nothing about what is left out.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `input` | \{ `check`: `string`; `inputs`: `Readonly`\<`Record`\<`string`, `string`\>\>; `tools`: `Readonly`\<`Record`\<`string`, `string`\>\>; \} | The check id, its inputs (name to content digest) and the tools' versions. |
| `input.check` | `string` | The check id. |
| `input.inputs` | `Readonly`\<`Record`\<`string`, `string`\>\> | Each input's name and a digest of its content. |
| `input.tools` | `Readonly`\<`Record`\<`string`, `string`\>\> | Each tool's name and version. |

#### Returns

`string`

A 64-character hex digest.

***

### computeAffected()

```ts
function computeAffected(input): AffectedResult;
```

Computes which tests (and which mutation targets) a change can affect.

The analysis is symbol-level: each changed module is diffed against its base to find the exported
names whose behavior may differ, and those names are followed through the import graph --
including re-exports and `export *` -- to every module that uses them. Anything it cannot reason
about does not narrow the result: a changed file the graph cannot place, a global trigger such as
a lockfile, or a file that does not parse makes the whole result `"full"`, and a module that loads
code dynamically is treated as affected by everything. Narrowing is only ever an optimization of
a sound answer, never a guess.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `input` | [`ComputeAffectedInput`](#computeaffectedinput) | Module contents, the diff, and the TypeScript compiler API. |

#### Returns

[`AffectedResult`](#affectedresult)

The affected sets, with provenance for every test (see `explainAffected`).

***

### computeAffectedFromGit()

```ts
function computeAffectedFromGit(input): Promise<AffectedResult>;
```

Computes the affected set for the working tree against a base, using git and file reads the
caller supplies. Anything git cannot answer makes the result `"full"`.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `input` | [`ComputeAffectedFromGitInput`](#computeaffectedfromgitinput) | The TypeScript API, the capabilities and optional tuning. |

#### Returns

`Promise`\<[`AffectedResult`](#affectedresult)\>

The affected sets, as from `computeAffected`.

***

### createCache()

```ts
function createCache(options): Cache;
```

Creates a cache over a store.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | \{ `mode`: [`CacheMode`](#cachemode-1); `now?`: () => `Date`; `store`: [`CacheStore`](#cachestore-1); \} | The store, the mode and (for tests) a clock. |
| `options.mode` | [`CacheMode`](#cachemode-1) | Whether to read and write. |
| `options.now?` | () => `Date` | The clock, for an entry's creation time and for pruning by age. |
| `options.store` | [`CacheStore`](#cachestore-1) | Where entries live. |

#### Returns

[`Cache`](#cache)

The cache.

***

### diagnose()

```ts
function diagnose(snapshot): DoctorReport;
```

Looks for settings that make the affected-scope feature slower or wrong. Findings are ordered
by severity (warnings first), then id, so the most useful change is first.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `snapshot` | [`DoctorSnapshot`](#doctorsnapshot) | Facts about the repository. |

#### Returns

[`DoctorReport`](#doctorreport)

The findings.

***

### explainAffected()

```ts
function explainAffected(result): string[];
```

Explains why each test is in the affected set, as one line per test:
`test/b.test.ts <- src/b.ts depends on a changed symbol <- src/a.ts exports a changed \`foo\` <- ...`.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `result` | [`AffectedResult`](#affectedresult) | A result from `computeAffected`. |

#### Returns

`string`[]

One line per affected test (or a single line saying why everything is affected), sorted.

***

### findEscapes()

```ts
function findEscapes(input): CanaryResult;
```

Proves the affected scope sound against evidence: after a full run on the same change, any test
that failed there but was not in the affected set is an escape -- a regression the narrow run
would have shipped. Run it on merges to the main branch, where both answers exist.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `input` | [`CanaryInput`](#canaryinput) | The affected tests, all tests and the full run's failures. |

#### Returns

[`CanaryResult`](#canaryresult)

Whether the narrow scope was sound, and which tests escaped it.

***

### loadCompilerOptions()

```ts
function loadCompilerOptions(input): Promise<
  | {
  options?: CompilerOptions;
}
  | {
  because: Widening;
}>;
```

Reads the compiler options module resolution depends on (`paths`, `baseUrl`, ...), following
`extends` through the repository and `node_modules`. An import written through a path alias
looks like a package to the graph, so options that could not be read must widen the answer,
not be skipped.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `input` | [`LoadCompilerOptionsInput`](#loadcompileroptionsinput) | The TypeScript API, a file reader and optionally the config to use. |

#### Returns

`Promise`\<
  \| \{
  `options?`: `CompilerOptions`;
\}
  \| \{
  `because`: [`Widening`](#widening);
\}\>

The options (absent when there is no default `tsconfig.json`), or the reason to go full.

***

### mergeMutationReports()

```ts
function mergeMutationReports(reports, total): MergeResult;
```

Combines per-shard Stryker reports into the report an unsharded run would have produced. Never
a partial pass: a missing, repeated or out-of-range shard, an unreadable report, a file mutated
by two shards, or disagreeing schema versions all fail the merge.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `reports` | readonly [`ShardReport`](#shardreport)[] | Each shard's number and parsed report. |
| `total` | `number` | How many shards the run was split into. |

#### Returns

[`MergeResult`](#mergeresult)

The merged report, or why the shards cannot be merged.

***

### packArtifacts()

```ts
function packArtifacts(files): PackedArtifacts;
```

Packs build output so a cache can hold it and restore it later.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `files` | readonly [`ArtifactInput`](#artifactinput)[] | The files to keep, by safe relative path. |

#### Returns

[`PackedArtifacts`](#packedartifacts)

The files, sorted by path, each with its checksum.

#### Throws

If a path could name anything outside the directory it is restored into, or repeats.

***

### parseAffectedConfig()

```ts
function parseAffectedConfig(value): 
  | {
  options: AffectedOptions;
}
  | {
  error: string;
};
```

Validates the `affected` block of a repository's configuration (`package.json`'s
`"repo-contract"."affected"`). Strict on purpose: a misspelt key would otherwise silently
leave a coupling undeclared, which is the one thing this block exists to prevent.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `unknown` | The parsed block, or `undefined` if the repository has none. |

#### Returns

  \| \{
  `options`: [`AffectedOptions`](#affectedoptions);
\}
  \| \{
  `error`: `string`;
\}

The options, or a one-line description of what is wrong.

***

### parseFailFastArgs()

```ts
function parseFailFastArgs(argv): {
  failFast?: boolean;
  rest: readonly string[];
};
```

Pulls `--fail-fast` / `--no-fail-fast` out of a runner's arguments. The last one wins; anything
after a `--` terminator is left untouched.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `argv` | readonly `string`[] | The runner's arguments. |

#### Returns

```ts
{
  failFast?: boolean;
  rest: readonly string[];
}
```

The flag if one was given, and the arguments without it.

##### failFast?

```ts
readonly optional failFast?: boolean;
```

##### rest

```ts
readonly rest: readonly string[];
```

***

### parseNameStatus()

```ts
function parseNameStatus(output): ChangedFile[] | undefined;
```

Parses `git diff --name-status -M -z` output.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `output` | `string` | The NUL-separated output. |

#### Returns

[`ChangedFile`](#changedfile)[] \| `undefined`

The changes, or `undefined` if any entry is not understood (never a partial guess).

***

### parseScopeArgs()

```ts
function parseScopeArgs(argv): ParsedScopeArgs;
```

Reads `--scope` and `--base` out of a command line, in both `--flag value` and `--flag=value` forms.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `argv` | readonly `string`[] | The arguments, without the executable and script. |

#### Returns

[`ParsedScopeArgs`](#parsedscopeargs)

The requested scope and base, and every other argument in order; or the reason they are unusable.

***

### parseShardSpec()

```ts
function parseShardSpec(text): ShardSpec;
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `text` | `string` | A selector like `2/5`: shard 2 of 5. |

#### Returns

[`ShardSpec`](#shardspec)

The one-based index and the total, or what is wrong with the text.

***

### planFixes()

```ts
function planFixes(findings, files): PlannedChange[];
```

Works out what applying the findings' fixes would change, without touching anything: the caller
shows the difference, then writes it. Idempotent: text already present is not appended again.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `findings` | readonly [`DoctorFinding`](#doctorfinding)[] | Findings from [diagnose](#diagnose). |
| `files` | `Readonly`\<`Record`\<`string`, `string` \| `undefined`\>\> | The current content of every file a fix may touch (absent means it does not exist). |

#### Returns

[`PlannedChange`](#plannedchange)[]

One change per file that would differ.

***

### planShards()

```ts
function planShards(input): ShardPlan;
```

Splits mutation targets across shards: heaviest first onto the lightest shard, so the shards
finish at about the same time. The same targets and timings always give the same plan.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `input` | [`ShardPlanInput`](#shardplaninput) | The targets, their recorded timings, and a shard count or a time budget. |

#### Returns

[`ShardPlan`](#shardplan)

The plan.

#### Throws

If a count or budget is not a positive number.

***

### resolveCacheMode()

```ts
function resolveCacheMode(input): {
  mode: CacheMode;
  reason: string;
};
```

Decides the cache mode of a run. A full run is always cold (the cache is neither read nor
written), so a release can never be satisfied by an earlier result; otherwise the command line
wins over `REPO_CONTRACT_CACHE` (`off`, `ro` or `rw`), which wins over the default of read-write.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `input` | \{ `env`: `Readonly`\<`Record`\<`string`, `string` \| `undefined`\>\>; `flag?`: [`CacheMode`](#cachemode-1); `scope`: [`RunScope`](#runscope); \} | The run's scope, the environment as data, and any mode given on the command line. |
| `input.env` | `Readonly`\<`Record`\<`string`, `string` \| `undefined`\>\> | The environment, as data. |
| `input.flag?` | [`CacheMode`](#cachemode-1) | A mode given on the command line. |
| `input.scope` | [`RunScope`](#runscope) | The run's scope. |

#### Returns

```ts
{
  mode: CacheMode;
  reason: string;
}
```

The mode and why.

##### mode

```ts
readonly mode: CacheMode;
```

##### reason

```ts
readonly reason: string;
```

#### Throws

If `REPO_CONTRACT_CACHE` is not one of off, ro, rw.

***

### resolveFailFast()

```ts
function resolveFailFast(input): boolean;
```

Decides whether a run stops spending time on expensive checks once a cheap one has failed. Off
unless asked for, in CI as much as locally, so a run reports every problem by default; and never
on for a release, which always runs everything.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `input` | \{ `env`: `Readonly`\<`Record`\<`string`, `string` \| `undefined`\>\>; `flag?`: `boolean`; \} | The explicit flag and the environment. |
| `input.env` | `Readonly`\<`Record`\<`string`, `string` \| `undefined`\>\> | The environment variables to read; this function reads no ambient state. |
| `input.flag?` | `boolean` | `--fail-fast` (true) or `--no-fail-fast` (false), if given. |

#### Returns

`boolean`

Whether to pass `failFast: true` to the run.

***

### resolveScope()

```ts
function resolveScope(input): ScopeDecision;
```

Decides whether a run validates the affected part of the tree or all of it. A release is always
full, and `CI_FULL` forces full over anything else; otherwise an explicit request wins, then
`REPO_CONTRACT_SCOPE`, then the CI event (a pull request compares with its base, every other
event, and a CI system with no pull request, validates everything), and a local run compares
with its base branch.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `input` | [`ResolveScopeInput`](#resolvescopeinput) | The request and the environment, as data. |

#### Returns

[`ScopeDecision`](#scopedecision)

The scope and why.

#### Throws

If `REPO_CONTRACT_SCOPE` is not one of the three choices.

***

### shardMatrix()

```ts
function shardMatrix(count): ShardMatrix;
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `count` | `number` | The number of shards. |

#### Returns

[`ShardMatrix`](#shardmatrix)

A matrix for `strategy.matrix: ${{ fromJSON(...) }}`.

***

### unpackArtifacts()

```ts
function unpackArtifacts(value): UnpackResult;
```

Unpacks a cached set of files, trusting nothing: the shape, every path and every checksum are
checked, and any problem means the whole set is refused (a cache miss, never a partial restore).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `unknown` | What the cache returned. |

#### Returns

[`UnpackResult`](#unpackresult)

The files with their content, or why the set cannot be used.
