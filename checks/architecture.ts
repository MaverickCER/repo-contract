import type {
  ArchitectureEvidence,
  DependencyGraphEvidence,
} from "../scripts/architecture/evidence-types.js"
import { requireParsedOutput } from "./shared/require-parsed-output.js"
import type { CheckDefinitionConfig, PolicyResult } from "../src/types.js"

interface EvaluateArchitecturePolicyInput {
  readonly evidence: ArchitectureEvidence
}

type DependencyGraphViolation = Extract<DependencyGraphEvidence, { ok: true }>["violations"][number]

interface ArchitectureDeterminant {
  readonly dependencyGraphOk: boolean
  readonly dependencyGraphError: string | undefined
  readonly testCategoryBoundariesOk: boolean
  readonly testCategoryBoundariesError: string | undefined
  readonly boundaryViolations: readonly string[]
  readonly filesScanned: number
  readonly modulesAnalyzed: number
  readonly errorViolations: readonly DependencyGraphViolation[]
  readonly warnViolations: readonly DependencyGraphViolation[]
  readonly adrStructureOk: boolean
  readonly adrStructureError: string | undefined
  readonly adrStructureViolations: readonly string[]
  readonly adrFilesScanned: number
}

/**
 * Reduces the raw architecture evidence (dependency graph + test-category boundaries) down to the fields the policy below actually branches on.
 * @param evidence - the architecture check's evidence to summarize.
 * @returns the determinant fields (ok/error flags, violations, and counts) the policy evaluates.
 */
function getArchitectureDeterminant(evidence: ArchitectureEvidence): ArchitectureDeterminant {
  const { dependencyGraph, testCategoryBoundaries, adrStructure } = evidence

  return {
    dependencyGraphOk: dependencyGraph.ok,
    dependencyGraphError: dependencyGraph.ok ? undefined : dependencyGraph.error,
    testCategoryBoundariesOk: testCategoryBoundaries.ok,
    testCategoryBoundariesError: testCategoryBoundaries.ok
      ? undefined
      : testCategoryBoundaries.error,
    boundaryViolations: testCategoryBoundaries.ok ? testCategoryBoundaries.violations : [],
    filesScanned: testCategoryBoundaries.ok ? testCategoryBoundaries.filesScanned : 0,
    modulesAnalyzed: dependencyGraph.ok ? dependencyGraph.modulesAnalyzed : 0,
    errorViolations: dependencyGraph.ok
      ? dependencyGraph.violations.filter((v) => v.severity === "error")
      : [],
    warnViolations: dependencyGraph.ok
      ? dependencyGraph.violations.filter((v) => v.severity !== "error")
      : [],
    adrStructureOk: adrStructure.ok,
    adrStructureError: adrStructure.ok ? undefined : adrStructure.error,
    adrStructureViolations: adrStructure.ok ? adrStructure.violations : [],
    adrFilesScanned: adrStructure.ok ? adrStructure.filesScanned : 0,
  }
}

/**
 * Renders a single dependency-graph violation as one human-readable line.
 * @param v - the dependency-graph violation to render.
 * @returns the rendered `from -> to [rule, severity]: comment` line.
 */
function formatViolation(v: DependencyGraphViolation): string {
  return `${v.from} -> ${v.to} [${v.rule}, ${v.severity}]: ${v.comment}`
}

/**
 * Renders the test-category-boundary portion of the rationale: a clean summary line when there are no violations, or a bulleted list of them.
 * @param determinant - the architecture determinant whose boundary violations and scanned-file count are rendered.
 * @returns the rendered test-category-boundary section.
 */
function formatBoundarySection(determinant: ArchitectureDeterminant): string {
  if (determinant.boundaryViolations.length === 0) {
    return `Test-category boundaries: ${String(determinant.filesScanned)} test file(s) scanned, 0 violations.`
  }

  return [
    `Test-category boundary violation(s) (${String(determinant.boundaryViolations.length)}):`,
    ...determinant.boundaryViolations.map((v) => `- ${v}`),
  ].join("\n")
}

/**
 * Renders the ADR-structure portion of the rationale: a clean summary line when there are no violations, or a bulleted list of them.
 * @param determinant - the architecture determinant whose ADR-structure violations and scanned-file count are rendered.
 * @returns the rendered ADR-structure section.
 */
function formatAdrStructureSection(determinant: ArchitectureDeterminant): string {
  if (determinant.adrStructureViolations.length === 0) {
    return `ADR structure: ${String(determinant.adrFilesScanned)} ADR file(s) scanned, 0 violations.`
  }

  return [
    `ADR structure violation(s) (${String(determinant.adrStructureViolations.length)}):`,
    ...determinant.adrStructureViolations.map((v) => `- ${v}`),
  ].join("\n")
}

/**
 * Renders the error-severity portion of the dependency-graph rationale: a clean summary line when there are no error violations, or a bulleted list of them.
 * @param determinant - the architecture determinant whose error-severity violations and analyzed-module count are rendered.
 * @returns the rendered dependency-graph error section.
 */
function formatDependencyErrorSection(determinant: ArchitectureDeterminant): string {
  if (determinant.errorViolations.length === 0) {
    return `Dependency graph: ${String(determinant.modulesAnalyzed)} module(s) analyzed, 0 errors.`
  }

  return [
    `Dependency-graph error(s) (${String(determinant.errorViolations.length)}/${String(determinant.modulesAnalyzed)} module(s) analyzed):`,
    ...determinant.errorViolations.map((v) => `- ${formatViolation(v)}`),
  ].join("\n")
}

/**
 * Renders the warn/info-severity portion of the dependency-graph rationale as a bulleted list.
 * @param determinant - the architecture determinant whose warn/info-severity violations are rendered.
 * @returns the rendered dependency-graph warn/info section.
 */
function formatDependencyWarnSection(determinant: ArchitectureDeterminant): string {
  return [
    `Dependency-graph warn/info finding(s) (${String(determinant.warnViolations.length)}):`,
    ...determinant.warnViolations.map((v) => `- ${formatViolation(v)}`),
  ].join("\n")
}

/**
 * Fails on any dependency-graph tool-infrastructure failure, any error-severity
 * dependency-graph violation, or any test-category-boundary violation; warns
 * on warn/info-only dependency-graph findings; passes otherwise.
 * @param root0 - the policy input.
 * @param root0.evidence - the architecture check's evidence to evaluate.
 * @returns the pass/warn/fail outcome and its rationale.
 */
export function evaluateArchitecturePolicy({
  evidence,
}: EvaluateArchitecturePolicyInput): PolicyResult {
  const determinant = getArchitectureDeterminant(evidence)

  if (!determinant.dependencyGraphOk) {
    return {
      outcome: "fail",
      rationale: `dependency-cruiser could not be evaluated: ${String(determinant.dependencyGraphError)}`,
    }
  }

  if (!determinant.testCategoryBoundariesOk) {
    return {
      outcome: "fail",
      rationale: `Test-category boundaries failed: ${String(determinant.testCategoryBoundariesError)}`,
    }
  }

  if (!determinant.adrStructureOk) {
    return {
      outcome: "fail",
      rationale: `ADR structure could not be evaluated: ${String(determinant.adrStructureError)}`,
    }
  }

  const sections = [
    formatBoundarySection(determinant),
    formatAdrStructureSection(determinant),
    formatDependencyErrorSection(determinant),
  ]

  if (
    determinant.boundaryViolations.length > 0 ||
    determinant.adrStructureViolations.length > 0 ||
    determinant.errorViolations.length > 0
  ) {
    return { outcome: "fail", rationale: sections.join("\n") }
  }

  if (determinant.warnViolations.length > 0) {
    return {
      outcome: "warn",
      rationale: [...sections, formatDependencyWarnSection(determinant)].join("\n"),
    }
  }

  return { outcome: "pass", rationale: sections.join("\n") }
}

// Static, no execution, no coverage contribution: does the production src/
// dependency graph obey this repository's architectural constraints
// (.dependency-cruiser.cjs), does every verification category's own
// Vitest config stay inside its own directory
// (scripts/check-test-boundaries.mjs), and does specs/decisions/ stay
// structurally well-formed (scripts/check-adr-structure.mjs)? See
// scripts/architecture/evidence-types.ts for the three-section evidence
// shape this policy interprets.
export const architecture: CheckDefinitionConfig = {
  run: ["node", "scripts/check-architecture.mjs"],
  output: { format: "json" },
  policy: ({ result }) => {
    const parsed = requireParsedOutput<ArchitectureEvidence>(
      result.output,
      "Architecture check output could not be parsed as JSON.",
    )
    if (!parsed.ok) return parsed.result

    return evaluateArchitecturePolicy({ evidence: parsed.value })
  },
}
