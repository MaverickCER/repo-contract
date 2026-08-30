import type { AdrGovernanceEvidence } from "../scripts/adr-governance/evidence-types.js"
import { requireParsedOutput } from "./shared/require-parsed-output.js"
import type { CheckDefinitionConfig, PolicyResult } from "../src/types.js"

interface EvaluateAdrGovernancePolicyInput {
  readonly evidence: AdrGovernanceEvidence
}

type AdrGovernanceDeterminant =
  | { readonly kind: "nothing-governed-changed"; readonly baseRef: string }
  | {
      readonly kind: "adr-touched"
      readonly baseRef: string
      readonly adrFilesTouched: readonly string[]
    }
  | {
      readonly kind: "referenced"
      readonly baseRef: string
      readonly resolvedAdrNumbers: readonly string[]
    }
  | {
      readonly kind: "unsatisfied"
      readonly baseRef: string
      readonly governedFilesTouched: readonly string[]
      readonly commitsScanned: number
    }

/**
 * Classifies the adr-governance evidence into the four outcomes the policy below distinguishes.
 * @param evidence - the adr-governance check's evidence to classify.
 * @returns the determinant describing which outcome applies, with its supporting details.
 */
function getAdrGovernanceDeterminant(evidence: AdrGovernanceEvidence): AdrGovernanceDeterminant {
  if (evidence.governedFilesTouched.length === 0) {
    return { kind: "nothing-governed-changed", baseRef: evidence.baseRef }
  }
  if (evidence.adrFilesTouched.length > 0) {
    return {
      kind: "adr-touched",
      baseRef: evidence.baseRef,
      adrFilesTouched: evidence.adrFilesTouched,
    }
  }
  if (evidence.satisfied) {
    return {
      kind: "referenced",
      baseRef: evidence.baseRef,
      resolvedAdrNumbers: evidence.resolvedAdrNumbers,
    }
  }
  return {
    kind: "unsatisfied",
    baseRef: evidence.baseRef,
    governedFilesTouched: evidence.governedFilesTouched,
    commitsScanned: evidence.commitsScanned,
  }
}

/**
 * Fails whenever a PR changes `src/execution/**`/`src/policy/**` without either touching
 * `specs/decisions/**` itself or referencing a real, existing ADR from one of the branch's
 * commit messages -- the one thing this check exists to guarantee. Passes trivially when nothing
 * governed changed.
 * @param root0 - the policy input.
 * @param root0.evidence - the adr-governance check's evidence to evaluate.
 * @returns the pass/fail outcome and its rationale.
 */
export function evaluateAdrGovernancePolicy({
  evidence,
}: EvaluateAdrGovernancePolicyInput): PolicyResult {
  const determinant = getAdrGovernanceDeterminant(evidence)

  if (determinant.kind === "nothing-governed-changed") {
    return {
      outcome: "pass",
      rationale: `No files under src/execution/ or src/policy/ changed relative to ${determinant.baseRef} -- nothing governed by this check.`,
    }
  }

  if (determinant.kind === "adr-touched") {
    return {
      outcome: "pass",
      rationale: [
        `${String(determinant.adrFilesTouched.length)} file(s) under specs/decisions/ were touched in this diff:`,
        ...determinant.adrFilesTouched.map((path) => `- ${path}`),
      ].join("\n"),
    }
  }

  if (determinant.kind === "referenced") {
    return {
      outcome: "pass",
      rationale: `Governed files changed, but a commit message references existing ADR(s): ${determinant.resolvedAdrNumbers.join(", ")}.`,
    }
  }

  return {
    outcome: "fail",
    rationale: [
      `${String(determinant.governedFilesTouched.length)} file(s) under src/execution/ or src/policy/ ` +
        `changed relative to ${determinant.baseRef}, but no specs/decisions/ file was touched and none ` +
        `of the ${String(determinant.commitsScanned)} commit message(s) on this branch references an ` +
        `existing ADR:`,
      ...determinant.governedFilesTouched.map((path) => `- ${path}`),
      'Add or amend an ADR under specs/decisions/, or reference one (e.g. "ADR 0003") in a commit message on this branch.',
    ].join("\n"),
  }
}

// Architectural-change traceability: a PR touching the execution or policy engine must either
// engage the ADR set directly or reference an existing ADR from one of its commit messages; a
// typo'd or nonexistent ADR number never satisfies this. See
// specs/decisions/0008-api-contract-compatibility-gate.md.
export const adrGovernance: CheckDefinitionConfig = {
  run: ["tsx", "scripts/adr-governance/check.ts", "--base=origin/main"],
  output: { format: "json" },
  policy: ({ result }) => {
    const parsed = requireParsedOutput<AdrGovernanceEvidence>(
      result.output,
      "ADR governance check output could not be parsed as JSON.",
    )
    if (!parsed.ok) return parsed.result

    return evaluateAdrGovernancePolicy({ evidence: parsed.value })
  },
}
