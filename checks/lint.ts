import { requireParsedOutput } from "./shared/require-parsed-output.js"
import type { CheckDefinitionConfig, PolicyResult } from "../src/types.js"

/**
 * ESLint does not expose its JSON formatter result as a public LintResult
 * export in the installed version. These types describe the JSON formatter
 * contract rather than ESLint's internal Linter types.
 */
export interface EslintMessage {
  readonly ruleId: string | null
  readonly severity: 0 | 1 | 2
  readonly message: string
  readonly line: number
  readonly column: number
  readonly nodeType?: string | null
  readonly messageId?: string
  readonly endLine?: number
  readonly endColumn?: number
  readonly fix?: {
    readonly range: readonly [number, number]
    readonly text: string
  }
  readonly suggestions?: readonly {
    readonly messageId?: string
    readonly message: string
    readonly fix: {
      readonly range: readonly [number, number]
      readonly text: string
    }
  }[]
}

export interface EslintResult {
  readonly filePath: string
  readonly messages: readonly EslintMessage[]
  readonly suppressedMessages?: readonly EslintMessage[]
  readonly errorCount: number
  readonly fatalErrorCount: number
  readonly warningCount: number
  readonly fixableErrorCount: number
  readonly fixableWarningCount: number
  readonly usedDeprecatedRules?: readonly {
    readonly ruleId: string
    readonly replacedBy: readonly string[]
  }[]
}

/** oxlint's own `--format json` contract -- not published as a TypeScript type by the tool. */
export interface OxlintDiagnostic {
  readonly message: string
  readonly code: string
  readonly severity: "error" | "warning"
  readonly filename: string
  readonly labels?: readonly {
    readonly span: { readonly line: number; readonly column: number }
  }[]
}

export interface OxlintReport {
  readonly diagnostics: readonly OxlintDiagnostic[]
  readonly number_of_files: number
}

/** One tool's outcome from scripts/check-lint.mjs: either it ran and produced parseable JSON, or a tool-infrastructure failure occurred. */
export type ToolResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string }

export interface CombinedLintEvidence {
  readonly eslint: ToolResult<readonly EslintResult[]>
  readonly oxlint: ToolResult<OxlintReport>
}

/**
 * Renders one oxlint diagnostic as a single human-readable line, including its first label's location when one is present.
 * @param diagnostic - the oxlint diagnostic to render.
 * @returns the rendered `filename:line:column [code]: message` line.
 */
function formatOxlintDiagnostic(diagnostic: OxlintDiagnostic): string {
  const label = diagnostic.labels?.[0]?.span
  const location = label ? `:${String(label.line)}:${String(label.column)}` : ""

  return `${diagnostic.filename}${location} [${diagnostic.code}]: ${diagnostic.message}`
}

/**
 * The lint check's full interpretation logic, factored out so test/unit/lint/policy.test.ts can
 * exercise ESLint's/oxlint's error-severity filtering directly against already-parsed evidence,
 * without spawning scripts/check-lint.mjs -- matching every other check's own
 * `evaluate<Name>Policy` convention (see e.g. checks/adr-governance.ts).
 * @param root0 - the policy input.
 * @param root0.evidence - scripts/check-lint.mjs's own combined ESLint/oxlint evidence.
 * @returns the pass/fail verdict.
 */
export function evaluateLintPolicy({
  evidence,
}: {
  readonly evidence: CombinedLintEvidence
}): PolicyResult {
  const { eslint, oxlint } = evidence

  if (!eslint.ok) {
    return { outcome: "fail", rationale: `ESLint could not be evaluated: ${eslint.error}` }
  }

  if (!oxlint.ok) {
    return { outcome: "fail", rationale: `oxlint could not be evaluated: ${oxlint.error}` }
  }

  const eslintFailures = eslint.value.filter((file) => file.errorCount > 0)
  const eslintDetails = eslintFailures.flatMap((file: EslintResult): string[] =>
    file.messages
      .filter((message: EslintMessage) => message.severity === 2)
      .map((message: EslintMessage) => {
        const rule = message.ruleId ? ` [${message.ruleId}]` : ""

        return `${file.filePath}:${String(message.line)}:${String(message.column)}${rule}: ${message.message}`
      }),
  )

  const oxlintErrors = oxlint.value.diagnostics.filter((d) => d.severity === "error")
  const oxlintDetails = oxlintErrors.map(formatOxlintDiagnostic)

  if (eslintDetails.length === 0 && oxlintDetails.length === 0) {
    return {
      outcome: "pass",
      rationale: `ESLint reported 0 errors; oxlint reported 0 errors across ${String(oxlint.value.number_of_files)} file(s).`,
    }
  }

  const sections: string[] = []

  if (eslintDetails.length > 0) {
    sections.push(
      `ESLint reported ${String(eslintDetails.length)} error(s):`,
      ...eslintDetails.map((detail) => `- ${detail}`),
    )
  }

  if (oxlintDetails.length > 0) {
    sections.push(
      `oxlint reported ${String(oxlintDetails.length)} error(s):`,
      ...oxlintDetails.map((detail) => `- ${detail}`),
    )
  }

  return { outcome: "fail", rationale: sections.join("\n") }
}

export const lint: CheckDefinitionConfig = {
  run: ["node", "scripts/check-lint.mjs"],
  output: { format: "json" },
  policy: ({ result }) => {
    const parsed = requireParsedOutput<CombinedLintEvidence>(
      result.output,
      "Lint check output could not be parsed as JSON.",
    )
    if (!parsed.ok) return parsed.result

    return evaluateLintPolicy({ evidence: parsed.value })
  },
}
