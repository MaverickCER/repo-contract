import { describe, expect, it } from "vitest"
import { defineRepoContract, runRepoContract, serializeRun } from "../../../src/index.js"
import { aiReview } from "../../../src/presets/ai-review.js"
import type { AiReviewOptions, AiReviewReply } from "../../../src/presets/ai-review.js"
import type { CheckEvidence, PolicyResult } from "../../../src/types.js"
import { testSpawn } from "../../helpers/test-spawn.js"
import { fakeCheckEvidence, fakeContext } from "./fixtures.js"

/** The default prompt, word for word: GUIDE.md shows it, and the reviewer depends on it. */
const DEFAULT_PROMPT = `Review this repository's changes against its default branch for bugs and for rules its docs state.
Reply with JSON only, no prose, in exactly this shape:
{
  "findings": [
    {
      "rule": "no-logging-in-library",
      "file": "src/greet.ts",
      "line": 15,
      "severity": "warn",
      "score": 0.7,
      "reason": "greet() logs every name; leave logging to the caller."
    }
  ],
  "summary": { "score": 0.9 }
}
- "severity" is "info", "warn" or "error". Use "error" only for a defect.
- "score" is your confidence from 0 to 1 that the finding is real.
- "line" is the 1-based line, or 0 when the finding has no single line.
- "summary.score" is your confidence in the change as a whole.
- Reply { "findings": [], "summary": { "score": 1 } } when you find nothing.`

const UNPARSED = "the output is not JSON, and neither is the text from its first { to its last }"
const DEFAULT_FALLBACK_LINES = [
  "1 finding(s) below the blocking bar (error at confidence 0.8 or more):",
  "- [unparsed-output] warn, confidence 1: the reviewer's output could not be parsed",
]

const finding = (
  severity: "info" | "warn" | "error",
  score: number,
  overrides: Record<string, unknown> = {},
) => ({
  rule: `${severity}-rule`,
  file: "src/a.ts",
  line: 7,
  severity,
  score,
  reason: `a ${severity} reason`,
  ...overrides,
})

const reply = (...findings: unknown[]) => JSON.stringify({ findings, summary: { score: 0.5 } })

/**
 * Runs the preset's policy on fabricated evidence.
 * @param evidence - Overrides for a completed run with exit code 0.
 * @param options - Preset options; `agent` defaults to `["agent"]`.
 * @returns The policy's verdict.
 */
async function judge(
  evidence: Partial<CheckEvidence>,
  options: Partial<AiReviewOptions> = {},
): Promise<PolicyResult> {
  const check = aiReview({ agent: ["agent"], ...options })
  return check.policy(fakeContext(fakeCheckEvidence(evidence)))
}

/**
 * @param stdout - The agent's output.
 * @param options - Preset options.
 * @returns The policy's verdict on that output.
 */
const output = (stdout: string, options: Partial<AiReviewOptions> = {}) =>
  judge({ stdout }, options)

describe("aiReview: the check it builds", () => {
  it("appends the default prompt to the agent, sets a 10-minute timeout and an empty env, and nothing else", () => {
    const check = aiReview({ agent: ["agent", "--json"] })
    expect(check.run).toEqual(["agent", "--json", DEFAULT_PROMPT])
    expect(check.env).toStrictEqual({})
    expect(check.timeoutMs).toBe(600_000)
    expect(Object.keys(check).sort()).toEqual(["env", "policy", "run", "timeoutMs"])
  })

  it("puts the prompt wherever an argument holds {prompt}, every time, and appends nothing", () => {
    const check = aiReview({
      agent: ["claude", "-p", "{prompt}", "--note={prompt}|{prompt}", "--plain"],
      prompt: "P",
    })
    expect(check.run).toEqual(["claude", "-p", "P", "--note=P|P", "--plain"])
  })

  it("inserts the prompt literally, even when it holds replacement patterns such as $& and $'", () => {
    const check = aiReview({ agent: ["agent", "{prompt}"], prompt: "cost $& and $' and $$" })
    expect(check.run).toEqual(["agent", "cost $& and $' and $$"])
  })

  it("sends a custom string prompt as written", () => {
    expect(aiReview({ agent: ["agent"], prompt: "Find bugs." }).run).toEqual([
      "agent",
      "Find bugs.",
    ])
  })

  it("lists `files` after a string prompt, and the default prompt too", () => {
    expect(
      aiReview({ agent: ["agent"], prompt: "Find bugs.", files: ["a.ts", "b/c.ts"] }).run,
    ).toEqual(["agent", "Find bugs.\nReview only these files:\n- a.ts\n- b/c.ts"])
    expect(aiReview({ agent: ["agent"], files: ["a.ts"] }).run).toEqual([
      "agent",
      `${DEFAULT_PROMPT}\nReview only these files:\n- a.ts`,
    ])
  })

  it("accepts `files` beside a string prompt and judges the reply", async () => {
    expect(
      await output(reply(finding("info", 0.4)), { prompt: "Find bugs.", files: ["a.ts"] }),
    ).toEqual({
      outcome: "pass",
      rationale: "The AI reviewer raised no warn or error findings (1 info).",
    })
  })

  it("adds no file list for an empty `files`", () => {
    expect(aiReview({ agent: ["agent"], prompt: "Find bugs.", files: [] }).run).toEqual([
      "agent",
      "Find bugs.",
    ])
  })

  it("hands the agent the path of a `{ file }` prompt, appended or at {prompt}", () => {
    expect(aiReview({ agent: ["agent"], prompt: { file: "review.txt" } }).run).toEqual([
      "agent",
      "review.txt",
    ])
    expect(
      aiReview({ agent: ["agent", "--prompt-file", "{prompt}", "-q"], prompt: { file: "r.md" } })
        .run,
    ).toEqual(["agent", "--prompt-file", "r.md", "-q"])
  })

  it("passes credentials that have a value through `env`, never through the command line", () => {
    const check = aiReview({
      agent: ["agent", "{prompt}"],
      credentials: { API_KEY: "s3cret-value", OTHER: "x2", UNSET: undefined, EMPTY: "" },
    })
    expect(check.env).toStrictEqual({ API_KEY: "s3cret-value", OTHER: "x2" })
    expect(JSON.stringify(check.run)).not.toContain("s3cret-value")
  })

  it("sets `cwd` and `timeoutMs` when given", () => {
    const check = aiReview({ agent: ["agent"], cwd: "packages/app", timeoutMs: 5000 })
    expect(check.cwd).toBe("packages/app")
    expect(check.timeoutMs).toBe(5000)
    expect(Object.keys(check).sort()).toEqual(["cwd", "env", "policy", "run", "timeoutMs"])
  })
})

describe("aiReview: misconfiguration", () => {
  it.each([-0.01, 1.01, Number.NaN, "0.5"])(
    "fails before reading the output when errorThreshold is %s",
    async (errorThreshold) => {
      const result = await output(reply(), { errorThreshold: errorThreshold as number })
      expect(result).toEqual({
        outcome: "fail",
        rationale: "aiReview is misconfigured:\n- errorThreshold must be a number from 0 to 1",
      })
    },
  )

  it("lists every problem of an off-shape fallback under `fallback.`", async () => {
    const fallback = {
      findings: [{ rule: 1, file: "a", line: 1, severity: "warn", score: 1, reason: "r" }],
      summary: { score: 2 },
    } as unknown as AiReviewReply
    expect(await output("not json", { fallback })).toEqual({
      outcome: "fail",
      rationale: [
        "aiReview is misconfigured:",
        "- fallback.summary.score must be a number from 0 to 1",
        "- fallback.findings[0].rule must be a string",
      ].join("\n"),
    })
  })

  it("rejects `files` with a `{ file }` prompt, and lists it after the other problems", async () => {
    const result = await output(reply(), {
      prompt: { file: "r.txt" },
      files: ["a.ts"],
      errorThreshold: 2,
    })
    expect(result).toEqual({
      outcome: "fail",
      rationale: [
        "aiReview is misconfigured:",
        "- errorThreshold must be a number from 0 to 1",
        "- files needs a string prompt; with { file } the agent reads its prompt from that file",
      ].join("\n"),
    })
  })

  it("accepts a `{ file }` prompt with no files, and the thresholds 0 and 1", async () => {
    expect((await output(reply(), { prompt: { file: "r.txt" }, files: [] })).outcome).toBe("pass")
    expect((await output(reply(), { errorThreshold: 0 })).outcome).toBe("pass")
    expect((await output(reply(), { errorThreshold: 1 })).outcome).toBe("pass")
  })
})

describe("aiReview: a process that did not run to its exit", () => {
  it("reads ENOENT only from a spawn error: a completed run that carries the code is judged on its output", async () => {
    expect(await judge({ stdout: reply(finding("info", 0.4)), spawnErrorCode: "ENOENT" })).toEqual({
      outcome: "pass",
      rationale: "The AI reviewer raised no warn or error findings (1 info).",
    })
  })

  it("names the missing agent command", async () => {
    const result = await judge({
      command: "claude",
      status: "spawn_error",
      exitCode: null,
      spawnError: "spawn claude ENOENT",
      spawnErrorCode: "ENOENT",
    })
    expect(result).toEqual({
      outcome: "fail",
      rationale:
        "The AI reviewer could not be started: `claude` was not found. Install it, or change `agent`.",
    })
  })

  it("reports any other spawn error through the shared termination guard", async () => {
    const result = await judge(
      {
        status: "spawn_error",
        exitCode: null,
        spawnError: "spawn agent EACCES",
        spawnErrorCode: "EACCES",
      },
      { label: "Reviewer" },
    )
    expect(result).toEqual({
      outcome: "fail",
      rationale: "Reviewer could not be started: spawn agent EACCES.",
    })
  })

  it("fails a timeout, naming the label", async () => {
    const result = await judge({ status: "timed_out", exitCode: null }, { label: "Claude" })
    expect(result).toEqual({
      outcome: "fail",
      rationale:
        "Claude did not finish: its process exceeded the configured timeout and was terminated.",
    })
  })

  it("fails a run it never started because of fail-fast", async () => {
    const result = await judge({ status: "aborted", exitCode: null, skipReason: "fail-fast" })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toBe(
      "The AI reviewer did not run: fail-fast skipped it after an earlier check failed.",
    )
  })
})

describe("aiReview: reading the output", () => {
  it("parses the whole output as JSON first", async () => {
    expect(await output(reply(finding("info", 0.4)))).toEqual({
      outcome: "pass",
      rationale: "The AI reviewer raised no warn or error findings (1 info).",
    })
  })

  it("recovers JSON wrapped in text from the first { to the last }, nested braces included, and says so", async () => {
    const wrapped = `Here is my review:\n\`\`\`json\n${reply(finding("warn", 0.6, { reason: "use {a: {b}}" }))}\n\`\`\`\nThat is all.`
    expect(await output(wrapped)).toEqual({
      outcome: "warn",
      rationale: [
        "The AI reviewer's output had text around its JSON; the review was read from its first { to its last }.",
        "1 finding(s) below the blocking bar (error at confidence 0.8 or more):",
        "- src/a.ts:7 [warn-rule] warn, confidence 0.6: use {a: {b}}",
      ].join("\n"),
    })
  })

  it("recovers JSON that ends at the output's last character", async () => {
    const result = await output(`Review: ${reply()}`)
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain("read from its first { to its last }")
  })

  it.each([
    ["no braces", "Looks good to me."],
    ["an empty output", ""],
    ["braces in reverse order", "} nothing here {"],
    ["only a closing brace, last", "nothing here }"],
    ["only an opening brace", "{ nothing here"],
    ["a brace in the prose before the JSON", `See {details}: ${reply(finding("error", 1))}`],
    ["a brace in the prose after the JSON", `${reply(finding("error", 1))} then {more}`],
    ["truncated JSON", reply(finding("error", 1)).slice(0, -2)],
  ])("falls back on %s, and the default fallback warns", async (_case, stdout) => {
    expect(await output(stdout)).toEqual({
      outcome: "warn",
      rationale: [
        `The AI reviewer's output could not be parsed (exit code 0): ${UNPARSED}. The fallback review applies.`,
        ...DEFAULT_FALLBACK_LINES,
      ].join("\n"),
    })
  })

  it("reports the exit code when the output could not be parsed", async () => {
    const result = await judge({ stdout: "Unauthorized", exitCode: 3 })
    expect(result.rationale.split("\n")[0]).toBe(
      `The AI reviewer's output could not be parsed (exit code 3): ${UNPARSED}. The fallback review applies.`,
    )
  })

  it("trusts a well-formed reply even when the agent exits non-zero", async () => {
    const result = await judge({ stdout: reply(finding("error", 0.9)), exitCode: 1 })
    expect(result.outcome).toBe("fail")
  })

  it("never slices JSON that parsed whole but is off-shape", async () => {
    const stdout = `{"findings": "none", "summary": {"score": 1}}`
    expect((await output(stdout)).rationale.split("\n")[0]).toBe(
      "The AI reviewer's output could not be parsed (exit code 0): reply.findings must be an array. The fallback review applies.",
    )
  })

  it.each([
    ["an array", "[]", "reply must be an object"],
    ["null", "null", "reply must be an object"],
    ["a string", '"fine"', "reply must be an object"],
    ["a number", "1", "reply must be an object"],
    [
      "an empty object",
      "{}",
      "reply.summary.score must be a number from 0 to 1; reply.findings must be an array",
    ],
    ["a missing summary", '{"findings": []}', "reply.summary.score must be a number from 0 to 1"],
    [
      "a null summary",
      '{"findings": [], "summary": null}',
      "reply.summary.score must be a number from 0 to 1",
    ],
    [
      "an array summary",
      '{"findings": [], "summary": [1]}',
      "reply.summary.score must be a number from 0 to 1",
    ],
    [
      "a summary score above 1",
      '{"findings": [], "summary": {"score": 1.5}}',
      "reply.summary.score must be a number from 0 to 1",
    ],
    [
      "a summary score below 0",
      '{"findings": [], "summary": {"score": -1}}',
      "reply.summary.score must be a number from 0 to 1",
    ],
    [
      "a string summary score",
      '{"findings": [], "summary": {"score": "1"}}',
      "reply.summary.score must be a number from 0 to 1",
    ],
    [
      "a findings object",
      '{"findings": {}, "summary": {"score": 1}}',
      "reply.findings must be an array",
    ],
    ["a null finding", reply(null), "reply.findings[0] must be an object"],
    ["an array finding", reply([]), "reply.findings[0] must be an object"],
    ["a string finding", reply("bug"), "reply.findings[0] must be an object"],
    [
      "an empty finding",
      reply({}),
      [
        "reply.findings[0].rule must be a string",
        "reply.findings[0].file must be a string",
        "reply.findings[0].line must be a whole number, 0 or more",
        'reply.findings[0].severity must be "info", "warn" or "error"',
        "reply.findings[0].score must be a number from 0 to 1",
        "reply.findings[0].reason must be a string",
      ].join("; "),
    ],
    [
      "a numeric rule",
      reply(finding("warn", 0.5, { rule: 1 })),
      "reply.findings[0].rule must be a string",
    ],
    [
      "a null file",
      reply(finding("warn", 0.5, { file: null })),
      "reply.findings[0].file must be a string",
    ],
    [
      "a negative line",
      reply(finding("warn", 0.5, { line: -1 })),
      "reply.findings[0].line must be a whole number, 0 or more",
    ],
    [
      "a fractional line",
      reply(finding("warn", 0.5, { line: 1.5 })),
      "reply.findings[0].line must be a whole number, 0 or more",
    ],
    [
      "a string line",
      reply(finding("warn", 0.5, { line: "3" })),
      "reply.findings[0].line must be a whole number, 0 or more",
    ],
    [
      "an unknown severity",
      reply(finding("warn", 0.5, { severity: "high" })),
      'reply.findings[0].severity must be "info", "warn" or "error"',
    ],
    [
      "an upper-case severity",
      reply(finding("warn", 0.5, { severity: "ERROR" })),
      'reply.findings[0].severity must be "info", "warn" or "error"',
    ],
    [
      "a score below 0",
      reply(finding("warn", -0.01)),
      "reply.findings[0].score must be a number from 0 to 1",
    ],
    [
      "a score above 1",
      reply(finding("warn", 1.01)),
      "reply.findings[0].score must be a number from 0 to 1",
    ],
    [
      "a string score",
      reply(finding("warn", "0.5" as unknown as number)),
      "reply.findings[0].score must be a number from 0 to 1",
    ],
    [
      "an array reason",
      reply(finding("warn", 0.5, { reason: ["r"] })),
      "reply.findings[0].reason must be a string",
    ],
    [
      "a problem in the second finding",
      reply(finding("info", 0.5), finding("warn", 0.5, { rule: null })),
      "reply.findings[1].rule must be a string",
    ],
  ])("sends %s to the fallback, naming the problem", async (_case, stdout, problems) => {
    expect(await output(stdout)).toEqual({
      outcome: "warn",
      rationale: [
        `The AI reviewer's output could not be parsed (exit code 0): ${problems}. The fallback review applies.`,
        ...DEFAULT_FALLBACK_LINES,
      ].join("\n"),
    })
  })

  it("checks the shape of JSON recovered from the slice too", async () => {
    const result = await output('Here: {"findings": [], "summary": {}} done')
    expect(result.rationale.split("\n")[0]).toBe(
      "The AI reviewer's output could not be parsed (exit code 0): reply.summary.score must be a number from 0 to 1. The fallback review applies.",
    )
  })

  it("accepts the boundary values: score 0 and 1, line 0, an empty file, extra fields", async () => {
    const stdout = JSON.stringify({
      findings: [finding("info", 0, { line: 0, file: "" }), finding("info", 1, { extra: true })],
      summary: { score: 0 },
      model: "any",
    })
    expect(await output(stdout)).toEqual({
      outcome: "pass",
      rationale: "The AI reviewer raised no warn or error findings (2 info).",
    })
  })

  it("judges a custom fallback in place of the default", async () => {
    const blocking: AiReviewReply = {
      findings: [finding("error", 1, { rule: "no-review", file: "", reason: "no usable review" })],
      summary: { score: 0 },
    }
    expect(await output("garbage", { fallback: blocking })).toEqual({
      outcome: "fail",
      rationale: [
        `The AI reviewer's output could not be parsed (exit code 0): ${UNPARSED}. The fallback review applies.`,
        "1 error finding(s) at or above confidence 0.8:",
        "- [no-review] error, confidence 1: no usable review",
      ].join("\n"),
    })
    expect(await output("garbage", { fallback: { findings: [], summary: { score: 1 } } })).toEqual({
      outcome: "pass",
      rationale: [
        `The AI reviewer's output could not be parsed (exit code 0): ${UNPARSED}. The fallback review applies.`,
        "The AI reviewer raised no warn or error findings (0 info).",
      ].join("\n"),
    })
  })
})

describe("aiReview: the policy", () => {
  it("fails on an error finding at the threshold, listing blocking findings, then advisory ones, never info", async () => {
    const stdout = reply(
      finding("warn", 0.9, { rule: "w", line: 2 }),
      finding("info", 1, { rule: "i" }),
      finding("error", 0.8, { rule: "e1", line: 0 }),
      finding("error", 0.5, { rule: "e2", file: "", reason: "maybe" }),
      finding("error", 0.95, { rule: "e3", file: "b.ts", line: 30 }),
    )
    expect(await output(stdout)).toEqual({
      outcome: "fail",
      rationale: [
        "2 error finding(s) at or above confidence 0.8:",
        "- src/a.ts [e1] error, confidence 0.8: a error reason",
        "- b.ts:30 [e3] error, confidence 0.95: a error reason",
        "- src/a.ts:2 [w] warn, confidence 0.9: a warn reason",
        "- [e2] error, confidence 0.5: maybe",
      ].join("\n"),
    })
  })

  it("warns on an error finding just below the threshold", async () => {
    expect(await output(reply(finding("error", 0.79)))).toEqual({
      outcome: "warn",
      rationale: [
        "1 finding(s) below the blocking bar (error at confidence 0.8 or more):",
        "- src/a.ts:7 [error-rule] error, confidence 0.79: a error reason",
      ].join("\n"),
    })
  })

  it("never fails on a warn finding, however confident", async () => {
    expect((await output(reply(finding("warn", 1)))).outcome).toBe("warn")
  })

  it.each([
    [0.5, 0.5, "fail"],
    [0.5, 0.49, "warn"],
    [0, 0, "fail"],
    [1, 1, "fail"],
    [1, 0.99, "warn"],
  ] as const)(
    "with errorThreshold %s, an error at %s gives %s",
    async (errorThreshold, score, outcome) => {
      const result = await output(reply(finding("error", score)), { errorThreshold })
      expect(result.outcome).toBe(outcome)
      expect(result.rationale).toContain(`confidence ${String(errorThreshold)}`)
    },
  )

  it("passes with no findings at all", async () => {
    expect(await output(reply())).toEqual({
      outcome: "pass",
      rationale: "The AI reviewer raised no warn or error findings (0 info).",
    })
  })

  it("names the reviewer by its label", async () => {
    expect((await output(reply(), { label: "CodeRabbit" })).rationale).toBe(
      "CodeRabbit raised no warn or error findings (0 info).",
    )
    expect((await output("x", { label: "CodeRabbit" })).rationale).toContain(
      "CodeRabbit's output could not be parsed",
    )
    expect((await output(`x ${reply()}`, { label: "CodeRabbit" })).rationale).toContain(
      "CodeRabbit's output had text around its JSON",
    )
  })
})

describe("aiReview: credentials", () => {
  it("turns a pass into a warn when a credential has no value, naming every such credential", async () => {
    const result = await output(reply(), {
      credentials: { SET: "set-value-1", MISSING: undefined, EMPTY: "" },
    })
    expect(result).toEqual({
      outcome: "warn",
      rationale: [
        "No value for credential(s) MISSING, EMPTY; the agent ran without them.",
        "The AI reviewer raised no warn or error findings (0 info).",
      ].join("\n"),
    })
  })

  it("keeps a fail a fail, and notes the missing credential before the parse note", async () => {
    const failing = await output(reply(finding("error", 1)), { credentials: { KEY: undefined } })
    expect(failing.outcome).toBe("fail")
    const unparsed = await output("nope", { credentials: { KEY: "" } })
    expect(unparsed.outcome).toBe("warn")
    expect(unparsed.rationale.split("\n").slice(0, 2)).toEqual([
      "No value for credential(s) KEY; the agent ran without them.",
      `The AI reviewer's output could not be parsed (exit code 0): ${UNPARSED}. The fallback review applies.`,
    ])
  })

  it("adds no note when every credential has a value", async () => {
    expect(await output(reply(), { credentials: { KEY: "key-value-1" } })).toEqual({
      outcome: "pass",
      rationale: "The AI reviewer raised no warn or error findings (0 info).",
    })
  })

  it("redacts every credential value from every reason, the longer value first", async () => {
    const stdout = reply(finding("warn", 0.5, { reason: "key abc-long-secret and abc and xyz" }))
    const result = await output(stdout, {
      credentials: { SHORT: "abc", LONG: "abc-long-secret", OTHER: "xyz" },
    })
    expect(result.rationale).toBe(
      [
        "1 finding(s) below the blocking bar (error at confidence 0.8 or more):",
        "- src/a.ts:7 [warn-rule] warn, confidence 0.5: key [redacted] and [redacted] and [redacted]",
      ].join("\n"),
    )
  })

  it("redacts a credential from the output the termination guard quotes", async () => {
    const result = await judge(
      { status: "timed_out", exitCode: null, stdout: "token=tok-123", stderr: "" },
      { credentials: { TOKEN: "tok-123" } },
    )
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("token=[redacted]")
    expect(result.rationale).not.toContain("tok-123")
  })

  it("reaches the agent through a runner that sets inheritEnv: false, and stays out of the evidence", async () => {
    const script = [
      // Compares against the reversed token, so the token itself is never in the command line.
      'const ok = process.env.AI_TOKEN === "a3f9-kot".split("").reverse().join("") && process.argv[1].includes("findings")',
      'const f = { rule: "token", file: "", line: 0, severity: "info", score: 1, reason: ok ? "present" : "absent" }',
      "process.stdout.write(JSON.stringify({ findings: [f], summary: { score: 1 } }))",
    ].join("\n")
    const check = aiReview({
      agent: [process.execPath, "-e", script],
      credentials: { AI_TOKEN: "tok-9f3a" },
    })
    const config = defineRepoContract({
      checks: { aiReview: { ...check, inheritEnv: false } },
      spawn: testSpawn,
      env: {},
    })
    const run = await runRepoContract(config)
    expect(run.verdict.checks.aiReview).toEqual({
      outcome: "pass",
      rationale: "The AI reviewer raised no warn or error findings (1 info).",
    })
    expect(run.evidence.checks.aiReview.stdout).toContain('"reason":"present"')
    expect(JSON.stringify(serializeRun(run))).not.toContain("tok-9f3a")
  })
})
