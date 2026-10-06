import type { CheckSchema, Evidence, Verdict } from "../types.js"

/**
 * Options for {@link renderMarkdownSummary}.
 * @public
 */
export interface RenderMarkdownSummaryOptions {
  /** Heading text; defaults to `"Contract"`. */
  readonly title?: string
  /** How many of the slowest checks to list when `evidence` is given; defaults to 5. */
  readonly slowest?: number
}

const ORDER = ["fail", "warn", "pass"] as const
const HEADINGS = { fail: "Failed", warn: "Warnings", pass: "Passed" } as const

/**
 * The first line of a rationale, which is the part a summary row needs.
 * @param text - A rationale.
 * @returns Everything before its first newline.
 */
function firstLine(text: string): string {
  // Everything up to the first newline; the appended one makes a single line end the same way.
  return text.slice(0, `${text}\n`.indexOf("\n"))
}

/**
 * Renders a run's verdict (and, if given, its evidence) as GitHub-flavored Markdown suitable for
 * `$GITHUB_STEP_SUMMARY`, a pull-request comment or a README badge page: totals first, then every
 * failing check with its complete rationale (so nothing needs re-running to see why), every warning
 * and passing check with the first line of its rationale, and -- when the evidence is supplied -- the
 * slowest checks, which is the contract's own cost. Pure: it reads nothing and writes nothing.
 * @param verdict - The aggregated verdict of the run.
 * @param evidence - The run's evidence; optional, adds per-check timing.
 * @param options - Heading and list-length options.
 * @returns The Markdown document, ending in a newline.
 * @public
 */
export function renderMarkdownSummary<TChecks extends CheckSchema>(
  verdict: Verdict<TChecks>,
  evidence?: Evidence<TChecks>,
  options: RenderMarkdownSummaryOptions = {},
): string {
  const entries = Object.entries(verdict.checks) as [
    string,
    { readonly outcome: "pass" | "warn" | "fail"; readonly rationale: string },
  ][]
  const counts = { pass: 0, warn: 0, fail: 0 }
  for (const [, result] of entries) counts[result.outcome] += 1

  const lines = [
    `## ${options.title ?? "Contract"}: ${verdict.passed ? "passed" : "FAILED"}`,
    "",
    "| Outcome | Checks |",
    "| --- | ---: |",
    ...ORDER.map((outcome) => `| ${HEADINGS[outcome]} | ${String(counts[outcome])} |`),
    "",
  ]

  for (const outcome of ORDER) {
    const group = entries.filter(([, result]) => result.outcome === outcome)
    if (group.length === 0) continue
    lines.push(`### ${HEADINGS[outcome]}`, "")
    for (const [id, result] of group) {
      if (outcome === "fail") {
        lines.push(`#### ${id}`, "", "```text", result.rationale, "```", "")
      } else {
        lines.push(`- **${id}** -- ${firstLine(result.rationale)}`)
      }
    }
    if (outcome !== "fail") lines.push("")
  }

  if (evidence !== undefined) {
    const timed = (Object.entries(evidence.checks) as [string, { readonly durationMs: number }][])
      .sort((a, b) => b[1].durationMs - a[1].durationMs)
      .slice(0, options.slowest ?? 5)
    if (timed.length > 0) {
      lines.push("### Slowest checks", "", "| Check | Time |", "| --- | ---: |")
      for (const [id, check] of timed)
        lines.push(`| ${id} | ${(check.durationMs / 1000).toFixed(1)}s |`)
      lines.push("", `Whole run: ${(evidence.durationMs / 1000).toFixed(1)}s.`, "")
    }
  }

  return lines.join("\n")
}

/**
 * Serializes a run for storage -- stable, indented JSON with a trailing newline, one document per
 * file, matching the published `Evidence` and `Verdict` JSON Schemas (`repo-contract/schema`). The
 * caller decides where to write them; this package never touches the filesystem.
 * @param run - The result of `runRepoContract`.
 * @param run.evidence - The run's evidence.
 * @param run.verdict - The run's verdict.
 * @returns The two documents as strings.
 * @public
 */
export function serializeRun<TChecks extends CheckSchema>(run: {
  readonly evidence: Evidence<TChecks>
  readonly verdict: Verdict<TChecks>
}): { readonly evidence: string; readonly verdict: string } {
  return {
    evidence: `${JSON.stringify(run.evidence, null, 2)}\n`,
    verdict: `${JSON.stringify(run.verdict, null, 2)}\n`,
  }
}
