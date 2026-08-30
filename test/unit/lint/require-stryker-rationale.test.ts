import { RuleTester } from "eslint"
import { describe, it } from "vitest"
import requireStrykerRationale from "../../../eslint-rules/require-stryker-rationale.mjs"

// eslint's RuleTester supports any test framework that exposes describe/it
// via these static hooks -- wiring vitest's directly avoids adding a
// mocha-shaped dependency just for this one file.
RuleTester.describe = describe
RuleTester.it = it

/**
 * Proves this rule discriminates a genuine adjacent rationale from an
 * absent one -- not just that it runs -- the same "rule quality, not rule
 * existence" standard test/unit/architecture/rules.test.ts applies to the
 * dependency-cruiser layering rule.
 */
const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
})

ruleTester.run("require-stryker-rationale", requireStrykerRationale, {
  valid: [
    `
      // Real explanation of why this branch is safe to exempt from mutation testing.
      // Stryker disable next-line all
      if (x) y()
    `,
    // Rationale separated from the directive by an intervening, directive-only
    // v8-ignore marker -- the common spawn-check.ts/run-checks.ts shape.
    `
      // Real explanation of why this branch is safe to exempt from mutation testing.
      /* v8 ignore start */
      // Stryker disable all
      if (x) y()
      // Stryker restore all
      /* v8 ignore stop */
    `,
    // Rationale combined with the v8-ignore marker inside the same comment.
    `
      /* v8 ignore start -- real explanation of why this is unreachable in a real process */
      // Stryker disable all
      if (x) y()
    `,
    // No Stryker directive present -- the rule has nothing to flag.
    `if (x) y()`,
  ],
  invalid: [
    {
      // Immediately preceded by code, not a comment.
      code: `
        if (x) y()
        // Stryker disable next-line all
        if (z) w()
      `,
      errors: [{ messageId: "missingRationale" }],
    },
    {
      // A directive-only comment immediately above carries no rationale of
      // its own.
      code: `
        // Stryker restore all
        // Stryker disable next-line all
        if (x) y()
      `,
      errors: [{ messageId: "missingRationale" }],
    },
    {
      // A blank line between the rationale and the directive breaks
      // adjacency -- the rule requires the explanation to sit with the
      // directive it justifies, not merely exist somewhere above it.
      code: `
        // Real explanation.

        // Stryker disable next-line all
        if (x) y()
      `,
      errors: [{ messageId: "missingRationale" }],
    },
  ],
})
