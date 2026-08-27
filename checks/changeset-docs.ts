import type { ChangesetDocsEvidence } from "../scripts/changeset-docs/evidence-types.js"
import { requireParsedOutput } from "./shared/require-parsed-output.js"
import type { CheckDefinitionConfig, PolicyResult } from "../src/types.js"

interface EvaluateChangesetDocsPolicyInput {
  readonly evidence: ChangesetDocsEvidence
}

type ChangesetDocsDeterminant =
  | { readonly kind: "nothing-to-document"; readonly baseRef: string }
  | {
      readonly kind: "all-described"
      readonly baseRef: string
      readonly total: number
      readonly changesetPath: string
    }
  | {
      readonly kind: "missing-descriptions"
      readonly baseRef: string
      readonly total: number
      readonly changesetPath: string
      readonly undescribed: readonly string[]
    }

/**
 * Classifies the changeset-docs evidence into the three outcomes the policy below distinguishes: nothing changed, everything is described, or some files still lack a description.
 * @param evidence - the changeset-docs check's evidence to classify.
 * @returns the determinant describing which of the three outcomes applies, with its supporting details.
 */
function getChangesetDocsDeterminant(evidence: ChangesetDocsEvidence): ChangesetDocsDeterminant {
  if (evidence.rows.length === 0) {
    return { kind: "nothing-to-document", baseRef: evidence.baseRef }
  }

  const changesetPath = evidence.changesetPath ?? "(unknown path)"

  if (evidence.allDescribed) {
    return {
      kind: "all-described",
      baseRef: evidence.baseRef,
      total: evidence.rows.length,
      changesetPath,
    }
  }

  return {
    kind: "missing-descriptions",
    baseRef: evidence.baseRef,
    total: evidence.rows.length,
    changesetPath,
    undescribed: evidence.rows
      .filter((row) => row.description === undefined)
      .map((row) => row.path),
  }
}

/**
 * Fails whenever any changed file's description is still the placeholder --
 * the one thing this check exists to guarantee -- and lists exactly which
 * paths still need one.
 * @param root0 - the policy input.
 * @param root0.evidence - the changeset-docs check's evidence to evaluate.
 * @returns the pass/fail outcome and its rationale.
 */
export function evaluateChangesetDocsPolicy({
  evidence,
}: EvaluateChangesetDocsPolicyInput): PolicyResult {
  const determinant = getChangesetDocsDeterminant(evidence)

  if (determinant.kind === "nothing-to-document") {
    return {
      outcome: "pass",
      rationale: `No files changed relative to ${determinant.baseRef} -- nothing to document.`,
    }
  }

  if (determinant.kind === "all-described") {
    return {
      outcome: "pass",
      rationale: `All ${String(determinant.total)} changed file(s) relative to ${determinant.baseRef} are described in ${determinant.changesetPath}.`,
    }
  }

  return {
    outcome: "fail",
    rationale: [
      `${String(determinant.undescribed.length)} of ${String(determinant.total)} changed file(s) still need a description in ${determinant.changesetPath}:`,
      ...determinant.undescribed.map((path) => `- ${path}`),
    ].join("\n"),
  }
}

// Documentation completeness/traceability, deliberately distinct from api-contract's "did the
// public API change" -- see specs/decisions/0010-changeset-adr-and-pr-documentation-discipline.md. Maintains a
// second, independently-delimited section of the same changeset file (located via the shared
// scripts/changeset-file-locator.ts) listing every file changed relative to --base, and fails
// until each one carries a real description.
export const changesetDocs: CheckDefinitionConfig = {
  run: ["tsx", "scripts/changeset-docs/check.ts", "--base=origin/main"],
  output: { format: "json" },
  policy: ({ result }) => {
    const parsed = requireParsedOutput<ChangesetDocsEvidence>(
      result.output,
      "Changeset documentation check output could not be parsed as JSON.",
    )
    if (!parsed.ok) return parsed.result

    return evaluateChangesetDocsPolicy({ evidence: parsed.value })
  },
}
