import { describe, it } from "vitest"

describe("R7a mutation report reading", () => {
  it.todo("resolveMutants reads every mutant with its original source span")
  it.todo("resolveMutants handles a multi-line span and an out-of-range location")
  it.todo("resolveMutants fails on a report without a files object or a malformed file entry")
  it.todo("mutationExceptionId matches internal-package-contract's ids for the same mutant")
  it.todo("mutationExceptionId ignores the line")
  it.todo("findMutantById finds the mutant an id names and undefined otherwise")
})
