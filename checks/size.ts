import { readFile } from "node:fs/promises"
import { readJsonReport } from "../src/presets/shared/read-json-report.js"
import type { CheckDefinitionConfig, PolicyResult } from "../src/types.js"

interface SizeBudget {
  readonly label: string
  readonly file: string
  readonly maxGzipBytes: number
}

// The one place the required gzip size lives -- scripts/check-size.mjs
// itself no longer knows any budget; it only measures and reports (see that
// file's own doc comment). Matched against the report below by `file`, not
// trusted from anything the script echoes back.
//
// These are regression tripwires, not a hard external constraint: nothing
// ships this package to a browser and npm imposes no meaningful size limit
// on a Node dev dependency. The number the check exists to catch is a
// dependency accidentally being inlined -- un-externalizing cross-spawn
// (~5KB gzip) or yaml (~40KB) in tsup.config.ts -- which blows past any sane
// budget. So each budget is set ~25-30% above the current gzip size: loose
// enough that ordinary feature work (a new error class, another validation
// branch) doesn't trip CI, tight enough that an inlined dependency still
// does. Bump these deliberately when a real capability addition grows the
// bundle; `npm run size` prints the current figure against the budget.
// CJS runs a few hundred bytes larger than ESM at the same source (esbuild's
// interop wrappers -- `__toCommonJS`, a getter per named export), so the two
// formats share one budget sized for the larger.
export const SIZE_BUDGETS: readonly SizeBudget[] = [
  // Budgets only this package's own compiled source: cross-spawn (the one
  // runtime dependency) and yaml (optional peer, dynamically imported) are
  // both `external` in tsup.config.ts and resolved from node_modules at
  // install time, never inlined here.
  // Both `.` entrypoint formats: ESM and CJS share one budget sized for the
  // larger (CJS -- see the comment above). Without the ESM entry a regression
  // in `dist/index.js` alone was undetectable by this check.
  { label: "index (esm)", file: "dist/index.js", maxGzipBytes: 10 * 1024 },
  { label: "index (cjs)", file: "dist/index.cjs", maxGzipBytes: 10 * 1024 },
  // `./presets` is an equally published `exports` entrypoint (package.json) --
  // without its own budget a regression here was undetectable by this check.
  { label: "presets (esm)", file: "dist/presets.js", maxGzipBytes: 7 * 1024 },
  { label: "presets (cjs)", file: "dist/presets.cjs", maxGzipBytes: 7 * 1024 },
]

export interface SizeReportEntry {
  readonly label: string
  readonly file: string
  /** `null` when the entry point didn't exist at check time (e.g. `npm run build` wasn't run first). */
  readonly gzipBytes: number | null
  /** Echoed back from this check's own `--budget` args, purely for a self-describing report -- the policy below never reads this field, only `SIZE_BUDGETS`. */
  readonly maxGzipBytes: number | null
}

export interface SizeReport {
  readonly generatedAt: string
  readonly entries: readonly SizeReportEntry[]
}

/**
 * The size check's full interpretation logic, factored out so test/unit/size/policy.test.ts can
 * exercise every budget comparison directly against an already-parsed report, without spawning
 * scripts/check-size.mjs -- matching every other check's own `evaluate<Name>Policy` convention
 * (see e.g. checks/adr-governance.ts).
 * @param root0 - the policy input.
 * @param root0.evidence - the size check's own parsed report: one entry per budgeted file.
 * @returns the pass/fail verdict.
 */
export function evaluateSizePolicy({ evidence }: { readonly evidence: SizeReport }): PolicyResult {
  const { entries } = evidence

  const details: string[] = []
  const summaryParts: string[] = []

  for (const budget of SIZE_BUDGETS) {
    const entry = entries.find((candidate) => candidate.file === budget.file)

    if (!entry) {
      details.push(
        `${budget.label} (${budget.file}) -- check-size's report has no entry for this file`,
      )
      continue
    }

    if (entry.gzipBytes === null) {
      details.push(`${budget.label} (${budget.file}) -- missing, run \`npm run build\` first`)
      continue
    }

    if (entry.gzipBytes > budget.maxGzipBytes) {
      details.push(
        `${budget.label} (${budget.file}) -- ${String(entry.gzipBytes)}B gzip exceeds ${String(budget.maxGzipBytes)}B budget`,
      )
      continue
    }

    summaryParts.push(
      `${budget.label}: ${String(entry.gzipBytes)}B / ${String(budget.maxGzipBytes)}B`,
    )
  }

  if (details.length > 0) {
    return {
      outcome: "fail",
      rationale: [
        `check-size found ${String(details.length)} issue(s):`,
        ...details.map((detail) => `- ${detail}`),
      ].join("\n"),
    }
  }

  return {
    outcome: "pass",
    rationale: `All gzip size budgets were met (${summaryParts.join(", ")}).`,
  }
}

// check-size.mjs is a pure reporter (see that file) -- this check owns the
// actual required size and enforces it itself, never trusting the script's
// own exit code or its echoed `maxGzipBytes`. `--json` writes the
// machine-readable report to disk rather than stdout, matching the
// mutation/security-secrets checks' own file-based pattern.
export const size: CheckDefinitionConfig = {
  run: [
    "node",
    "scripts/check-size.mjs",
    "--json",
    "reports/size.json",
    ...SIZE_BUDGETS.flatMap((budget) => [
      "--budget",
      `${budget.label}=${String(budget.maxGzipBytes)}`,
    ]),
  ],
  policy: async () => {
    const parsed = await readJsonReport<SizeReport>(
      () => readFile("reports/size.json", "utf8"),
      "check-size did not produce its expected JSON report.",
      "check-size produced invalid JSON evidence.",
    )
    if (!parsed.ok) return parsed.result
    const report = parsed.value

    if (!Array.isArray(report.entries)) {
      return { outcome: "fail", rationale: "check-size produced invalid JSON report data." }
    }

    // Re-annotated rather than used directly: `Array.isArray` narrows its
    // argument to `any[]` regardless of the checked value's declared type
    // (a long-standing TypeScript limitation), so `report.entries` would
    // otherwise silently lose its `SizeReportEntry` element type below.
    const entries: readonly SizeReportEntry[] = report.entries

    return evaluateSizePolicy({ evidence: { ...report, entries } })
  },
}
