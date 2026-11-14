import type { CheckDefinitionConfig, CheckEvidence, PolicyResult } from "../types.js"
import { checkTerminatedAbnormally } from "./shared/terminal-status.js"

/**
 * One finding in an AI reviewer's reply.
 * @beta
 */
export interface AiReviewFinding {
  /** A short name for the concern, such as `no-logging-in-library`. */
  readonly rule: string
  /** The file the finding is about, relative to the repository root. `""` when it is about no one file. */
  readonly file: string
  /** The 1-based line in `file`, or `0` when the finding has no single line. */
  readonly line: number
  /** `error` for a defect, `warn` for a concern, `info` for a remark. Only `error` can fail the check. */
  readonly severity: "info" | "warn" | "error"
  /** The reviewer's confidence that the finding is real, from 0 to 1. */
  readonly score: number
  /** What is wrong and why, in the reviewer's words. */
  readonly reason: string
}

/**
 * The JSON reply {@link aiReview} asks the reviewer for, and the shape of its `fallback`.
 * @beta
 */
export interface AiReviewReply {
  /** Every finding, in any order. Empty when the reviewer found nothing. */
  readonly findings: readonly AiReviewFinding[]
  /** The reviewer's confidence in the change as a whole, from 0 to 1. The policy gates on `findings` only. */
  readonly summary: { readonly score: number }
}

/**
 * Options accepted by {@link aiReview}. Only `agent` is required.
 * @beta
 */
export interface AiReviewOptions {
  /**
   * The agent's command line: its executable, then its arguments, for example
   * `["claude", "-p", "{prompt}"]`. Every `{prompt}` inside an argument becomes the prompt. With no
   * `{prompt}`, the prompt is appended as the last argument. The evidence records this command line.
   */
  readonly agent: readonly string[]
  /**
   * What the agent is asked. A string is the prompt text. `{ file }` hands the agent that path in
   * place of the text, for an agent that reads its prompt from a file. Defaults to a prompt that
   * asks for {@link AiReviewReply} and shows an example of it; a replacement must ask for the same
   * shape, or every reply goes to `fallback`.
   */
  readonly prompt?: string | { readonly file: string }
  /** Files the review is limited to, listed at the end of a string prompt. Empty by default: the agent reviews the repository's changes. */
  readonly files?: readonly string[]
  /**
   * Environment variables the agent authenticates with, by name, for example
   * `{ ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY }`. Each value reaches the agent's process
   * through the check's `env`, so it works when the runner sets `inheritEnv: false`. A value never
   * enters the command line, and every occurrence of it in a reason is replaced with `[redacted]`.
   * The evidence keeps the agent's own stdout and stderr, so a value the agent prints lands there.
   * A name whose value is `undefined` or `""` is left unset and turns a `pass` into a `warn`.
   */
  readonly credentials?: Readonly<Record<string, string | undefined>>
  /** An `error` finding at or above this confidence fails the check; below it, the finding warns. From 0 to 1. Defaults to `0.8`. */
  readonly errorThreshold?: number
  /**
   * The review used when the output cannot be parsed into an {@link AiReviewReply}. Defaults to one
   * `warn` finding (rule `unparsed-output`, score 1) whose reason is "the reviewer's output could
   * not be parsed", so an unusable reply never passes silently. An `error` finding at score 1 here
   * makes an unusable reply fail the check.
   */
  readonly fallback?: AiReviewReply
  /** How the reasons name the reviewer. Defaults to `"The AI reviewer"`. */
  readonly label?: string
  /** Milliseconds before the agent's process is stopped and the check fails. Defaults to `600_000` (10 minutes). */
  readonly timeoutMs?: number
  /** The agent's working directory. Defaults to the runner's. */
  readonly cwd?: string
}

const PROMPT_PLACEHOLDER = "{prompt}"
const REDACTED = "[redacted]"

const DEFAULT_PROMPT = [
  "Review this repository's changes against its default branch for bugs and for rules its docs state.",
  "Reply with JSON only, no prose, in exactly this shape:",
  "{",
  '  "findings": [',
  "    {",
  '      "rule": "no-logging-in-library",',
  '      "file": "src/greet.ts",',
  '      "line": 15,',
  '      "severity": "warn",',
  '      "score": 0.7,',
  '      "reason": "greet() logs every name; leave logging to the caller."',
  "    }",
  "  ],",
  '  "summary": { "score": 0.9 }',
  "}",
  '- "severity" is "info", "warn" or "error". Use "error" only for a defect.',
  '- "score" is your confidence from 0 to 1 that the finding is real.',
  '- "line" is the 1-based line, or 0 when the finding has no single line.',
  '- "summary.score" is your confidence in the change as a whole.',
  '- Reply { "findings": [], "summary": { "score": 1 } } when you find nothing.',
].join("\n")

const DEFAULT_FALLBACK: AiReviewReply = {
  findings: [
    {
      rule: "unparsed-output",
      file: "",
      line: 0,
      severity: "warn",
      score: 1,
      reason: "the reviewer's output could not be parsed",
    },
  ],
  summary: { score: 0 },
}

const SEVERITIES: ReadonlySet<unknown> = new Set(["info", "warn", "error"])

/**
 * @param value - Any parsed JSON value.
 * @returns Whether it is a number from 0 to 1.
 */
function isScore(value: unknown): value is number {
  return typeof value === "number" && value >= 0 && value <= 1
}

/**
 * @param value - Any parsed JSON value.
 * @returns Whether it is a plain object (not `null`, not an array).
 */
function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Every way one finding differs from {@link AiReviewFinding}.
 * @param finding - One entry of a reply's `findings`.
 * @param at - Its path, such as `reply.findings[0]`.
 * @returns One message per problem; empty when it matches.
 */
function findingProblems(finding: unknown, at: string): readonly string[] {
  if (!isObject(finding)) return [`${at} must be an object`]
  const problems: string[] = []
  if (typeof finding.rule !== "string") problems.push(`${at}.rule must be a string`)
  if (typeof finding.file !== "string") problems.push(`${at}.file must be a string`)
  if (!Number.isInteger(finding.line) || (finding.line as number) < 0) {
    problems.push(`${at}.line must be a whole number, 0 or more`)
  }
  if (!SEVERITIES.has(finding.severity)) {
    problems.push(`${at}.severity must be "info", "warn" or "error"`)
  }
  if (!isScore(finding.score)) problems.push(`${at}.score must be a number from 0 to 1`)
  if (typeof finding.reason !== "string") problems.push(`${at}.reason must be a string`)
  return problems
}

/**
 * Every way `value` differs from {@link AiReviewReply}.
 * @param value - A parsed reply, or the configured fallback.
 * @param root - The name its paths start with: `reply` or `fallback`.
 * @returns One message per problem; empty when it matches.
 */
function replyProblems(value: unknown, root: string): readonly string[] {
  if (!isObject(value)) return [`${root} must be an object`]
  const problems: string[] = []
  const summary = value.summary
  if (!isObject(summary) || !isScore(summary.score)) {
    problems.push(`${root}.summary.score must be a number from 0 to 1`)
  }
  if (!Array.isArray(value.findings)) return [...problems, `${root}.findings must be an array`]
  const findings: readonly unknown[] = value.findings
  return [
    ...problems,
    ...findings.flatMap((finding, index) =>
      findingProblems(finding, `${root}.findings[${String(index)}]`),
    ),
  ]
}

type ParsedReply =
  | { readonly ok: true; readonly reply: AiReviewReply; readonly sliced: boolean }
  | { readonly ok: false; readonly problems: readonly string[] }

/**
 * Reads the reviewer's output: the whole output as JSON first, then the text from its first `{` to
 * its last `}`. Either way the result must have the {@link AiReviewReply} shape.
 * @param output - The agent's stdout.
 * @returns The reply and whether it came from the slice, or the problems that send it to the fallback.
 */
function parseReply(output: string): ParsedReply {
  let value: unknown
  let sliced = false
  try {
    value = JSON.parse(output)
  } catch {
    // With no `{`, or a `}` only before it, the slice is "" or a lone "}": neither parses.
    const candidate = output.slice(output.indexOf("{"), output.lastIndexOf("}") + 1)
    try {
      value = JSON.parse(candidate)
      sliced = true
    } catch {
      return {
        ok: false,
        problems: [
          "the output is not JSON, and neither is the text from its first { to its last }",
        ],
      }
    }
  }
  const problems = replyProblems(value, "reply")
  return problems.length === 0
    ? { ok: true, reply: value as AiReviewReply, sliced }
    : { ok: false, problems }
}

/**
 * @param finding - One finding.
 * @returns One reason line: where, which rule, how severe, how confident, and why.
 */
function describeFinding(finding: AiReviewFinding): string {
  const where =
    finding.file === ""
      ? ""
      : finding.line === 0
        ? `${finding.file} `
        : `${finding.file}:${String(finding.line)} `
  return `- ${where}[${finding.rule}] ${finding.severity}, confidence ${String(finding.score)}: ${finding.reason}`
}

/**
 * The verdict on a reply: `fail` on an `error` finding at or above the threshold, `warn` on any
 * other `warn` or `error` finding, otherwise `pass`.
 * @param reply - The parsed reply or the fallback.
 * @param threshold - The `errorThreshold`.
 * @param label - How to name the reviewer.
 * @returns The outcome and its reason.
 */
function judge(reply: AiReviewReply, threshold: number, label: string): PolicyResult {
  const { findings } = reply
  const blocking = findings.filter(
    (finding) => finding.severity === "error" && finding.score >= threshold,
  )
  const advisory = findings.filter(
    (finding) => finding.severity !== "info" && !blocking.includes(finding),
  )
  if (blocking.length > 0) {
    return {
      outcome: "fail",
      rationale: [
        `${String(blocking.length)} error finding(s) at or above confidence ${String(threshold)}:`,
        ...blocking.map(describeFinding),
        ...advisory.map(describeFinding),
      ].join("\n"),
    }
  }
  if (advisory.length > 0) {
    return {
      outcome: "warn",
      rationale: [
        `${String(advisory.length)} finding(s) below the blocking bar (error at confidence ${String(threshold)} or more):`,
        ...advisory.map(describeFinding),
      ].join("\n"),
    }
  }
  return {
    outcome: "pass",
    rationale: `${label} raised no warn or error findings (${String(findings.length)} info).`,
  }
}

/**
 * @param text - A reason.
 * @param secrets - Credential values, longest first so a value that contains another is replaced whole.
 * @returns `text` with every occurrence of every secret replaced by `[redacted]`.
 */
function redact(text: string, secrets: readonly string[]): string {
  return secrets.reduce((current, secret) => current.split(secret).join(REDACTED), text)
}

/**
 * An AI review as a check. It runs your agent with a prompt that asks for one fixed JSON shape,
 * {@link AiReviewReply}, with a confidence score on every finding, and gates on those scores. A
 * model can answer differently on every run, so the policy reads only that structured reply,
 * never prose.
 *
 * The output is read in three steps. The whole output is parsed as JSON. If that fails, the text
 * from its first `{` to its last `}` is parsed. If that fails too, or the JSON is not the
 * requested shape, `fallback` is judged in its place and the reason lists the problems.
 *
 * The verdict: `fail` when an `error` finding scores at or above `errorThreshold`; `warn` for any
 * other `warn` or `error` finding, which includes the default fallback; `pass` for `info` findings
 * only. Each reason lists every `warn` and `error` finding with its file, line, rule and confidence.
 * A timeout, a missing agent or a process killed by a signal fails. A non-zero exit code alone
 * does not: a well-formed reply still counts, and an unreadable one names the code. The tests prove
 * the parsing and the policy; they do not prove a model's judgement.
 * @param options - The agent to run and how to judge it; see {@link AiReviewOptions}.
 * @returns The configured check.
 * @example
 * ```ts
 * aiReview: aiReview({
 *   agent: ["claude", "-p", "{prompt}"],
 *   credentials: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY },
 *   errorThreshold: 0.8,
 * }),
 * ```
 * @beta
 */
export function aiReview(options: AiReviewOptions): CheckDefinitionConfig {
  const {
    agent,
    prompt = DEFAULT_PROMPT,
    files = [],
    credentials = {},
    errorThreshold = 0.8,
    fallback = DEFAULT_FALLBACK,
    label = "The AI reviewer",
    timeoutMs = 600_000,
    cwd,
  } = options

  const promptArgument =
    typeof prompt === "string"
      ? [
          prompt,
          ...(files.length > 0 ? ["Review only these files:"] : []),
          ...files.map((file) => `- ${file}`),
        ].join("\n")
      : prompt.file
  const usesPlaceholder = agent.some((argument) => argument.includes(PROMPT_PLACEHOLDER))
  const argv = usesPlaceholder
    ? agent.map((argument) => argument.split(PROMPT_PLACEHOLDER).join(promptArgument))
    : [...agent, promptArgument]

  const env: Record<string, string> = {}
  const missing: string[] = []
  for (const [name, value] of Object.entries(credentials)) {
    if (value === undefined || value === "") missing.push(name)
    else env[name] = value
  }
  const secrets = Object.values(env).sort((a, b) => b.length - a.length)

  const misconfigured = [
    ...(isScore(errorThreshold) ? [] : ["errorThreshold must be a number from 0 to 1"]),
    ...replyProblems(fallback, "fallback"),
    ...(typeof prompt !== "string" && files.length > 0
      ? ["files needs a string prompt; with { file } the agent reads its prompt from that file"]
      : []),
  ]

  /**
   * @param result - The agent's evidence.
   * @returns The verdict, before redaction.
   */
  function decide(result: CheckEvidence): PolicyResult {
    if (misconfigured.length > 0) {
      return {
        outcome: "fail",
        rationale: `aiReview is misconfigured:\n${misconfigured.map((problem) => `- ${problem}`).join("\n")}`,
      }
    }
    if (result.status === "spawn_error" && result.spawnErrorCode === "ENOENT") {
      return {
        outcome: "fail",
        rationale: `${label} could not be started: \`${result.command}\` was not found. Install it, or change \`agent\`.`,
      }
    }
    const terminated = checkTerminatedAbnormally(result, label)
    if (terminated) return terminated

    const notes =
      missing.length > 0
        ? [`No value for credential(s) ${missing.join(", ")}; the agent ran without them.`]
        : []
    const parsed = parseReply(result.stdout)
    if (!parsed.ok) {
      notes.push(
        `${label}'s output could not be parsed (exit code ${String(result.exitCode)}): ${parsed.problems.join("; ")}. The fallback review applies.`,
      )
    } else if (parsed.sliced) {
      notes.push(
        `${label}'s output had text around its JSON; the review was read from its first { to its last }.`,
      )
    }
    const verdict = judge(parsed.ok ? parsed.reply : fallback, errorThreshold, label)
    return {
      outcome: missing.length > 0 && verdict.outcome === "pass" ? "warn" : verdict.outcome,
      rationale: [...notes, verdict.rationale].join("\n"),
    }
  }

  return {
    run: [...argv],
    env,
    timeoutMs,
    ...(cwd === undefined ? {} : { cwd }),
    policy: ({ result }) => {
      const verdict = decide(result)
      return { outcome: verdict.outcome, rationale: redact(verdict.rationale, secrets) }
    },
  }
}
