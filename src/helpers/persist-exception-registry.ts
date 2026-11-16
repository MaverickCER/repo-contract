import { notImplemented } from "../not-implemented.js"
import type { StandardSchemaV1 } from "../standard-schema/types.js"

/** A registry after a batch of findings was reconciled against it and written back. */
export interface PersistedExceptionRegistry<TRecord> {
  readonly activeRecords: readonly TRecord[]
  readonly staleRecords: readonly TRecord[]
  readonly newStubIds: readonly string[]
}

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
export function reconcileAndPersistExceptionRegistry<
  TFinding extends { readonly id: string },
  TRecord extends { readonly id: string },
>(
  registryPath: string,
  registryRelativePath: string,
  existing: readonly TRecord[],
  findings: readonly TFinding[],
  createStub: (finding: TFinding, id: string) => TRecord,
): Promise<
  | { readonly ok: true; readonly registry: PersistedExceptionRegistry<TRecord> }
  | { readonly ok: false; readonly rationale: string }
> {
  return notImplemented("R2x", registryPath, registryRelativePath, existing, findings, createStub)
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
export function loadAndReconcileExceptionRegistry<
  TFinding extends { readonly id: string },
  TRecord extends { readonly id: string },
>(
  registryPath: string,
  registryRelativePath: string,
  schema: StandardSchemaV1<unknown, readonly TRecord[]>,
  findings: readonly TFinding[],
  createStub: (finding: TFinding, id: string) => TRecord,
): Promise<
  | { readonly ok: true; readonly registry: PersistedExceptionRegistry<TRecord> }
  | { readonly ok: false; readonly rationale: string }
> {
  return notImplemented("R2x", registryPath, registryRelativePath, schema, findings, createStub)
}
