import type { StandardSchemaV1 } from "../../../src/standard-schema/types.js"

/** A schema whose `validate()` always succeeds, returning its input unchanged. */
export function successSchema<T>(): StandardSchemaV1<T, T> {
  return {
    "~standard": {
      version: 1,
      vendor: "fixture",
      validate: (value) => ({ value: value as T }),
    },
  }
}

/** A schema whose `validate()` succeeds with a transformed value -- proves a schema can coerce/normalize, not just check. */
export function transformSchema(): StandardSchemaV1<unknown, number> {
  return {
    "~standard": {
      version: 1,
      vendor: "fixture",
      validate: (value) => ({ value: Number(value) * 2 }),
    },
  }
}

/** A schema whose `validate()` always fails with the given issues. */
export function failureSchema(issues: readonly StandardSchemaV1.Issue[]): StandardSchemaV1 {
  return {
    "~standard": {
      version: 1,
      vendor: "fixture",
      validate: () => ({ issues }),
    },
  }
}

/** A schema whose `validate()` succeeds, but only after resolving asynchronously -- proves `parseOutput` awaits a `Promise<Result>`, not just a synchronous `Result`. */
export function asyncSuccessSchema<T>(): StandardSchemaV1<T, T> {
  return {
    "~standard": {
      version: 1,
      vendor: "fixture",
      validate: (value) => Promise.resolve({ value: value as T }),
    },
  }
}

/** A schema whose `validate()` throws synchronously -- a bug in the schema itself, distinct from a validation failure. */
export function throwingSchema(error: unknown): StandardSchemaV1 {
  return {
    "~standard": {
      version: 1,
      vendor: "fixture",
      validate: () => {
        throw error
      },
    },
  }
}

/** A schema whose `validate()` returns a `Promise` that rejects -- the async counterpart to `throwingSchema`. */
export function rejectingSchema(error: Error): StandardSchemaV1 {
  return {
    "~standard": {
      version: 1,
      vendor: "fixture",
      validate: () => Promise.reject(error),
    },
  }
}

/**
 * A *callable* schema -- `typeof schema === "function"`, with `"~standard"` attached as a property
 * on the function itself, mirroring ArkType's own `Type` values (themselves callable functions).
 * Proves `output.schema` accepts a function, not just a plain object.
 */
export function callableSchema<T>(): StandardSchemaV1<T, T> {
  const schema = ((value: T) => value) as StandardSchemaV1<T, T> & ((value: T) => T)
  ;(schema as { "~standard": StandardSchemaV1.Props<T, T> })["~standard"] = {
    version: 1,
    vendor: "fixture-callable",
    validate: (value) => ({ value: value as T }),
  }
  return schema
}
