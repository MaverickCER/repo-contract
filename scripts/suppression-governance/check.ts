// Entry point for the "suppression-governance" self-hosting check, invoked via
// `run: ["tsx", "scripts/suppression-governance/check.ts"]` in repo-contract.config.ts. Prints
// ONLY the JSON evidence to stdout (for `output: { format: "json" }` to parse) -- mirrors
// scripts/api-contract/check.ts's own stdout contract.
//
// Report-only, like architecture.ts/dead-code.ts: a forbidden or under-justified suppression this
// run *discovers* never fails this script's own exit code -- that judgment belongs entirely to
// checks/suppression-governance.ts's policy, reading this same evidence. Only a genuine
// tool-infrastructure failure (an unreadable source file, or a pre-existing disable-comments.json
// that fails validation) sets a non-zero exit code here.

import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { discoverSuppressions } from "./discover-suppressions.js"
import type {
  DisableCommentRecord,
  DisableCommentRegistry,
  SuppressionGovernanceEvidence,
} from "./evidence-types.js"
import { listSourceFiles } from "./find-source-files.js"
import { serializeRegistry, validateSuppressionRegistry } from "./registry.js"
import { synchronize, type SynchronizedRecord } from "./synchronize.js"

const REGISTRY_FILE_NAME = "disable-comments.json"

type ExistingRegistryLoad =
  | { readonly ok: true; readonly records: DisableCommentRegistry }
  | { readonly ok: false; readonly evidence: SuppressionGovernanceEvidence }

/**
 * Reads and validates the pre-existing registry, if any. A missing file is a normal, valid "empty
 * registry" state (first run). A present-but-malformed file is deliberately never overwritten by
 * the synchronization step below -- it's surfaced as an `ok: false` tool-infrastructure failure
 * instead, left exactly as found on disk.
 * @param registryPath - Absolute path to disable-comments.json.
 * @returns The existing records, or the `ok: false` evidence to return immediately.
 */
async function loadExistingRegistry(registryPath: string): Promise<ExistingRegistryLoad> {
  let raw: string

  try {
    raw = await readFile(registryPath, "utf8")
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException
    if (nodeError.code === "ENOENT") return { ok: true, records: [] }
    return {
      ok: false,
      evidence: { ok: false, error: `Could not read ${REGISTRY_FILE_NAME}: ${nodeError.message}` },
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    return {
      ok: false,
      evidence: {
        ok: false,
        error: `${REGISTRY_FILE_NAME} is not valid JSON: ${(error as Error).message}`,
      },
    }
  }

  const validated = validateSuppressionRegistry(parsed)
  if (!validated.ok) {
    return {
      ok: false,
      evidence: {
        ok: false,
        error: `${REGISTRY_FILE_NAME} failed validation and was left unchanged.`,
        registryValidationErrors: validated.errors,
      },
    }
  }

  return { ok: true, records: validated.records }
}

/**
 * disable-comments.json's on-disk shape carries only the eleven documented fields -- `status` is
 * evidence-only, never persisted. Every field must be listed explicitly here: this function (along
 * with synchronize.ts's moved/new-record literals) independently reconstructs a record via its own
 * object literal rather than spreading `record` wholesale, so a field added to `DisableCommentRecord`
 * without a matching addition here is silently dropped from disk on every single run -- the reason
 * `category`/`verificationMethod` are typed as *required* fields on the interface, so this exact
 * omission is a `tsc` error instead of a silent data-loss bug.
 * @param record - A synchronized record, `status` included.
 * @returns The same record with `status` dropped.
 */
export function toPersistedRecord(record: SynchronizedRecord): DisableCommentRecord {
  return {
    file: record.file,
    line: record.line,
    domain: record.domain,
    rule: record.rule,
    content: record.content,
    justification: record.justification,
    alternatives: record.alternatives,
    remediation: record.remediation,
    category: record.category,
    verificationMethod: record.verificationMethod,
    reason: record.reason,
  }
}

/**
 * The check's full logic, factored out of the bottom-of-file script invocation so
 * test/integration/suppression-governance can exercise the complete real path (file discovery ->
 * registry load -> synchronization -> write) in-process against a scratch fixture directory,
 * without spawning a subprocess -- matching scripts/api-contract/check.ts's own testing
 * convention.
 * @param root - Absolute path to the repository being checked.
 * @returns The evidence for `output: { format: "json" }`.
 */
export async function runSuppressionGovernanceCheck(
  root: string,
): Promise<SuppressionGovernanceEvidence> {
  const registryPath = path.join(root, REGISTRY_FILE_NAME)

  const existing = await loadExistingRegistry(registryPath)
  if (!existing.ok) return existing.evidence

  let discovered
  try {
    const files = await listSourceFiles(root)
    discovered = await discoverSuppressions(root, files)
  } catch (error) {
    return { ok: false, error: `Suppression discovery failed: ${(error as Error).message}` }
  }

  const { records, newCount, movedCount, removedCount } = synchronize(existing.records, discovered)

  const serialized = serializeRegistry(records.map(toPersistedRecord))
  const currentContent = await readFile(registryPath, "utf8").catch(() => undefined)
  if (currentContent !== serialized) {
    await writeFile(registryPath, serialized, "utf8")
  }

  return {
    ok: true,
    records,
    newCount,
    movedCount,
    removedCount,
    registryPath: REGISTRY_FILE_NAME,
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const evidence = await runSuppressionGovernanceCheck(process.cwd())
  process.stdout.write(JSON.stringify(evidence))
  process.exitCode = evidence.ok ? 0 : 1
}
