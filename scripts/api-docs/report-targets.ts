/**
 * The public entry points this feature generates an API Extractor report for, and the shared
 * extraction routine every caller runs against: check.ts (drift/completeness detection),
 * generate.ts (the human-invoked markdown regeneration command), and
 * `../api-docs-html/generate.ts` (the HTML API reference generator, which needs this same
 * extraction's Doc Model JSON rather than running API Extractor a second time -- see
 * `GenerateApiReportsOptions.docModelFolder`). Isolates every caller from
 * `../api-contract/extractor-adapter.js`'s own API Extractor details, the same way that adapter
 * isolates the rest of the api-contract feature from `@microsoft/api-extractor` itself.
 */
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises"
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
 * Every public entry point this feature documents -- the package root, `repo-contract/presets`,
 * and `repo-contract/helpers` (specs/decisions/0013-reusable-exception-policy-helper.md). Points
 * at `dist/.dts/`'s own real declaration files, not the
 * `dist/index.d.ts`/`dist/presets.d.ts`/`dist/helpers.d.ts` shims scripts/emit-dts-shims.mjs
 * writes over them (there purely so consumers' declaration maps resolve) -- a
 * `@packageDocumentation` comment is only recognized on the literal entry file API Extractor is
 * pointed at, and a bare `export * from "./.dts/index.js"` shim carries none of its own. The
 * internal api-contract check (scripts/api-contract/check.ts) has no such requirement and
 * deliberately keeps using the shim path -- its own concern is re-exported symbol shapes, not
 * package-level documentation.
 */
const API_REPORT_TARGETS: readonly ApiReportTarget[] = [
  { mainEntryPointFilePath: "dist/.dts/index.d.ts", reportFileName: "repo-contract" },
  {
    mainEntryPointFilePath: "dist/.dts/presets/index.d.ts",
    reportFileName: "repo-contract-presets",
  },
  {
    mainEntryPointFilePath: "dist/.dts/helpers/index.d.ts",
    reportFileName: "repo-contract-helpers",
  },
]

export interface GeneratedApiReport {
  readonly reportFileName: string
  /** Absolute path the report was written to, inside `reportFolder`. */
  readonly reportPath: string
  readonly content: string
  /**
   * Absolute path of this target's Doc Model JSON (`<reportFileName>.api.json`), preserved only
   * when `options.docModelFolder` was supplied to {@link generateApiReports} -- otherwise the
   * file was written to a throwaway scratch directory and discarded, as before.
   */
  readonly apiJsonPath?: string
}

export interface GenerateApiReportsOptions {
  /**
   * Absolute folder to ALSO write each target's `<reportFileName>.api.json` Doc Model into,
   * preserved after this call returns (`generateApiReports` still creates it if missing). Omit to
   * keep the original behavior: the Doc Model is written to a throwaway scratch directory and
   * discarded, since the human-readable report is all this feature needed historically.
   * `scripts/api-docs-html/generate.ts` is the one caller that supplies this, to render the same
   * Doc Model into HTML without running API Extractor a second time.
   */
  readonly docModelFolder?: string
}

/**
 * Runs API Extractor once per `API_REPORT_TARGETS` entry, writing each `<reportFileName>.api.md`
 * into `reportFolder`. The `.d.ts` rollup API Extractor also always produces is written to a
 * throwaway scratch directory and discarded either way -- nothing in this feature or its callers
 * needs it. The Doc Model JSON is discarded the same way UNLESS `options.docModelFolder` is
 * supplied, in which case it's preserved there and returned via each report's `apiJsonPath`.
 * @param root - Absolute path to the repository root; must contain a built `dist/` and `tsconfig.json`.
 * @param reportFolder - Absolute path to write each target's report into. Pass the committed
 *   `docs/api-report/` to regenerate it in place, or a scratch directory to inspect fresh output
 *   without touching the committed files.
 * @param options - See {@link GenerateApiReportsOptions}.
 * @returns Each target's generated report, content included.
 */
export async function generateApiReports(
  root: string,
  reportFolder: string,
  options: GenerateApiReportsOptions = {},
): Promise<GeneratedApiReport[]> {
  const scratchDir = await mkdtemp(path.join(os.tmpdir(), "repo-contract-api-docs-"))

  if (options.docModelFolder !== undefined) {
    await mkdir(options.docModelFolder, { recursive: true })
  }

  try {
    const reports: GeneratedApiReport[] = []

    for (const target of API_REPORT_TARGETS) {
      const apiJsonFilePath = path.join(
        options.docModelFolder ?? scratchDir,
        `${target.reportFileName}.api.json`,
      )

      const result = runApiExtractor({
        projectFolder: root,
        mainEntryPointFilePath: target.mainEntryPointFilePath,
        tsconfigFilePath: path.join(root, "tsconfig.json"),
        apiJsonFilePath,
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
        ...(options.docModelFolder !== undefined ? { apiJsonPath: apiJsonFilePath } : {}),
      })
    }

    return reports
  } finally {
    await rm(scratchDir, { recursive: true, force: true })
  }
}
