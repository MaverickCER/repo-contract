import { describe, it } from "vitest"

describe("R2 link judgement", () => {
  it.todo("passes when no link is broken")
  it.todo("passes a link that answered HTTP 429 and lists it")
  it.todo("passes a broken local link that exists on disk as a file or directory")
  it.todo("strips a #fragment and ?query before probing the disk")
  it.todo("fails a broken local link that does not exist on disk")
  it.todo("fails a broken external link that did not answer 429")
  it.todo(
    "brokenLinks runs one crawl over every start point, with --markdown when any start is markdown",
  )
  it.todo("brokenLinks keeps today's run for a single string start")
})
