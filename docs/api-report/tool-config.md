# tool-config

Shared inputs for the tool config helpers: the entry points from package.json `exports`, and
one exclude list. Each tool has its own subpath: `repo-contract/config/tsup`, `/typedoc`,
`/knip`, `/vitest` and `/stryker`. Each returns a plain object to spread into the tool's config,
and imports nothing from the tool itself.

Experimental. Published under its `./config` subpath.

## Interfaces

### EntriesOptions

Options for [entries](#entries).

#### Properties

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

##### sources?

```ts
readonly sources?: Readonly<Record<string, string>>;
```

The source file per `exports` subpath, where the convention does not hold.

##### srcDir?

```ts
readonly srcDir?: string;
```

The source directory. Defaults to `"src"`.

***

### EntryPoint

One code entry point, from one `exports` subpath.

#### Properties

##### name

```ts
readonly name: string;
```

The built file's path under the build directory, without extension, such as `"index"` or `"config/tsup"`.

##### source

```ts
readonly source: string;
```

The source file that builds it, such as `"src/helpers/index.ts"`.

##### subpath

```ts
readonly subpath: string;
```

The `exports` key, such as `"."` or `"./helpers"`.

***

### PackageManifest

The package.json fields the config helpers read. Pass the parsed file.

#### Properties

##### exports?

```ts
readonly exports?: unknown;
```

##### main?

```ts
readonly main?: string;
```

##### module?

```ts
readonly module?: string;
```

##### name?

```ts
readonly name?: string;
```

##### types?

```ts
readonly types?: string;
```

***

### ToolConfigOptions

What every config helper takes.

#### Extended by

- [`TsupConfigOptions`](tool-config/tsup.md#tsupconfigoptions)
- [`KnipConfigOptions`](tool-config/knip.md#knipconfigoptions)

#### Properties

##### exclude?

```ts
readonly exclude?: readonly string[];
```

Globs left out of the build's checks: mutation targets, coverage and dead-code analysis. Added to [DEFAULT\_EXCLUDE](#default_exclude).

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

##### manifest

```ts
readonly manifest: PackageManifest;
```

The parsed package.json. Its `exports` decide the entry points.

##### sources?

```ts
readonly sources?: Readonly<Record<string, string>>;
```

The source file per `exports` subpath, where the convention does not hold, such as `{ ".": "src/runtime/index.ts" }`.

##### srcDir?

```ts
readonly srcDir?: string;
```

The source directory. Defaults to `"src"`.

## Variables

### DEFAULT\_EXCLUDE

```ts
const DEFAULT_EXCLUDE: readonly string[];
```

Globs every helper leaves out: tests, mocks, fixtures and declarations. Each starts with `**`
so it matches under any source directory.

## Functions

### entries()

```ts
function entries(manifest, options?): readonly EntryPoint[];
```

Lists the package's code entry points from `exports`. The source of `"."` is
`<srcDir>/index.ts`; of `"./x"`, `<srcDir>/x/index.ts`, else `<srcDir>/x.ts`. `sources` wins
over the convention. A subpath with no JavaScript target, such as a JSON schema or
`./package.json`, is skipped. Without `exports`, `main` (else `module`) gives `"."` alone.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `manifest` | [`PackageManifest`](#packagemanifest) | the parsed package.json. |
| `options?` | [`EntriesOptions`](#entriesoptions) | overrides and the file-system probe. |

#### Returns

readonly [`EntryPoint`](#entrypoint)[]

the entry points in `exports` order.

#### Throws

when `sources` names a subpath with no code entry, when a wildcard subpath has
a JavaScript target (one entry cannot stand for many files), or when two subpaths build one file.

***

### excludeGlobs()

```ts
function excludeGlobs(exclude?): readonly string[];
```

The one exclude list every helper uses: the defaults plus the package's own, without
duplicates.

#### Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `exclude?` | readonly `string`[] | `[]` | the package's own globs. |

#### Returns

readonly `string`[]

the merged list, a new array on every call.

#### Throws

on a blank glob or one that starts with `!`.

***

### negateGlobs()

```ts
function negateGlobs(globs): readonly string[];
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `globs` | readonly `string`[] | globs to leave out. |

#### Returns

readonly `string`[]

each glob prefixed with `!`, for Stryker's `mutate` and knip's `project`.

#### Throws

on a blank glob or one that already starts with `!`.
