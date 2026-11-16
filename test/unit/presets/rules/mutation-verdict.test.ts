import { describe, it } from "vitest"

describe("R7a mutation verdict", () => {
  it.todo("readMutationRun accepts a well-formed report of every state")
  it.todo("readMutationRun rejects a wrong schemaVersion or a missing field")
  it.todo("MUTATION_EXCEPTION_SCHEMA rejects a record whose id does not match its fields")
  it.todo(
    "applyMutationExceptions suppresses a Survived or NoCoverage mutant a complete record covers",
  )
  it.todo("applyMutationExceptions never suppresses a Timeout")
  it.todo("applyMutationExceptions reports an incomplete or expired record")
  it.todo("applyMutationExceptions reports an unmatched record as stale only on a full run")
  it.todo("judgeMutation passes at minScore 80 with 80% detected")
  it.todo("judgeMutation fails below minScore and lists the offenders")
  it.todo("judgeMutation fails on any Timeout whatever the score")
  it.todo("judgeMutation leaves Ignored and suppressed mutants out of the score")
  it.todo("judgeMutation counts RuntimeError and CompileError as detected")
  it.todo("judgeMutation fails on a report with no mutants")
  it.todo("judgeMutation names the shard in its rationale")
})
