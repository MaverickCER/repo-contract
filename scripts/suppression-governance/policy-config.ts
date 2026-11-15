import type {
  ExceptionCategoryGroup,
  ExceptionPolicy,
  ExceptionPolicyConfig,
} from "../../src/helpers/index.js"

/**
 * Single source of truth for the repository's suppression-justification policy, imported by
 * checks/suppression-governance.ts's policy. It follows the "one exported const, imported by the
 * script/check that gates on it" convention of scripts/coverage-thresholds.mjs. That file is
 * imported by both scripts/report-coverage.mjs and checks/coverage.ts.
 * repo-contract has no runtime config-merging mechanism. A maintainer customizes this policy by
 * editing this file, the same way as the coverage thresholds.
 *
 * The check never auto-generates `justification`/`category`/`verificationMethod` (see check.ts).
 * A record that reconciliation scaffolds starts with all three empty.
 * A developer justifies a scaffolded record by editing those fields in disable-comments.json:
 *   - `justification`: why this guardrail is deliberately bypassed for an approved reason, what
 *     alternatives were considered, and what was checked to confirm the finding is real.
 *   - `category`: what kind of suppression this is, from a fixed set (see evidence-types.ts's
 *     `SUPPRESSION_CATEGORIES`).
 *   - `verificationMethod`: how the claim above was substantiated, from a fixed set (see
 *     evidence-types.ts's `VERIFICATION_METHODS`).
 * The next run preserves those fields verbatim as long as the suppression's identity
 * (`suppression:<domain>:<rule>:<file>:<line>`) is still found. Moving a directive to a new line
 * makes its old record stale and scaffolds a fresh blank stub. Both fail the build until a human
 * carries the justification across. No move detection is attempted.
 *
 * `SuppressionPolicy`/`SuppressionDomainPolicy`/`SuppressionPolicyConfig` are thin aliases of
 * `repo-contract/helpers`'s classification-neutral `ExceptionPolicy`/`ExceptionCategoryGroup`/
 * `ExceptionPolicyConfig` (see specs/decisions/0013-reusable-exception-policy-helper.md). This
 * file is the suppression-governance domain's instantiation of that generic pattern. `group`
 * is a suppression's `domain` (`"eslint"`, `"typescript"`, `"stryker"`, ...), and `category` is
 * one of its `rule` entries. Aliasing rather than redeclaring keeps this file's literal
 * `suppressionPolicy` value assignable to the check's resolver with no adapter code. The
 * cost is that the `requirements` array widens from the closed `SuppressionRequirement` union to
 * a plain `readonly string[]` at the type level. `checks/suppression-governance.ts` recovers that
 * narrower check at runtime via `validateExceptionPolicyConfig(suppressionPolicy,
 * VALID_REQUIREMENTS)`.
 */

/**
 * One of the fixed, named fields a `SuppressionPolicy`'s `"exception"` mode can require.
 * `"justification"` is free-prose and hand-authored. `"category"`/`"verificationMethod"` are
 * hand-authored the
 * same way but are closed enumerations rather than free prose. For them, "filled in" means "one
 * of a fixed, reviewable set of classifications", not "some prose exists". `"reason"` is
 * different in kind. A domain's recognizer (recognizers.ts) derives it mechanically from the
 * directive comment's text, and it lives on the *finding*, not the record. Requiring it
 * forces the author to write inline rationale at the suppression site. Any domain may require any
 * of these; today only `stryker` requires `"reason"`.
 */
export type SuppressionRequirement = "justification" | "category" | "verificationMethod" | "reason"

/**
 * The three hand-authored record fields every non-`stryker` `"exception"` policy requires.
 * A content-bound sign-off gate (`verifiedBy`/`verifiedContentHash`) is deferred with the
 * PR-approval attestation work. See the deferred-gaps list in
 * specs/decisions/0013-reusable-exception-policy-helper.md.
 */
const BASE_EXCEPTION_REQUIREMENTS: readonly SuppressionRequirement[] = [
  "justification",
  "category",
  "verificationMethod",
]

/** `BASE_EXCEPTION_REQUIREMENTS` plus `"reason"`: the `stryker` domain additionally requires the mechanically-derived reason text on the finding. Derived, not re-listed, so the two can never silently diverge. */
const STRYKER_EXCEPTION_REQUIREMENTS: readonly SuppressionRequirement[] = [
  ...BASE_EXCEPTION_REQUIREMENTS,
  "reason",
]

/**
 * `"forbidden"`: the suppression is never permitted, regardless of justification.
 * `"allowed"`: the suppression is permitted unconditionally; no justification required.
 * `"exception"`: the suppression is permitted only once every field named in `requirements` is a
 * non-empty string on the record.
 *
 * Deliberately not a numeric "how many details are required" threshold.
 * Generic filler entries satisfy a plain count without doing the underlying work.
 * Naming which fields must be filled in makes each one reviewable against a specific question.
 *
 * An alias of `repo-contract/helpers`'s `ExceptionPolicy`: see this file's module doc
 * comment above for why aliasing rather than redeclaring.
 */
export type SuppressionPolicy = ExceptionPolicy

/**
 * `default` is this domain's fallback policy for any rule with no exact or pattern match in
 * `rules`. `repo-contract/helpers`'s `resolveExceptionPolicy` has the full exact > pattern >
 * domain-default > global-default precedence. Omit `default` to fall through to
 * `GLOBAL_DEFAULT_POLICY` instead.
 *
 * An alias of `repo-contract/helpers`'s `ExceptionCategoryGroup`.
 */
export type SuppressionDomainPolicy = ExceptionCategoryGroup

/** An alias of `repo-contract/helpers`'s `ExceptionPolicyConfig`. */
export type SuppressionPolicyConfig = ExceptionPolicyConfig

/** Used when a suppression's `domain` has no entry in `suppressionPolicy` at all: the strictest non-forbidding policy. Requires the three hand-authored record fields (not `reason`, which is a `stryker`-only mechanically-derived finding field). */
export const GLOBAL_DEFAULT_POLICY: SuppressionPolicy = {
  mode: "exception",
  requirements: BASE_EXCEPTION_REQUIREMENTS,
}

export const suppressionPolicy: SuppressionPolicyConfig = {
  eslint: {
    default: {
      mode: "exception",
      requirements: BASE_EXCEPTION_REQUIREMENTS,
    },
    rules: {
      "security/*": {
        mode: "forbidden",
      },
      // Every disable needs a written record, like the rest.
      "no-console": {
        mode: "exception",
        requirements: BASE_EXCEPTION_REQUIREMENTS,
      },
      "react-hooks/exhaustive-deps": {
        mode: "exception",
        requirements: BASE_EXCEPTION_REQUIREMENTS,
      },
    },
  },

  typescript: {
    default: {
      mode: "exception",
      requirements: BASE_EXCEPTION_REQUIREMENTS,
    },
    rules: {
      "@ts-ignore": {
        mode: "forbidden",
      },
      // Whole-file type-checking opt-out: strictly broader than `@ts-ignore`,
      // which is already forbidden, so this is too.
      "@ts-nocheck": {
        mode: "forbidden",
      },
      // An expected type error is a deliberate hole in the type-check, so it gets a record.
      "@ts-expect-error": {
        mode: "exception",
        requirements: BASE_EXCEPTION_REQUIREMENTS,
      },
    },
  },

  // Code hidden from the coverage report escapes the `coverage` thresholds. Each directive carries
  // a record saying why the lines cannot run in-process (today: Windows-only and OS-signal paths).
  coverage: {
    default: {
      mode: "exception",
      requirements: BASE_EXCEPTION_REQUIREMENTS,
    },
    rules: {
      // Hiding a whole file from coverage is never acceptable.
      "*-ignore-file": {
        mode: "forbidden",
      },
    },
  },

  stryker: {
    default: {
      mode: "exception",
      requirements: STRYKER_EXCEPTION_REQUIREMENTS,
    },
    rules: {
      // Stryker's literal "disable all mutators" token, not a glob. This must stay the exact
      // string ("all"), never "*", which would glob-match every mutator name.
      // The `STRYKER_DIRECTIVE` comment in recognizers.ts explains why.
      all: {
        mode: "forbidden",
      },
    },
  },
}
