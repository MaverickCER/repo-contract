import { describe, it } from "vitest"

describe("R1e loosening rules", () => {
  it.todo("a higher coverage threshold is stricter and a lower one looser")
  it.todo("a higher mutation minScore is stricter and a lower one looser")
  it.todo("a lower duplication budget is stricter and a higher one looser")
  it.todo("a lower CRAP threshold or complexity ceiling is stricter and a higher one looser")
  it.todo("an equal value is the same")
  it.todo("a value the baseline judges but the config leaves undefined is looser")
  it.todo("a value only the config judges is stricter")
  it.todo(
    "LOOSENING_RULES covers Coverage's four metrics, Duplication, Crap's two ceilings and Mutation",
  )
})
