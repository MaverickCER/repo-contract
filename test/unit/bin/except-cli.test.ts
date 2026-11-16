import { describe, it } from "vitest"

describe("R4 repo-contract except", () => {
  it.todo("finds the record by id across the registry directory and sets each --set field")
  it.todo("creates a mutation record from reports/mutation/mutation.json when none exists")
  it.todo("exits 0 and reports complete when no required field is blank")
  it.todo("exits 1 and lists the blank fields when the record is incomplete")
  it.todo("exits 1 when no registry holds the id and it is not a mutation id")
  it.todo("rejects a --set for a field the record cannot carry")
  it.todo("validates the result with the v2 record rules before writing")
  it.todo("writes only the registry it changed")
  it.todo("--json prints the record, its registry and the missing fields")
})
