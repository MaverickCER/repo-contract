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
      readonly changesetPath: string
    }
  | {
      readonly kind: "unsatisfied"
      readonly baseRef: string
      readonly governedFilesTouched: readonly string[]
      readonly changesetPath: string | undefined
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
  if (evidence.satisfied && evidence.changesetPath) {
    return {
      kind: "referenced",
      baseRef: evidence.baseRef,
      resolvedAdrNumbers: evidence.resolvedAdrNumbers,
      changesetPath: evidence.changesetPath,
    }
  }
  return {
    kind: "unsatisfied",
    baseRef: evidence.baseRef,
    governedFilesTouched: evidence.governedFilesTouched,
    changesetPath: evidence.changesetPath,
  }
}

/**
 * Fails whenever a PR changes `src/execution/**`/`src/policy/**` without either touching
 * `specs/decisions/**` itself or referencing a real, existing ADR from its own changeset file --
 * the one thing this check exists to guarantee. Passes trivially when nothing governed changed.
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
      rationale: `Governed files changed, but ${determinant.changesetPath} references existing ADR(s): ${determinant.resolvedAdrNumbers.join(", ")}.`,
    }
  }

  return {
    outcome: "fail",
    rationale: [
      `${String(determinant.governedFilesTouched.length)} file(s) under src/execution/ or src/policy/ ` +
        `changed relative to ${determinant.baseRef}, but no specs/decisions/ file was touched and no ` +
        `changeset entry references an existing ADR` +
        (determinant.changesetPath ? ` in ${determinant.changesetPath}` : "") +
        `:`,
      ...determinant.governedFilesTouched.map((path) => `- ${path}`),
      'Add or amend an ADR under specs/decisions/, or reference one (e.g. "ADR 0003") in your changeset file.',
    ].join("\n"),
  }
}

// Architectural-change traceability, deliberately distinct from changeset-docs's "is every changed
// file described" -- see specs/decisions/0010-changeset-adr-and-pr-documentation-discipline.md. A PR
// touching the execution or policy engine must either engage the ADR set directly or reference an
// existing one from its own changeset entry; a typo'd or nonexistent ADR number never satisfies this.
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
