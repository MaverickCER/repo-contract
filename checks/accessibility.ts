import { requireParsedOutput } from "./shared/require-parsed-output.js"
import type { CheckDefinitionConfig } from "../src/types.js"

/** One pa11y finding, `--reporter json` shape -- not published as a TypeScript type by the tool. */
interface Pa11yFinding {
  readonly code: string
  readonly type: "error" | "warning" | "notice"
  readonly message: string
  readonly context: string | null
  readonly selector: string
}

type ToolResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string }

/**
 * @param finding One pa11y finding.
 * @returns A single-line `selector [code]: message` summary.
 */
function formatFinding(finding: Pa11yFinding): string {
  return `${finding.selector} [${finding.code}]: ${finding.message}`
}

// Runs pa11y (WCAG2AA, its default standard) against docs/index.html via a
// real headless-Chromium accessibility tree, not static markup analysis --
// see scripts/check-accessibility.mjs's own doc comment and
// specs/decisions/0008-self-hosting-tool-and-dependency-choices.md for why
// this tool was chosen. "error"-type findings fail; "warning" surfaces as
// warn (never blocks); "notice" is too noisy relative to its actionability
// to gate on and is dropped from the rationale entirely.
export const accessibility: CheckDefinitionConfig = {
  run: ["node", "scripts/check-accessibility.mjs"],
  output: { format: "json" },
  policy: ({ result }) => {
    const parsed = requireParsedOutput<ToolResult<readonly Pa11yFinding[]>>(
      result.output,
      "Accessibility check output could not be parsed as JSON.",
    )
    if (!parsed.ok) return parsed.result

    const evidence = parsed.value

    if (!evidence.ok) {
      return { outcome: "fail", rationale: `pa11y could not be evaluated: ${evidence.error}` }
    }

    const errors = evidence.value.filter((finding) => finding.type === "error")
    const warnings = evidence.value.filter((finding) => finding.type === "warning")

    if (errors.length > 0) {
      return {
        outcome: "fail",
        rationale: [
          `pa11y reported ${String(errors.length)} WCAG2AA error(s) against docs/index.html:`,
          ...errors.map((finding) => `- ${formatFinding(finding)}`),
        ].join("\n"),
      }
    }

    if (warnings.length > 0) {
      return {
        outcome: "warn",
        rationale: [
          `pa11y reported 0 errors, but ${String(warnings.length)} warning(s):`,
          ...warnings.map((finding) => `- ${formatFinding(finding)}`),
        ].join("\n"),
      }
    }

    return {
      outcome: "pass",
      rationale: `pa11y reported 0 WCAG2AA issues against docs/index.html (${String(evidence.value.length)} finding(s) total, all informational).`,
    }
  },
}
