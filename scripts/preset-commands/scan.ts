// Entry point for the "preset-commands" self-hosting check, invoked via
// `run: ["tsx", "scripts/preset-commands/scan.ts"]` in repo-contract.config.ts. Prints ONLY the
// JSON evidence to stdout; a scaffolding notice goes to stderr.
//
// Report-only for policy purposes (checks/preset-commands.ts's policy judges the evidence). A
// genuine tool-infrastructure or registry-integrity failure sets a non-zero exit code here.
//
// This is a repository-internal review mechanism, not shipped code: it discovers every external
// command a published preset (src/presets/*.ts) spawns and holds each to a reviewed record in
// .repo-contract/exceptions/preset-commands.json -- the reconciled successor to the former
// ALLOWED_PRESET_COMMANDS allowlist. See specs/decisions/0007-no-network-surface.md.

import { mkdir, readFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import * as ts from "typescript"
import {
  loadExceptionRegistry,
  reconcileExceptions,
  writeExceptionRegistry,
} from "../../src/helpers/index.js"
import type { StandardSchemaV1 } from "../../src/helpers/index.js"
import { listSourceFiles } from "../suppression-governance/find-source-files.js"
import { asFlatExceptionRecords, validateExceptionRegistry } from "../shared/exception-record.js"
import type {
  NonLiteralPresetCommand,
  PresetCommandExceptionRecord,
  PresetCommandFinding,
  PresetCommandsEvidence,
} from "./evidence-types.js"
import { derivePresetCommandId } from "./evidence-types.js"
import { PRESET_COMMAND_EXCEPTION_SCHEMA, createPresetCommandStub } from "./registry.js"
import { guidanceFor } from "./review-guidance.js"

const REGISTRY_RELATIVE_PATH = ".repo-contract/exceptions/preset-commands.json"

const registrySchema: StandardSchemaV1<unknown, readonly PresetCommandExceptionRecord[]> = {
  "~standard": {
    version: 1,
    vendor: "repo-contract",
    validate: (value: unknown) => {
      const result = validateExceptionRegistry(value, PRESET_COMMAND_EXCEPTION_SCHEMA)
      return result.ok
        ? { value: result.records }
        : { issues: result.errors.map((message) => ({ message })) }
    },
  },
}

/**
 * Only `src/presets/**\/*.ts` -- the published preset modules whose `run:` properties become the
 * commands repo-contract spawns on a consumer's behalf.
 * @param repoRelativePath - A repo-relative, POSIX-separated file path.
 * @returns `true` if this file is a published preset module.
 */
function isPresetModule(repoRelativePath: string): boolean {
  return repoRelativePath.startsWith("src/presets/") && repoRelativePath.endsWith(".ts")
}

/**
 * Peels off `as const`, `satisfies <Type>`, and parenthesization -- none change a `run:`
 * initializer's runtime value.
 * @param expr - The expression to unwrap.
 * @returns The innermost expression once every such wrapper is removed.
 */
function unwrapTypeWrapper(expr: ts.Expression): ts.Expression {
  if (ts.isAsExpression(expr) || ts.isSatisfiesExpression(expr)) {
    return unwrapTypeWrapper(expr.expression)
  }
  if (ts.isParenthesizedExpression(expr)) return unwrapTypeWrapper(expr.expression)
  return expr
}

interface ScanResult {
  readonly commands: readonly {
    readonly command: string
    readonly file: string
    readonly line: number
  }[]
  readonly nonLiteral: readonly NonLiteralPresetCommand[]
}

/**
 * Scans one preset module's AST for every `run:` property, extracting the first token of each.
 * @param relativePath - The file's repo-relative path.
 * @param text - The file's full source text.
 * @returns Every resolvable command name found, and every `run:` whose first token isn't a literal.
 */
export function scanPresetModule(relativePath: string, text: string): ScanResult {
  const sourceFile = ts.createSourceFile(relativePath, text, ts.ScriptTarget.Latest, true)
  const commands: { command: string; file: string; line: number }[] = []
  const nonLiteral: NonLiteralPresetCommand[] = []

  /**
   * The 1-based source line of `node`'s start.
   * @param node - The AST node.
   * @returns The 1-based line number.
   */
  function lineOf(node: ts.Node): number {
    return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
  }

  /**
   * Inspects one `run:` property's initializer, recording either the resolved command name or a
   * non-literal entry.
   * @param initializer - The `run:` property's value expression.
   */
  function checkRunProperty(initializer: ts.Expression): void {
    const value = unwrapTypeWrapper(initializer)

    let first: ts.Expression | undefined
    if (ts.isArrayLiteralExpression(value)) {
      const [element] = value.elements
      first = element === undefined ? undefined : unwrapTypeWrapper(element)
    } else if (ts.isStringLiteralLike(value)) {
      first = value
    }

    if (first === undefined) {
      // An empty `run: []` array literal is a real config, just not one that spawns anything --
      // nothing to review.
      if (ts.isArrayLiteralExpression(value) && value.elements.length === 0) return
      nonLiteral.push({
        file: relativePath,
        line: lineOf(value),
        detail: "The run property's first token is not a statically-resolvable string literal.",
      })
      return
    }

    if (ts.isStringLiteralLike(first)) {
      const [firstToken] = first.text.trim().split(/\s+/)
      if (firstToken !== undefined && firstToken.length > 0) {
        commands.push({ command: firstToken, file: relativePath, line: lineOf(first) })
      }
      return
    }

    nonLiteral.push({
      file: relativePath,
      line: lineOf(first),
      detail: "The run array's first element is not a string literal.",
    })
  }

  /**
   * Recursively walks the subtree rooted at `node`, dispatching every `run:` property.
   * @param node - The AST node (or subtree root) to inspect.
   */
  function visit(node: ts.Node): void {
    if (
      ts.isPropertyAssignment(node) &&
      (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
      node.name.text === "run"
    ) {
      checkRunProperty(node.initializer)
    } else if (ts.isShorthandPropertyAssignment(node) && node.name.text === "run") {
      nonLiteral.push({
        file: relativePath,
        line: lineOf(node),
        detail: "The run property uses shorthand syntax; its command cannot be verified.",
      })
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return { commands, nonLiteral }
}

/**
 * Discovers every preset command across `src/presets/**`.
 * @param root - Absolute path to the repository (or fixture root).
 * @returns Deduped findings (one per command name, keeping the first occurrence), and any non-literal `run:` properties.
 */
export async function scanPresetCommands(root: string): Promise<{
  readonly findings: readonly PresetCommandFinding[]
  readonly nonLiteral: readonly NonLiteralPresetCommand[]
}> {
  const files = (await listSourceFiles(root)).filter((relativePath) => isPresetModule(relativePath))
  const perFile = await Promise.all(
    files.map(async (relativePath) => {
      const text = await readFile(path.join(root, relativePath), "utf8")
      return scanPresetModule(relativePath, text)
    }),
  )

  const seen = new Set<string>()
  const findings: PresetCommandFinding[] = []
  const nonLiteral: NonLiteralPresetCommand[] = []
  for (const result of perFile) {
    nonLiteral.push(...result.nonLiteral)
    for (const { command, file, line } of result.commands) {
      if (seen.has(command)) continue
      seen.add(command)
      findings.push({ id: derivePresetCommandId({ command }), command, file, line })
    }
  }
  return { findings, nonLiteral }
}

/**
 * The check's full logic: scan, then reconcile `.repo-contract/exceptions/preset-commands.json`
 * against the discovered commands and write it back.
 * @param root - Absolute path to the repository (or fixture root).
 * @returns The full `PresetCommandsEvidence`.
 */
export async function runPresetCommandsScan(root: string): Promise<PresetCommandsEvidence> {
  let scanned: Awaited<ReturnType<typeof scanPresetCommands>>
  try {
    scanned = await scanPresetCommands(root)
  } catch (error) {
    return { ok: false, error: `Preset-command discovery failed: ${(error as Error).message}` }
  }
  const { findings, nonLiteral } = scanned
  const registryPath = path.join(root, REGISTRY_RELATIVE_PATH)

  const base = {
    registryPath: REGISTRY_RELATIVE_PATH,
    findings,
    nonLiteral,
    activeExceptions: {} as Record<string, PresetCommandExceptionRecord>,
    staleExceptions: [] as readonly PresetCommandExceptionRecord[],
    scaffoldedIds: [] as readonly string[],
  }

  const loaded = await loadExceptionRegistry({ path: registryPath, schema: registrySchema })
  if (!loaded.ok) return { ...base, ok: true, registryError: loaded.errors }

  const reconciled = reconcileExceptions<PresetCommandFinding, PresetCommandExceptionRecord>({
    existing: loaded.records,
    findings,
    deriveId: (finding) => finding.id,
    createStub: createPresetCommandStub,
  })
  if (!reconciled.ok) return { ...base, ok: true, registryError: [reconciled.error] }

  const { activeRecords, staleRecords, newStubIds } = reconciled.reconciliation

  try {
    await mkdir(path.dirname(registryPath), { recursive: true })
  } catch (error) {
    return {
      ...base,
      ok: true,
      registryError: [`Could not create the exceptions directory: ${(error as Error).message}`],
    }
  }
  const write = await writeExceptionRegistry({
    path: registryPath,
    records: asFlatExceptionRecords([...activeRecords, ...staleRecords]),
  })
  if (!write.ok)
    return { ...base, ok: true, registryError: [`Writing the registry failed: ${write.error}`] }

  const activeExceptions: Record<string, PresetCommandExceptionRecord> = {}
  for (const record of activeRecords) activeExceptions[record.id] = record

  return {
    ok: true,
    registryPath: REGISTRY_RELATIVE_PATH,
    findings,
    nonLiteral,
    activeExceptions,
    staleExceptions: staleRecords,
    scaffoldedIds: newStubIds,
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const evidence = await runPresetCommandsScan(process.cwd())
  if (evidence.ok && evidence.scaffoldedIds.length > 0) {
    const lines = evidence.scaffoldedIds.map(
      (id) => `  - ${guidanceFor(id.slice("preset-command:".length))}`,
    )
    process.stderr.write(
      `Scaffolded ${String(evidence.scaffoldedIds.length)} preset-command stub(s) in ${REGISTRY_RELATIVE_PATH}:\n${lines.join("\n")}\n` +
        `Fill in each "justification" and \`git add ${REGISTRY_RELATIVE_PATH}\` before re-running or committing.\n`,
    )
  }
  process.stdout.write(JSON.stringify(evidence))
  process.exitCode = evidence.ok && evidence.registryError === undefined ? 0 : 1
}
