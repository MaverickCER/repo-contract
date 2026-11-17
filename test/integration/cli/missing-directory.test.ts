import { spawnSync } from "node:child_process"
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { pathToFileURL } from "node:url"
import { distBuilt } from "../../helpers/dist-built.js"
import { missingDirectoryCases } from "../../helpers/missing-directory-cases.js"

// Every command that takes -C, run by the real bin against a path that is not a usable directory:
// missing, a regular file, a name too long to stat, or a directory it may not read. Each must
// name the path through its own failure path. It must never pass as if the directory were empty,
// and never print a raw error or a Node stack trace.
const root = path.resolve(__dirname, "../../..")
const bin = path.join(root, "bin", "repo-contract.mjs")
const dir = mkdtempSync(path.join(tmpdir(), "rc-missing-dir-"))
writeFileSync(path.join(dir, "file"), "")
// Mode 000: the directory exists but cannot be listed or entered. Windows ignores the mode bits
// and root bypasses them, so that situation runs only where the mode is enforced.
const locked = path.join(dir, "locked")
mkdirSync(locked, { mode: 0o000 })
const modeEnforced = process.platform !== "win32" && process.getuid?.() !== 0
afterAll(() => {
  chmodSync(locked, 0o700)
  rmSync(dir, { recursive: true, force: true })
})

// A name over 255 bytes makes stat fail with ENAMETOOLONG on macOS and Linux, even as root.
// Windows may report the name differently, so there the expected message comes from the shared
// check. The test below pins ENAMETOOLONG everywhere else. The check runs in a child process:
// importing bin/ here would make Stryker run this suite against instrumented code.
const missing = path.join(dir, "missing")
const file = path.join(dir, "file")
const long = path.join(dir, "a".repeat(300))
const options = pathToFileURL(path.join(root, "bin", "cli-options.mjs")).href
const longMessage = spawnSync(
  "node",
  [
    "--input-type=module",
    "-e",
    `const { checkDirectory } = await import(process.argv[1])
process.stdout.write(checkDirectory(process.argv[2]) ?? "the shared check accepted a 300-character name")`,
    options,
    long,
  ],
  { encoding: "utf8" },
).stdout
const SITUATIONS: [string, string, string][] = [
  ["missing", missing, `the directory ${missing} does not exist`],
  ["a regular file", file, `${file} is not a directory`],
  ["too long a name", long, longMessage],
  ...(modeEnforced
    ? [
        ["a directory it may not read", locked, `cannot read the directory ${locked}: EACCES`] as [
          string,
          string,
          string,
        ],
      ]
    : []),
]

it.skipIf(process.platform === "win32")("reports a too-long name as ENAMETOOLONG", () => {
  expect(longMessage).toBe(`cannot read the directory ${long}: ENAMETOOLONG`)
})
const CASES = missingDirectoryCases("")

describe
  .skipIf(!distBuilt(["affected.js", "helpers.js", "metrics.js", "tiers.js"]))
  .each(SITUATIONS)("every -C command of the real bin, given %s", (_, target, message) => {
  it.each(missingDirectoryCases(message))(
    "%s exits 1 through its own failure path",
    (_name, args, expected) => {
      const result = spawnSync("node", [bin, ...args, "-C", target], {
        cwd: dir,
        encoding: "utf8",
      })
      const output = `${result.stdout}${result.stderr}`
      expect(result.status).toBe(1)
      expect(output).not.toContain("ENOENT")
      expect(output).not.toContain("node:fs")
      expect(output).not.toContain("    at ")
      if ("json" in expected) {
        expect(result.stderr).toBe("")
        expect(JSON.parse(result.stdout)).toStrictEqual(expected.json)
      } else {
        expect(result.stdout).toBe("stdout" in expected ? expected.stdout : "")
        expect(result.stderr).toBe("stderr" in expected ? expected.stderr : "")
      }
    },
  )
})

describe("the -C cases", () => {
  it("cover every command whose usage offers -C", () => {
    const offering = readdirSync(path.join(root, "bin"))
      .filter((file) => file.endsWith(".mjs"))
      .map((file) => readFileSync(path.join(root, "bin", file), "utf8"))
      .filter((text) => text.includes("-C <dir>"))
      .flatMap((text) => [...text.matchAll(/Usage: repo-contract ([a-z-]+)/g)].map((m) => m[1]))
    const tested = new Set(CASES.map(([name]) => name.split(" ")[0]))
    expect(new Set(offering).size).toBe(11)
    expect([...new Set(offering)].filter((command) => !tested.has(command))).toEqual([])
  })

  // One way to check, so no command can call a check that throws outside its failure path.
  it("check the directory one way, through the never-throwing checkDirectory", () => {
    const texts = readdirSync(path.join(root, "bin"))
      .filter((file) => file.endsWith(".mjs") && file !== "cli-options.mjs")
      .map((file) => readFileSync(path.join(root, "bin", file), "utf8"))
    const calls = texts.flatMap((text) => [...text.matchAll(/checkDirectory\)?\(/g)])
    const shaped = texts.flatMap((text) => [
      ...text.matchAll(
        /directoryProblem = (?:await \(input\.checkDirectory \?\? checkDirectory\)|checkDirectory)\(/g,
      ),
    ])
    // mutation checks twice, once in `plan` and once in `run`.
    expect(shaped).toHaveLength(12)
    expect(calls).toHaveLength(shaped.length)
    expect(
      texts.filter((text) =>
        /(?<![.\w])isDirectory\b|input\.isDirectory|missingDirectory/.test(text),
      ),
    ).toEqual([])
  })
})
