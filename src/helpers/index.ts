/**
 * A reusable, generic exception-policy primitive -- the mechanism
 * `scripts/suppression-governance/` already built for `disable-comments.json`
 * (ADR 0006), extracted so any check can gate a finding on a named,
 * non-empty-prose exception instead of hand-rolling the same
 * exact/glob/default precedence and field-completeness logic again. Deciding
 * nothing and matching nothing: this barrel resolves a `{ group,
 * category }` classification to a policy and checks a record's own field
 * values against it -- it never decides what a "finding" is, never matches a
 * record to one, and never owns a canonical-identity concept. Those stay
 * entirely check-owned (see `checks/shared/`, unpublished) -- see
 * specs/decisions/0013-reusable-exception-policy-helper.md for the full
 * rationale and the boundary this barrel deliberately does not cross.
 *
 * Published **Experimental** (see VERSIONING.md): its TypeScript signature
 * and runtime behavior may both change in a minor or patch release, the same
 * classification `repo-contract/presets` already carries (see
 * specs/decisions/0004-public-surface-stays-narrow-no-cli-experimental-presets.md)
 * -- neither has been through a real feedback cycle yet.
 *
 * Never re-exported from the package root (`src/index.ts`) -- this is a
 * second, independent public barrel, published under its own `./helpers`
 * subpath, exactly like `src/presets/index.ts`; the two stay independent of
 * each other and of the root barrel.
 * @packageDocumentation
 */
export type {
  ExceptionCategoryGroup,
  ExceptionClassification,
  ExceptionDeterminant,
  ExceptionPolicy,
  ExceptionPolicyConfig,
  ExceptionVerdict,
} from "./exception-policy.js"
export {
  evaluateExceptionRecord,
  evaluateExceptionRecords,
  hashRequirementFields,
  resolveExceptionPolicy,
  validateExceptionPolicyConfig,
} from "./exception-policy.js"

export { loadExceptionRegistry } from "./load-exception-registry.js"
// Re-exported here (as well as from the root barrel) because `loadExceptionRegistry`'s own public
// signature names it: a consumer of `repo-contract/helpers` typing their own `schema` argument
// must be able to import the type from the same subpath the function comes from.
export type { StandardSchemaV1 } from "../standard-schema/types.js"
