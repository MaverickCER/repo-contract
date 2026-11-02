import { execFileSync, spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createCache } from "../../../src/affected/index.js"
import { createFileCacheStore } from "../../../src/helpers/index.js"
import { createRunRecord, serializeRunRecord } from "../../../src/metrics/index.js"

// A pull request's life through the real command line: which tests the change needs, how the
// mutation work splits across CI jobs, what `doctor` says about the repository, why a cache lookup
// missed, and what the run log shows. The README's "Getting the most out of repo-contract" section
// is written from this test, so a change to any output here must change the docs. Needs `dist/`,
// which `npm run contract` builds first.

const root = path.resolve(__dirname, "../../..")
const bin = path.join(root, "bin/repo-contract.mjs")

const base: Record<string, string> = {
  "src/math.ts": "export const double = (n: number) => n * 2\n",
  "src/text.ts": "export const shout = (s: string) => s.toUpperCase()\n",
  "src/both.ts":
    'import { double } from "./math.js"\nexport const twice = (n: number) => double(n)\n',
  "test/math.test.ts": 'import { double } from "../src/math.js"\ndouble(1)\n',
  "test/text.test.ts": 'import { shout } from "../src/text.js"\nshout("a")\n',
  "test/both.test.ts": 'import { twice } from "../src/both.js"\ntwice(1)\n',
  ".github/workflows/ci.yml":
    "jobs:\n  contract:\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm run contract\n",
}

let repo: string
const git = (...args: string[]): string =>
  execFileSync("git", args, {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, GIT_DIR: undefined },
  })
const write = (name: string, content: string): void => {
  mkdirSync(path.dirname(path.join(repo, name)), { recursive: true })
  writeFileSync(path.join(repo, name), content)
}
const run = (args: string[]) =>
  spawnSync("node", [bin, ...args], {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, GIT_DIR: undefined },
  })
const lines = (text: string): string[] => text.split("\n").filter(Boolean)

beforeAll(() => {
  repo = mkdtempSync(path.join(tmpdir(), "rc-workflow-"))
  git("init", "-q", "-b", "main")
  git("config", "user.email", "t@example.com")
  git("config", "user.name", "t")
  git("config", "commit.gpgsign", "false")
  mkdirSync(path.join(repo, "node_modules"))
  symlinkSync(
    path.join(root, "node_modules/typescript"),
    path.join(repo, "node_modules/typescript"),
  )
  writeFileSync(path.join(repo, ".gitignore"), "node_modules\n")
  for (const [name, content] of Object.entries(base)) write(name, content)
  git("add", "-A")
  git("commit", "-q", "-m", "base")
  // The pull request: change what `double` does.
  write("src/math.ts", "export const double = (n: number) => n + n\n")
})

afterAll(() => {
  rmSync(repo, { recursive: true, force: true })
})

describe("a pull request, end to end", () => {
  it("1. runs only the tests the change can reach, and says why", () => {
    const { status, stdout } = run(["affected", "--base", "HEAD", "--tests"])
    expect(status).toBe(0)
    expect(lines(stdout)).toEqual(["test/both.test.ts", "test/math.test.ts"])
    const why = run(["affected", "--base", "HEAD", "--explain"]).stdout
    expect(why).toContain("src/math.ts#double")
    expect(why).not.toContain("text.test.ts")
  })

  it("2. mutates the changed file and what uses it directly", () => {
    expect(lines(run(["affected", "--base", "HEAD", "--mutate"]).stdout)).toEqual([
      "src/both.ts",
      "src/math.ts",
    ])
  })

  it("3. splits the mutation work across CI jobs and loses none of it", () => {
    const plan = JSON.parse(
      run(["affected", "--base", "HEAD", "--plan-shards", "--shards", "2"]).stdout,
    ) as {
      count: number
      include: { shard: number; total: number; spec: string }[]
    }
    expect(plan.count).toBe(2)
    expect(plan.include.map((entry) => entry.spec)).toEqual(["1/2", "2/2"])
    const shards = plan.include.map((entry) =>
      lines(run(["affected", "--base", "HEAD", "--mutate", "--shard", entry.spec]).stdout),
    )
    expect(shards.every((files) => files.length === 1)).toBe(true)
    expect(shards.flat().sort()).toEqual(["src/both.ts", "src/math.ts"])
  })

  it("3b. merges the shards' mutation reports, and refuses when one is missing", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rc-shards-"))
    const shardReport = (name: string) =>
      JSON.stringify({
        schemaVersion: "2",
        thresholds: {},
        files: { [name]: { language: "typescript", mutants: [] } },
      })
    writeFileSync(path.join(dir, "s1.json"), shardReport("src/both.ts"))
    writeFileSync(path.join(dir, "s2.json"), shardReport("src/math.ts"))
    const merged = run([
      "merge-mutation",
      "--total",
      "2",
      path.join("1=" + dir, "s1.json"),
      path.join("2=" + dir, "s2.json"),
    ])
    expect(merged.status).toBe(0)
    expect(Object.keys((JSON.parse(merged.stdout) as { files: object }).files)).toEqual([
      "src/both.ts",
      "src/math.ts",
    ])
    const lost = run([
      "merge-mutation",
      "--total",
      "3",
      path.join("1=" + dir, "s1.json"),
      path.join("2=" + dir, "s2.json"),
    ])
    expect(lost.status).toBe(1)
    expect(lost.stderr).toContain("missing shard 3")
    expect(lost.stdout).toBe("")
  })

  it("4. balances shards by recorded time", () => {
    // Timings come from the last run, kept outside the working tree so they are not themselves a change.
    const timings = path.join(mkdtempSync(path.join(tmpdir(), "rc-timings-")), "timings.json")
    writeFileSync(timings, JSON.stringify({ "src/math.ts": 600_000, "src/both.ts": 1_000 }))
    const first = lines(
      run(["affected", "--base", "HEAD", "--mutate", "--shard", "1/2", "--timings", timings])
        .stdout,
    )
    expect(first).toEqual(["src/math.ts"])
    const sized = JSON.parse(
      run([
        "affected",
        "--base",
        "HEAD",
        "--plan-shards",
        "--target-minutes",
        "5",
        "--timings",
        timings,
      ]).stdout,
    ) as { count: number }
    expect(sized.count).toBe(2)
  })

  it("5. widens to everything when a global file changes, and says so", () => {
    write("package.json", '{ "name": "demo" }\n')
    const { stdout, stderr } = run(["affected", "--base", "HEAD", "--tests"])
    expect(stderr).toContain("running everything (global-trigger: package.json)")
    expect(lines(stdout)).toEqual(["test/both.test.ts", "test/math.test.ts", "test/text.test.ts"])
    rmSync(path.join(repo, "package.json"))
  })

  it("6. doctor finds a shallow checkout and an unignored cache, and fixes only the safe one", () => {
    const found = run(["doctor"]).stdout
    expect(found).toContain("cache-not-ignored")
    expect(found).toContain("checkout-shallow")
    expect(found).toContain("Run with --fix to apply 1 safe change.")
    const fixed = run(["doctor", "--fix"]).stdout
    expect(fixed).toContain("+.repo-contract/cache/")
    expect(readFileSync(path.join(repo, ".gitignore"), "utf8")).toBe(
      "node_modules\n.repo-contract/cache/\n",
    )
    const after = run(["doctor"]).stdout
    expect(after).not.toContain("cache-not-ignored")
    expect(after).toContain("checkout-shallow")
  })

  it("7. explains a cache miss by naming the input that changed", async () => {
    const cache = createCache({
      store: createFileCacheStore(path.join(repo, ".repo-contract", "cache")),
      mode: "read-write",
      now: () => new Date(),
    })
    await cache.store({
      check: "tests",
      key: "c".repeat(64),
      inputs: { "src/math.ts": "old", "test/math.test.ts": "same" },
      value: { passed: true },
      durationMs: 1000,
    })
    write("inputs.json", JSON.stringify({ "src/math.ts": "new", "test/math.test.ts": "same" }))
    const { status, stdout } = run(["cache", "why", "tests", "--inputs", "inputs.json"])
    expect(status).toBe(0)
    expect(stdout).toContain("inputs differ from the latest entry")
    expect(stdout).toContain("changed: src/math.ts")
    expect(stdout).not.toContain("test/math.test.ts")
    expect(run(["cache", "stats"]).stdout).toContain("1 entry")
  })

  it("8. summarizes the run log", () => {
    const record = (patch: Record<string, unknown>) =>
      serializeRunRecord(
        createRunRecord({
          startedAt: "2026-11-02T10:00:00.000Z",
          durationMs: 60_000,
          scope: "affected",
          checks: [{ id: "tests", durationMs: 1, verdict: "pass", cache: "hit" }],
          ...patch,
        } as never),
      )
    write(
      ".repo-contract/metrics/runs.jsonl",
      record({}) +
        record({ scope: "full", durationMs: 600_000 }) +
        record({ checks: [{ id: "tests", durationMs: 1, verdict: "fail" }] }),
    )
    const { status, stdout } = run(["metrics"])
    expect(status).toBe(0)
    expect(stdout).toContain("runs: 3 (2 passed, 1 failed)")
    expect(stdout).toContain("minutes saved by affected runs: 18.0")
    expect(stdout).toContain("  tests: 1")
    expect(JSON.parse(run(["metrics", "--json"]).stdout)).toMatchObject({
      schemaVersion: 1,
      summary: { runs: 3 },
    })
  })
})
