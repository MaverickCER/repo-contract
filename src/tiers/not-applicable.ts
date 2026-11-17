import { readFile } from "node:fs/promises"
import type { CheckDefinitionConfig, PolicyResult } from "../types.js"

/**
 * @param id - the check id, for the rationale.
 * @returns the not-applicable pass when package.json in the working directory sets
 * `"private": true`; nothing otherwise. A missing or unreadable manifest counts as public, so the
 * wrapped check still judges.
 */
async function notApplicable(id: string): Promise<PolicyResult | undefined> {
  try {
    // A manifest of `null` throws on `.private` and lands in the catch, as unreadable JSON does.
    const manifest = JSON.parse(await readFile("package.json", "utf8")) as {
      readonly private?: unknown
    }
    if (manifest.private !== true) return undefined
  } catch {
    return undefined
  }
  return {
    outcome: "pass",
    rationale: `${id} is not applicable: package.json sets "private": true, so the package is never published.`,
  }
}

/**
 * Wraps a library-only check so it passes as not applicable on a `private: true` package. A
 * private app can then run `strict`, which sits on `library`. The policy reads `package.json` in
 * the working directory, not the check's `cwd`, as the report-reading presets do. The check's own
 * policy runs when the package is not private. Its process runs either way; only the verdict
 * changes.
 * @param id - the check id, for the rationale.
 * @param check - the library-only check.
 * @returns the wrapped check.
 */
export function passWhenPrivate<Check extends CheckDefinitionConfig>(
  id: string,
  check: Check,
): Check {
  return {
    ...check,
    policy: async (context): Promise<PolicyResult> =>
      (await notApplicable(id)) ?? check.policy(context),
  }
}
