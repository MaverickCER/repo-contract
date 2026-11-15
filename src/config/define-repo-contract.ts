import type { CheckSchema, RepoContractConfig, ValidatedCheckSchema } from "../types.js"

/**
 * Declares a contract with full type inference, and returns it unchanged. Each check's `output`
 * (present or absent, and its format) flows into that check's `policy` parameter type, so a config
 * needs no type annotations. It also checks every `dependsOn` against the sibling check ids at
 * compile time (see `ValidatedCheckSchema`), so a mistyped or self-referencing id fails to compile.
 *
 * It does no other validation and no cloning. `runRepoContract` validates whatever config it is
 * given, whether or not it passed through this function.
 *
 * `const TChecks` (TypeScript 5.0's `const` type parameter modifier) keeps each check's
 * configuration from being widened during inference, notably whether `output` is present.
 * Without it, TypeScript's inference for a `Record` of heterogeneous generic entries does not
 * reliably preserve that per-check shape once a callback property (`policy`) is present. See
 * `InferParsedValue` in types.ts for the related limitation this does not fully solve.
 *
 * `TChecks` is inferred from the plain `RepoContractConfig<TChecks>` position. The
 * `ValidatedCheckSchema<TChecks>` constraint on `checks` is intersected in afterward, computed
 * from the inferred `TChecks`. Inferring `TChecks` from a mapped/conditional type over itself (as
 * `ValidatedCheckSchema` is) loses the contextual typing each `policy` callback otherwise gets.
 * That is a second TypeScript inference limitation, separate from the `output`-to-`policy` one.
 * @param config - the config to type-check and return unchanged.
 * @returns the same `config` object, untouched and uncloned.
 * @public
 */
export function defineRepoContract<const TChecks extends CheckSchema>(
  config: RepoContractConfig<TChecks> & { readonly checks: ValidatedCheckSchema<TChecks> },
): RepoContractConfig<TChecks> {
  return config
}
