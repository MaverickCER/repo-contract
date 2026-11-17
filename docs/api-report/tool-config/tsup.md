# tool-config/tsup

A tsup config built from package.json `exports`: one entry per code subpath.

## Interfaces

### TsupConfigFragment

The tsup settings the helper sets. Spread it into `defineConfig`. Arrays are mutable copies
because tsup's `Options` type takes mutable arrays.

#### Properties

##### entry

```ts
readonly entry: Record<string, string>;
```

Built file name to source file, from [entries](../tool-config.md#entries).

##### format

```ts
readonly format: ("esm" | "cjs")[];
```

##### platform

```ts
readonly platform: "node" | "neutral" | "browser";
```

##### sourcemap

```ts
readonly sourcemap: boolean;
```

##### target

```ts
readonly target: string;
```

##### treeshake

```ts
readonly treeshake: boolean;
```

***

### TsupConfigOptions

Options for [tsupConfig](#tsupconfig).

#### Extends

- [`ToolConfigOptions`](../tool-config.md#toolconfigoptions)

#### Properties

##### exclude?

```ts
readonly exclude?: readonly string[];
```

Globs left out of the build's checks: mutation targets, coverage and dead-code analysis. Added to [DEFAULT\_EXCLUDE](../tool-config.md#default_exclude).

###### Inherited from

[`ToolConfigOptions`](../tool-config.md#toolconfigoptions).[`exclude`](../tool-config.md#exclude)

##### exists?

```ts
readonly exists?: (path) => boolean;
```

Whether a file exists, relative to the working directory. Defaults to `node:fs`'s `existsSync`; tests pass their own.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `path` | `string` |

###### Returns

`boolean`

###### Inherited from

[`ToolConfigOptions`](../tool-config.md#toolconfigoptions).[`exists`](../tool-config.md#exists-1)

##### format?

```ts
readonly format?: readonly ("esm" | "cjs")[];
```

Defaults to `["esm", "cjs"]`.

##### manifest

```ts
readonly manifest: PackageManifest;
```

The parsed package.json. Its `exports` decide the entry points.

###### Inherited from

[`ToolConfigOptions`](../tool-config.md#toolconfigoptions).[`manifest`](../tool-config.md#manifest)

##### platform?

```ts
readonly platform?: "node" | "neutral" | "browser";
```

Defaults to `"node"`.

##### sources?

```ts
readonly sources?: Readonly<Record<string, string>>;
```

The source file per `exports` subpath, where the convention does not hold, such as `{ ".": "src/runtime/index.ts" }`.

###### Inherited from

[`ToolConfigOptions`](../tool-config.md#toolconfigoptions).[`sources`](../tool-config.md#sources-1)

##### srcDir?

```ts
readonly srcDir?: string;
```

The source directory. Defaults to `"src"`.

###### Inherited from

[`ToolConfigOptions`](../tool-config.md#toolconfigoptions).[`srcDir`](../tool-config.md#srcdir-1)

##### target?

```ts
readonly target?: string;
```

Defaults to `"node22"`.

## Functions

### tsupConfig()

```ts
function tsupConfig(options): TsupConfigFragment;
```

**`Beta`**

The defaults are what repo-contract, env-cap and data-cap build with today. Declarations are
left to the caller: all three emit them with `tsc`, so the fragment sets no `dts`.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`TsupConfigOptions`](#tsupconfigoptions) | the manifest and overrides. |

#### Returns

[`TsupConfigFragment`](#tsupconfigfragment)

the tsup settings.

#### Throws

when `format` is empty.
