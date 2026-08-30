import type { CheckDefinitionConfig } from "../types.js"
import { checkDependencyInstalled } from "./shared/missing-dependency.js"
import { checkTerminatedAbnormally } from "./shared/terminal-status.js"

/** linkinator's own `--format json` contract -- not published as a TypeScript type by the tool. */
interface LinkinatorLink {
  readonly url: string
  readonly status: number
  readonly state: "OK" | "BROKEN" | "SKIPPED"
  readonly parent?: string
}

interface LinkinatorReport {
  readonly links: readonly LinkinatorLink[]
}

/** Options accepted by {@link brokenLinks}. */
interface BrokenLinksOptions {
  /** File or directory passed straight through to linkinator as its positional target. Defaults to `"."`. */
  readonly start?: string
}

/**
 * @param link One linkinator link result with `state === "BROKEN"`.
 * @returns A single-line `url -- HTTP status (linked from parent)` summary.
 */
function formatBrokenLink(link: LinkinatorLink): string {
  const parent = link.parent ? ` (linked from ${link.parent})` : ""

  return `${link.url} -- HTTP ${String(link.status)}${parent}`
}

/**
 * Broken-link detection via linkinator, recursing through local files and
 * following both local and remote links. `--skip node_modules` avoids
 * wasting the crawl on vendored files that were never authored content.
 * @param options - configuration for this check; see {@link BrokenLinksOptions}.
 * @returns the configured check.
 */
export function brokenLinks(options: BrokenLinksOptions = {}): CheckDefinitionConfig {
  const { start = "." } = options

  return {
    run: ["linkinator", start, "--recurse", "--format", "json", "--skip", "node_modules"],
    output: { format: "json" },
    policy: ({ result }) => {
      const missing = checkDependencyInstalled(result, "linkinator")
      if (missing) return missing

      const terminated = checkTerminatedAbnormally(result, "linkinator")
      if (terminated) return terminated

      if (!result.output?.success) {
        return { outcome: "fail", rationale: "linkinator output could not be parsed as JSON." }
      }

      // Valid JSON of an unexpected shape (a future linkinator reporter
      // change, `null`, a primitive, or any leading non-JSON line that still
      // parses to something without `.links`) must produce a clean fail, not
      // a TypeError that escapes the policy and crashes the whole run --
      // matching how dead-code.ts / duplication.ts guard their own reports.
      const value: unknown = result.output.value

      if (typeof value !== "object" || value === null) {
        return { outcome: "fail", rationale: "linkinator produced invalid JSON report data." }
      }

      const report = value as LinkinatorReport

      if (!Array.isArray(report.links)) {
        return { outcome: "fail", rationale: "linkinator produced invalid JSON report data." }
      }

      // Re-annotated rather than used directly: `Array.isArray` narrows to
      // `any[]` regardless of the checked value's declared type.
      const links: readonly LinkinatorLink[] = report.links
      const brokenLinkResults = links.filter((link) => link.state === "BROKEN")

      if (brokenLinkResults.length === 0) {
        return {
          outcome: "pass",
          rationale: `linkinator found 0 broken link(s) across ${String(links.length)} checked.`,
        }
      }

      return {
        outcome: "fail",
        rationale: [
          `linkinator found ${String(brokenLinkResults.length)} broken link(s):`,
          ...brokenLinkResults.map((link) => `- ${formatBrokenLink(link)}`),
        ].join("\n"),
      }
    },
  }
}
