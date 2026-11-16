import { describe, it } from "vitest"

describe("R7a repo-contract mutation", () => {
  it.todo(
    "plan --json prints files, bytes, count and the matrix for the Stryker config's mutate set",
  )
  it.todo("run --json runs Stryker with --force and prints a ran report")
  it.todo("run --shard i/n mutates one slice planned by size")
  it.todo("run --mutate restricts the run, and an empty list prints nothing-to-mutate")
  it.todo("run --report adopts a report and runs no mutant")
  it.todo(
    "run re-runs at most --confirm-timeouts timed-out mutants alone and rewrites the caught ones",
  )
  it.todo("run --cache read-write replays a clean run when the inputs are unchanged")
  it.todo("run --cache off never reads or writes the cache")
  it.todo("rejects an unknown subcommand or flag with exit 2")
  it.todo("prints usage for --help")
})
