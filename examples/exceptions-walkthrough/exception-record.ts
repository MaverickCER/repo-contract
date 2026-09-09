/**
 * The shape of one waiver in `exceptions.json`, and a hand-written Standard Schema that validates
 * the whole `exceptions` array.
 *
 * `repo-contract/helpers` does not install or depend on Zod, Valibot, or ArkType -- `loadExceptionRegistry`
 * takes any [Standard Schema](https://standardschema.dev). A real project would almost always reach
 * for whichever schema library it already uses; this file hand-writes one instead, with no
 * dependency, to show that the interface is small enough to satisfy directly.
 */
import type { StandardSchemaV1 } from "repo-contract/helpers"

/** One justified, versioned exception to an otherwise-blocking advisory. */
export interface AdvisoryException {
  /** `<package>:<advisoryId>` -- matches `deriveAdvisoryId` in findings.ts. */
  readonly id: string
  /** Bumped whenever `justification` or `alternatives` is edited, so a stale sign-off is visible. */
  readonly version: number
  /** Why this advisory is acceptable in this repository, specifically. */
  readonly justification: string
  /** What was considered instead, and what would end the waiver. */
  readonly alternatives: string
}

// Structurally required and non-empty. `alternatives` is checked separately: it must be a string,
// but may be empty here -- whether an empty `alternatives` is *acceptable* is a policy question
// (`evaluateExceptionRecord`'s `missing`), not a schema question.
const NON_EMPTY_STRING_FIELDS = ["id", "justification"] as const

/** The fields a reviewer signs off on -- see `hashRequirementFields` usage in exception-policy.ts. */
export const SIGNED_OFF_FIELDS = ["justification", "alternatives"] as const

/** Reads one field's current string value off a record (`""` when absent or non-string). */
export function advisoryFieldValue(record: AdvisoryException, requirement: string): string {
  const value = (record as unknown as Record<string, unknown>)[requirement]
  return typeof value === "string" ? value : ""
}

export const advisoryExceptionsSchema: StandardSchemaV1<unknown, readonly AdvisoryException[]> = {
  "~standard": {
    version: 1,
    vendor: "exceptions-walkthrough",
    validate: (value) => {
      if (!Array.isArray(value)) {
        return { issues: [{ message: "the `exceptions` array is missing or not an array" }] }
      }

      const issues: { message: string; path: (string | number)[] }[] = []

      value.forEach((raw, index) => {
        if (raw === null || typeof raw !== "object") {
          issues.push({ message: "each exception must be an object", path: [index] })
          return
        }
        const record = raw as Record<string, unknown>
        for (const field of NON_EMPTY_STRING_FIELDS) {
          if (typeof record[field] !== "string" || record[field] === "") {
            issues.push({ message: `${field} must be a non-empty string`, path: [index, field] })
          }
        }
        if (typeof record["alternatives"] !== "string") {
          issues.push({ message: "alternatives must be a string", path: [index, "alternatives"] })
        }
        if (typeof record["version"] !== "number") {
          issues.push({ message: "version must be a number", path: [index, "version"] })
        }
      })

      if (issues.length > 0) return { issues }

      return {
        value: value.map((raw) => {
          const record = raw as Record<string, unknown>
          return {
            id: record["id"] as string,
            version: record["version"] as number,
            justification: record["justification"] as string,
            alternatives: record["alternatives"] as string,
          }
        }),
      }
    },
  },
}
