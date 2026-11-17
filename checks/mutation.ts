import { readFile } from "node:fs/promises"
import { resolveMutants } from "../src/affected/mutation-report.js"
import type { ResolvedMutant } from "../src/affected/mutation-report.js"
import { mutation as mutationPreset } from "../src/presets/mutation.js"
import {
  COMMENT_IGNORE_REASON,
  readMutationRun,
  STATIC_IGNORE_REASON,
} from "../src/presets/rules/mutation-verdict.js"
import { readJsonReport } from "../src/presets/shared/read-json-report.js"
import type { SuppressionGovernanceEvidence } from "../scripts/suppression-governance/evidence-types.js"
import { suppressionPolicy } from "../scripts/suppression-governance/policy-config.js"
import {
  evaluateFinding,
  formatOffender,
} from "../scripts/suppression-governance/resolve-policy.js"
import type { CheckDefinitionConfig, CheckEvidence, PolicyContext } from "../src/types.js"

// The published preset at this repository's floor of 100. A mutant no test can kill gets a
// record in .repo-contract/exceptions/mutation.json; the preset judges those records.
const preset = mutationPreset({ minScore: 100, config: "stryker.config.mjs" })

// This repository is not installed into its own node_modules, so the command runs from bin/, as
// `quick-start` and `api-docs-report` do.
const [, ...presetArgs] = preset.run as readonly string[]

const STRYKER_REPORT = "reports/mutation/mutation.json"

/**
 * The preset leaves every Ignored mutant out of the score. This repository trusts only two kinds:
 * a static mutant (stryker.config.mjs's `ignoreStatic`, one reviewed config decision) and a
 * comment-ignored one whose directive suppression-governance holds a complete record for
 * (specs/decisions/0006-suppression-governance.md). Any other ignore, such as an
 * `excludedMutations` entry, would hide code from the score with no review.
 * @param mutants - the run's mutants.
 * @returns one line per unexplained ignore.
 */
function unexplainedIgnores(mutants: readonly ResolvedMutant[]): string[] {
  const unexplained = mutants.filter(
    (mutant) =>
      mutant.status === "Ignored" &&
      mutant.statusReason !== COMMENT_IGNORE_REASON &&
      mutant.statusReason !== STATIC_IGNORE_REASON,
  )
  if (unexplained.length === 0) return []
  return [
    `Ignored without a reviewed reason (${String(unexplained.length)}). Only ignoreStatic and a Stryker disable comment with a registry record may leave a mutant out:`,
    ...unexplained.map(
      (mutant) =>
        `- ${mutant.file}:${String(mutant.line)}:${String(mutant.column)} [${mutant.mutator}] "${mutant.original}" -> "${mutant.replacement}" (${mutant.statusReason ?? "no reason given"})`,
    ),
  ]
}

/**
 * Checks every Stryker-domain record before a comment-ignored mutant is trusted. The gate is
 * global, not per mutant: Stryker's report does not say which directive ignored a mutant, and one
 * block directive can cover many lines.
 * @param suppression - suppression-governance's evidence, read through `dependsOn`.
 * @returns the failing lines, or none when every Stryker-domain record is sound.
 */
function strykerSuppressionProblems(suppression: CheckEvidence | undefined): string[] {
  const output = suppression?.output
  if (output?.success !== true) {
    return [
      "Stryker suppression registry unverifiable: suppression-governance produced no usable evidence.",
    ]
  }
  const evidence = output.value as SuppressionGovernanceEvidence
  if (!evidence.ok) return [`Stryker suppression registry unverifiable: ${evidence.error}`]

  const insufficient = evidence.findings
    .filter((finding) => finding.domain === "stryker")
    .map((finding) =>
      evaluateFinding(finding, evidence.activeExceptions[finding.id], suppressionPolicy),
    )
    .filter((determinant) => determinant.verdict !== "permitted")
  const stale = evidence.staleExceptions.filter((record) => record.domain === "stryker")
  if (insufficient.length + stale.length === 0) return []
  return [
    `Under-justified or stale Stryker suppressions (${String(insufficient.length + stale.length)}):`,
    ...insufficient.map((determinant) => `- ${formatOffender(determinant)}`),
    ...stale.map(
      (record) => `- stale: ${JSON.stringify(record.id)} (directive gone; delete this entry)`,
    ),
  ]
}

/**
 * Re-reads the report the preset judged and applies this repository's two ignore rules.
 * @param context - the policy context.
 * @returns the failing lines, or none.
 */
async function privateRuleProblems(context: PolicyContext): Promise<string[]> {
  const { output } = context.result
  const run = output?.success === true ? readMutationRun(output.value) : undefined
  // Without a report the preset has already failed or passed with nothing to mutate.
  if (run === undefined || run.state === "error" || run.state === "nothing-to-mutate") return []
  // This config never passes `report`, so every run writes stryker.config.mjs's
  // `jsonReporter.fileName`. The path stays a literal: the security lint forbids a variable one.
  if (run.report !== STRYKER_REPORT) {
    return [
      `The run judged ${run.report}, not ${STRYKER_REPORT}, so its ignored mutants cannot be checked.`,
    ]
  }
  const parsed = await readJsonReport<unknown>(
    () => readFile("reports/mutation/mutation.json", "utf8"),
    "unreadable",
    "invalid",
  )
  if (!parsed.ok) return []
  const resolved = resolveMutants(parsed.value)
  if (!resolved.ok) return []

  const commentIgnored = resolved.mutants.some(
    (mutant) => mutant.status === "Ignored" && mutant.statusReason === COMMENT_IGNORE_REASON,
  )
  return [
    ...unexplainedIgnores(resolved.mutants),
    ...(commentIgnored
      ? strykerSuppressionProblems(context.dependencies["suppression-governance"])
      : []),
  ]
}

// `isolated: true` comes from the preset: Stryker's workers beside the concurrent test suite
// starved timing margins and flaked run-checks.test.ts's SIGINT-cleanup test. The evidence edge
// to suppression-governance is declared in repo-contract.config.ts.
export const mutation: CheckDefinitionConfig = {
  ...preset,
  run: ["node", "bin/repo-contract.mjs", ...presetArgs],
  policy: async (context) => {
    const verdict = await preset.policy(context)
    const problems = await privateRuleProblems(context)
    if (problems.length === 0) return verdict
    return { outcome: "fail", rationale: [verdict.rationale, ...problems].join("\n") }
  },
}
