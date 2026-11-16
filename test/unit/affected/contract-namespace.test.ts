import { describe, it } from "vitest"

describe("R5 contract namespace", () => {
  it.todo("reads contract.affected through parseAffectedConfig, source contract")
  it.todo("falls back to repo-contract.affected, source repo-contract")
  it.todo("returns empty options and source none when neither is present")
  it.todo("fails when both contract.affected and repo-contract.affected are present")
  it.todo("ignores other keys under contract, which belong to other tools")
  it.todo("passes a parseAffectedConfig error through with its key path")
  it.todo("fails when contract is not an object")
})
