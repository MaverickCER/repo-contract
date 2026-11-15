/**
 * Hand-vendored from `@standard-schema/spec@1.1.0` (standardschema.dev), pinned
 * 2026-09-04. See specs/decisions/0012-hand-vendored-standard-schema-support-for-optional-output-validation.md
 * for why this is vendored rather than installed, and for the version-pin/re-diff process. Pure
 * type declarations, zero runtime code: assigning a Zod/Valibot/ArkType (etc.) schema to this
 * type costs nothing at runtime. Only `StandardSchemaV1` (validation) is vendored here. The
 * separate, optional `StandardJSONSchemaV1` (JSON Schema conversion) extension
 * (standardschema.dev/json-schema) is out of scope; see the ADR.
 *
 * Upstream's `StandardSchemaV1.Props` extends a shared `StandardTypedV1.Props` base
 * (`version`/`vendor`/`types`). This vendored copy inlines those fields into one flat
 * interface, since repo-contract has no use for the shared base alone. It is structurally
 * identical for any library schema object assigned to it. Re-diff against
 * `@standard-schema/spec`'s published `dist/index.d.ts` whenever this file is touched.
 *
 * Tagged `@public`, not tied to either re-exporting barrel's stability tier. This type is
 * re-exported from the root barrel, for `output.schema`, and from the
 * `repo-contract/helpers` barrel. This vendored copy's shape changes only through a
 * deliberate re-diff against the pinned upstream spec version above. It never changes as a side
 * effect of either barrel's stability classification.
 * @public
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  /** The Standard Schema properties. */
  readonly "~standard": StandardSchemaV1.Props<Input, Output>
}

/**
 * Namespaced members of `StandardSchemaV1`: `Props`, `Result`, `SuccessResult`, `FailureResult`,
 * `Issue`, `PathSegment`, `Types`, `InferInput`, `InferOutput`.
 * @public
 */
// eslint-disable-next-line @typescript-eslint/no-namespace -- the interface+namespace declaration-merging pattern is required here to mirror @standard-schema/spec's own published shape (StandardSchemaV1.Props/.Result/.Issue/... nested under the interface's own name). An ES2015 module can't merge with an interface of the same name the way a namespace does. Diverging from upstream's exact shape would defeat this file's purpose: a faithful, re-diffable vendor copy (see this file's own top comment).
export declare namespace StandardSchemaV1 {
  /** The Standard Schema properties interface. */
  export interface Props<Input = unknown, Output = Input> {
    /** The version number of the standard. */
    readonly version: 1
    /** The vendor name of the schema library. */
    readonly vendor: string
    /** Validates unknown input values. */
    readonly validate: (
      value: unknown,
      options?: Options,
    ) => Result<Output> | Promise<Result<Output>>
    /** Inferred types associated with the schema. */
    readonly types?: Types<Input, Output> | undefined
  }

  /** Options passable to `validate`. */
  export interface Options {
    /** Explicit support for additional vendor-specific parameters, if needed. */
    readonly libraryOptions?: Record<string, unknown> | undefined
  }

  /** The result interface of the validate function. */
  export type Result<Output> = SuccessResult<Output> | FailureResult

  /** The result interface if validation succeeds. */
  export interface SuccessResult<Output> {
    /** The typed output value. */
    readonly value: Output
    /** A falsy value for `issues` indicates success. */
    readonly issues?: undefined
  }

  /** The result interface if validation fails. */
  export interface FailureResult {
    /** The issues of failed validation. */
    readonly issues: readonly Issue[]
  }

  /** The issue interface of the failure output. */
  export interface Issue {
    /** The error message of the issue. */
    readonly message: string
    /** The path of the issue, if any. */
    readonly path?: readonly (PropertyKey | PathSegment)[] | undefined
  }

  /** The path segment interface of the issue. */
  export interface PathSegment {
    /** The key representing a path segment. */
    readonly key: PropertyKey
  }

  /** The Standard Schema types interface. */
  export interface Types<Input = unknown, Output = Input> {
    /** The input type of the schema. */
    readonly input: Input
    /** The output type of the schema. */
    readonly output: Output
  }

  /** Infers the input type of a Standard Schema. */
  export type InferInput<Schema extends StandardSchemaV1> = NonNullable<
    Schema["~standard"]["types"]
  >["input"]

  /** Infers the output type of a Standard Schema. */
  export type InferOutput<Schema extends StandardSchemaV1> = NonNullable<
    Schema["~standard"]["types"]
  >["output"]
}
