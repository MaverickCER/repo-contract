import type { CheckExecutionEntry } from "../execution/run-checks.js"
import type { ParserDependencyMissingError } from "../errors.js"
import { parseOutput } from "../parsing/parse-output.js"
import type { CheckDefinition, CheckEvidence, Evidence } from "../types.js"

/** One check's id, its original definition, and its final evidence (parsed output attached, if requested) -- the parsed-output counterpart to `CheckExecutionEntry`, consumed directly by the policy phase so it never needs to look a check up by id either. */
export type ParsedCheckEntry = readonly [string, CheckDefinition, CheckEvidence]

// Not exported -- nothing outside this file references it by name; callers
// (run-repo-contract.ts) destructure `{ evidence, entries }` directly.
interface BuiltEvidence {
  readonly evidence: Evidence
  readonly entries: readonly ParsedCheckEntry[]
}

/**
 * Attaches parsed output (if requested) to every check's raw execution
 * evidence and assembles the versioned, immutable `Evidence` object for the
 * run as a whole. Also returns the same information as a flat entries array
 * (see `ParsedCheckEntry`) for the policy phase to consume directly -- by
 * the time this function returns, every check's evidence -- including every
 * sibling check's -- is fully assembled; nothing here is generated lazily
 * or streamed, which is what makes it safe for a policy to read the full
 * `evidence` object, not just its own check's `result` (see
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
  // Mirrors src/policy/run-policies.ts's own thrown-error aggregation: each
  // mapped entry catches its own failure and records it rather than letting
  // it reject `Promise.all` directly, so that two checks concurrently
  // requesting an output format whose parser dependency is missing (e.g.
  // "yaml" without the optional peer dependency installed) are both
  // reported, not just whichever rejected first.
  const thrown: unknown[] = []

  const entries = await Promise.all(
    results.map(async ([checkId, check, raw]): Promise<ParsedCheckEntry> => {
      if (check.output === undefined) return [checkId, check, raw]
      try {
        const output = await parseOutput(
          check.output.format,
          raw.stdout,
          checkId,
          check.output.schema,
        )
        return [checkId, check, { ...raw, output }]
      } catch (error) {
        thrown.push(error)
        // Never actually consumed -- every branch below that follows a
        // non-empty `thrown` throws before `entries` is read.
        // Stryker disable next-line ArrayDeclaration -- this tuple is never read: both branches below that can run when `thrown` is non-empty (thrown.length === 1 or > 1) throw before `entries` -- the array this returns into -- is ever returned to a caller.
        return [checkId, check, raw]
      }
    }),
  )

  if (thrown.length === 1) {
    const [only] = thrown as [ParserDependencyMissingError]
    throw only
  }
  // "> 1" vs. ">= 1" are equivalent here for the same reason as the
  // identical comparison in src/policy/run-policies.ts: the `=== 1` early
  // return just above already consumes the length-1 case, so by the time
  // this line runs, thrown.length is never exactly 1 -- either 0 (falls
  // through below either way) or >= 2 (takes this branch either way).
  // Stryker disable next-line EqualityOperator -- "> 1" vs. ">= 1" are equivalent here given the early return just above: by the time this line runs, thrown.length is never exactly 1 (either 0 or >= 2 either way), documented so a future refactor that removes the early return doesn't quietly widen this comparison's real behavior without anyone noticing.
  if (thrown.length > 1) {
    throw new AggregateError(thrown, `${String(thrown.length)} check output(s) failed to parse.`)
  }

  // `Evidence["checks"]` is a mapped type over the *specific* CheckSchema a
  // consumer's config declares (see runRepoContract's own generic
  // signature) -- internal pipeline code works with the erased/default
  // CheckSchema instead, whose `keyof` is a plain `string`. The precise
  // generic Evidence<TChecks> is asserted only once, at runRepoContract's
  // own public boundary.
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
