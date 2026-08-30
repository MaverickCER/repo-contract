import { describe, expect, it } from "vitest"
import { parseNpmPackFilename } from "../../scripts/npm-pack.mjs"

const ESC = String.fromCharCode(27)

describe("parseNpmPackFilename", () => {
  it("reads the filename from clean pretty-printed `npm pack --json` output (npm 11)", () => {
    const stdout = JSON.stringify(
      [{ id: "pkg@1.0.0", filename: "pkg-1.0.0.tgz", files: [] }],
      null,
      2,
    )
    expect(parseNpmPackFilename(stdout)).toBe("pkg-1.0.0.tgz")
  })

  it("reads the filename from compact JSON output", () => {
    expect(parseNpmPackFilename('[{"filename":"pkg-2.0.0.tgz"}]')).toBe("pkg-2.0.0.tgz")
  })

  it("skips ANSI-coloured npm log lines prepended to stdout (npm 10)", () => {
    const noise = `${ESC}[2m[${ESC}[22m npm timing reify:audit ${ESC}[2m]${ESC}[22m`
    const json = JSON.stringify([{ filename: "pkg-3.0.0.tgz" }], null, 2)
    expect(parseNpmPackFilename(`${noise}\n${json}`)).toBe("pkg-3.0.0.tgz")
  })

  it("throws with the raw stdout and stderr when nothing parses", () => {
    expect(() => parseNpmPackFilename("not json", "boom")).toThrow(
      /did not produce parseable JSON[\s\S]*boom/,
    )
  })

  it("throws when the parsed value is not a non-empty array of { filename }", () => {
    expect(() => parseNpmPackFilename("[]")).toThrow(/unexpected shape/)
    expect(() => parseNpmPackFilename('[{"noFilename":true}]')).toThrow(/unexpected shape/)
  })
})
