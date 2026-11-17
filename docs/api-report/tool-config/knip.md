# tool-config/knip

A knip config built from package.json `exports`: every code entry point is an entry, and the
exclude list leaves the same files out of `project`.

## Interfaces

### KnipConfigFragment

The knip settings the helper sets. Arrays are mutable copies, as knip's configuration type takes.

#### Properties

##### entry

```ts
readonly entry: string[];
```

##### project

```ts
readonly project: string[];
```

***

### KnipConfigOptions

Options for [knipConfig](#knipconfig).

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

##### extraEntries?

```ts
readonly extraEntries?: readonly string[];
```

More entry files, such as scripts and bins.

##### manifest

```ts
readonly manifest: PackageManifest;
```

The parsed package.json. Its `exports` decide the entry points.

###### Inherited from

[`ToolConfigOptions`](../tool-config.md#toolconfigoptions).[`manifest`](../tool-config.md#manifest)

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

## Functions

### knipConfig()

```ts
function knipConfig(options): KnipConfigFragment;
```

**`Beta`**

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`KnipConfigOptions`](#knipconfigoptions) | the manifest and overrides. |

#### Returns

[`KnipConfigFragment`](#knipconfigfragment)

the knip settings, with each entry listed once.
