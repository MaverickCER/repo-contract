import { describe, it } from "vitest"

describe("R5 mutation shard planner", () => {
  it.todo("mutationShardCount is ceil(bytes / 65536) between 1 and min(files, 256)")
  it.todo("mutationShardCount is 0 with no files")
  it.todo("never plans more shards than files")
  it.todo("never plans more than 256 shards")
  it.todo("planMutationShards weights files by size and gives a matching matrix")
  it.todo("the same files always give the same plan")
})
