import { readFile } from "node:fs/promises"
import { readJsonReport } from "../src/presets/shared/read-json-report.js"
import type { CheckDefinitionConfig, PolicyResult } from "../src/types.js"

interface SizeBudget {
  readonly label: string
  readonly file: string
  readonly maxGzipBytes: number
}

// The one place the required gzip sizes live. scripts/check-size.mjs only
// measures and reports. Each budget is matched against its report entry by
// `file`, never trusted from anything the script echoes back.
//
// These are regression tripwires. Nothing ships this package to a browser,
// so size matters only as a signal: an inlined runtime dependency blows past
// any sane budget. Each budget sits about 25-30% above the current gzip size.
// Ordinary feature work stays under it, and an inlined dependency does not.
// Bump a budget deliberately when a capability grows the bundle; `npm run
// size` prints the current figure against it.
//
// Budget history: 10->13 KB and 7->9 KB when tsup.config.ts stopped
// minifying, then presets 9->10 KB when the `distNoUrls` scanner and the glob
// matcher landed, then presets 10->16 KB when the `aiReview` preset landed
// (12.1 KiB gzip CJS).
//
// CJS runs a few hundred bytes larger than ESM for the same source, because
// of esbuild's interop wrappers (`__toCommonJS` and a getter per named
// export). Both formats share one budget sized for CJS.
export const SIZE_BUDGETS: readonly SizeBudget[] = [
  // Budgets only this package's own compiled source: there are no runtime
  // `dependencies` at all (glob matching is src/helpers/glob-match.ts).
  // Both `.` entrypoint formats: ESM and CJS share one budget sized for the
  // larger (CJS; see the comment above). Without the ESM entry a regression
  // in `dist/index.js` alone was undetectable by this check.
  { label: "index (esm)", file: "dist/index.js", maxGzipBytes: 13 * 1024 },
  { label: "index (cjs)", file: "dist/index.cjs", maxGzipBytes: 13 * 1024 },
  // `./presets` is an equally published `exports` entrypoint (package.json):
  // without its own budget a regression here was undetectable by this check.
  { label: "presets (esm)", file: "dist/presets.js", maxGzipBytes: 16 * 1024 },
  { label: "presets (cjs)", file: "dist/presets.cjs", maxGzipBytes: 16 * 1024 },
  // The three barrels added since. When these budgets were set they measured about 7, 18 and
  // 4 KiB gzip (CJS, the larger format). Each budget adds a quarter of headroom, so a stray
  // dependency or a duplicated module shows up as a failure, not a trend.
  { label: "helpers (esm)", file: "dist/helpers.js", maxGzipBytes: 9 * 1024 },
  { label: "helpers (cjs)", file: "dist/helpers.cjs", maxGzipBytes: 9 * 1024 },
  { label: "affected (esm)", file: "dist/affected.js", maxGzipBytes: 23 * 1024 },
  { label: "affected (cjs)", file: "dist/affected.cjs", maxGzipBytes: 23 * 1024 },
  { label: "metrics (esm)", file: "dist/metrics.js", maxGzipBytes: 5 * 1024 },
  { label: "metrics (cjs)", file: "dist/metrics.cjs", maxGzipBytes: 5 * 1024 },
]

export interface SizeReportEntry {
  readonly label: string
  readonly file: string
  /** `null` when the entry point didn't exist at check time (e.g. `npm run build` wasn't run first). */
  readonly gzipBytes: number | null
  /** Echoed back from this check's own `--budget` args, purely for a self-describing report: the policy below never reads this field, only `SIZE_BUDGETS`. */
  readonly maxGzipBytes: number | null
}

export interface SizeReport {
  readonly generatedAt: string
  readonly entries: readonly SizeReportEntry[]
}

/**
 * The size check's full interpretation logic, factored out for direct unit testing.
 * test/unit/size/policy.test.ts exercises every budget comparison against an already-parsed
 * report, without spawning scripts/check-size.mjs. This matches every other check's own
 * `evaluate<Name>Policy` convention (see e.g. checks/adr-governance.ts).
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
        `${budget.label} (${budget.file}): check-size's report has no entry for this file`,
      )
      continue
    }

    if (entry.gzipBytes === null) {
      details.push(`${budget.label} (${budget.file}): missing, run \`npm run build\` first`)
      continue
    }

    if (entry.gzipBytes > budget.maxGzipBytes) {
      details.push(
        `${budget.label} (${budget.file}): ${String(entry.gzipBytes)}B gzip exceeds ${String(budget.maxGzipBytes)}B budget`,
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

// The check-size.mjs script is a pure reporter (see that file). This check
// owns the required size and enforces it itself. It never trusts the
// script's own exit code or its echoed `maxGzipBytes`. `--json` writes the
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

    // Re-annotated rather than used directly. `Array.isArray` narrows its
    // argument to `any[]` regardless of the checked value's declared type
    // (a long-standing TypeScript limitation). `report.entries` would
    // otherwise silently lose its `SizeReportEntry` element type below.
    const entries: readonly SizeReportEntry[] = report.entries

    return evaluateSizePolicy({ evidence: { ...report, entries } })
  },
}
