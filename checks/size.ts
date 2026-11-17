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
// CJS runs a few hundred bytes larger than ESM for the same source, because
// of esbuild's interop wrappers (`__toCommonJS` and a getter per named
// export). Both formats share one budget sized for CJS.
export const SIZE_BUDGETS: readonly SizeBudget[] = [
  // Budgets only this package's compiled source: there are no runtime
  // `dependencies` at all (glob matching is src/helpers/glob-match.ts).
  // Every published `exports` entrypoint is budgeted in both formats, so a
  // regression in either file alone fails this check.
  { label: "index (esm)", file: "dist/index.js", maxGzipBytes: 13 * 1024 },
  { label: "index (cjs)", file: "dist/index.cjs", maxGzipBytes: 13 * 1024 },
  // The preset redesign (tiers' presets, the mutation verdict, the v2 exception record) took the
  // CJS bundle from about 13 KiB to 33 KiB; CJS inlines what ESM shares in chunks.
  { label: "presets (esm)", file: "dist/presets.js", maxGzipBytes: 42 * 1024 },
  { label: "presets (cjs)", file: "dist/presets.cjs", maxGzipBytes: 42 * 1024 },
  // These three budgets also add about a quarter of headroom over their CJS size. A stray
  // dependency or a duplicated module then shows up as a failure, not a trend.
  // The v2 exception record and the registry inventory took helpers' CJS to about 10 KiB.
  { label: "helpers (esm)", file: "dist/helpers.js", maxGzipBytes: 13 * 1024 },
  { label: "helpers (cjs)", file: "dist/helpers.cjs", maxGzipBytes: 13 * 1024 },
  { label: "affected (esm)", file: "dist/affected.js", maxGzipBytes: 23 * 1024 },
  { label: "affected (cjs)", file: "dist/affected.cjs", maxGzipBytes: 23 * 1024 },
  { label: "metrics (esm)", file: "dist/metrics.js", maxGzipBytes: 5 * 1024 },
  { label: "metrics (cjs)", file: "dist/metrics.cjs", maxGzipBytes: 5 * 1024 },
  // tiers' CJS inlines every preset it builds on, about 31 KiB.
  { label: "tiers (esm)", file: "dist/tiers.js", maxGzipBytes: 40 * 1024 },
  { label: "tiers (cjs)", file: "dist/tiers.cjs", maxGzipBytes: 40 * 1024 },
  // Each tool-config helper returns a plain object; each is under 2 KiB in CJS.
  { label: "config (esm)", file: "dist/config.js", maxGzipBytes: 2 * 1024 },
  { label: "config (cjs)", file: "dist/config.cjs", maxGzipBytes: 2 * 1024 },
  { label: "config/knip (esm)", file: "dist/config/knip.js", maxGzipBytes: 2 * 1024 },
  { label: "config/knip (cjs)", file: "dist/config/knip.cjs", maxGzipBytes: 2 * 1024 },
  { label: "config/stryker (esm)", file: "dist/config/stryker.js", maxGzipBytes: 2 * 1024 },
  { label: "config/stryker (cjs)", file: "dist/config/stryker.cjs", maxGzipBytes: 2 * 1024 },
  { label: "config/tsup (esm)", file: "dist/config/tsup.js", maxGzipBytes: 2 * 1024 },
  { label: "config/tsup (cjs)", file: "dist/config/tsup.cjs", maxGzipBytes: 2 * 1024 },
  { label: "config/typedoc (esm)", file: "dist/config/typedoc.js", maxGzipBytes: 2 * 1024 },
  { label: "config/typedoc (cjs)", file: "dist/config/typedoc.cjs", maxGzipBytes: 2 * 1024 },
  { label: "config/vitest (esm)", file: "dist/config/vitest.js", maxGzipBytes: 2 * 1024 },
  { label: "config/vitest (cjs)", file: "dist/config/vitest.cjs", maxGzipBytes: 2 * 1024 },
]

export interface SizeReportEntry {
  readonly label: string
  readonly file: string
  /** `null` when the entry point didn't exist at check time (e.g. `npm run build` wasn't run first). */
  readonly gzipBytes: number | null
  /** Echoed back from this check's `--budget` args, purely for a self-describing report: the policy below never reads this field, only `SIZE_BUDGETS`. */
  readonly maxGzipBytes: number | null
}

export interface SizeReport {
  readonly generatedAt: string
  readonly entries: readonly SizeReportEntry[]
}

/**
 * The size check's full interpretation logic, factored out for direct unit testing.
 * test/unit/size/policy.test.ts exercises every budget comparison against an already-parsed
 * report, without spawning scripts/check-size.mjs. This matches every other check's
 * `evaluate<Name>Policy` convention (see e.g. checks/adr-governance.ts).
 * @param root0 - the policy input.
 * @param root0.evidence - the size check's parsed report: one entry per budgeted file.
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
// script's exit code or its echoed `maxGzipBytes`. `--json` writes the
// machine-readable report to disk rather than stdout, matching the
// mutation/security-secrets checks' file-based pattern.
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

    // `Array.isArray` narrows its argument to `any[]` whatever the checked
    // value's declared type (a long-standing TypeScript limitation). This
    // annotation keeps the `SizeReportEntry` element type for the policy
    // call below.
    const entries: readonly SizeReportEntry[] = report.entries

    return evaluateSizePolicy({ evidence: { ...report, entries } })
  },
}
