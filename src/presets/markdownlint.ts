import { readFile } from "node:fs/promises"
import type { CheckDefinitionConfig } from "../types.js"
import { checkDependencyInstalled } from "./shared/missing-dependency.js"
import { readJsonReport } from "./shared/read-json-report.js"
import { checkTerminatedAbnormally } from "./shared/terminal-status.js"

/**
 * markdownlint-cli2 has no stdout JSON mode -- this describes its own JSON
 * output-formatter contract (markdownlint-cli2-formatter-json), read back
 * from disk. Not published as a TypeScript type by either package.
 */
interface MarkdownlintFinding {
  readonly fileName: string
  readonly lineNumber: number
  readonly ruleNames: readonly string[]
  readonly ruleDescription: string
  readonly errorDetail: string | null
  readonly severity: "error" | "warning"
}

/** Options accepted by {@link markdownlint}. */
interface MarkdownlintOptions {
  /** Glob passed straight through to markdownlint-cli2 as its positional target. Defaults to `"**\/*.md"`. */
  readonly glob?: string
}

const REPORT_PATH = "reports/markdownlint.json"

/**
 * @param finding One markdownlint-cli2 finding.
 * @returns A single-line `file:line [rule]: description (detail)` summary.
 */
function formatFinding(finding: MarkdownlintFinding): string {
  const rule = finding.ruleNames.join("/")
  const detail = finding.errorDetail ? ` (${finding.errorDetail})` : ""

  return `${finding.fileName}:${String(finding.lineNumber)} [${rule}]: ${finding.ruleDescription}${detail}`
}

/**
 * Markdown structure/style lint via markdownlint-cli2. Unlike this
 * package's other file-based-report presets, the report path is
 * config-driven rather than a CLI flag -- markdownlint-cli2 only writes
 * JSON when its own config file requests it. This preset assumes the
 * consumer's `.markdownlint-cli2.jsonc` includes:
 * ```jsonc
 * "outputFormatters": [["markdownlint-cli2-formatter-json", { "name": "reports/markdownlint.json" }]]
 * ```
 * which also requires the `markdownlint-cli2-formatter-json` package
 * alongside `markdownlint-cli2` itself.
 * @param options - configuration for this check; see {@link MarkdownlintOptions}.
 * @returns the configured check.
 */
export function markdownlint(options: MarkdownlintOptions = {}): CheckDefinitionConfig {
  const { glob = "**/*.md" } = options

  return {
    run: ["markdownlint-cli2", glob],
    policy: async ({ result }) => {
      const missing = checkDependencyInstalled(result, "markdownlint-cli2")
      if (missing) return missing

      const terminated = checkTerminatedAbnormally(result, "markdownlint-cli2")
      if (terminated) return terminated

      const parsed = await readJsonReport<readonly MarkdownlintFinding[]>(
        // Provably equivalent, not a coverage gap -- see the identical
        // comment in src/presets/duplication.ts for why.
        // Stryker disable next-line StringLiteral -- JSON.parse coerces via toString(), which defaults to utf8 for a Buffer, so parsing succeeds identically either way
        () => readFile(REPORT_PATH, "utf8"),
        "markdownlint-cli2 did not produce its expected JSON report -- confirm your " +
          ".markdownlint-cli2.jsonc configures outputFormatters to write " +
          `"${REPORT_PATH}" (requires the markdownlint-cli2-formatter-json package).`,
        "markdownlint-cli2 produced invalid JSON evidence.",
      )
      if (!parsed.ok) return parsed.result

      // `readJsonReport<T>` narrows only at the type level -- the parsed
      // value is `unknown` at runtime. Valid JSON that isn't an array (an
      // object from a different/older formatter, `null`) must fail cleanly
      // rather than throw `.length`/`.map` out of the policy and crash the
      // run, matching duplication.ts's `Array.isArray` guard.
      if (!Array.isArray(parsed.value)) {
        return {
          outcome: "fail",
          rationale: "markdownlint-cli2 produced invalid JSON report data.",
        }
      }

      const findings: readonly MarkdownlintFinding[] = parsed.value

      if (findings.length === 0) {
        return { outcome: "pass", rationale: "markdownlint-cli2 reported 0 issues." }
      }

      return {
        outcome: "fail",
        rationale: [
          `markdownlint-cli2 reported ${String(findings.length)} issue(s):`,
          ...findings.map((finding) => `- ${formatFinding(finding)}`),
        ].join("\n"),
      }
    },
  }
}
