import { beforeEach, describe, expect, it, vi } from "vitest"
import { passWhenPrivate } from "../../../src/tiers/not-applicable.js"
import type { CheckDefinitionConfig } from "../../../src/types.js"
import { fakeCheckEvidence, fakeContext } from "../presets/fixtures.js"

const { readFile } = vi.hoisted(() => ({ readFile: vi.fn() }))
vi.mock("node:fs/promises", () => ({ readFile }))

const WRAPPED_RESULT = { outcome: "fail", rationale: "publint found 2 problems." } as const

const wrapped: CheckDefinitionConfig = {
  run: ["publint", "run"],
  output: { format: "json" },
  timeoutMs: 1000,
  isolated: true,
  expensive: true,
  policy: () => WRAPPED_RESULT,
}

/**
 * Runs the wrapped policy against the package.json text `readFile` returns.
 * @param manifest - the file's text, or an error for a file that cannot be read.
 * @param id - the check id to wrap under.
 * @returns the policy's result.
 */
async function judge(manifest: string | Error, id = "Packaging"): Promise<unknown> {
  if (manifest instanceof Error) readFile.mockRejectedValue(manifest)
  else readFile.mockResolvedValue(manifest)
  return passWhenPrivate(id, wrapped).policy(fakeContext(fakeCheckEvidence()))
}

beforeEach(() => {
  readFile.mockReset()
})

describe("R1 passWhenPrivate", () => {
  it("passes as not applicable when package.json says private: true", async () => {
    expect(await judge(JSON.stringify({ name: "app", private: true }))).toEqual({
      outcome: "pass",
      rationale:
        'Packaging is not applicable: package.json sets "private": true, so the package is never published.',
    })
    expect(readFile).toHaveBeenCalledWith("package.json", "utf8")
  })

  it("runs the wrapped policy when package.json is not private", async () => {
    for (const manifest of [
      { name: "lib", private: false },
      { name: "lib" },
      { name: "lib", private: "true" },
    ]) {
      expect(await judge(JSON.stringify(manifest)), JSON.stringify(manifest)).toBe(WRAPPED_RESULT)
    }
  })

  it("runs the wrapped policy when package.json is missing or unreadable", async () => {
    const missing = Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" })
    expect(await judge(missing)).toBe(WRAPPED_RESULT)
    expect(await judge("{ not json")).toBe(WRAPPED_RESULT)
    expect(await judge("null")).toBe(WRAPPED_RESULT)
  })

  it("names the check id in the not-applicable rationale", async () => {
    const result = await judge(JSON.stringify({ private: true }), "QuickStart")
    expect((result as { rationale: string }).rationale).toMatch(/^QuickStart is not applicable: /)
  })

  it("reads package.json each time the policy runs, not when the check is built", async () => {
    const check = passWhenPrivate("Packaging", wrapped)
    expect(readFile).not.toHaveBeenCalled()
    readFile.mockResolvedValue(JSON.stringify({ private: true }))
    await check.policy(fakeContext(fakeCheckEvidence()))
    await check.policy(fakeContext(fakeCheckEvidence()))
    expect(readFile).toHaveBeenCalledTimes(2)
  })

  it("keeps every field of the wrapped check except the policy", () => {
    const check = passWhenPrivate("Packaging", wrapped)
    const { policy, ...rest } = check
    const { policy: original, ...expected } = wrapped
    expect(rest).toEqual(expected)
    expect(policy).not.toBe(original)
  })
})
