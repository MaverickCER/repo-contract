import { describe, it } from "vitest"

describe("R1 passWhenPrivate", () => {
  it.todo("passes as not applicable when package.json says private: true")
  it.todo("runs the wrapped policy when package.json is not private")
  it.todo("runs the wrapped policy when package.json is missing or unreadable")
  it.todo("names the check id in the not-applicable rationale")
  it.todo("keeps every field of the wrapped check except the policy")
})
