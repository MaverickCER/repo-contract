import { describe, expect, it } from "vitest"
import {
  summarizeChanges,
  summarizeLowerTierChanges,
} from "../../../scripts/api-contract/summarize-changes.js"
import type { ApiContractChange } from "../../../scripts/api-contract/evidence-types.js"

function change(overrides: Partial<ApiContractChange> = {}): ApiContractChange {
  return {
    id: "id",
    path: "getUsers",
    kind: "export-added",
    compatibility: "compatible",
    explanation: "Added getUsers.",
    ...overrides,
  }
}

describe("summarizeChanges", () => {
  it("states the initial-baseline sentence regardless of diff/impact", () => {
    const summary = summarizeChanges([change()], "unchanged", true)
    expect(summary).toContain("No historical public API contract exists.")
    expect(summary).toContain("v0.1.0 is recommended")
  })

  it("states there were no changes when the diff is empty", () => {
    expect(summarizeChanges([], "unchanged", false)).toBe("No public API changes detected.")
  })

  it("lists every change deterministically, in the order given", () => {
    const changes = [
      change({ id: "a", explanation: "Added getUsers." }),
      change({ id: "b", explanation: "Removed getUserByEmail.", compatibility: "breaking" }),
    ]
    const summary = summarizeChanges(changes, "breaking", false)
    expect(summary).toBe(
      [
        "2 public contract change(s) detected:",
        "- Added getUsers.",
        "- Removed getUserByEmail.",
      ].join("\n"),
    )
  })

  it("notes indeterminate classification for unknown impact", () => {
    const summary = summarizeChanges([change({ compatibility: "unknown" })], "unknown", false)
    expect(summary).toContain("could not be classified deterministically")
  })
})

describe("summarizeLowerTierChanges", () => {
  it("returns undefined for an empty diff", () => {
    expect(summarizeLowerTierChanges([])).toBeUndefined()
  })

  it("lists every lower-tier change deterministically, labeled as informational only", () => {
    const changes = [
      change({ id: "a", path: "InternalHelper", explanation: "Added InternalHelper." }),
      change({ id: "b", path: "internalUtil", explanation: "Removed internalUtil." }),
    ]
    const summary = summarizeLowerTierChanges(changes)
    expect(summary).toBe(
      [
        "2 non-public contract change(s) also detected (informational only -- does not affect the required release level):",
        "- Added InternalHelper.",
        "- Removed internalUtil.",
      ].join("\n"),
    )
  })
})
