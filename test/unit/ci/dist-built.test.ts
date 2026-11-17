import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { distBuilt } from "../../helpers/dist-built.js"

// A package root with dist/index.js built and dist/tiers.js missing.
const root = mkdtempSync(path.join(tmpdir(), "repo-contract-dist-built-"))
mkdirSync(path.join(root, "dist"))
writeFileSync(path.join(root, "dist", "index.js"), "")
afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe("distBuilt, the condition integration suites skip on", () => {
  it("is true when every file is built, in CI or not", () => {
    expect(distBuilt(["index.js"], {}, root)).toBe(true)
    expect(distBuilt(["index.js"], { CI: "true" }, root)).toBe(true)
  })

  it.each([
    ["CI unset", {}],
    ["CI empty", { CI: "" }],
    ["CI false", { CI: "false" }],
    ["CI 0", { CI: "0" }],
  ])("is false, so the suite skips, on a local run with a file missing (%s)", (_name, env) => {
    expect(distBuilt(["index.js", "tiers.js"], env, root)).toBe(false)
  })

  it.each([["true"], ["1"]])(
    "throws when CI is %s and a file is missing, so the suite fails instead of passing empty",
    (ci) => {
      expect(() => distBuilt(["index.js", "tiers.js", "helpers.js"], { CI: ci }, root)).toThrow(
        new Error(
          "CI is set, but dist/ lacks tiers.js, helpers.js. Run npm run build before the tests.",
        ),
      )
    },
  )
})
