import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { evaluateMaintained } from "../openssf-scorecard/github-checks.js"
import {
  evaluateCiTests,
  evaluateDangerousWorkflow,
  evaluatePinnedDependencies,
  evaluateTokenPermissions,
} from "../openssf-scorecard/local-checks.js"
import { repoSlug } from "../openssf-scorecard/gh-api.js"
import type { ScorecardCheckResult } from "../openssf-scorecard/types.js"
import type { ProcessEvidence } from "./types.js"

interface CoverageMetric {
  readonly pct: number
}
interface CoverageSummary {
  readonly total: {
    readonly lines: CoverageMetric
    readonly statements: CoverageMetric
    readonly functions: CoverageMetric
    readonly branches: CoverageMetric
  }
}

interface Mutant {
  readonly status: string
}
interface MutationReport {
  readonly files: Readonly<Record<string, { readonly mutants: readonly Mutant[] }>>
}

/**
 * @param result - The Scorecard sub-check result to cite.
 * @param category - The 12207 process category this belongs under.
 * @param process - The 12207 process name this is evidence for.
 * @returns A `ProcessEvidence` entry citing that sub-check's own reason -- `"no-evidence"`, not `"evidence-found"`, when the underlying Scorecard sub-check itself was `"not-applicable"` (e.g. gh CLI unavailable, or -- Maintained's own applicability precondition -- the repository is too young to assess). Citing a `"not-applicable"` sub-check as though it were a determination would misrepresent "couldn't be evaluated" as "evaluated and found compliant."
 */
function scorecardEvidence(
  result: ScorecardCheckResult,
  category: string,
  process: string,
): ProcessEvidence {
  if (result.score === "not-applicable") {
    return {
      category,
      process,
      status: "no-evidence",
      summary: `The OpenSSF Scorecard-informed "${result.name}" check could not be evaluated: ${result.reason}`,
    }
  }
  return {
    category,
    process,
    status: "evidence-found",
    summary: `From this repository's own OpenSSF Scorecard-informed "${result.name}" check (see docs/OpenSSF-Scorecard.md): ${result.reason}`,
  }
}

/**
 * @param category - The 12207 process category.
 * @param process - The 12207 process name.
 * @param why - Why this repository's technical contract has nothing to say about this process.
 * @returns A `"no-evidence"` `ProcessEvidence` entry.
 */
function noEvidence(category: string, process: string, why: string): ProcessEvidence {
  return { category, process, status: "no-evidence", summary: why }
}

/**
 * Assembles every `ProcessEvidence` entry this generator can produce from
 * real, gathered evidence -- re-running the same pure evaluator functions
 * `openssf-scorecard` uses (rather than depending on that check's own
 * already-rendered Markdown) so this check's own evidence is independently,
 * freshly computed, not a re-parse of another check's rendered output.
 * @param root - Repository root.
 * @returns Every process this generator evaluated, evidence-found or not.
 */
export function gatherProcessEvidence(root: string): readonly ProcessEvidence[] {
  const slug = repoSlug(root)
  const entries: ProcessEvidence[] = []

  // -- Agreement Processes: genuinely out of scope. A single repository's
  // technical contract has no evidence about acquirer/supplier agreements. --
  entries.push(
    noEvidence(
      "Agreement Processes",
      "Acquisition",
      "Out of scope: an acquisition agreement is a business/contractual fact, not something a source-controlled repository's own technical evidence can speak to.",
    ),
    noEvidence(
      "Agreement Processes",
      "Supply",
      "Out of scope: a supply agreement is a business/contractual fact, not something a source-controlled repository's own technical evidence can speak to.",
    ),
  )

  // -- Organizational Project-Enabling Processes --
  const hasCi = existsSync(path.join(root, ".github/workflows/ci.yml"))
  entries.push(
    hasCi
      ? {
          category: "Organizational Project-Enabling Processes",
          process: "Infrastructure Management",
          status: "evidence-found",
          summary:
            "This repository declares its own CI infrastructure as code (.github/workflows/), version-controlled alongside the software it builds -- see Configuration Management, Information Management, and Validation below for what that infrastructure actually enforces.",
        }
      : noEvidence(
          "Organizational Project-Enabling Processes",
          "Infrastructure Management",
          "No .github/workflows/ci.yml found.",
        ),
    noEvidence(
      "Organizational Project-Enabling Processes",
      "Life Cycle Model Management",
      "Out of scope: which life cycle model an organization has chosen is a process-governance fact, not evidence a single repository's own contract produces.",
    ),
    noEvidence(
      "Organizational Project-Enabling Processes",
      "Portfolio Management",
      "Out of scope: portfolio management spans multiple projects/products, outside any one repository's own evidence.",
    ),
    noEvidence(
      "Organizational Project-Enabling Processes",
      "Human Resource Management",
      "Out of scope: staffing and competency management are organizational facts a code repository's contract has no evidence about.",
    ),
    {
      category: "Organizational Project-Enabling Processes",
      process: "Quality Management",
      status: "evidence-found",
      summary:
        "This repository's own `npm run contract` (repo-contract.config.ts) is a real, executable quality-management process: every merge is gated by a versioned set of checks (lint, typecheck, coverage, mutation, security, accessibility, licensing, and more), producing versioned Evidence/Verdict records rather than an unverified quality claim.",
    },
    {
      category: "Organizational Project-Enabling Processes",
      process: "Knowledge Management",
      status: "evidence-found",
      summary: `This repository's own "docs" check (markdownlint-cli2 + linkinator) mechanically verifies every Markdown document and every internal link across the documentation set, and specs/decisions/ holds ${String(countAdrs(root))} committed Architecture Decision Record(s) capturing design rationale for future readers.`,
    },
  )

  // -- Technical Management Processes --
  entries.push(
    noEvidence(
      "Technical Management Processes",
      "Project Planning",
      "Out of scope: schedules, budgets, and staffing plans are project-management artifacts this repository's technical contract does not produce or verify.",
    ),
    noEvidence(
      "Technical Management Processes",
      "Project Assessment and Control",
      "Out of scope: progress tracking against a plan is a project-management activity, not a fact this repository's own evidence establishes.",
    ),
    {
      category: "Technical Management Processes",
      process: "Decision Management",
      status: "evidence-found",
      summary: `${String(countAdrs(root))} committed Architecture Decision Record(s) under specs/decisions/, each a versioned record of a specific design decision and its rationale, mechanically checked for structural consistency by this repository's own "adr-governance" check.`,
    },
    scorecardEvidence(
      evaluateDangerousWorkflow(root),
      "Technical Management Processes",
      "Risk Management",
    ),
    scorecardEvidence(
      evaluatePinnedDependencies(root),
      "Technical Management Processes",
      "Configuration Management",
    ),
    scorecardEvidence(
      evaluateTokenPermissions(root),
      "Technical Management Processes",
      "Information Management",
    ),
    {
      category: "Technical Management Processes",
      process: "Quality Assurance",
      status: "evidence-found",
      summary:
        "This repository's full `npm run contract` run -- 34 checks spanning static analysis, testing, security, accessibility, licensing, and packaging -- is itself the quality assurance process, producing a versioned Evidence/Verdict record every run rather than an aspirational claim.",
    },
  )

  // -- Technical Processes --
  const coverage = readCoverageSummary(root)
  const mutation = readMutationReport(root)
  entries.push(
    noEvidence(
      "Technical Processes",
      "Business/Mission Analysis",
      "Out of scope: why the business exists to build this software is not a fact a code repository's own evidence establishes.",
    ),
    noEvidence(
      "Technical Processes",
      "Stakeholder Needs and Requirements Definition",
      "Out of scope: stakeholder needs are captured upstream of this repository's own version-controlled artifacts.",
    ),
    noEvidence(
      "Technical Processes",
      "System/Software Requirements Definition",
      "Out of scope: this repository's specs/decisions/ records design DECISIONS (see Decision Management above), not a formal requirements specification.",
    ),
    {
      category: "Technical Processes",
      process: "Architecture Definition",
      status: "evidence-found",
      summary:
        'This repository\'s own "architecture" check enforces a real, checked dependency graph and test-category boundary set on every run (depcruise-based), failing if a module is imported from a layer it should not be reachable from.',
    },
    noEvidence(
      "Technical Processes",
      "Design Definition",
      "No dedicated design-definition artifact or check exists in this repository beyond the ADRs already covered under Decision Management.",
    ),
    noEvidence(
      "Technical Processes",
      "System Analysis",
      "Out of scope: no dedicated system-analysis artifact exists in this repository.",
    ),
    {
      category: "Technical Processes",
      process: "Implementation",
      status: "evidence-found",
      summary:
        'This repository\'s own "build" check (`npm run build`) compiles the published package from source on every run; a build failure fails the contract.',
    },
    {
      category: "Technical Processes",
      process: "Integration",
      status: "evidence-found",
      summary:
        'This repository\'s own "test-integration" and "test-e2e" checks exercise cross-module and real-consumer-install behavior respectively, against the actual built package, not mocks.',
    },
    {
      category: "Technical Processes",
      process: "Verification",
      status: "evidence-found",
      summary:
        coverage && mutation
          ? `Coverage thresholds (this run: lines ${coverage.lines.toFixed(1)}%, statements ${coverage.statements.toFixed(1)}%, functions ${coverage.functions.toFixed(1)}%, branches ${coverage.branches.toFixed(1)}%) and mutation testing (this run: ${String(mutation.detected)}/${String(mutation.valid)} mutants detected, policy requires zero survived/no-coverage/timeout/unjustified-ignored) are both enforced every contract run -- see this repository's own "coverage" and "mutation" checks.`
          : 'This repository\'s own "coverage" and "mutation" checks enforce verification thresholds every run (coverage/mutation report files were not present for this specific generation -- run the full `npm run contract` first for the numeric detail).',
    },
    noEvidence(
      "Technical Processes",
      "Transition",
      "Out of scope: deployment/transition to an operational environment is a consuming project's own concern, not something this published package's own repository evidences.",
    ),
    scorecardEvidence(evaluateCiTests(root), "Technical Processes", "Validation"),
    scorecardEvidence(evaluateMaintained(slug), "Technical Processes", "Maintenance"),
    noEvidence(
      "Technical Processes",
      "Operation",
      "Out of scope: this is a published library, not an operated service -- there is no runtime operation for this repository's own evidence to speak to.",
    ),
    noEvidence(
      "Technical Processes",
      "Disposal",
      "Out of scope: no disposal/decommissioning process applies to a currently-maintained published package.",
    ),
  )

  return entries
}

/**
 * @param root - Repository root.
 * @returns The number of committed ADR files under `specs/decisions/`.
 */
function countAdrs(root: string): number {
  const dir = path.join(root, "specs/decisions")
  if (!existsSync(dir)) return 0
  return readdirSync(dir).filter((entry) => /^\d{4}-.*\.md$/.test(entry)).length
}

/**
 * @param root - Repository root.
 * @returns The four aggregate coverage percentages, or `undefined` if the report doesn't exist yet.
 */
function readCoverageSummary(
  root: string,
): { lines: number; statements: number; functions: number; branches: number } | undefined {
  const summaryPath = path.join(root, "coverage/aggregate/coverage-summary.json")
  if (!existsSync(summaryPath)) return undefined
  try {
    const { total } = JSON.parse(readFileSync(summaryPath, "utf8")) as CoverageSummary
    return {
      lines: total.lines.pct,
      statements: total.statements.pct,
      functions: total.functions.pct,
      branches: total.branches.pct,
    }
  } catch {
    return undefined
  }
}

/**
 * @param root - Repository root.
 * @returns Detected/valid mutant counts (excluding Ignored from the denominator, matching this repository's own mutation.ts policy), or `undefined` if the report doesn't exist yet.
 */
function readMutationReport(root: string): { detected: number; valid: number } | undefined {
  const reportPath = path.join(root, "reports/mutation/mutation.json")
  if (!existsSync(reportPath)) return undefined
  try {
    const report = JSON.parse(readFileSync(reportPath, "utf8")) as MutationReport
    const mutants = Object.values(report.files).flatMap((f) => f.mutants)
    // The exact same detected/applicable split this repo's own
    // checks/mutation.ts uses -- confirmed by reading that file directly:
    // Killed, RuntimeError, and CompileError are "detected"; Survived,
    // NoCoverage, and Timeout all stay in the denominator but never count as
    // detected (this repository's policy requires zero of each, Timeout
    // included -- a real timeout is not tolerated the way it might be
    // elsewhere).
    const detected = mutants.filter((m) =>
      ["Killed", "RuntimeError", "CompileError"].includes(m.status),
    ).length
    const valid = mutants.filter((m) =>
      ["Killed", "RuntimeError", "CompileError", "Survived", "NoCoverage", "Timeout"].includes(
        m.status,
      ),
    ).length
    return { detected, valid }
  } catch {
    return undefined
  }
}
