import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { removeTempDir } from "../helpers/remove-temp-dir.js"

/**
 * `repo-contract quick-start` for real: it packs a fixture package with npm, installs the tarball
 * into an empty project and runs the README's marked commands in a shell. The fixture has no
 * dependencies, so the install needs no registry. test/unit/presets/quick-start.test.ts judges
 * the same report shapes with the quickStart preset's policy.
 */
const bin = path.resolve(__dirname, "../../bin/repo-contract.mjs")
const root = mkdtempSync(path.join(tmpdir(), "repo-contract-quick-start-e2e-"))

afterAll(async () => {
  await removeTempDir(root)
})

const marked = (commands: string): string =>
  `# qs-fixture\n\n<!-- quick-start:begin -->\n\n\`\`\`sh\n${commands}\n\`\`\`\n\n<!-- quick-start:end -->\n`

/** A package with two commands: `qs-fixture-hello` exits 0 and `qs-fixture-fail` exits 3. */
function fixture(name: string, readme: string): string {
  const dir = path.join(root, name)
  mkdirSync(dir)
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({
      name: "qs-fixture",
      version: "1.0.0",
      bin: { "qs-fixture-hello": "hello.js", "qs-fixture-fail": "fail.js" },
      files: ["hello.js", "fail.js"],
    }),
  )
  writeFileSync(path.join(dir, "hello.js"), '#!/usr/bin/env node\nconsole.log("hello")\n')
  writeFileSync(
    path.join(dir, "fail.js"),
    '#!/usr/bin/env node\nconsole.error("the fixture failed on purpose")\nprocess.exit(3)\n',
  )
  writeFileSync(path.join(dir, "README.md"), readme)
  return dir
}

function quickStartIn(dir: string): { status: number | null; report: unknown } {
  const run = spawnSync(process.execPath, [bin, "quick-start", "--json", "--timeout", "120000"], {
    cwd: dir,
    encoding: "utf8",
  })
  return { status: run.status, report: JSON.parse(run.stdout) as unknown }
}

describe("repo-contract quick-start (real npm pack, install and shell)", () => {
  it("passes a quick start whose every command exits 0", () => {
    const dir = fixture(
      "passing",
      marked("npm install --no-audit --no-fund qs-fixture\nnpx qs-fixture-hello"),
    )
    const { status, report } = quickStartIn(dir)
    expect(report).toMatchObject({
      state: "passed",
      commands: [
        {
          command: "npm install --no-audit --no-fund ../tarball/qs-fixture-1.0.0.tgz",
          exitCode: 0,
        },
        { command: "npx qs-fixture-hello", exitCode: 0 },
      ],
    })
    expect(status).toBe(0)
  }, 120_000)

  it("fails a quick start with a command that exits non-zero, and shows its output", () => {
    const dir = fixture(
      "failing",
      marked(
        "npm install --no-audit --no-fund qs-fixture\nnpx qs-fixture-fail\nnpx qs-fixture-hello",
      ),
    )
    const { status, report } = quickStartIn(dir)
    expect(report).toMatchObject({
      state: "failed",
      commands: [{ exitCode: 0 }, { command: "npx qs-fixture-fail", exitCode: 3, timedOut: false }],
    })
    expect((report as { output: string }).output).toContain("the fixture failed on purpose")
    expect(status).toBe(1)
  }, 120_000)

  it("fails a README without a marked block, naming the markers", () => {
    const dir = fixture("unmarked", "# qs-fixture\n\n```sh\nnpm install qs-fixture\n```\n")
    const { status, report } = quickStartIn(dir)
    expect(report).toEqual({
      schemaVersion: 1,
      readme: "README.md",
      state: "no-block",
      message:
        "README.md has no marked quick start. Put <!-- quick-start:begin --> on the line before its fenced shell block and <!-- quick-start:end --> on the line after it.",
    })
    expect(status).toBe(1)
  }, 60_000)
})
