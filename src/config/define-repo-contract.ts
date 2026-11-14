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
 * `const TChecks` (TypeScript 5.0's `const` type parameter modifier) keeps
 * each check's own configuration (notably whether `output` is present at
 * all) from being widened during inference. Without it, TypeScript's
 * inference for a `Record` of heterogeneous generic entries does not
 * reliably preserve that per-check shape once a callback property
 * (`policy`) is also present. See `InferParsedValue` in types.ts for the
 * related limitation this does not fully solve.
 *
 * `TChecks` is inferred from the plain, unwrapped `RepoContractConfig<TChecks>`
 * position: the `ValidatedCheckSchema<TChecks>` constraint on `checks` is
 * intersected in afterward, computed from that already-inferred `TChecks`,
 * rather than substituted in its place. Inferring `TChecks` directly from a
 * mapped/conditional type over itself (as `ValidatedCheckSchema` is) loses
 * the contextual typing every check's `policy` callback otherwise gets:
 * another real, confirmed TypeScript inference limitation, distinct from
 * the `output`-to-`policy` one above.
 * @param config - the config to type-check and return unchanged.
 * @returns the same `config` object, untouched and uncloned.
 * @public
 */
export function defineRepoContract<const TChecks extends CheckSchema>(
  config: RepoContractConfig<TChecks> & { readonly checks: ValidatedCheckSchema<TChecks> },
): RepoContractConfig<TChecks> {
  return config
}
