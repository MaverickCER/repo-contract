import { describe, expect, it, vi } from "vitest"
import { ParserDependencyMissingError } from "../../../src/errors.js"

// File-scoped: vi.mock affects this whole file's module graph, so the
// "yaml package unavailable" simulation is isolated here, away from
// parse-yaml.test.ts's real-success/real-failure tests -- the one genuinely
// justified mock in the parsing layer, since uninstalling a devDependency
// mid-test-run isn't practical.
vi.mock("yaml", () => {
  throw new Error("Cannot find module 'yaml'")
})

describe("parseYaml -- yaml peer dependency unavailable", () => {
  it("throws ParserDependencyMissingError, preserving the original import failure as cause", async () => {
    const { parseYaml } = await import("../../../src/parsing/parse-yaml.js")

    await expect(parseYaml("a: 1", "mutation")).rejects.toThrow(ParserDependencyMissingError)

    try {
      await parseYaml("a: 1", "mutation")
      expect.unreachable("expected parseYaml to reject")
    } catch (error) {
      expect(error).toBeInstanceOf(ParserDependencyMissingError)
      const typed = error as ParserDependencyMissingError
      expect(typed.checkId).toBe("mutation")
      expect(typed.format).toBe("yaml")
      expect(typed.cause).toBeInstanceOf(Error)
      expect(typed.message).toContain("npm install yaml")
    }
  })
})
