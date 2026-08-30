import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import * as ts from "typescript"
import { loadApiModel, runApiExtractor } from "../../../scripts/api-contract/extractor-adapter.js"
import type { ApiPackage } from "@microsoft/api-extractor-model"

/**
 * Compiles a tiny, real TypeScript source file into declarations and runs the real
 * `runApiExtractor`/`loadApiModel` adapter against it -- used by model-normalizer.test.ts,
 * schema-version-consistency.test.ts, and check.integration.test.ts, all of which need a real
 * `ApiPackage` (and, for the integration test, a real `.d.ts` rollup) rather than mocked data, per
 * the project's real-behavior-over-mocking house style.
 */

interface FixturePackage {
  readonly root: string
  readonly pkg: ApiPackage
  readonly apiJsonPath: string
  readonly apiJsonText: string
  readonly dtsRollupPath: string
  readonly dtsRollupText: string
  readonly packageName: string
}

function compileDeclarations(root: string): void {
  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    declaration: true,
    emitDeclarationOnly: true,
    outDir: path.join(root, "dist"),
    rootDir: path.join(root, "src"),
    strict: true,
    skipLibCheck: true,
  }

  const program = ts.createProgram([path.join(root, "src", "index.ts")], compilerOptions)
  const result = program.emit()
  const diagnostics = [...ts.getPreEmitDiagnostics(program), ...result.diagnostics]
  if (diagnostics.length > 0) {
    const messages = diagnostics
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))
      .join("\n")
    throw new Error(`Fixture package failed to compile:\n${messages}`)
  }
}

/**
 * Writes a fixture package's source, package.json, and tsconfig.json, and compiles it to
 * `dist/*.d.ts` -- everything `runApiContractCheck`/`runApiExtractor` need to find on disk, without
 * itself invoking the extractor (unlike `buildFixturePackage`, used where the caller -- e.g. the
 * real `runApiContractCheck` under test -- must be the one to run it).
 */
export async function writeFixtureSource(
  root: string,
  sourceText: string,
  packageName = "fixture-package",
  version = "1.0.0",
): Promise<void> {
  await mkdir(path.join(root, "src"), { recursive: true })
  await writeFile(path.join(root, "src", "index.ts"), sourceText, "utf8")
  // Mirror the real repository's own .gitattributes rule for this path (see the
  // repo-root .gitattributes): API Extractor emits the baseline.api.json /
  // baseline.d.ts snapshots with CRLF line endings unconditionally, and
  // `readBaseline` compares `git show HEAD:...` output byte-for-byte against the
  // hash recorded in baseline.meta.json. Without `-text` here, a fixture repo
  // created on Windows (where `core.autocrlf=true` is the runner default)
  // normalizes those CRLFs to LF on `git add`, so the committed blob no longer
  // matches its own recorded hash and every baseline read throws "corrupted
  // baseline". macOS/Linux runners leave line endings alone and never hit this.
  await writeFile(path.join(root, ".gitattributes"), ".repo-contract/** -text\n", "utf8")
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: packageName, version, types: "dist/index.d.ts" }),
    "utf8",
  )
  await writeFile(
    path.join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        strict: true,
        skipLibCheck: true,
      },
      include: ["src"],
    }),
    "utf8",
  )

  compileDeclarations(root)
}

export async function buildFixturePackage(
  root: string,
  sourceText: string,
  packageName = "fixture-package",
): Promise<FixturePackage> {
  await writeFixtureSource(root, sourceText, packageName)

  const outDir = path.join(root, ".out")
  await mkdir(outDir, { recursive: true })

  const extractResult = runApiExtractor({
    projectFolder: root,
    mainEntryPointFilePath: "dist/index.d.ts",
    tsconfigFilePath: path.join(root, "tsconfig.json"),
    apiJsonFilePath: path.join(outDir, "current.api.json"),
    dtsRollupFilePath: path.join(outDir, "current.d.ts"),
    apiReportFolder: outDir,
    apiReportFileName: "current",
  })

  if (!extractResult.succeeded) {
    throw new Error(
      `API Extractor reported ${String(extractResult.errorCount)} error(s) analyzing fixture package.`,
    )
  }

  const apiJsonText = await readFile(extractResult.apiJsonFilePath, "utf8")
  const dtsRollupText = await readFile(extractResult.dtsRollupFilePath, "utf8")
  const { pkg } = loadApiModel(extractResult.apiJsonFilePath)

  return {
    root,
    pkg,
    apiJsonPath: extractResult.apiJsonFilePath,
    apiJsonText,
    dtsRollupPath: extractResult.dtsRollupFilePath,
    dtsRollupText,
    packageName,
  }
}
