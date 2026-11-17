import { spawn } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterAll, describe, expect, it } from "vitest"
import { runMutation } from "../../../bin/mutation-cli.mjs"
import * as affected from "../../../src/affected/index.js"
import * as helpers from "../../../src/helpers/index.js"
import { mutation } from "../../../src/presets/mutation.js"
import type { MutationRunReport } from "../../../src/presets/rules/mutation-verdict.js"
import { fakeCheckEvidence, fakeContext } from "../../unit/presets/fixtures.js"

// One real Stryker run over a two-file project, so the runner's arguments, the report path and
// the verdict are proven against the tool rather than a fake. The project borrows this
// repository's node_modules through a symlink.
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const dir = mkdtempSync(path.join(tmpdir(), "rc-mutation-real-"))
afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

const files: Record<string, string> = {
  "package.json": JSON.stringify({ name: "fixture", private: true, type: "module" }),
  "stryker.config.json": JSON.stringify({
    testRunner: "vitest",
    coverageAnalysis: "perTest",
    mutate: ["src/**/*.js"],
    jsonReporter: { fileName: "reports/mutation/mutation.json" },
    incrementalFile: "reports/mutation/stryker-incremental.json",
    concurrency: 1,
  }),
  "vitest.config.mjs": "export default { test: { include: ['test/**/*.test.js'] } }\n",
  "src/add.js": "export const add = (a, b) => a + b\n",
  // `n >= 10` survives: no test sits on the boundary.
  "src/big.js": "export const big = (n) => n > 10\n",
  "test/add.test.js": [
    'import { expect, test } from "vitest"',
    'import { add } from "../src/add.js"',
    'import { big } from "../src/big.js"',
    'test("adds", () => expect(add(2, 3)).toBe(5))',
    'test("big", () => { expect(big(20)).toBe(true); expect(big(0)).toBe(false) })',
    "",
  ].join("\n"),
}
for (const [file, text] of Object.entries(files)) {
  mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
  writeFileSync(path.join(dir, file), text)
}
symlinkSync(path.join(repository, "node_modules"), path.join(dir, "node_modules"), "dir")

const stryker = (args: readonly string[], options: { cwd: string; quiet: boolean }) =>
  new Promise<{ exitCode: number | null }>((resolve) => {
    const bin = path.join(repository, "node_modules/@stryker-mutator/core/bin/stryker.js")
    const child = spawn(process.execPath, [bin, ...args], { cwd: options.cwd, stdio: "ignore" })
    child.on("close", (exitCode) => {
      resolve({ exitCode })
    })
  })

describe("repo-contract mutation run against real Stryker", () => {
  it("runs cold, reports every mutant, and the preset judges the floor", async () => {
    let stdout = ""
    const code = await runMutation({
      argv: ["run", "--json"],
      cwd: dir,
      version: "0.0.0",
      stdout: (text: string) => (stdout += text),
      stderr: () => undefined,
      affected,
      helpers,
      stryker,
      git: () => Promise.resolve(undefined),
      now: () => new Date(),
    })
    const run = JSON.parse(stdout) as MutationRunReport
    expect(run).toMatchObject({ state: "ran", report: "reports/mutation/mutation.json" })
    expect(code).toBe(run.exitCode)

    const judge = (minScore: number) =>
      mutation({ minScore, registry: false }).policy(
        fakeContext(
          fakeCheckEvidence({
            output: {
              format: "json",
              success: true,
              value: { ...run, report: path.join(dir, run.report) },
            },
          }),
        ),
      )
    const lenient = await judge(50)
    expect(lenient.outcome).toBe("pass")
    expect(lenient.rationale).toMatch(/\d+ survived/)
    expect(lenient.rationale).toContain("src/big.js")
    const strict = await judge(100)
    expect(strict.outcome).toBe("fail")
    expect(strict.rationale).toContain("Below the minimum score of 100%")
  }, 180_000)
})
