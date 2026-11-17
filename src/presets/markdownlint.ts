import { readFile } from "node:fs/promises"
import type { CheckDefinitionConfig } from "../types.js"
import { judgeMarkdownlintExit, markdownlintArguments } from "./rules/markdownlint-exit.js"
import { combinedOutput } from "./shared/exit-code-fail-rationale.js"
import { checkDependencyInstalled } from "./shared/missing-dependency.js"
import { readJsonReport } from "./shared/read-json-report.js"
import { checkTerminatedAbnormally } from "./shared/terminal-status.js"
import { checkOptionsObject } from "./rules/option-checks.js"

/**
 * markdownlint-cli2 has no stdout JSON mode. This describes its JSON
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
export interface MarkdownlintOptions {
  /** Glob passed straight through to markdownlint-cli2 as its positional target. Defaults to `"**\/*.md"`. Ignored when `globs` is set. */
  readonly glob?: string
  /** Globs passed to markdownlint-cli2 in place of `glob`. Explicit globs such as `["*.md", "docs/**\/*.md"]` keep the run out of `node_modules`. */
  readonly globs?: readonly string[]
  /** A markdownlint config file, passed as `--config`. */
  readonly config?: string
  /** How the verdict is read. `"json"` (the default) reads the JSON formatter's report file. `"exit-code"` reads the exit code and printed output, so no formatter is needed. */
  readonly verdict?: "json" | "exit-code"
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
 * Markdown structure/style lint via markdownlint-cli2. The default `"json"` verdict reads a
 * report file whose path comes from config, not a CLI flag. markdownlint-cli2 writes JSON only
 * when its config asks for it, so this verdict assumes the consumer's `.markdownlint-cli2.jsonc`
 * includes:
 * ```jsonc
 * "outputFormatters": [["markdownlint-cli2-formatter-json", { "name": "reports/markdownlint.json" }]]
 * ```
 * which also requires the `markdownlint-cli2-formatter-json` package alongside
 * `markdownlint-cli2` itself. The `"exit-code"` verdict needs neither: it reads the exit code and
 * the printed findings.
 * @param options - configuration for this check; see {@link MarkdownlintOptions}.
 * @returns the configured check.
 * @throws {TypeError} when `options` is not an object.
 * @throws {RangeError} when `globs` is an empty list.
 * @beta
 */
export function markdownlint(options: MarkdownlintOptions = {}): CheckDefinitionConfig {
  checkOptionsObject("markdownlint", options)
  const { glob = "**/*.md", globs, config, verdict = "json" } = options

  return {
    run: ["markdownlint-cli2", ...markdownlintArguments({ glob, globs, config })],
    policy: async ({ result }) => {
      const missing = checkDependencyInstalled(result, "markdownlint-cli2")
      if (missing) return missing

      const terminated = checkTerminatedAbnormally(result, "markdownlint-cli2")
      if (terminated) return terminated

      if (verdict === "exit-code") {
        return judgeMarkdownlintExit({
          exitCode: result.exitCode,
          output: combinedOutput(result),
        })
      }

      const parsed = await readJsonReport<readonly MarkdownlintFinding[]>(
        // Provably equivalent, not a coverage gap: see the identical
        // comment in src/presets/duplication.ts for why.
        () => readFile(REPORT_PATH, "utf8"),
        "markdownlint-cli2 did not produce its expected JSON report. Confirm your " +
          ".markdownlint-cli2.jsonc configures outputFormatters to write " +
          `"${REPORT_PATH}" (requires the markdownlint-cli2-formatter-json package).`,
        "markdownlint-cli2 produced invalid JSON evidence.",
      )
      if (!parsed.ok) return parsed.result

      // `readJsonReport<T>` narrows only at the type level: the parsed
      // value is `unknown` at runtime. Valid JSON that isn't an array (an
      // object from a different/older formatter, `null`) must fail cleanly.
      // It must not throw `.length`/`.map` out of the policy and crash the
      // run. duplication.ts's `Array.isArray` guard does the same.
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
