import type { StandardSchemaV1 } from "../../src/index.js"

/**
 * Wraps a hand-written `(value: unknown) => ok/errors` validator as a real `StandardSchemaV1` --
 * the same style `scripts/suppression-governance/registry.ts`'s own `validateSuppressionRegistry`
 * already uses internally, just adapted to the one extra `"~standard"` field the interface
 * requires. Every retrofitted check in this repository passes one of these to
 * `loadExceptionRegistry` (`src/helpers/load-exception-registry.ts`) rather than pulling in a real
 * schema library (Zod, Valibot, ...) as a new dependency -- external consumers of the published
 * `repo-contract/helpers` barrel are free to pass a real one instead; this helper is
 * self-hosting-tooling-only (`checks/shared/`, never published).
 * @param validate - Validates an unknown value as an array of `T`, returning every record or every problem found.
 * @returns A `StandardSchemaV1<unknown, readonly T[]>` implementation wrapping `validate`.
 */
export function handWrittenArraySchema<T>(
  validate: (
    value: unknown,
  ) =>
    | { readonly ok: true; readonly records: readonly T[] }
    | { readonly ok: false; readonly errors: readonly string[] },
): StandardSchemaV1<unknown, readonly T[]> {
  return {
    "~standard": {
      version: 1,
      vendor: "repo-contract",
      validate: (value: unknown) => {
        const result = validate(value)
        return result.ok
          ? { value: result.records }
          : { issues: result.errors.map((message) => ({ message })) }
      },
    },
  }
}
