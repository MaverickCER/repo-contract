/**
 * The read, reconcile, write-back sequence every registry-backed check runs. It is the one place a
 * check writes to the consumer's tree: a blank stub for each new finding, and a stale record kept
 * so the check's policy can fail on it.
 */
import { mkdir as mkdirFromFs } from "node:fs/promises"
import path from "node:path"
import type { StandardSchemaV1 } from "../standard-schema/types.js"
import { asFlatExceptionRecords } from "./exception-record.js"
import { loadExceptionRegistry } from "./load-exception-registry.js"
import { reconcileExceptions } from "./reconcile-exceptions.js"
import { writeExceptionRegistry } from "./write-exception-registry.js"

/** A registry after a batch of findings was reconciled against it and written back. */
export interface PersistedExceptionRegistry<TRecord> {
  readonly activeRecords: readonly TRecord[]
  readonly staleRecords: readonly TRecord[]
  readonly newStubIds: readonly string[]
}

/** The reconciled registry, or the rationale a check fails with when it cannot be read or written. */
export type PersistExceptionRegistryResult<TRecord> =
  | { readonly ok: true; readonly registry: PersistedExceptionRegistry<TRecord> }
  | { readonly ok: false; readonly rationale: string }

/**
 * Reconciles findings against existing records and writes the registry back: a blank stub for
 * each new finding, a stale record kept for the policy to fail on.
 * @param registryPath - the registry's absolute path.
 * @param registryRelativePath - its repository-relative path, for rationales.
 * @param existing - the records already loaded.
 * @param findings - this run's findings.
 * @param createStub - builds a blank record for a finding.
 * @returns the reconciled registry, or the rationale to fail with.
 */
export async function reconcileAndPersistExceptionRegistry<
  TFinding extends { readonly id: string },
  TRecord extends { readonly id: string },
>(
  registryPath: string,
  registryRelativePath: string,
  existing: readonly TRecord[],
  findings: readonly TFinding[],
  createStub: (finding: TFinding, id: string) => TRecord,
): Promise<PersistExceptionRegistryResult<TRecord>> {
  const reconciled = reconcileExceptions<TFinding, TRecord>({
    existing,
    findings,
    deriveId: (finding) => finding.id,
    createStub,
  })
  if (!reconciled.ok) {
    return {
      ok: false,
      rationale: `${registryRelativePath} could not be reconciled: ${reconciled.error}`,
    }
  }
  const { activeRecords, staleRecords, newStubIds } = reconciled.reconciliation

  try {
    await mkdirFromFs(path.dirname(registryPath), { recursive: true })
    const write = await writeExceptionRegistry({
      path: registryPath,
      records: asFlatExceptionRecords([...activeRecords, ...staleRecords]),
    })
    if (!write.ok) {
      return { ok: false, rationale: `Writing ${registryRelativePath} failed: ${write.error}` }
    }
  } catch (error) {
    return {
      ok: false,
      rationale: `Could not write ${registryRelativePath}: ${(error as Error).message}`,
    }
  }

  return { ok: true, registry: { activeRecords, staleRecords, newStubIds } }
}

/**
 * Loads a registry, reconciles findings against it and writes it back.
 * @param registryPath - the registry's absolute path.
 * @param registryRelativePath - its repository-relative path, for rationales.
 * @param schema - validates the file's records.
 * @param findings - this run's findings.
 * @param createStub - builds a blank record for a finding.
 * @returns the reconciled registry, or the rationale to fail with.
 */
export async function loadAndReconcileExceptionRegistry<
  TFinding extends { readonly id: string },
  TRecord extends { readonly id: string },
>(
  registryPath: string,
  registryRelativePath: string,
  schema: StandardSchemaV1<unknown, readonly TRecord[]>,
  findings: readonly TFinding[],
  createStub: (finding: TFinding, id: string) => TRecord,
): Promise<PersistExceptionRegistryResult<TRecord>> {
  const loaded = await loadExceptionRegistry({ path: registryPath, schema })
  if (!loaded.ok) {
    return {
      ok: false,
      rationale: [
        `${registryRelativePath} failed to load and was left unchanged:`,
        ...loaded.errors.map((error) => `- ${error}`),
      ].join("\n"),
    }
  }
  return reconcileAndPersistExceptionRegistry(
    registryPath,
    registryRelativePath,
    loaded.records,
    findings,
    createStub,
  )
}
