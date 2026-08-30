import type { GitHubActionsEvidence } from "../scripts/github-actions/evidence-types.js"
import { requireParsedOutput } from "./shared/require-parsed-output.js"
import type { CheckDefinitionConfig, PolicyResult } from "../src/types.js"

interface EvaluateGitHubActionsPolicyInput {
  readonly evidence: GitHubActionsEvidence
}

/**
 * Fails on any actionlint tool-infrastructure failure, or any actionlint finding in this
 * repository's own `.github/workflows/*` -- workflow correctness and security-oriented static
 * analysis are owned by actionlint (rhysd/actionlint), this policy only decides whether that
 * analysis satisfies the contract. See
 * specs/decisions/0010-review-driven-contracts-and-shared-internal-system-contracts.md.
 * @param root0 - the policy input.
 * @param root0.evidence - the github-actions check's evidence to evaluate.
 * @returns the pass/fail outcome and its rationale.
 */
export function evaluateGitHubActionsPolicy({
  evidence,
}: EvaluateGitHubActionsPolicyInput): PolicyResult {
  if (!evidence.ok) {
    return {
      outcome: "fail",
      rationale: `actionlint could not be evaluated: ${evidence.error}`,
    }
  }

  if (evidence.filesScanned === 0) {
    return {
      outcome: "pass",
      rationale: "No .github/workflows/*.{yml,yaml} files to lint.",
    }
  }

  if (evidence.findings.length === 0) {
    return {
      outcome: "pass",
      rationale: `actionlint found 0 issue(s) across ${String(evidence.filesScanned)} workflow file(s).`,
    }
  }

  return {
    outcome: "fail",
    rationale: [
      `actionlint found ${String(evidence.findings.length)} issue(s) across ${String(evidence.filesScanned)} workflow file(s):`,
      ...evidence.findings.map(
        (finding) =>
          `- ${finding.file}:${String(finding.line)}:${String(finding.column)} [${finding.kind}] ${finding.message}`,
      ),
    ].join("\n"),
  }
}

// GitHub Actions correctness + security via actionlint, run through the `github-actionlint` npm
// wrapper (a devDependency -- never a runtime dependency of the published package). The wrapper
// resolves the official actionlint binary on first use; scripts/github-actions/lint.mjs shells out
// to it and prints the normalized JSON evidence this policy interprets. See
// specs/decisions/0010-review-driven-contracts-and-shared-internal-system-contracts.md for why the
// analysis is delegated to a mature external tool rather than reimplemented here.
export const githubActions: CheckDefinitionConfig = {
  run: ["node", "scripts/github-actions/lint.mjs"],
  output: { format: "json" },
  policy: ({ result }) => {
    const parsed = requireParsedOutput<GitHubActionsEvidence>(
      result.output,
      "github-actions check output could not be parsed as JSON.",
    )
    if (!parsed.ok) return parsed.result

    return evaluateGitHubActionsPolicy({ evidence: parsed.value })
  },
}
