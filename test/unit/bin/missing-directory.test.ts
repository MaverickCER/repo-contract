import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { runAffected } from "../../../bin/affected-cli.mjs"
import { runCache } from "../../../bin/cache-cli.mjs"
import { runDoctor } from "../../../bin/doctor-cli.mjs"
import { runExcept } from "../../../bin/except-cli.mjs"
import { runExceptions } from "../../../bin/exceptions-cli.mjs"
import { runExplain } from "../../../bin/explain-cli.mjs"
import { runMergeMutation } from "../../../bin/merge-mutation-cli.mjs"
import { runMetrics } from "../../../bin/metrics-cli.mjs"
import { runMutation } from "../../../bin/mutation-cli.mjs"
import { runNpmScript } from "../../../bin/npm-script-cli.mjs"
import { runQuickStart } from "../../../bin/quick-start-cli.mjs"
import {
  type MissingDirectoryOutput,
  missingDirectoryCases,
} from "../../helpers/missing-directory-cases.js"

// The cases test/integration/cli/missing-directory.test.ts runs through the real bin, run here
// in-process against the real file system. Every capability throws when touched: a -C path that is
// not a usable directory must stop each command before it reads, spawns or writes anything there.
const scratch = mkdtempSync(path.join(tmpdir(), "rc-missing-dir-unit-"))
writeFileSync(path.join(scratch, "file"), "")
// A directory with mode 000 exists but cannot be listed or entered. Windows ignores the mode
// bits and root bypasses them, so the situation runs only where the mode is enforced.
const LOCKED = "locked"
mkdirSync(path.join(scratch, LOCKED), { mode: 0o000 })
const modeEnforced = process.platform !== "win32" && process.getuid?.() !== 0
afterAll(() => {
  chmodSync(path.join(scratch, LOCKED), 0o700)
  rmSync(scratch, { recursive: true, force: true })
})

// A name over 255 bytes makes stat fail with ENAMETOOLONG on macOS and Linux, even as root.
// Windows reports it differently, so that situation runs everywhere else.
const LONG = "a".repeat(300)
const SITUATIONS: [string, string, string][] = [
  ["missing", "missing", `the directory ${path.join(scratch, "missing")} does not exist`],
  ["a regular file", "file", `${path.join(scratch, "file")} is not a directory`],
  ...(process.platform === "win32"
    ? []
    : [
        [
          "too long a name",
          LONG,
          `cannot read the directory ${path.join(scratch, LONG)}: ENAMETOOLONG`,
        ] as [string, string, string],
      ]),
  ...(modeEnforced
    ? [
        [
          "a directory it may not read",
          LOCKED,
          `cannot read the directory ${path.join(scratch, LOCKED)}: EACCES`,
        ] as [string, string, string],
      ]
    : []),
]

const RUN: Record<string, (input: Record<string, unknown>) => Promise<number>> = {
  affected: runAffected,
  cache: runCache,
  doctor: runDoctor,
  except: runExcept,
  exceptions: runExceptions,
  explain: runExplain,
  "merge-mutation": runMergeMutation,
  metrics: runMetrics,
  mutation: runMutation,
  "npm-script": runNpmScript,
  "quick-start": runQuickStart,
}

const touched = (): never => {
  throw new Error("a capability was touched")
}

async function runIn(
  [command = "", ...argv]: string[],
  dir: string,
  extra: Record<string, unknown> = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  const run = RUN[command]
  if (run === undefined) throw new Error(`no runner for ${command}`)
  const out: string[] = []
  const err: string[] = []
  const code = await run({
    argv: [...argv, "-C", dir],
    cwd: scratch,
    version: "1",
    stdout: (text: string) => out.push(text),
    stderr: (text: string) => err.push(text),
    ...extra,
    engine: {},
    helpers: {},
    affected: {},
    createCapabilities: touched,
    createStore: touched,
    createRequire: touched,
    loadTypeScript: touched,
    readFile: touched,
    writeFile: touched,
    mkdir: touched,
    exec: touched,
    shell: touched,
    stryker: touched,
    git: touched,
    now: touched,
  })
  return { code, stdout: out.join(""), stderr: err.join("") }
}

function expectOutput(
  { stdout, stderr }: { stdout: string; stderr: string },
  expected: MissingDirectoryOutput,
): void {
  if ("json" in expected) {
    expect(stderr).toBe("")
    expect(JSON.parse(stdout)).toStrictEqual(expected.json)
  } else {
    expect(stdout).toBe("stdout" in expected ? expected.stdout : "")
    expect(stderr).toBe("stderr" in expected ? expected.stderr : "")
  }
}

describe.each(SITUATIONS)("every -C command in-process, given %s", (_, dir, message) => {
  it.each(missingDirectoryCases(message))(
    "%s exits 1 through its own failure path",
    async (_name, argv, expected) => {
      const result = await runIn(argv, dir)
      expect(result.code).toBe(1)
      expectOutput(result, expected)
    },
  )
})

// The five runners that take `checkDirectory` as an input. What the input says is printed as is,
// and an input that breaks its never-throw promise still ends in the runner's own failure line.
const INJECTED = new Set(["affected", "cache", "doctor", "merge-mutation", "metrics"])
const injectedCases = (message: string) =>
  missingDirectoryCases(message).filter(([name]) => INJECTED.has(name.split(" ")[0] ?? ""))

describe("a runner given a checkDirectory input", () => {
  it.each(injectedCases("the directory is on holiday"))(
    "%s prints the message it returns",
    async (_, argv, expected) => {
      const result = await runIn(argv, "missing", {
        checkDirectory: async () => "the directory is on holiday",
      })
      expect(result.code).toBe(1)
      expectOutput(result, expected)
    },
  )

  it.each(injectedCases(""))(
    "%s goes on to its work when it returns undefined",
    async (_, argv) => {
      const { stdout, stderr } = await runIn(argv, "missing", {
        checkDirectory: async () => undefined,
      })
      expect(`${stdout}${stderr}`).toContain("a capability was touched")
    },
  )
})

describe("a runner whose checkDirectory input throws", () => {
  const failed = (name: string, result: { code: number; stdout: string; stderr: string }) => {
    expect(result.code).toBe(1)
    if (name === "doctor --json") {
      expect(result.stderr).toBe("")
      expect(JSON.parse(result.stdout)).toStrictEqual({
        schemaVersion: 1,
        error: "permission denied",
      })
    } else {
      expect(result.stdout).toBe("")
      expect(result.stderr).toBe(
        `repo-contract ${name.split(" ")[0] ?? ""}: failed: permission denied\n`,
      )
    }
  }

  it.each(injectedCases(""))("%s reports the error and exits 1", async (name, argv) => {
    const thrown = (): never => {
      throw new Error("permission denied")
    }
    failed(name, await runIn(argv, "missing", { checkDirectory: thrown }))
  })

  it.each(injectedCases(""))("%s reports a rejected check the same way", async (name, argv) => {
    const rejected = async (): Promise<never> => {
      throw new Error("permission denied")
    }
    failed(name, await runIn(argv, "missing", { checkDirectory: rejected }))
  })
})
