import { describe, expect, it } from "vitest"
import { excludeGlobs, negateGlobs, sourceGlob } from "../../../src/tool-config/exclude.js"
import { DEFAULT_EXCLUDE } from "../../../src/tool-config/types.js"

describe("R3 one exclude list", () => {
  it("excludeGlobs returns DEFAULT_EXCLUDE with no input", () => {
    expect(excludeGlobs()).toEqual(DEFAULT_EXCLUDE)
    expect(excludeGlobs([])).toEqual(DEFAULT_EXCLUDE)
  })

  it("excludeGlobs appends the package's globs without duplicates", () => {
    const own = ["src/types.ts", "src/_ipc/**", "src/types.ts", "**/*.d.ts"]

    expect(excludeGlobs(own)).toEqual([...DEFAULT_EXCLUDE, "src/types.ts", "src/_ipc/**"])
  })

  it("excludeGlobs rejects a blank or already negated glob", () => {
    expect(() => excludeGlobs(["!src/types.ts"])).toThrow(
      'exclude takes plain globs; drop the leading "!" from "!src/types.ts"',
    )
    expect(() => excludeGlobs([" "])).toThrow("exclude takes plain globs; got a blank one")
  })

  it("negateGlobs prefixes each glob with !", () => {
    expect(negateGlobs(["src/types.ts", "**/*.d.ts"])).toEqual(["!src/types.ts", "!**/*.d.ts"])
    expect(negateGlobs([])).toEqual([])
  })

  it("negateGlobs rejects an already negated glob, which would include the files again", () => {
    expect(() => negateGlobs(["!src/types.ts"])).toThrow('drop the leading "!"')
  })

  it("DEFAULT_EXCLUDE leaves out tests, declarations and fixtures", () => {
    expect(DEFAULT_EXCLUDE).toEqual([
      "**/*.{test,spec}.{ts,tsx}",
      "**/__tests__/**",
      "**/__mocks__/**",
      "**/fixtures/**",
      "**/__fixtures__/**",
      "**/*.d.ts",
    ])
  })

  it("sourceGlob trims ./ and trailing slashes from srcDir and rejects an empty one", () => {
    expect(sourceGlob()).toBe("src/**/*.{ts,tsx}")
    expect(sourceGlob("./lib/")).toBe("lib/**/*.{ts,tsx}")
    expect(sourceGlob("./packages/core//")).toBe("packages/core/**/*.{ts,tsx}")
    expect(() => sourceGlob("./")).toThrow('srcDir must name a directory; got "./"')
    expect(() => sourceGlob("")).toThrow("srcDir must name a directory")
  })

  it("returns a fresh array each call, so a caller's push changes no later config", () => {
    const first = excludeGlobs() as string[]
    first.push("src/leak.ts")

    expect(excludeGlobs()).not.toContain("src/leak.ts")
  })
})
