import { stat } from "node:fs/promises"
import { resolve } from "node:path"
import type { CheckDefinitionConfig } from "../types.js"
import {
  type BrokenLinksStart,
  type CheckedLink,
  crawlArguments,
  judgeLinks,
  linksToProbe,
} from "./rules/link-results.js"
import { checkDependencyInstalled } from "./shared/missing-dependency.js"
import { checkTerminatedAbnormally } from "./shared/terminal-status.js"
import { checkOptionsObject } from "./rules/option-checks.js"

/** linkinator's `--format json` contract: not published as a TypeScript type by the tool. */
interface LinkinatorReport {
  readonly links: readonly CheckedLink[]
}

// Declared beside the rule that reads it, so the rule never imports this file back.
export type { BrokenLinksStart }

/** Options accepted by {@link brokenLinks}. */
export interface BrokenLinksOptions {
  /**
   * Where the crawl starts. A string is one HTML start point. Defaults to `"."`. A list runs one
   * crawl over every start point, served from the working directory. linkinator's Markdown mode
   * is all or nothing, so one `"markdown"` start turns it on for the whole crawl.
   */
  readonly start?: string | readonly BrokenLinksStart[]
}

/**
 * Broken-link detection via linkinator, recursing through local files and following both local
 * and remote links. `--skip node_modules` avoids wasting the crawl on vendored files that were
 * never authored content. A link that answered HTTP 429 passes, since a rate limit says nothing
 * about whether the page exists. A local link linkinator could not serve passes when it exists
 * on disk, resolved from the working directory: linkinator reports a bare directory link as
 * broken, though every git host renders it.
 * @param options - configuration for this check; see {@link BrokenLinksOptions}.
 * @returns the configured check.
 * @throws {TypeError} when `options` is not an object.
 * @throws {RangeError} when `start` is an empty list.
 * @beta
 */
export function brokenLinks(options: BrokenLinksOptions = {}): CheckDefinitionConfig {
  checkOptionsObject("brokenLinks", options)
  const { start = "." } = options

  return {
    run: ["linkinator", ...crawlArguments(start), "--format", "json", "--skip", "node_modules"],
    output: { format: "json" },
    policy: async ({ result }) => {
      const missing = checkDependencyInstalled(result, "linkinator")
      if (missing) return missing

      const terminated = checkTerminatedAbnormally(result, "linkinator")
      if (terminated) return terminated

      if (!result.output?.success) {
        return { outcome: "fail", rationale: "linkinator output could not be parsed as JSON." }
      }

      // Valid JSON of an unexpected shape must produce a clean fail, not a
      // TypeError that escapes the policy and crashes the whole run. A future
      // linkinator reporter change can cause it, as can `null`, a primitive, or a
      // leading non-JSON line that parses to something without `.links`.
      // `dead-code.ts` and `duplication.ts` guard their reports the same way.
      const value: unknown = result.output.value

      if (typeof value !== "object" || value === null) {
        return { outcome: "fail", rationale: "linkinator produced invalid JSON report data." }
      }

      const report = value as LinkinatorReport

      if (!Array.isArray(report.links)) {
        return { outcome: "fail", rationale: "linkinator produced invalid JSON report data." }
      }

      // Probed up front because the judgement is synchronous. Each path is relative and has no
      // `..` segment, so it resolves inside the working directory.
      const onDisk = new Set<string>()
      await Promise.all(
        linksToProbe(report.links).map(async (local) => {
          const found = await stat(resolve(local)).then(
            () => true,
            () => false,
          )
          if (found) onDisk.add(local)
        }),
      )

      return judgeLinks({ links: report.links, existsLocally: (local) => onDisk.has(local) })
    },
  }
}
