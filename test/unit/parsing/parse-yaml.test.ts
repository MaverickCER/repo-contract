import { describe, expect, it } from "vitest"
import { parseYaml } from "../../../src/parsing/parse-yaml.js"

describe("parseYaml", () => {
  it("parses valid YAML", async () => {
    const result = await parseYaml("score: 92\nok: true\n", "check-id")
    expect(result).toEqual({ format: "yaml", success: true, value: { score: 92, ok: true } })
  })

  it("parses a YAML list", async () => {
    const result = await parseYaml("- a\n- b\n- c\n", "check-id")
    expect(result).toEqual({ format: "yaml", success: true, value: ["a", "b", "c"] })
  })

  it("parses YAML flow-style content", async () => {
    const result = await parseYaml("{a: 1, b: [2, 3]}", "check-id")
    expect(result).toEqual({ format: "yaml", success: true, value: { a: 1, b: [2, 3] } })
  })

  it("reports a failure for malformed YAML, preserving a readable error, format: yaml, and not throwing", async () => {
    const result = await parseYaml("a: [unterminated", "check-id")
    expect(result.success).toBe(false)
    expect(result.format).toBe("yaml")
    if (!result.success) {
      expect(typeof result.error).toBe("string")
      expect(result.error.length).toBeGreaterThan(0)
    }
  })

  it("parses an empty string as a null/undefined document without throwing", async () => {
    await expect(parseYaml("", "check-id")).resolves.toMatchObject({ format: "yaml" })
  })
})
