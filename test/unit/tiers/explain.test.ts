import { describe, it } from "vitest"

describe("R1e explainTier and renderExplain", () => {
  it.todo("explains a strict() config with no loosening against its own tier")
  it.todo("lists a lowered coverage threshold as loosened with its baseline and value")
  it.todo("lists a raised duplication budget as loosened")
  it.todo("lists a check turned off with false as loosened (setting enabled)")
  it.todo("lists a baseline check deleted from checks under missing and as loosened")
  it.todo("marks a check the tier does not contain as source added")
  it.todo("explains a config with no tier metadata against an explicit baseline")
  it.todo("returns tier undefined and baseline undefined for a config with neither")
  it.todo("tierBaseline(name) carries the tier's checks, settings and planned checks")
  it.todo("compares against a supplied baseline, as IPC does for its Loosened section")
  it.todo("renderExplain text lists each check, then a Loosened heading, then planned checks")
  it.todo("renderExplain markdown uses the heading option over the loosened list")
  it.todo("renderExplain says nothing is loosened when the list is empty")
})
