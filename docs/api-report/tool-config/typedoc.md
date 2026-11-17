# tool-config/typedoc

A TypeDoc config built from package.json `exports`: one entry point per code subpath.

## Interfaces

### TypedocConfigFragment

The TypeDoc settings the helper sets. Arrays are mutable copies, as TypeDoc's options type takes.

#### Properties

##### entryPoints

```ts
readonly entryPoints: string[];
```

##### exclude

```ts
readonly exclude: string[];
```

## Functions

### typedocConfig()

```ts
function typedocConfig(options): TypedocConfigFragment;
```

**`Beta`**

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`ToolConfigOptions`](../tool-config.md#toolconfigoptions) | the manifest and overrides. |

#### Returns

[`TypedocConfigFragment`](#typedocconfigfragment)

the TypeDoc settings.
