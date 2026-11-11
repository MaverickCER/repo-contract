// Walks one pull request through repo-contract's affected-scope commands in a throwaway git
// repository, printing each real command and its real output, and failing (exit code 1) the moment
// an output differs from what ./README.md says. Run it with `npm run walkthrough` (or `tsx run.ts`)
// from this directory.
//
// The commands are the ones a developer or a CI job runs; nothing here is simulated. They are also
// exercised by repo-contract's own test/integration/affected/workflow.test.ts.
import { execFileSync, spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const bin = fileURLToPath(new URL("../../bin/repo-contract.mjs", import.meta.url))
const typescript = path.dirname(createRequire(import.meta.url).resolve("typescript/package.json"))

// A tiny project: `both` uses `math`, and `text` stands alone.
const project: Record<string, string> = {
  "src/math.ts": "export const double = (n: number) => n * 2\n",
  "src/text.ts": "export const shout = (s: string) => s.toUpperCase()\n",
  "src/both.ts":
    'import { double } from "./math.js"\nexport const twice = (n: number) => double(n)\n',
  "test/math.test.ts": 'import { double } from "../src/math.js"\ndouble(1)\n',
  "test/text.test.ts": 'import { shout } from "../src/text.js"\nshout("a")\n',
  "test/both.test.ts": 'import { twice } from "../src/both.js"\ntwice(1)\n',
}

const repo = mkdtempSync(path.join(tmpdir(), "affected-scope-"))
const env = { ...process.env, GIT_DIR: undefined }
const git = (...args: string[]): void => {
  execFileSync("git", args, { cwd: repo, env, stdio: "ignore" })
}
const write = (name: string, content: string): void => {
  mkdirSync(path.dirname(path.join(repo, name)), { recursive: true })
  writeFileSync(path.join(repo, name), content)
}
const lines = (text: string): string[] => text.split("\n").filter(Boolean)

let failed = false
const expect = (what: string, actual: unknown, wanted: unknown): void => {
  const same = JSON.stringify(actual) === JSON.stringify(wanted)
  if (!same) failed = true
  process.stdout.write(`  ${same ? "ok  " : "FAIL"} ${what}\n`)
  if (!same)
    process.stdout.write(
      `       wanted ${JSON.stringify(wanted)}\n       got    ${JSON.stringify(actual)}\n`,
    )
}
const run = (...args: string[]): { stdout: string; stderr: string } => {
  process.stdout.write(`\n$ repo-contract ${args.join(" ")}\n`)
  const { stdout, stderr } = spawnSync("node", [bin, ...args], { cwd: repo, encoding: "utf8", env })
  process.stdout.write(stdout.replace(/^/gm, "  "))
  return { stdout, stderr }
}

try {
  git("init", "-q", "-b", "main")
  git("config", "user.email", "walkthrough@example.com")
  git("config", "user.name", "walkthrough")
  git("config", "commit.gpgsign", "false")
  // The analysis reads the project's own TypeScript, as any real repository has.
  mkdirSync(path.join(repo, "node_modules"))
  symlinkSync(typescript, path.join(repo, "node_modules/typescript"))
  write(".gitignore", "node_modules\n")
  for (const [name, content] of Object.entries(project)) write(name, content)
  git("add", "-A")
  git("commit", "-q", "-m", "base")

  process.stdout.write("The pull request changes what `double` does.\n")
  write("src/math.ts", "export const double = (n: number) => n + n\n")

  process.stdout.write("\n1. Which tests can the change reach?\n")
  expect(
    "only the tests of math and of what uses it",
    lines(run("affected", "--base", "HEAD", "--tests").stdout),
    ["test/both.test.ts", "test/math.test.ts"],
  )

  process.stdout.write("\n2. Why? Every test that runs has a chain back to a changed symbol.\n")
  const why = run("affected", "--base", "HEAD", "--explain").stdout
  expect("names the changed symbol", why.includes("src/math.ts#double"), true)
  expect("leaves the unrelated test out", why.includes("text.test.ts"), false)

  process.stdout.write("\n3. Which files does mutation testing need to cover?\n")
  expect(
    "the changed file and what uses it",
    lines(run("affected", "--base", "HEAD", "--mutate").stdout),
    ["src/both.ts", "src/math.ts"],
  )

  process.stdout.write("\n4. Split that work across two CI jobs: no file is lost or doubled.\n")
  const plan = JSON.parse(
    run("affected", "--base", "HEAD", "--plan-shards", "--shards", "2").stdout,
  ) as {
    include: { spec: string }[]
  }
  const shards = plan.include.map((entry) =>
    lines(run("affected", "--base", "HEAD", "--mutate", "--shard", entry.spec).stdout),
  )
  expect("the shards together are exactly the mutation targets", shards.flat().sort(), [
    "src/both.ts",
    "src/math.ts",
  ])

  process.stdout.write("\n5. A change repo-contract cannot reason about makes it run everything.\n")
  write("package.json", '{ "name": "walkthrough", "version": "1.0.0" }\n')
  const widened = run("affected", "--base", "HEAD", "--tests")
  expect("every test runs", lines(widened.stdout), [
    "test/both.test.ts",
    "test/math.test.ts",
    "test/text.test.ts",
  ])
  expect("and it says why", widened.stderr.includes("global-trigger: package.json"), true)

  process.stdout.write("\n6. doctor finds settings that would slow or break these runs.\n")
  expect(
    "it spots the cache directory that is not ignored",
    run("doctor").stdout.includes("cache-not-ignored"),
    true,
  )
} finally {
  rmSync(repo, { recursive: true, force: true })
}

process.stdout.write(`\n${failed ? "FAIL" : "PASS"}\n`)
process.exitCode = failed ? 1 : 0
