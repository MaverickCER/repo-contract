import type { CheckExecutionEntry } from "../execution/run-checks.js"
import type { StandardSchemaValidateThrewError } from "../errors.js"
import { parseOutput } from "../parsing/parse-output.js"
import type { CheckDefinition, CheckEvidence, Evidence } from "../types.js"

/**
 * One check's id, its original definition, and its final evidence (parsed output attached, if
 * requested). It is the parsed-output counterpart to `CheckExecutionEntry`. The policy phase
 * consumes it, so it never needs to look a check up by id either.
 */
export type ParsedCheckEntry = readonly [string, CheckDefinition, CheckEvidence]

// Not exported: nothing outside this file references it by name. Callers
// (run-repo-contract.ts) destructure `{ evidence, entries }`.
interface BuiltEvidence {
  readonly evidence: Evidence
  readonly entries: readonly ParsedCheckEntry[]
}

/**
 * Attaches parsed output (if requested) to every check's raw execution
 * evidence and assembles the versioned, immutable `Evidence` object for the
 * run as a whole. Also returns the same information as a flat entries array
 * (see `ParsedCheckEntry`) for the policy phase to consume. By
 * the time this function returns, every check's evidence (including every
 * sibling check's) is fully assembled. Nothing here is generated lazily
 * or streamed. That is what makes it safe for a policy to read the full
 * `evidence` object, not only its check's `result` (see
 * specs/architecture.md).
 * @param results - each check's id, definition, and raw execution evidence from the run phase
 * @param startedAt - when the overall run began, recorded on the assembled `Evidence`
 * @param completedAt - when the overall run finished, used with `startedAt` to compute the assembled `Evidence`'s `durationMs`
 * @returns the assembled `Evidence` for the whole run, plus the same checks as a flat `ParsedCheckEntry` array for the policy phase
 */
export async function buildEvidence(
  results: readonly CheckExecutionEntry[],
  startedAt: Date,
  completedAt: Date,
): Promise<BuiltEvidence> {
  // Every output is parsed to completion before any failure is reported. Two checks whose
  // `output.schema` both throw during validation are then both reported, not only the first to
  // reject. `StandardSchemaValidateThrewError` is the only error `parseOutput` can still throw.
  const settled = await Promise.allSettled(
    results.map(async ([checkId, check, raw]): Promise<ParsedCheckEntry> => {
      if (check.output === undefined) return [checkId, check, raw]
      const output = await parseOutput(
        check.output.format,
        raw.stdout,
        checkId,
        check.output.schema,
      )
      return [checkId, check, { ...raw, output }]
    }),
  )

  const thrown = settled.flatMap((outcome): unknown[] =>
    outcome.status === "rejected" ? [outcome.reason as unknown] : [],
  )
  if (thrown.length > 0) {
    throw thrown.length === 1
      ? (thrown[0] as StandardSchemaValidateThrewError)
      : new AggregateError(thrown, `${String(thrown.length)} check output(s) failed to parse.`)
  }
  // Nothing rejected past the check above, so every outcome is fulfilled.
  const entries = settled.map(
    (outcome) => (outcome as PromiseFulfilledResult<ParsedCheckEntry>).value,
  )

  // `Evidence["checks"]` is a mapped type over the *specific* CheckSchema a
  // consumer's config declares (see runRepoContract's generic signature).
  // Internal pipeline code works with the erased/default CheckSchema
  // instead, whose `keyof` is a plain `string`. The precise generic
  // Evidence<TChecks> is asserted only once, at runRepoContract's public
  // boundary.
  const evidence = {
    version: 1,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(),
    checks: Object.fromEntries(
      entries.map(([checkId, , checkEvidence]) => [checkId, checkEvidence]),
    ),
  } as Evidence

  return { evidence, entries }
}
