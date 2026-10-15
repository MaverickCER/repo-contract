import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  onEvidenceSaveToRepoContractLogs,
  onVerdictPrependRepoContractLogs,
  REPO_CONTRACT_LOG_DIRECTORY,
  REPO_CONTRACT_LOG_EVIDENCE_MARKER,
  repoContractLogs,
} from "../../../src/helpers/index.js"
import type { RepoContractLogsOptions } from "../../../src/helpers/index.js"
import type { CheckEvidence } from "../../../src/types.js"

let dir: string
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "rc-logs-"))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const evidence = (over: Partial<CheckEvidence> = {}): CheckEvidence => ({
  command: "eslint",
  args: [".", "--format", "a b"],
  status: "completed",
  exitCode: 1,
  signal: null,
  startedAt: "2026-10-12T00:00:00.000Z",
  completedAt: "2026-10-12T00:00:01.000Z",
  durationMs: 1234,
  stdout: "out text\n",
  stderr: "",
  ...over,
})
const folder = () => path.join(dir, REPO_CONTRACT_LOG_DIRECTORY)
const read = (id: string) => readFileSync(path.join(folder(), `${id}.log`), "utf8")
const settle = (options: RepoContractLogsOptions) => repoContractLogs(options).flush()

describe("the evidence hook", () => {
  it("writes the command as typed, how it ended, the timing and both streams", async () => {
    const options = { cwd: dir, mode: "all" as const }
    onEvidenceSaveToRepoContractLogs(options)("Lint", evidence())
    await settle(options)
    expect(read("Lint")).toBe(
      [
        REPO_CONTRACT_LOG_EVIDENCE_MARKER,
        "Check: Lint",
        'Command: eslint . --format "a b"',
        "Ended: completed (exit code 1)",
        "Started: 2026-10-12T00:00:00.000Z",
        "Duration: 1234 ms",
        "",
        "--- stdout ---",
        "out text",
        "",
        "--- stderr ---",
        "(nothing)",
        "",
      ].join("\n"),
    )
  })

  it("says how a run that did not complete ended, and why it could not start", async () => {
    const options = { cwd: dir, mode: "all" as const }
    const save = onEvidenceSaveToRepoContractLogs(options)
    save("A", evidence({ status: "timed_out", signal: "SIGTERM" }))
    save("B", evidence({ status: "aborted" }))
    save("C", evidence({ status: "spawn_error", spawnError: "spawn x ENOENT" }))
    await settle(options)
    expect(read("A")).toContain("Ended: timed_out (SIGTERM)")
    expect(read("B")).toContain("Ended: aborted\n")
    expect(read("C")).toContain("Could not start: spawn x ENOENT")
  })

  it("removes the logs of an earlier run when it is created, and keeps other files", async () => {
    mkdirSync(folder(), { recursive: true })
    writeFileSync(path.join(folder(), "Old.log"), "stale")
    writeFileSync(path.join(folder(), "notes.txt"), "keep")
    const options = { cwd: dir, mode: "all" as const }
    onEvidenceSaveToRepoContractLogs(options)
    await settle(options)
    expect(readdirSync(folder())).toEqual(["notes.txt"])
  })

  it("overwrites a log that is already there", async () => {
    const options = { cwd: dir, mode: "all" as const }
    const save = onEvidenceSaveToRepoContractLogs(options)
    await settle(options)
    writeFileSync(path.join(folder(), "Lint.log"), "previous")
    save("Lint", evidence())
    await settle(options)
    expect(read("Lint")).not.toContain("previous")
  })

  it("writes into a folder of the caller's choosing", async () => {
    const options = { cwd: dir, directory: "out/logs", mode: "all" as const }
    onEvidenceSaveToRepoContractLogs(options)("Lint", evidence())
    await settle(options)
    expect(existsSync(path.join(dir, "out/logs/Lint.log"))).toBe(true)
  })

  it("writes nothing at all when off", async () => {
    const options = { cwd: dir, mode: "off" as const }
    onEvidenceSaveToRepoContractLogs(options)("Lint", evidence())
    await settle(options)
    expect(existsSync(folder())).toBe(false)
    expect(repoContractLogs(options).count()).toBe(0)
  })
})

describe("the verdict hook", () => {
  it("leads the log with the verdict and keeps the evidence under it", async () => {
    const options = { cwd: dir, mode: "all" as const }
    onEvidenceSaveToRepoContractLogs(options)("Lint", evidence())
    onVerdictPrependRepoContractLogs(options)("Lint", { outcome: "fail", rationale: "3 errors" })
    await settle(options)
    expect(
      read("Lint").startsWith("Verdict: FAIL\n\n3 errors\n\n=== evidence ===\nCheck: Lint"),
    ).toBe(true)
    expect(read("Lint")).toContain("out text")
  })

  it("replaces a verdict already there and never repeats the evidence", async () => {
    const options = { cwd: dir, mode: "all" as const }
    onEvidenceSaveToRepoContractLogs(options)("Lint", evidence())
    const logs = repoContractLogs(options)
    logs.prependVerdict("Lint", "FAIL", "first", false)
    logs.prependVerdict("Lint", "FAIL (advisory)", "second", false)
    await logs.flush()
    const text = read("Lint")
    expect(text.startsWith("Verdict: FAIL (advisory)\n\nsecond\n\n")).toBe(true)
    expect(text.split(REPO_CONTRACT_LOG_EVIDENCE_MARKER)).toHaveLength(2)
    expect(text).not.toContain("first")
  })

  it("keeps, by default, the log of what did not pass and removes the one of what did", async () => {
    const options = { cwd: dir }
    const save = onEvidenceSaveToRepoContractLogs(options)
    const prepend = onVerdictPrependRepoContractLogs(options)
    save("Lint", evidence())
    save("Tests", evidence())
    save("Docs", evidence())
    prepend("Lint", { outcome: "fail", rationale: "r" })
    prepend("Tests", { outcome: "pass", rationale: "ok" })
    prepend("Docs", { outcome: "warn", rationale: "hm" })
    await settle(options)
    expect(existsSync(path.join(folder(), "Tests.log"))).toBe(false)
    expect(read("Lint").startsWith("Verdict: FAIL")).toBe(true)
    expect(read("Docs").startsWith("Verdict: WARN")).toBe(true)
    expect(repoContractLogs(options).count()).toBe(2)
    expect(repoContractLogs(options).has("Tests")).toBe(false)
  })

  it("keeps the log of a check that passed with mode all", async () => {
    const options = { cwd: dir, mode: "all" as const }
    onEvidenceSaveToRepoContractLogs(options)("Tests", evidence())
    onVerdictPrependRepoContractLogs(options)("Tests", { outcome: "pass", rationale: "ok" })
    await settle(options)
    expect(read("Tests").startsWith("Verdict: PASS")).toBe(true)
  })

  it("ignores a verdict for a check that has no evidence", async () => {
    const options = { cwd: dir, mode: "all" as const }
    onEvidenceSaveToRepoContractLogs(options)
    onVerdictPrependRepoContractLogs(options)("Ghost", { outcome: "fail", rationale: "r" })
    await settle(options)
    expect(existsSync(path.join(folder(), "Ghost.log"))).toBe(false)
  })
})

describe("a disk problem", () => {
  it("is told once through onProblem and never thrown, and later writes still run", async () => {
    const problems: string[] = []
    let calls = 0
    const options = {
      cwd: dir,
      mode: "all" as const,
      onProblem: (message: string) => problems.push(message),
      fs: {
        writeFile: () => {
          calls += 1
          return Promise.reject(new Error("disk full"))
        },
      },
    }
    const logs = repoContractLogs(options)
    logs.saveEvidence("A", evidence())
    logs.saveEvidence("B", evidence())
    await logs.flush()
    expect(problems).toEqual(["could not write a log: disk full"])
    expect(calls).toBe(2)
  })

  it("is ignored when no one is listening, and a non-error reason is still told", async () => {
    const quiet = repoContractLogs({
      cwd: dir,
      fs: { mkdir: () => Promise.reject(new Error("no")) },
    })
    quiet.saveEvidence("A", evidence())
    await expect(quiet.flush()).resolves.toBeUndefined()
    const problems: string[] = []
    const odd = repoContractLogs({
      cwd: dir,
      onProblem: (m) => problems.push(m),
      fs: { mkdir: () => Promise.reject(JSON.parse('"just a string"') as Error) },
    })
    odd.saveEvidence("A", evidence())
    await odd.flush()
    expect(problems).toEqual(["could not write a log: just a string"])
  })
})

describe("repoContractLogs", () => {
  it("gives the same store for the same folder and mode, and a different one otherwise", () => {
    expect(repoContractLogs({ cwd: dir })).toBe(repoContractLogs({ cwd: dir }))
    expect(repoContractLogs({ cwd: dir })).not.toBe(repoContractLogs({ cwd: dir, mode: "all" }))
    expect(repoContractLogs({ cwd: dir }).directory).toBe(REPO_CONTRACT_LOG_DIRECTORY)
  })

  it("does not share a store that has its own file operations", () => {
    const own = repoContractLogs({ cwd: dir, fs: {} })
    expect(own).not.toBe(repoContractLogs({ cwd: dir }))
  })
})

describe("details that are easy to get subtly wrong", () => {
  it("trims the end of what a tool printed, and calls a whitespace-only stream nothing", async () => {
    const options = { cwd: dir, mode: "all" as const }
    const save = onEvidenceSaveToRepoContractLogs(options)
    save("Padded", evidence({ stdout: "text   \n\n", stderr: "  \n" }))
    await settle(options)
    expect(read("Padded")).toContain("--- stdout ---\ntext\n\n--- stderr ---\n(nothing)\n")
  })

  it("does not share a store that has its own file operations even when one is already cached", () => {
    const shared = repoContractLogs({ cwd: dir })
    expect(repoContractLogs({ cwd: dir, fs: {} })).not.toBe(shared)
  })

  it("does not complain when the log it is about to remove is already gone", async () => {
    const problems: string[] = []
    const options = { cwd: dir, onProblem: (m: string) => problems.push(m) }
    onEvidenceSaveToRepoContractLogs(options)("Tests", evidence())
    await settle(options)
    rmSync(path.join(folder(), "Tests.log"))
    onVerdictPrependRepoContractLogs(options)("Tests", { outcome: "pass", rationale: "ok" })
    await settle(options)
    expect(problems).toEqual([])
  })

  it("forgets what an earlier run wrote when a new run begins", async () => {
    const options = { cwd: dir, mode: "all" as const }
    onEvidenceSaveToRepoContractLogs(options)("A", evidence())
    expect(repoContractLogs(options).has("A")).toBe(true)
    onEvidenceSaveToRepoContractLogs(options)
    expect(repoContractLogs(options).has("A")).toBe(false)
    expect(repoContractLogs(options).count()).toBe(0)
    await settle(options)
  })

  it("quietly ignores a verdict for a check with no log, in every mode", async () => {
    for (const mode of ["off", "all", "failing"] as const) {
      const problems: string[] = []
      const options = { cwd: dir, mode, onProblem: (m: string) => problems.push(m) }
      onEvidenceSaveToRepoContractLogs(options)
      onVerdictPrependRepoContractLogs(options)("Ghost", { outcome: "fail", rationale: "r" })
      await settle(options)
      expect(problems).toEqual([])
      expect(existsSync(path.join(folder(), "Ghost.log"))).toBe(false)
    }
  })

  it("does not write anything for a verdict in off mode even for a check that was saved elsewhere", async () => {
    const problems: string[] = []
    const store = repoContractLogs({ cwd: dir, mode: "off", onProblem: (m) => problems.push(m) })
    store.prependVerdict("A", "FAIL", "r", false)
    await store.flush()
    expect(problems).toEqual([])
    expect(existsSync(folder())).toBe(false)
  })

  it("puts the whole reason, with its trailing blank lines removed, above the evidence", async () => {
    const options = { cwd: dir, mode: "all" as const }
    onEvidenceSaveToRepoContractLogs(options)("A", evidence())
    onVerdictPrependRepoContractLogs(options)("A", { outcome: "fail", rationale: "reason\n\n\n" })
    await settle(options)
    expect(read("A").startsWith("Verdict: FAIL\n\nreason\n\n=== evidence ===")).toBe(true)
  })

  it("tells the first problem of each run, not only of the first run", async () => {
    const problems: string[] = []
    const store = repoContractLogs({
      cwd: dir,
      mode: "all",
      onProblem: (m) => problems.push(m),
      fs: { writeFile: () => Promise.reject(new Error("disk full")) },
    })
    store.saveEvidence("A", evidence())
    store.saveEvidence("B", evidence())
    await store.flush()
    store.begin()
    store.saveEvidence("A", evidence())
    await store.flush()
    expect(problems).toEqual([
      "could not write a log: disk full",
      "could not write a log: disk full",
    ])
  })

  it("encodes a check id into one file name, so it cannot leave the folder or nest", async () => {
    const options = { cwd: dir, mode: "all" as const }
    const hook = onEvidenceSaveToRepoContractLogs(options)
    hook("../escape", evidence())
    hook("a/b", evidence())
    hook("plain-id", evidence())
    await settle(options)
    expect(readdirSync(folder()).sort()).toEqual(["..%2Fescape.log", "a%2Fb.log", "plain-id.log"])
    expect(existsSync(path.join(dir, "escape.log"))).toBe(false)
  })

  it("keeps the whole log when it has no evidence marker to cut at", async () => {
    mkdirSync(folder(), { recursive: true })
    writeFileSync(path.join(folder(), "A.log"), "written by someone else\n")
    const store = repoContractLogs({ cwd: dir, mode: "all" })
    store.saveEvidence("A", evidence())
    await store.flush()
    writeFileSync(path.join(folder(), "A.log"), "written by someone else\n")
    store.prependVerdict("A", "FAIL", "r", false)
    await store.flush()
    expect(read("A")).toBe("Verdict: FAIL\n\nr\n\nwritten by someone else\n")
  })
})
