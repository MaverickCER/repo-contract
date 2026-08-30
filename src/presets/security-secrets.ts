import { readFile } from "node:fs/promises"
import type { CheckDefinitionConfig } from "../types.js"
import { checkDependencyInstalled } from "./shared/missing-dependency.js"
import { readJsonReport } from "./shared/read-json-report.js"
import { checkTerminatedAbnormally } from "./shared/terminal-status.js"

interface SecretlintMessage {
  readonly message: string
  readonly line: number
  readonly column: number
  readonly ruleId?: string
  readonly severity?: number
}

interface SecretlintResult {
  readonly filePath: string
  readonly messages: readonly SecretlintMessage[]
}

// Secret values are deliberately excluded from the policy output. The
// location and rule identify the remediation target without turning the
// contract result itself into another secret-disclosure channel. Requires
// the consumer's own secretlint config (secretlint has no built-in rules).
/** Secret-leak scanning via secretlint. */
export const securitySecrets: CheckDefinitionConfig = {
  run: ["secretlint", "--format", "json", "--output", "reports/secretlint.json", "**/*"],
  policy: async ({ result }) => {
    const missing = checkDependencyInstalled(result, "secretlint")
    if (missing) return missing

    const terminated = checkTerminatedAbnormally(result, "Secretlint")
    if (terminated) return terminated

    const parsed = await readJsonReport<readonly SecretlintResult[]>(
      // Provably equivalent, not a coverage gap -- see the identical
      // comment in src/presets/duplication.ts for why.
      // Stryker disable next-line StringLiteral -- JSON.parse coerces via toString(), which defaults to utf8 for a Buffer, so parsing succeeds identically either way
      () => readFile("reports/secretlint.json", "utf8"),
      "Secretlint did not produce its expected JSON report.",
      "Secretlint produced invalid JSON evidence.",
    )
    if (!parsed.ok) return parsed.result

    // `readJsonReport<T>` narrows only at the type level; valid JSON that
    // isn't an array must fail cleanly rather than throw `.flatMap` out of
    // the policy and crash the run.
    if (!Array.isArray(parsed.value)) {
      return { outcome: "fail", rationale: "Secretlint produced invalid JSON report data." }
    }

    const results: readonly SecretlintResult[] = parsed.value

    const findings = results.flatMap((file: SecretlintResult) =>
      file.messages.map((message: SecretlintMessage) => ({
        file: file.filePath,
        line: message.line,
        column: message.column,
        ruleId: message.ruleId,
      })),
    )

    if (findings.length === 0) {
      return { outcome: "pass", rationale: "Secretlint found 0 potential secrets." }
    }

    const details = findings.map((finding) => {
      const rule = finding.ruleId ? ` [${finding.ruleId}]` : ""

      return `${finding.file}:${String(finding.line)}:${String(finding.column)}${rule}`
    })

    return {
      outcome: "fail",
      rationale: [
        `Secretlint found ${String(findings.length)} potential secret(s):`,
        ...details.map((detail: string) => `- ${detail}`),
        "Potential secret values are intentionally omitted. Remove the secret, replace it with an appropriate secret-management mechanism, and rotate any credential that may already have been exposed.",
      ].join("\n"),
    }
  },
}
