import { describe, it } from "vitest"

describe("R4 exception inventory", () => {
  it.todo("summarizeExceptionRegistries counts records per registry and per exceptionType")
  it.todo("a record without exceptionType counts as (untyped)")
  it.todo("counts version 1 records as legacy")
  it.todo("counts a record whose expires is before now as expired")
  it.todo("counts a blank justification or a blank v2 field as incomplete")
  it.todo("carries unreadable registries into errors")
  it.todo("readExceptionRegistries reads *.json in file-name order and skips other files")
  it.todo(
    "readExceptionRegistries turns an unreadable file or a missing exceptions array into an error row",
  )
  it.todo("readExceptionRegistries returns nothing for a missing directory")
  it.todo("renderExceptionInventory says nothing is recorded when empty")
  it.todo("renderExceptionInventory prints a total line and one line per registry")
})
