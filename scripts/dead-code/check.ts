// Entry point for the self-hosted "dead-code" check, invoked via
// `run: ["tsx", "scripts/dead-code/check.ts"]` in repo-contract.config.ts. Prints ONLY the JSON
// evidence to stdout; a scaffolding notice goes to stderr.
//
// This repository stops using the published `deadCode` preset (`src/presets/dead-code.ts`) for
// its own run -- that preset's `exemptUnusedDevDependencies` option is a config-time exempt list,
// which this repository's own registry-reconciliation model cannot use: the registry that would
// suppress a finding can only be built from findings that already ran unsuppressed, so a
// config-time exempt list is a boot-time chicken-and-egg loop. Running knip raw here, every time,
// with reconciliation happening only *after*, avoids that loop entirely. The published preset
// itself is untouched, for external consumers who want its simpler, non-reconciled model.

import { sync as spawnSync } from "cross-spawn"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import {
  loadExceptionRegistry,
  reconcileExceptions,
  writeExceptionRegistry,
} from "../../src/helpers/index.js"
import type { StandardSchemaV1 } from "../../src/helpers/index.js"
import { asFlatExceptionRecords, validateExceptionRegistry } from "../shared/exception-record.js"
import type {
  DeadCodeEvidence,
  DeadCodeExceptionRecord,
  DeadCodeFinding,
  DeadCodeKind,
} from "./evidence-types.js"
import { deriveDeadCodeId } from "./evidence-types.js"
import { DEAD_CODE_EXCEPTION_SCHEMA, createDeadCodeStub } from "./registry.js"

const REGISTRY_RELATIVE_PATH = ".repo-contract/exceptions/dead-code.json"

const registrySchema: StandardSchemaV1<unknown, readonly DeadCodeExceptionRecord[]> = {
  "~standard": {
    version: 1,
    vendor: "repo-contract",
    validate: (value: unknown) => {
      const result = validateExceptionRegistry(value, DEAD_CODE_EXCEPTION_SCHEMA)
      return result.ok
        ? { value: result.records }
        : { issues: result.errors.map((message) => ({ message })) }
    },
  },
}

/** One entry in a knip `json`-reporter issue category -- see `src/presets/dead-code.ts`'s identical, independently-owned copy of this shape (self-hosting scripts stay independent of the published preset they parallel). */
interface KnipIssueEntry {
  readonly name: string
  readonly line?: number
  readonly col?: number
}

type KnipCategory = readonly (KnipIssueEntry | readonly KnipIssueEntry[])[]

interface KnipIssue {
  readonly file: string
  readonly dependencies?: KnipCategory
  readonly devDependencies?: KnipCategory
  readonly optionalPeerDependencies?: KnipCategory
  readonly unlisted?: KnipCategory
  readonly unresolved?: KnipCategory
  readonly exports?: KnipCategory
  readonly types?: KnipCategory
  readonly nsExports?: KnipCategory
  readonly nsTypes?: KnipCategory
  readonly namespaceMembers?: KnipCategory
  readonly enumMembers?: KnipCategory
  readonly binaries?: KnipCategory
  readonly duplicates?: KnipCategory
  readonly cycles?: KnipCategory
  readonly files?: KnipCategory
}

interface KnipReport {
  readonly issues: readonly KnipIssue[]
}

/** Maps each knip issue-category key to this check's own normalized `DeadCodeKind`. */
const CATEGORY_KIND: Readonly<Record<string, DeadCodeKind>> = {
  dependencies: "unused-dependency",
  devDependencies: "unused-dev-dependency",
  optionalPeerDependencies: "unused-optional-peer-dependency",
  unlisted: "unlisted-dependency",
  unresolved: "unresolved-import",
  exports: "unused-export",
  nsExports: "unused-export-namespace",
  types: "unused-type",
  nsTypes: "unused-type-namespace",
  namespaceMembers: "unused-namespace-member",
  enumMembers: "unused-enum-member",
  binaries: "unlisted-binary",
  duplicates: "duplicate-export",
  cycles: "circular-dependency",
  files: "unused-file",
}

/**
 * Renders one category entry as `{ name, location }`. `duplicates`/`cycles` entries are a group of
 * symbols (knip reports an array); every other category is a single entry.
 * @param entry - A single `KnipIssueEntry`, or a `duplicates`/`cycles` group of them.
 * @returns The joined symbol name(s), and a `:line:col` suffix (empty for a group or a location-less entry).
 */
function formatEntry(entry: KnipIssueEntry | readonly KnipIssueEntry[]): {
  readonly name: string
  readonly location: string
} {
  if (Array.isArray(entry)) {
    return {
      name: (entry as readonly KnipIssueEntry[]).map((member) => member.name).join(", "),
      location: "",
    }
  }
  const single = entry as KnipIssueEntry
  const location =
    typeof single.line === "number" ? `:${String(single.line)}:${String(single.col ?? 1)}` : ""
  return { name: single.name, location }
}

/**
 * Narrows `value` to a non-null, non-array object -- the shape knip's `json`-reporter output, and
 * each of its issue entries, must have before any property on them is read.
 * @param value - The value to check.
 * @returns Whether `value` is a plain object (not `null`, not an array).
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Flattens a raw, parsed knip `json`-reporter report into this check's own `DeadCodeFinding[]`,
 * deduping byte-identical entries (same kind/name/file/location -- indistinguishable). Findings
 * that share an id but differ in file/location are left for `reconcileExceptions` to surface as an
 * integrity failure.
 * @param report - The parsed knip JSON report.
 * @returns Every finding, in report order.
 */
export function buildDeadCodeFindings(report: KnipReport): readonly DeadCodeFinding[] {
  const seen = new Set<string>()
  const findings: DeadCodeFinding[] = []

  for (const issue of report.issues) {
    for (const [category, kind] of Object.entries(CATEGORY_KIND)) {
      const entries = issue[category as keyof KnipIssue] as KnipCategory | undefined
      for (const entry of entries ?? []) {
        const { name, location } = formatEntry(entry)
        if (name.length === 0) continue
        const key = JSON.stringify([kind, name, issue.file, location])
        if (seen.has(key)) continue
        seen.add(key)
        findings.push({
          id: deriveDeadCodeId({ kind, name }),
          kind,
          name,
          file: issue.file,
          location,
        })
      }
    }
  }
  return findings
}

/**
 * Runs `knip --reporter json` and parses its result. Never throws -- every recognized or
 * unrecognized outcome becomes a well-formed result instead.
 * @param cwd - The directory to run knip in (its own config discovery is cwd-relative).
 * @returns The parsed findings, or an error message.
 */
function runKnip(
  cwd: string,
):
  | { readonly ok: true; readonly findings: readonly DeadCodeFinding[] }
  | { readonly ok: false; readonly error: string } {
  const result = spawnSync("knip", ["--reporter", "json"], {
    cwd,
    encoding: "utf8",
    // A full knip run across this repository's own source completes in well under a minute in
    // practice; 5 min is a generous ceiling that still bounds a stalled invocation so it can
    // never hang this check or `npm run contract` indefinitely.
    timeout: 5 * 60 * 1000,
    killSignal: "SIGKILL",
    maxBuffer: 32 * 1024 * 1024,
  })

  if (result.error) {
    const nodeError = result.error as NodeJS.ErrnoException
    if (nodeError.code === "ENOENT") {
      return {
        ok: false,
        error:
          "The `knip` CLI is not installed (it is a required devDependency of this repository).",
      }
    }
    if (nodeError.code === "ETIMEDOUT") {
      return { ok: false, error: "The `knip` CLI timed out (exceeded 5 minutes)." }
    }
    return { ok: false, error: `Failed to spawn the \`knip\` CLI: ${nodeError.message}` }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(result.stdout)
  } catch {
    return { ok: false, error: "`knip --reporter json` produced no parseable JSON output." }
  }
  if (!isPlainObject(parsed) || !Array.isArray(parsed.issues)) {
    return {
      ok: false,
      error: '`knip --reporter json` produced JSON with no recognized "issues" array.',
    }
  }

  return { ok: true, findings: buildDeadCodeFindings(parsed as unknown as KnipReport) }
}

/**
 * The check's full logic: run knip raw (no exemptions), then reconcile
 * `.repo-contract/exceptions/dead-code.json` against every finding and write it back.
 * @param root - Absolute path to the repository (or fixture root) being checked.
 * @returns The full `DeadCodeEvidence`.
 */
export async function runDeadCodeCheck(root: string): Promise<DeadCodeEvidence> {
  const knip = runKnip(root)
  if (!knip.ok) return { ok: false, error: knip.error }
  const { findings } = knip
  const registryPath = path.join(root, REGISTRY_RELATIVE_PATH)

  const empty = {
    registryPath: REGISTRY_RELATIVE_PATH,
    findings,
    activeExceptions: {} as Record<string, DeadCodeExceptionRecord>,
    staleExceptions: [] as readonly DeadCodeExceptionRecord[],
    scaffoldedIds: [] as readonly string[],
  }

  const loaded = await loadExceptionRegistry({ path: registryPath, schema: registrySchema })
  if (!loaded.ok) return { ...empty, ok: true, registryError: loaded.errors }

  const reconciled = reconcileExceptions<DeadCodeFinding, DeadCodeExceptionRecord>({
    existing: loaded.records,
    findings,
    deriveId: (finding) => finding.id,
    createStub: createDeadCodeStub,
  })
  if (!reconciled.ok) return { ...empty, ok: true, registryError: [reconciled.error] }

  const { activeRecords, staleRecords, newStubIds } = reconciled.reconciliation

  try {
    await mkdir(path.dirname(registryPath), { recursive: true })
  } catch (error) {
    return {
      ...empty,
      ok: true,
      registryError: [`Could not create the exceptions directory: ${(error as Error).message}`],
    }
  }
  const write = await writeExceptionRegistry({
    path: registryPath,
    records: asFlatExceptionRecords([...activeRecords, ...staleRecords]),
  })
  if (!write.ok)
    return { ...empty, ok: true, registryError: [`Writing the registry failed: ${write.error}`] }

  const activeExceptions: Record<string, DeadCodeExceptionRecord> = {}
  for (const record of activeRecords) activeExceptions[record.id] = record

  return {
    ok: true,
    registryPath: REGISTRY_RELATIVE_PATH,
    findings,
    activeExceptions,
    staleExceptions: staleRecords,
    scaffoldedIds: newStubIds,
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const evidence = await runDeadCodeCheck(process.cwd())
  if (evidence.ok && evidence.scaffoldedIds.length > 0) {
    process.stderr.write(
      `Scaffolded ${String(evidence.scaffoldedIds.length)} exception stub(s) in ${REGISTRY_RELATIVE_PATH}. ` +
        `Fill in each "justification" and \`git add ${REGISTRY_RELATIVE_PATH}\` before re-running or committing.\n`,
    )
  }
  process.stdout.write(JSON.stringify(evidence))
  process.exitCode = evidence.ok && evidence.registryError === undefined ? 0 : 1
}
