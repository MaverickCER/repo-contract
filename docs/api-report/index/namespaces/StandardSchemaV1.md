# StandardSchemaV1

Namespaced members of `StandardSchemaV1`: `Props`, `Result`, `SuccessResult`, `FailureResult`,
`Issue`, `PathSegment`, `Types`, `InferInput`, `InferOutput`.

## Interfaces

### FailureResult

The result interface if validation fails.

#### Properties

##### issues

```ts
readonly issues: readonly Issue[];
```

The issues of failed validation.

***

### Issue

The issue interface of the failure output.

#### Properties

##### message

```ts
readonly message: string;
```

The error message of the issue.

##### path?

```ts
readonly optional path?: readonly (PropertyKey | PathSegment)[];
```

The path of the issue, if any.

***

### Options

Options passable to `validate`.

#### Properties

##### libraryOptions?

```ts
readonly optional libraryOptions?: Record<string, unknown>;
```

Explicit support for additional vendor-specific parameters, if needed.

***

### PathSegment

The path segment interface of the issue.

#### Properties

##### key

```ts
readonly key: PropertyKey;
```

The key representing a path segment.

***

### Props

The Standard Schema properties interface.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `Input` | `unknown` |
| `Output` | `Input` |

#### Properties

##### types?

```ts
readonly optional types?: Types<Input, Output>;
```

Inferred types associated with the schema.

##### validate

```ts
readonly validate: (value, options?) => 
  | Result<Output>
| Promise<Result<Output>>;
```

Validates unknown input values.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `value` | `unknown` |
| `options?` | [`Options`](#options) |

###### Returns

  \| [`Result`](#result)\<`Output`\>
  \| `Promise`\<[`Result`](#result)\<`Output`\>\>

##### vendor

```ts
readonly vendor: string;
```

The vendor name of the schema library.

##### version

```ts
readonly version: 1;
```

The version number of the standard.

***

### SuccessResult

The result interface if validation succeeds.

#### Type Parameters

| Type Parameter |
| ------ |
| `Output` |

#### Properties

##### issues?

```ts
readonly optional issues?: undefined;
```

A falsy value for `issues` indicates success.

##### value

```ts
readonly value: Output;
```

The typed output value.

***

### Types

The Standard Schema types interface.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `Input` | `unknown` |
| `Output` | `Input` |

#### Properties

##### input

```ts
readonly input: Input;
```

The input type of the schema.

##### output

```ts
readonly output: Output;
```

The output type of the schema.

## Type Aliases

### InferInput

```ts
type InferInput<Schema> = NonNullable<Schema["~standard"]["types"]>["input"];
```

Infers the input type of a Standard Schema.

#### Type Parameters

| Type Parameter |
| ------ |
| `Schema` *extends* [`StandardSchemaV1`](../README.md#standardschemav1) |

***

### InferOutput

```ts
type InferOutput<Schema> = NonNullable<Schema["~standard"]["types"]>["output"];
```

Infers the output type of a Standard Schema.

#### Type Parameters

| Type Parameter |
| ------ |
| `Schema` *extends* [`StandardSchemaV1`](../README.md#standardschemav1) |

***

### Result

```ts
type Result<Output> = 
  | SuccessResult<Output>
  | FailureResult;
```

The result interface of the validate function.

#### Type Parameters

| Type Parameter |
| ------ |
| `Output` |
