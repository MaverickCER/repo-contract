# tool-config/vitest

A Vitest config whose coverage writes what the `coverage` and `crap` presets read, over the
source directory minus the exclude list.

## Interfaces

### VitestConfigFragment

The Vitest settings the helper sets. Pass it to `defineConfig` or `mergeConfig`. Arrays are
mutable copies, as Vitest's config type takes.

#### Properties

##### test

```ts
readonly test: {
  coverage: {
     exclude: string[];
     include: string[];
     provider: "v8";
     reporter: CoverageReporterName[];
     reportOnFailure: boolean;
     reportsDirectory: string;
  };
  include: string[];
};
```

###### coverage

```ts
readonly coverage: {
  exclude: string[];
  include: string[];
  provider: "v8";
  reporter: CoverageReporterName[];
  reportOnFailure: boolean;
  reportsDirectory: string;
};
```

###### coverage.exclude

```ts
readonly exclude: string[];
```

###### coverage.include

```ts
readonly include: string[];
```

###### coverage.provider

```ts
readonly provider: "v8";
```

###### coverage.reporter

```ts
readonly reporter: CoverageReporterName[];
```

Includes `json-summary` and `json`, which the presets read.

###### coverage.reportOnFailure

```ts
readonly reportOnFailure: boolean;
```

###### coverage.reportsDirectory

```ts
readonly reportsDirectory: string;
```

`coverage`: the presets read `coverage/coverage-summary.json` and `coverage/coverage-final.json`.

###### include

```ts
readonly include: string[];
```

***

### VitestConfigOptions

Options for [vitestConfig](#vitestconfig).

#### Extends

- `Pick`\<[`ToolConfigOptions`](../tool-config.md#toolconfigoptions), `"srcDir"` \| `"exclude"`\>

#### Properties

##### exclude?

```ts
readonly exclude?: readonly string[];
```

Globs left out of the build's checks: mutation targets, coverage and dead-code analysis. Added to [DEFAULT\_EXCLUDE](../tool-config.md#default_exclude).

###### Inherited from

[`ToolConfigOptions`](../tool-config.md#toolconfigoptions).[`exclude`](../tool-config.md#exclude)

##### include?

```ts
readonly include?: readonly string[];
```

Test file globs. Defaults to `["test/**/*.test.ts"]`.

##### srcDir?

```ts
readonly srcDir?: string;
```

The source directory. Defaults to `"src"`.

###### Inherited from

[`ToolConfigOptions`](../tool-config.md#toolconfigoptions).[`srcDir`](../tool-config.md#srcdir-1)

## Type Aliases

### CoverageReporterName

```ts
type CoverageReporterName = "text" | "html" | "lcov" | "json" | "json-summary";
```

A coverage report format the fragment names.

## Functions

### vitestConfig()

```ts
function vitestConfig(options?): VitestConfigFragment;
```

**`Beta`**

`reportOnFailure` is on so a failing run still leaves a summary for the `coverage` preset to
judge, rather than a stale one from an earlier run.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`VitestConfigOptions`](#vitestconfigoptions) | the source directory, test globs and exclude list. |

#### Returns

[`VitestConfigFragment`](#vitestconfigfragment)

the Vitest settings.
