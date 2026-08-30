import type { CheckSchema, RepoContractConfig, ValidatedCheckSchema } from "../types.js"

/**
 * Identity function whose only job is type inference: authoring a config
 * through `defineRepoContract` lets each check's `output` (present or
 * absent, and which format) flow into that same check's `policy` parameter
 * type, without the consumer writing any type annotations themselves. It
 * also statically validates every check's `dependsOn` against its sibling
 * check ids (see `ValidatedCheckSchema`) -- a typo'd or self-referencing id
 * fails to compile here rather than only failing at runtime. Performs no
 * other validation and no cloning -- `runRepoContract` validates whatever
 * config it is ultimately given, whether or not it passed through this
 * function first.
 *
 * `const TChecks` (TypeScript 5.0's `const` type parameter modifier) keeps
 * each check's own configuration -- notably whether `output` is present at
 * all -- from being widened during inference; without it, TypeScript's
 * inference for a `Record` of heterogeneous generic entries does not
 * reliably preserve that per-check shape once a callback property
 * (`policy`) is also present. See `InferParsedValue` in types.ts for the
 * related limitation this does not fully solve.
 *
 * `TChecks` is inferred from the plain, unwrapped `RepoContractConfig<TChecks>`
 * position -- the `ValidatedCheckSchema<TChecks>` constraint on `checks` is
 * intersected in afterward, computed from that already-inferred `TChecks`,
 * rather than substituted in its place. Inferring `TChecks` directly from a
 * mapped/conditional type over itself (as `ValidatedCheckSchema` is) loses
 * the contextual typing every check's `policy` callback otherwise gets --
 * another real, confirmed TypeScript inference limitation, distinct from
 * the `output`-to-`policy` one above.
 * @param config - the config to type-check and return unchanged.
 * @returns the same `config` object, untouched and uncloned.
 */
export function defineRepoContract<const TChecks extends CheckSchema>(
  config: RepoContractConfig<TChecks> & { readonly checks: ValidatedCheckSchema<TChecks> },
): RepoContractConfig<TChecks> {
  return config
}
