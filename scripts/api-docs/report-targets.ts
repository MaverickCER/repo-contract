/**
 * The public entry points this feature generates an API Extractor report for, and the shared
 * extraction routine both check.ts (drift/completeness detection) and generate.ts (the
 * human-invoked regeneration command) run against. Isolates both callers from
 * `../api-contract/extractor-adapter.js`'s own API Extractor details, the same way that adapter
 * isolates the rest of the api-contract feature from `@microsoft/api-extractor` itself.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { runApiExtractor } from "../api-contract/extractor-adapter.js"

interface ApiReportTarget {
  /** Relative to the repository root, e.g. "dist/index.d.ts". */
  readonly mainEntryPointFilePath: string
  /** Base file name (no extension), e.g. "repo-contract" -> repo-contract.api.md. */
  readonly reportFileName: string
}

/**
 * Every public entry point this feature documents -- the package root and `repo-contract/presets`.
 * Points at `dist/.dts/`'s own real declaration files, not the `dist/index.d.ts`/`dist/presets.d.ts`
 * shims scripts/emit-dts-shims.mjs writes over them (there purely so consumers' declaration maps
 * resolve) -- a `@packageDocumentation` comment is only recognized on the literal entry file API
 * Extractor is pointed at, and a bare `export * from "./.dts/index.js"` shim carries none of its
 * own. The internal api-contract check (scripts/api-contract/check.ts) has no such requirement and
 * deliberately keeps using the shim path -- its own concern is re-exported symbol shapes, not
 * package-level documentation.
 */
const API_REPORT_TARGETS: readonly ApiReportTarget[] = [
  { mainEntryPointFilePath: "dist/.dts/index.d.ts", reportFileName: "repo-contract" },
  {
    mainEntryPointFilePath: "dist/.dts/presets/index.d.ts",
    reportFileName: "repo-contract-presets",
  },
]

export interface GeneratedApiReport {
  readonly reportFileName: string
  /** Absolute path the report was written to, inside `reportFolder`. */
  readonly reportPath: string
  readonly content: string
}

/**
 * Runs API Extractor once per `API_REPORT_TARGETS` entry, writing each `<reportFileName>.api.md`
 * into `reportFolder`. The Doc Model JSON and `.d.ts` rollup API Extractor also always produces
 * are written to a throwaway scratch directory and discarded -- this feature only needs the
 * human-readable report, never the machine-readable ones the internal api-contract check already
 * owns (see specs/decisions/0008-api-contract-compatibility-gate.md).
 * @param root - Absolute path to the repository root; must contain a built `dist/` and `tsconfig.json`.
 * @param reportFolder - Absolute path to write each target's report into. Pass the committed
 *   `docs/api-report/` to regenerate it in place, or a scratch directory to inspect fresh output
 *   without touching the committed files.
 * @returns Each target's generated report, content included.
 */
export async function generateApiReports(
  root: string,
  reportFolder: string,
): Promise<GeneratedApiReport[]> {
  const scratchDir = await mkdtemp(path.join(os.tmpdir(), "repo-contract-api-docs-"))

  try {
    const reports: GeneratedApiReport[] = []

    for (const target of API_REPORT_TARGETS) {
      const result = runApiExtractor({
        projectFolder: root,
        mainEntryPointFilePath: target.mainEntryPointFilePath,
        tsconfigFilePath: path.join(root, "tsconfig.json"),
        apiJsonFilePath: path.join(scratchDir, `${target.reportFileName}.api.json`),
        dtsRollupFilePath: path.join(scratchDir, `${target.reportFileName}.d.ts`),
        apiReportFolder: reportFolder,
        apiReportFileName: target.reportFileName,
      })

      if (!result.succeeded) {
        throw new Error(
          `API Extractor reported ${String(result.errorCount)} error(s) for "${target.reportFileName}" -- see stderr above for details.`,
        )
      }

      reports.push({
        reportFileName: target.reportFileName,
        reportPath: result.apiReportFilePath,
        content: await readFile(result.apiReportFilePath, "utf8"),
      })
    }

    return reports
  } finally {
    await rm(scratchDir, { recursive: true, force: true })
  }
}
