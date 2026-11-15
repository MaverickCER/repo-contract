import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { runQuickStart } from "../../../bin/quick-start-cli.mjs"
import { quickStart } from "../../../src/presets/quick-start.js"
import type { CheckEvidence } from "../../../src/types.js"
import { enoentEvidence, fakeCheckEvidence, fakeContext } from "./fixtures.js"

function reportEvidence(report: unknown): CheckEvidence {
  return fakeCheckEvidence({ output: { format: "json", success: true, value: report } })
}

const verdictFor = (report: unknown) => quickStart().policy(fakeContext(reportEvidence(report)))

describe("quickStart preset", () => {
  it("runs the repo-contract quick-start command with JSON output, README.md and a five-minute budget", () => {
    const check = quickStart()
    expect(check.run).toEqual([
      "repo-contract",
      "quick-start",
      "--json",
      "--readme",
      "README.md",
      "--timeout",
      "300000",
    ])
    expect(check.output).toEqual({ format: "json" })
    expect(check.timeoutMs).toBe(420_000)
  })

  it("threads its options through the command line", () => {
    const check = quickStart({ readme: "docs/START.md", timeoutMs: 60_000 })
    expect(check.run).toEqual([
      "repo-contract",
      "quick-start",
      "--json",
      "--readme",
      "docs/START.md",
      "--timeout",
      "60000",
    ])
    expect(check.timeoutMs).toBe(180_000)
  })

  it("passes when every command passed", async () => {
    expect(
      await verdictFor({
        schemaVersion: 1,
        readme: "README.md",
        state: "passed",
        commands: [
          { command: "npm install ../tarball/x.tgz", exitCode: 0, timedOut: false, durationMs: 5 },
          { command: "npx x", exitCode: 0, timedOut: false, durationMs: 5 },
        ],
      }),
    ).toEqual({
      outcome: "pass",
      rationale:
        "README.md's quick start ran 2 command(s) against the packed tarball in an empty project.",
    })
  })

  it("fails naming the command that exited non-zero, with its last output", async () => {
    expect(
      await verdictFor({
        schemaVersion: 1,
        readme: "README.md",
        state: "failed",
        commands: [
          { command: "npm install ../tarball/x.tgz", exitCode: 0, timedOut: false, durationMs: 5 },
          { command: "npx x", exitCode: 2, timedOut: false, durationMs: 5 },
        ],
        output: "Error: boom\n  at x",
      }),
    ).toEqual({
      outcome: "fail",
      rationale: [
        "README.md's quick start failed at command 2, `npx x`: it exited 2. Its last output:",
        "  Error: boom",
        "    at x",
      ].join("\n"),
    })
  })

  it("fails naming the command that ran out of time", async () => {
    const result = await quickStart({ timeoutMs: 1000 }).policy(
      fakeContext(
        reportEvidence({
          schemaVersion: 1,
          readme: "README.md",
          state: "failed",
          commands: [{ command: "npm test", exitCode: null, timedOut: true, durationMs: 1000 }],
          output: "",
        }),
      ),
    )
    expect(result).toEqual({
      outcome: "fail",
      rationale:
        "README.md's quick start failed at command 1, `npm test`: it was stopped when the 1000 ms budget ran out. Its last output:\n  (none)",
    })
  })

  it.each(["no-block", "invalid", "no-install", "error"])(
    "fails a %s report with the command's own message",
    async (state) => {
      expect(
        await verdictFor({
          schemaVersion: 1,
          readme: "README.md",
          state,
          message: "why it stopped",
        }),
      ).toEqual({ outcome: "fail", rationale: "why it stopped" })
    },
  )

  it.each([
    ["an unknown state", { schemaVersion: 1, readme: "R", state: "maybe" }],
    ["a passed report without commands", { schemaVersion: 1, readme: "R", state: "passed" }],
    [
      "a failed report without commands",
      { schemaVersion: 1, readme: "R", state: "failed", commands: [], output: "" },
    ],
    [
      "a failed report without output",
      {
        schemaVersion: 1,
        readme: "R",
        state: "failed",
        commands: [{ command: "a", exitCode: 1, timedOut: false, durationMs: 1 }],
      },
    ],
    [
      "a malformed command entry",
      { schemaVersion: 1, readme: "R", state: "passed", commands: [{ command: 1 }] },
    ],
    ["a message-only state without a message", { schemaVersion: 1, readme: "R", state: "error" }],
    ["another schema version", { schemaVersion: 2, readme: "R", state: "passed", commands: [] }],
    ["no readme", { schemaVersion: 1, state: "passed", commands: [] }],
    ["a null command entry", { schemaVersion: 1, readme: "R", state: "passed", commands: [null] }],
    [
      "an exit code that is text",
      {
        schemaVersion: 1,
        readme: "R",
        state: "passed",
        commands: [{ command: "a", exitCode: "0", timedOut: false }],
      },
    ],
    ["no report at all", null],
  ])("fails %s as an invalid report", async (_label, report) => {
    expect(await verdictFor(report)).toEqual({
      outcome: "fail",
      rationale: "The quick-start command produced an invalid report.",
    })
  })

  it("fails when the output was never parsed", async () => {
    const result = await quickStart().policy(fakeContext(fakeCheckEvidence({ exitCode: 1 })))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("could not be parsed as JSON")
  })

  it("fails when the output is not JSON", async () => {
    const result = await quickStart().policy(
      fakeContext(
        fakeCheckEvidence({ exitCode: 2, output: { format: "json", success: false, error: "x" } }),
      ),
    )
    expect(result).toEqual({
      outcome: "fail",
      rationale: "The quick-start command's output could not be parsed as JSON.\n",
    })
  })

  it("shows the command's own stderr when its output is not JSON", async () => {
    const result = await quickStart().policy(
      fakeContext(
        fakeCheckEvidence({
          exitCode: 2,
          stderr: "repo-contract: unknown command 'quick-start'\n",
          output: { format: "json", success: false, error: "x" },
        }),
      ),
    )
    expect(result.rationale).toBe(
      "The quick-start command's output could not be parsed as JSON.\nrepo-contract: unknown command 'quick-start'",
    )
  })

  it("fails a report whose commands or state are malformed", async () => {
    const ok = { command: "npx x", exitCode: 0, timedOut: false }
    const base = { schemaVersion: 1, readme: "README.md", state: "passed" }
    for (const report of [
      { ...base, commands: [{ exitCode: 0, timedOut: false }] },
      { ...base, commands: [{ command: "npx x", exitCode: 0 }] },
      { ...base, commands: [ok, { command: "npx y" }] },
      { ...base, commands: [null] },
      { ...base, state: "unknown", commands: [ok], output: "" },
    ]) {
      expect(await verdictFor(report)).toEqual({
        outcome: "fail",
        rationale: "The quick-start command produced an invalid report.",
      })
    }
  })

  it("names the quick-start command when it does not finish", async () => {
    const result = await quickStart().policy(
      fakeContext(fakeCheckEvidence({ status: "timed_out", exitCode: null })),
    )
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("The quick-start command")
  })

  it("asks for repo-contract when its command is missing", async () => {
    const result = await quickStart().policy(fakeContext(enoentEvidence("repo-contract")))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("`repo-contract` is required by this preset")
  })
})

describe("quickStart preset: reading what repo-contract quick-start prints", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "quick-start-preset-"))
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })
  writeFileSync(path.join(dir, "package.json"), '{"name":"x"}')

  /** The JSON `repo-contract quick-start --json` prints for this README, with commands faked. */
  async function printed(readme: string, exitCodes: readonly number[]): Promise<unknown> {
    writeFileSync(path.join(dir, "README.md"), readme)
    const out: string[] = []
    let call = 0
    await runQuickStart({
      argv: ["--json"],
      cwd: dir,
      version: "0.0.0",
      stdout: (text: string) => out.push(text),
      stderr: () => undefined,
      exec: async () => ({ exitCode: 0, stdout: "x-1.0.0.tgz\n", stderr: "" }),
      shell: async () => {
        const exitCode = exitCodes[call] ?? 0
        call += 1
        return { exitCode, timedOut: false, output: `out ${String(call)}\n` }
      },
      now: () => 0,
    })
    return JSON.parse(out.join("")) as unknown
  }

  const marked =
    "<!-- quick-start:begin -->\n```sh\nnpm install x\nnpx x\n```\n<!-- quick-start:end -->\n"

  it("passes a passed report, fails a failed one, and relays the missing-block message", async () => {
    expect(await verdictFor(await printed(marked, [0, 0]))).toEqual({
      outcome: "pass",
      rationale:
        "README.md's quick start ran 2 command(s) against the packed tarball in an empty project.",
    })
    expect(await verdictFor(await printed(marked, [0, 4]))).toEqual({
      outcome: "fail",
      rationale:
        "README.md's quick start failed at command 2, `npx x`: it exited 4. Its last output:\n  out 2",
    })
    expect(await verdictFor(await printed("# x\n", []))).toEqual({
      outcome: "fail",
      rationale:
        "README.md has no marked quick start. Put <!-- quick-start:begin --> on the line before its fenced shell block and <!-- quick-start:end --> on the line after it.",
    })
  })
})
