// Entry point for the "suppression-governance" self-hosting check, invoked via
// `run: ["tsx", "scripts/suppression-governance/check.ts"]` in repo-contract.config.ts. Prints
// ONLY the JSON evidence to stdout (for `output: { format: "json" }` to parse) -- mirrors
// scripts/api-contract/check.ts's own stdout contract. A human-facing scaffolding notice, when
// stubs were created this run, goes to stderr.
//
// Report-only for policy purposes, like architecture.ts/dead-code.ts: a forbidden or
// under-justified suppression this run *discovers* never fails this script's own exit code -- that
// judgment belongs to checks/suppression-governance.ts's policy, reading this same evidence. Only
// a genuine tool-infrastructure or registry-integrity failure (an unreadable source file, a
// pre-existing registry that fails validation, a `deriveId` collision, a failed write) sets a
// non-zero exit code here.
//
// Unlike a pure read, this check *builds evidence* -- it reconciles the on-disk registry against
// the discovered directives and writes it back (a fresh blank stub per new directive), exactly the
// way `format`/`lint` write on run. On a fully-governed clean tree it produces no diff. See
// specs/decisions/0013-reusable-exception-policy-helper.md's "The exception registry is the review
// surface" section.

import { mkdir } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import {
  loadExceptionRegistry,
  reconcileExceptions,
  writeExceptionRegistry,
} from "../../src/helpers/index.js"
import type { StandardSchemaV1 } from "../../src/helpers/index.js"
import { discoverSuppressions } from "./discover-suppressions.js"
import type { DiscoveredSuppression } from "./discover-suppressions.js"
import {
  asFlatRecords,
  createSuppressionStub,
  deriveSuppressionId,
  SUPPRESSION_EXCEPTION_SCHEMA,
  validateExceptionRegistry,
} from "./evidence-types.js"
import type {
  SuppressionExceptionRecord,
  SuppressionFinding,
  SuppressionGovernanceEvidence,
} from "./evidence-types.js"
import { listSourceFiles } from "./find-source-files.js"

// Repo-root-relative location of the on-disk registry. Lives under `.repo-contract/exceptions/`
// alongside the other reviewed-exception registries. Shown verbatim in this check's error messages
// and evidence, so it stays a forward-slash literal that points a reader straight at the file.
const REGISTRY_RELATIVE_PATH = ".repo-contract/exceptions/disable-comments.json"

/**
 * Wraps the check-owned `validateExceptionRegistry` as a `StandardSchemaV1` for
 * `loadExceptionRegistry` (which owns only the `{ "exceptions": [...] }` envelope and delegates
 * every field-level concern to the schema). Kept inline rather than importing
 * `checks/shared/standard-schema-validator.ts` -- `scripts/` does not depend on `checks/`.
 */
const registrySchema: StandardSchemaV1<unknown, readonly SuppressionExceptionRecord[]> = {
  "~standard": {
    version: 1,
    vendor: "repo-contract",
    validate: (value: unknown) => {
      const result = validateExceptionRegistry(value, SUPPRESSION_EXCEPTION_SCHEMA)
      return result.ok
        ? { value: result.records }
        : { issues: result.errors.map((message) => ({ message })) }
    },
  },
}

/**
 * Collapses byte-identical directives -- two directives sharing every field (`file`, `line`,
 * `domain`, `rule`, `content`, `reason`) are indistinguishable and the registry can only represent
 * one. Directives that share an id but differ in `content` are *not* collapsed here: that is a
 * real ambiguity `reconcileExceptions` surfaces as an integrity failure.
 * @param discovered - Every directive found in source, in discovery order.
 * @returns The findings with their semantic id attached, byte-identical duplicates removed.
 */
function toFindings(discovered: readonly DiscoveredSuppression[]): SuppressionFinding[] {
  const seen = new Set<string>()
  const findings: SuppressionFinding[] = []
  for (const item of discovered) {
    const id = deriveSuppressionId(item)
    const identity = JSON.stringify([
      item.file,
      item.line,
      item.domain,
      item.rule,
      item.content,
      item.reason,
    ])
    if (seen.has(identity)) continue
    seen.add(identity)
    findings.push({
      id,
      domain: item.domain,
      rule: [...item.rule],
      file: item.file,
      line: item.line,
      content: item.content,
      reason: item.reason,
    })
  }
  return findings
}

/**
 * The check's full logic, factored out of the bottom-of-file script invocation so
 * test/integration/suppression-governance can exercise the complete real path (file discovery ->
 * registry load -> reconcile -> write) in-process against a scratch fixture directory.
 * @param root - Absolute path to the repository being checked.
 * @returns The evidence for `output: { format: "json" }`.
 */
export async function runSuppressionGovernanceCheck(
  root: string,
): Promise<SuppressionGovernanceEvidence> {
  const registryPath = path.join(root, REGISTRY_RELATIVE_PATH)

  let discovered: DiscoveredSuppression[]
  try {
    const files = await listSourceFiles(root)
    discovered = await discoverSuppressions(root, files)
  } catch (error) {
    return { ok: false, error: `Suppression discovery failed: ${(error as Error).message}` }
  }
  const findings = toFindings(discovered)

  const loaded = await loadExceptionRegistry({ path: registryPath, schema: registrySchema })
  if (!loaded.ok) {
    return {
      ok: false,
      error: `${REGISTRY_RELATIVE_PATH} failed to load and was left unchanged.`,
      registryValidationErrors: loaded.errors,
    }
  }

  const reconciled = reconcileExceptions<SuppressionFinding, SuppressionExceptionRecord>({
    existing: loaded.records,
    findings,
    deriveId: (finding) => finding.id,
    createStub: createSuppressionStub,
  })
  if (!reconciled.ok) {
    return {
      ok: false,
      error: `Suppression registry integrity failure: ${reconciled.error}`,
    }
  }
  const { activeRecords, staleRecords, newStubIds } = reconciled.reconciliation

  // `writeExceptionRegistry` writes a sibling temp file and renames it over the target -- both need
  // the parent directory to exist. On a first run against a tree with no `.repo-contract/exceptions/`
  // yet (a fresh scratch fixture, a brand-new consumer repo) it must be created first; `recursive`
  // makes this a no-op once it exists. Path containment stays the caller's responsibility, hence
  // this lives here and not in the helper.
  try {
    await mkdir(path.dirname(registryPath), { recursive: true })
  } catch (error) {
    return {
      ok: false,
      error: `Could not create the exceptions directory: ${(error as Error).message}`,
    }
  }

  const write = await writeExceptionRegistry({
    path: registryPath,
    records: asFlatRecords([...activeRecords, ...staleRecords]),
  })
  if (!write.ok) {
    return { ok: false, error: `Writing the suppression registry failed: ${write.error}` }
  }

  const activeExceptions: Record<string, SuppressionExceptionRecord> = {}
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
  const evidence = await runSuppressionGovernanceCheck(process.cwd())
  if (evidence.ok && evidence.scaffoldedIds.length > 0) {
    process.stderr.write(
      `Scaffolded ${String(evidence.scaffoldedIds.length)} exception stub(s) in ${REGISTRY_RELATIVE_PATH}. ` +
        `Fill in "justification" (and "category"/"verificationMethod") and ` +
        `\`git add ${REGISTRY_RELATIVE_PATH}\` before re-running or committing.\n`,
    )
  }
  process.stdout.write(JSON.stringify(evidence))
  process.exitCode = evidence.ok ? 0 : 1
}
