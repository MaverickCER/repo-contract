# tiers

Four tiers of checks, each a function that returns `checks` to spread into
`defineRepoContract`: `basic`, `app`, `library` and `strict`. Each tier holds every check of the
tier before it. One overrides object, keyed by check id, changes a check's options or turns it
off. `explainTier` and `renderExplain` say what a config runs and what it loosened.

Built from `repo-contract/presets`, so Experimental like them. Published under its `./tiers`
subpath, independent of the other barrels.

## Interfaces

### ExplainableConfig

The part of a config `explainTier` reads. A config built by a tier carries `tier`.

#### Properties

##### checks

```ts
readonly checks: Readonly<Record<string, unknown>>;
```

##### tier?

```ts
readonly tier?: unknown;
```

***

### ExplainBaseline

What a config is compared against: a tier's defaults, or a stricter standard such as IPC's.

#### Properties

##### checks

```ts
readonly checks: readonly string[];
```

The check ids the baseline turns on.

##### name

```ts
readonly name: string;
```

A name for the rendered output, such as `"strict"`.

##### planned

```ts
readonly planned: readonly PlannedCheck[];
```

##### settings

```ts
readonly settings: TierSettings;
```

***

### ExplainedCheck

One check in the config, as `explain` reports it.

#### Properties

##### enabled

```ts
readonly enabled: boolean;
```

`false` when the tier's overrides turned the check off.

##### id

```ts
readonly id: string;
```

##### loosened

```ts
readonly loosened: readonly Loosening[];
```

##### settings

```ts
readonly settings: Readonly<Record<string, number>>;
```

The numeric settings in force, as `explain` knows them from the tier metadata.

##### source

```ts
readonly source: "added" | "tier";
```

`"tier"` when the baseline turns the check on; `"added"` when only the config does.

***

### Loosening

One setting looser than the baseline, or a baseline check turned off (`setting: "enabled"`).

#### Properties

##### baseline

```ts
readonly baseline: number | boolean | undefined;
```

##### check

```ts
readonly check: string;
```

##### setting

```ts
readonly setting: string;
```

##### value

```ts
readonly value: number | boolean | undefined;
```

***

### LooseningRule

One numeric setting `explain` compares, and which way it gets stricter.

#### Properties

##### check

```ts
readonly check: "Duplication" | "Coverage" | "Mutation" | "Crap";
```

##### direction

```ts
readonly direction: LooseningDirection;
```

##### setting

```ts
readonly setting: string;
```

***

### PlannedCheck

A check a tier will turn on later, with the tier it belongs to and why it waits.

#### Properties

##### id

```ts
readonly id: PlannedCheckId;
```

##### reason

```ts
readonly reason: string;
```

##### tier

```ts
readonly tier: TierName;
```

***

### RenderExplainOptions

Options for [renderExplain](#renderexplain).

#### Properties

##### format?

```ts
readonly format?: "text" | "markdown";
```

`"text"` for a terminal (the default), `"markdown"` for a report or step summary.

##### heading?

```ts
readonly heading?: string;
```

The heading over the loosened settings. Defaults to `"Loosened"`.

***

### TierCheckOptions

What each check accepts in a tier's overrides object. `never` means the check takes no options,
so the only override is `false`.

#### Properties

##### Build

```ts
readonly Build: Partial<NpmScriptOptions>;
```

##### BundledDependencies

```ts
readonly BundledDependencies: never;
```

##### Commits

```ts
readonly Commits: CommitlintOptions;
```

##### Coverage

```ts
readonly Coverage: CoverageOptions;
```

##### Crap

```ts
readonly Crap: CrapOptions;
```

##### DeadCode

```ts
readonly DeadCode: DeadCodeOptions;
```

##### DistNoUrls

```ts
readonly DistNoUrls: DistNoUrlsOptions;
```

##### DocsLinks

```ts
readonly DocsLinks: BrokenLinksOptions;
```

##### DocsMarkdown

```ts
readonly DocsMarkdown: MarkdownlintOptions;
```

##### Duplication

```ts
readonly Duplication: DuplicationOptions;
```

##### Format

```ts
readonly Format: never;
```

##### Licenses

```ts
readonly Licenses: never;
```

##### Lint

```ts
readonly Lint: LintOptions;
```

##### Mutation

```ts
readonly Mutation: MutationOptions;
```

##### Packaging

```ts
readonly Packaging: never;
```

##### QuickStart

```ts
readonly QuickStart: QuickStartOptions;
```

##### SecurityDeps

```ts
readonly SecurityDeps: SecurityDepsOptions;
```

##### SecuritySecrets

```ts
readonly SecuritySecrets: never;
```

##### Tests

```ts
readonly Tests: never;
```

##### Typecheck

```ts
readonly Typecheck: never;
```

##### TypeResolution

```ts
readonly TypeResolution: ArethetypeswrongOptions;
```

***

### TierConfig

What a tier function returns. Spread it into `defineRepoContract` next to `spawn` and `env`.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-id"></a> `Id` *extends* [`TierCheckId`](#tiercheckid) |

#### Properties

##### checks

```ts
readonly checks: TierChecks<Id>;
```

##### tier

```ts
readonly tier: TierMetadata;
```

***

### TierDefinition

One tier's own definition: what it adds to the tier it extends, and its default settings.

#### Properties

##### adds

```ts
readonly adds: readonly StrictCheckId[];
```

The checks this tier adds, in schedule order.

##### extends

```ts
readonly extends: TierName | undefined;
```

The tier this one builds on; `undefined` for `basic`.

##### name

```ts
readonly name: TierName;
```

##### planned

```ts
readonly planned: readonly PlannedCheck[];
```

The planned checks that belong to this tier.

##### settings

```ts
readonly settings: TierSettings;
```

The default settings at this tier.

***

### TierExplanation

What `explainTier` returns, and what `repo-contract explain --json` prints.

#### Properties

##### baseline

```ts
readonly baseline: string | undefined;
```

The baseline's name, or `undefined` when there was nothing to compare against.

##### checks

```ts
readonly checks: readonly ExplainedCheck[];
```

##### loosened

```ts
readonly loosened: readonly Loosening[];
```

Every loosening, in check order.

##### missing

```ts
readonly missing: readonly string[];
```

Baseline checks the config does not contain at all.

##### planned

```ts
readonly planned: readonly PlannedCheck[];
```

##### schemaVersion

```ts
readonly schemaVersion: 1;
```

##### tier

```ts
readonly tier: TierName | undefined;
```

The tier the config was built from, or `undefined` when it carries no tier metadata.

***

### TierMetadata

What a tier records about itself. It rides along on the config as `tier`, which
`validateRepoContractConfig` ignores, so `explain` can read it back.

#### Properties

##### checks

```ts
readonly checks: readonly StrictCheckId[];
```

The ids the tier put in `checks`, in schedule order, turned-off ones included.

##### name

```ts
readonly name: TierName;
```

##### off

```ts
readonly off: readonly StrictCheckId[];
```

The ids the overrides turned off.

##### overrides

```ts
readonly overrides: TierOverrides;
```

The overrides object exactly as passed.

##### planned

```ts
readonly planned: readonly PlannedCheck[];
```

Planned checks at this tier and below.

##### settings

```ts
readonly settings: TierSettings;
```

The settings in force: the tier's defaults with the overrides applied.

***

### TierSettings

The numeric settings `explain` compares against a baseline.

#### Properties

##### Coverage

```ts
readonly Coverage: {
  branches?: number;
  functions?: number;
  lines?: number;
  statements?: number;
};
```

Minimum coverage per metric. A metric left out is not judged.

###### branches?

```ts
readonly branches?: number;
```

###### functions?

```ts
readonly functions?: number;
```

###### lines?

```ts
readonly lines?: number;
```

###### statements?

```ts
readonly statements?: number;
```

##### Crap

```ts
readonly Crap: {
  maxComplexity: number;
  threshold: number;
};
```

The CRAP ceiling and the cyclomatic-complexity ceiling per function.

###### maxComplexity

```ts
readonly maxComplexity: number;
```

###### threshold

```ts
readonly threshold: number;
```

##### Duplication

```ts
readonly Duplication: {
  maxPercentage: number;
};
```

The largest duplicated share of scanned lines, in percent.

###### maxPercentage

```ts
readonly maxPercentage: number;
```

##### Mutation

```ts
readonly Mutation: {
  minScore: number;
};
```

The lowest mutation score that passes, in percent.

###### minScore

```ts
readonly minScore: number;
```

## Type Aliases

### AppCheckId

```ts
type AppCheckId = 
  | BasicCheckId
  | "Build"
  | "DeadCode"
  | "Duplication"
  | "Licenses"
  | "DocsLinks"
  | "Coverage";
```

The checks `app` turns on: `basic` plus what built, shipped and maintained code needs.

***

### BasicCheckId

```ts
type BasicCheckId = 
  | "Format"
  | "Lint"
  | "Typecheck"
  | "Tests"
  | "SecuritySecrets"
  | "SecurityDeps";
```

The checks `basic` turns on: what every codebase with source code needs.

***

### LibraryCheckId

```ts
type LibraryCheckId = 
  | AppCheckId
  | "Packaging"
  | "TypeResolution"
  | "BundledDependencies"
  | "QuickStart";
```

The checks `library` turns on: `app` plus what keeps a package working for the people who install it.

***

### LooseningDirection

```ts
type LooseningDirection = "higher-is-stricter" | "lower-is-stricter";
```

Which way a setting gets stricter.

***

### PlannedCheckId

```ts
type PlannedCheckId = 
  | "DocsFragments"
  | "GithubActions"
  | "GitHygiene"
  | "PackedConsumer"
  | "EngineMatrix"
  | "Suppressions"
  | "SecurityDevDeps"
  | "CleanCheckout";
```

General checks a tier will turn on in a later minor release. `explain` lists them so no tier looks more complete than it is.

***

### SettingComparison

```ts
type SettingComparison = "stricter" | "same" | "looser";
```

How a configured value compares with its baseline.

***

### StrictCheckId

```ts
type StrictCheckId = 
  | LibraryCheckId
  | "Mutation"
  | "Crap"
  | "DistNoUrls"
  | "DocsMarkdown"
  | "Commits";
```

The checks `strict` turns on: `library` plus general rigor that costs time.

***

### TierCheck

```ts
type TierCheck<Dependency> = CheckDefinitionConfig & {
  dependsOn?: readonly Dependency[];
};
```

One check as a tier builds it. `dependsOn` is narrowed to the tier's other ids, which is what
lets `defineRepoContract` accept a spread tier.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-dependency"></a> `Dependency` *extends* `string` |

#### Type Declaration

##### dependsOn?

```ts
readonly dependsOn?: readonly Dependency[];
```

***

### TierCheckId

```ts
type TierCheckId = StrictCheckId;
```

Every check id a tier can turn on. The ids are PascalCase so a stricter config can replace one by id.

***

### TierChecks

```ts
type TierChecks<Id> = { readonly [K in Id]: TierCheck<Exclude<Id, K>> };
```

Every check of a tier, keyed by id, in schedule order.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-id-1"></a> `Id` *extends* [`TierCheckId`](#tiercheckid) |

***

### TierName

```ts
type TierName = "basic" | "app" | "library" | "strict";
```

The four tiers, loosest first. Each tier holds every check of the tier before it.

***

### TierOverrides

```ts
type TierOverrides<Id> = { readonly [K in Id]?: TierCheckOptions[K] | false };
```

The one overrides object a tier takes, keyed by check id. Options replace the tier's options for
that check. `false` turns the check off: it stays in the config and passes with a rationale that
names the override, so the run still shows it.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-id-2"></a> `Id` *extends* [`TierCheckId`](#tiercheckid) | [`TierCheckId`](#tiercheckid) |

## Variables

### LIBRARY\_ONLY\_CHECKS

```ts
const LIBRARY_ONLY_CHECKS: readonly TierCheckId[];
```

The checks that only matter to a package someone installs. On a `private: true` package they pass as not applicable.

***

### LOOSENING\_RULES

```ts
const LOOSENING_RULES: readonly LooseningRule[];
```

Every numeric setting `explain` compares. Coverage and the mutation score are stricter higher.
The duplication budget and the CRAP and complexity ceilings are stricter lower. A check turned
off is always looser, and needs no rule.

***

### TIER\_NAMES

```ts
const TIER_NAMES: readonly TierName[];
```

The tier names, loosest first.

## Functions

### app()

```ts
function app(overrides?): TierConfig<AppCheckId>;
```

**`Beta`**

`basic` plus Build, DeadCode, Duplication (2%), Licenses, DocsLinks and Coverage (80% of lines
and statements): what built, shipped and maintained code needs. Tests also writes the coverage
reports Coverage reads.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `overrides?` | [`TierOverrides`](#tieroverrides)\<[`AppCheckId`](#appcheckid)\> | options per check id, or `false` to turn a check off. |

#### Returns

[`TierConfig`](#tierconfig)\<[`AppCheckId`](#appcheckid)\>

the checks and the tier's metadata, to spread into `defineRepoContract`.

#### Throws

on overrides that are not an object, an override for a check the tier
lacks, or one that is neither `false` nor an options object the check accepts.

***

### basic()

```ts
function basic(overrides?): TierConfig<BasicCheckId>;
```

**`Beta`**

Format, Lint, Typecheck, Tests, SecuritySecrets and SecurityDeps: what every codebase with
source code needs.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `overrides?` | [`TierOverrides`](#tieroverrides)\<[`BasicCheckId`](#basiccheckid)\> | options per check id, or `false` to turn a check off. |

#### Returns

[`TierConfig`](#tierconfig)\<[`BasicCheckId`](#basiccheckid)\>

the checks and the tier's metadata, to spread into `defineRepoContract`.

#### Throws

on overrides that are not an object, an override for a check the tier
lacks, or one that is neither `false` nor an options object the check accepts.

***

### compareSetting()

```ts
function compareSetting(
   direction, 
   baseline, 
   value
): SettingComparison;
```

Compares one setting with its baseline. A value the baseline sets but the config leaves out
(a coverage metric no longer judged) is looser; one only the config sets is stricter.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `direction` | [`LooseningDirection`](#looseningdirection) | which way the setting gets stricter. |
| `baseline` | `number` \| `undefined` | the baseline's value, or `undefined` when the baseline does not judge it. |
| `value` | `number` \| `undefined` | the config's value, or `undefined` when the config does not judge it. |

#### Returns

[`SettingComparison`](#settingcomparison)

whether the config is stricter, the same or looser.

***

### explainTier()

```ts
function explainTier(config, baseline?): TierExplanation;
```

**`Beta`**

Lists what a config runs and every setting looser than the baseline. Without a baseline it
compares against the defaults of the tier the config carries. Settings come from the tier
metadata alone: a check replaced by hand keeps the metadata's settings, and a config without
metadata has its checks compared but not its settings.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `config` | [`ExplainableConfig`](#explainableconfig) | a config, usually one spread from a tier. |
| `baseline?` | [`ExplainBaseline`](#explainbaseline) | what to compare against; defaults to the config's own tier. |

#### Returns

[`TierExplanation`](#tierexplanation)

the explanation.

***

### library()

```ts
function library(overrides?): TierConfig<LibraryCheckId>;
```

**`Beta`**

`app` plus Packaging, TypeResolution, BundledDependencies and QuickStart: what keeps a package
working for the people who install it. On a `private: true` package these four pass as not
applicable.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `overrides?` | [`TierOverrides`](#tieroverrides)\<[`LibraryCheckId`](#librarycheckid)\> | options per check id, or `false` to turn a check off. |

#### Returns

[`TierConfig`](#tierconfig)\<[`LibraryCheckId`](#librarycheckid)\>

the checks and the tier's metadata, to spread into `defineRepoContract`.

#### Throws

on overrides that are not an object, an override for a check the tier
lacks, or one that is neither `false` nor an options object the check accepts.

***

### plannedChecks()

```ts
function plannedChecks(name): readonly PlannedCheck[];
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `name` | [`TierName`](#tiername) | the tier. |

#### Returns

readonly [`PlannedCheck`](#plannedcheck)[]

the planned checks at this tier and below.

#### Throws

when `name` is not one of [TIER\_NAMES](#tier_names).

***

### renderExplain()

```ts
function renderExplain(explanation, options?): string;
```

**`Beta`**

Renders an explanation for a person: each check with its settings, then the loosened settings
under their own heading, then the planned checks.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `explanation` | [`TierExplanation`](#tierexplanation) | what [explainTier](#explaintier) returned. |
| `options?` | [`RenderExplainOptions`](#renderexplainoptions) | the format and heading. |

#### Returns

`string`

the text, ending in a newline.

***

### strict()

```ts
function strict(overrides?): TierConfig<StrictCheckId>;
```

**`Beta`**

`library` plus Crap (30, complexity 20), DistNoUrls, DocsMarkdown, Commits and Mutation (score
80, no unconfirmed Timeout). Coverage rises to 80% on all four metrics and Duplication falls to
0.75%.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `overrides?` | [`TierOverrides`](#tieroverrides) | options per check id, or `false` to turn a check off. |

#### Returns

[`TierConfig`](#tierconfig)\<[`StrictCheckId`](#strictcheckid)\>

the checks and the tier's metadata, to spread into `defineRepoContract`.

#### Throws

on overrides that are not an object, or an override that is neither
`false` nor an options object the check accepts.

***

### tier()

```ts
function tier(name, overrides?): TierConfig<StrictCheckId>;
```

**`Beta`**

Builds a tier chosen at run time, as `init --preset <tier>` and `explain` do.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `name` | [`TierName`](#tiername) | the tier. |
| `overrides?` | [`TierOverrides`](#tieroverrides) | options per check id, or `false` to turn a check off. |

#### Returns

[`TierConfig`](#tierconfig)\<[`StrictCheckId`](#strictcheckid)\>

the checks and the tier's metadata.

#### Throws

on an unknown tier, overrides that are not an object, an override for a
check the tier lacks, or one that is neither `false` nor an options object the check accepts.

***

### tierBaseline()

```ts
function tierBaseline(name): ExplainBaseline;
```

**`Beta`**

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `name` | [`TierName`](#tiername) | a tier. |

#### Returns

[`ExplainBaseline`](#explainbaseline)

that tier's defaults as a baseline.

***

### tierChecks()

```ts
function tierChecks(name): readonly StrictCheckId[];
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `name` | [`TierName`](#tiername) | the tier. |

#### Returns

readonly [`StrictCheckId`](#strictcheckid)[]

every check the tier turns on, the checks of the tiers below it first, in schedule order.

#### Throws

when `name` is not one of [TIER\_NAMES](#tier_names).

***

### tierDefinition()

```ts
function tierDefinition(name): TierDefinition;
```

Each tier's own definition. A tier's full check list is its `adds` after every tier it extends.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `name` | [`TierName`](#tiername) | the tier. |

#### Returns

[`TierDefinition`](#tierdefinition)

its definition.

#### Throws

when `name` is not one of [TIER\_NAMES](#tier_names).

***

### tierSettings()

```ts
function tierSettings(name): TierSettings;
```

A tier's setting for a check it does not run is that preset's own default: what the preset
judges when added by hand with no options.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `name` | [`TierName`](#tiername) | the tier. |

#### Returns

[`TierSettings`](#tiersettings)

the tier's default settings.

#### Throws

when `name` is not one of [TIER\_NAMES](#tier_names).
