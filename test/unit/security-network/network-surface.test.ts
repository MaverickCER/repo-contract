import { describe, expect, it } from "vitest"
import {
  ALLOWED_PRESET_COMMANDS,
  PRESET_COMMAND_REVIEW,
} from "../../../scripts/security-network/network-surface.mjs"

describe("PRESET_COMMAND_REVIEW", () => {
  it("is non-empty -- every loop below vacuously passes on an empty list", () => {
    expect(PRESET_COMMAND_REVIEW.length).toBeGreaterThan(0)
  })

  it("has a non-empty https:// documentation link for every entry", () => {
    for (const entry of PRESET_COMMAND_REVIEW) {
      expect(entry.docs, `${entry.command}'s docs link`).toMatch(/^https:\/\/\S+$/)
    }
  })

  it("has a specific, non-generic review target for every entry", () => {
    for (const entry of PRESET_COMMAND_REVIEW) {
      expect(entry.reviewFor.length, `${entry.command}'s reviewFor`).toBeGreaterThan(20)
      // A generic "is this safe" placeholder would defeat the whole point --
      // every real entry names what the tool actually does (reads/writes/
      // queries/etc.), not just a yes/no verdict.
      expect(entry.reviewFor.toLowerCase(), `${entry.command}'s reviewFor`).not.toMatch(
        /^(safe|trusted|reviewed|ok)\.?$/,
      )
    }
  })

  it("has no duplicate command names", () => {
    const commands = PRESET_COMMAND_REVIEW.map((entry) => entry.command)
    expect(new Set(commands).size).toBe(commands.length)
  })

  it("derives ALLOWED_PRESET_COMMANDS exactly, with nothing added or dropped", () => {
    expect(ALLOWED_PRESET_COMMANDS).toEqual(PRESET_COMMAND_REVIEW.map((entry) => entry.command))
  })
})
