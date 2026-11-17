# tool-config/stryker

A Stryker config that mutates the source directory minus the exclude list, with the settings the
`mutation` preset expects. Incremental mode is off: the preset judges full, cold runs.

## Interfaces

### StrykerConfigFragment

The Stryker settings the helper sets. Export it as the config's default. Arrays are mutable
copies, as Stryker's options type takes.

#### Properties

##### concurrency

```ts
readonly concurrency: number;
```

##### coverageAnalysis

```ts
readonly coverageAnalysis: "perTest";
```

##### dryRunTimeoutMinutes

```ts
readonly dryRunTimeoutMinutes: number;
```

`10`. The first, unmutated run reruns the suite with per-test coverage, and Stryker's 5-minute default aborts it on a loaded machine.

##### ignoreStatic

```ts
readonly ignoreStatic: boolean;
```

##### incremental

```ts
readonly incremental: false;
```

##### jsonReporter

```ts
readonly jsonReporter: {
  fileName: string;
};
```

###### fileName

```ts
readonly fileName: string;
```

##### mutate

```ts
readonly mutate: string[];
```

##### reporters

```ts
readonly reporters: string[];
```

##### tempDirName

```ts
readonly tempDirName: string;
```

##### testRunner

```ts
readonly testRunner: "vitest";
```

##### timeoutMS

```ts
readonly timeoutMS: number;
```

***

### StrykerConfigOptions

Options for [strykerConfig](#strykerconfig).

#### Extends

- `Pick`\<[`ToolConfigOptions`](../tool-config.md#toolconfigoptions), `"srcDir"` \| `"exclude"`\>

#### Properties

##### concurrency?

```ts
readonly concurrency?: number;
```

Defaults to `4`.

##### exclude?

```ts
readonly exclude?: readonly string[];
```

Globs left out of the build's checks: mutation targets, coverage and dead-code analysis. Added to [DEFAULT\_EXCLUDE](../tool-config.md#default_exclude).

###### Inherited from

[`ToolConfigOptions`](../tool-config.md#toolconfigoptions).[`exclude`](../tool-config.md#exclude)

##### srcDir?

```ts
readonly srcDir?: string;
```

The source directory. Defaults to `"src"`.

###### Inherited from

[`ToolConfigOptions`](../tool-config.md#toolconfigoptions).[`srcDir`](../tool-config.md#srcdir-1)

##### timeoutMS?

```ts
readonly timeoutMS?: number;
```

Per-mutant timeout, in milliseconds. Defaults to `20000`.

## Functions

### strykerConfig()

```ts
function strykerConfig(options?): StrykerConfigFragment;
```

**`Beta`**

The run settings are the ones repo-contract, env-cap and data-cap share today. `ignoreStatic`
is on because a static mutant reruns the whole suite under per-test coverage.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`StrykerConfigOptions`](#strykerconfigoptions) | the source directory, exclude list and run limits. |

#### Returns

[`StrykerConfigFragment`](#strykerconfigfragment)

the Stryker settings.

#### Throws

when `concurrency` or `timeoutMS` is not a positive whole number.
