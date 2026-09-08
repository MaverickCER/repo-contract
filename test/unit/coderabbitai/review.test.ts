import { describe, expect, it } from "vitest"
import { parseAgentStream } from "../../../scripts/coderabbitai/review.js"

/**
 * Fixtures are the real `coderabbit review --agent` event stream shapes, captured directly from a
 * live, authenticated CLI during implementation (see
 * `specs/decisions/0014-coderabbit-as-a-surfaced-check.md`) -- a clean 0-findings run, and a run
 * with real `finding` events (severity/fileName/codegenInstructions, no line, no category, no
 * native id).
 */
const REVIEW_CONTEXT = JSON.stringify({
  type: "review_context",
  reviewType: "uncommitted",
  currentBranch: "feat/x",
  baseBranch: "main",
})
const STATUS = JSON.stringify({ type: "status", phase: "analyzing", status: "reviewing" })
const HEARTBEAT = JSON.stringify({ type: "heartbeat", status: "reviewing" })

function finding(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: "finding",
    severity: "major",
    fileName: "src/example.ts",
    codegenInstructions: "Do the thing at line 3.",
    suggestions: [],
    ...overrides,
  })
}

function complete(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: "complete",
    status: "review_completed",
    findings: 0,
    reviewedFiles: [],
    ...overrides,
  })
}

describe("parseAgentStream", () => {
  it("parses a clean 0-findings run", () => {
    const result = parseAgentStream([REVIEW_CONTEXT, STATUS, HEARTBEAT, complete()].join("\n"))
    expect(result).toEqual({ ok: true, findings: [], completed: true })
  })

  it("normalizes finding events, mapping fileName -> file and codegenInstructions -> summary", () => {
    const result = parseAgentStream(
      [REVIEW_CONTEXT, finding(), complete({ findings: 1 })].join("\n"),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected ok:true")
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({
      file: "src/example.ts",
      severity: "major",
      summary: "Do the thing at line 3.",
    })
    expect(result.findings[0]?.id).toMatch(/^coderabbit:src\/example\.ts:major:[0-9a-f]{12}$/)
  })

  it("maps an unrecognized severity value to 'unknown' (not an error)", () => {
    const result = parseAgentStream(
      [finding({ severity: "blocker" }), complete({ findings: 1 })].join("\n"),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected ok:true")
    expect(result.findings[0]?.severity).toBe("unknown")
  })

  it("fails closed when the 'complete' count claims more findings than were streamed", () => {
    const result = parseAgentStream([complete({ findings: 2 })].join("\n"))
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected ok:false")
    expect(result.error).toContain("does not match the 0 finding event(s)")
  })

  it("fails closed when the 'complete' count claims fewer findings than were streamed", () => {
    const result = parseAgentStream(
      [finding(), complete({ findings: 0, status: "review_completed" })].join("\n"),
    )
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected ok:false")
    expect(result.error).toContain("does not match the 1 finding event(s)")
  })

  it("fails closed on a non-integer 'complete' findings count", () => {
    const result = parseAgentStream([complete({ findings: "many" })].join("\n"))
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected ok:false")
    expect(result.error).toContain('findings count ("many")')
  })

  it("ignores unrecognized event types (forward-compatible)", () => {
    const result = parseAgentStream(
      [JSON.stringify({ type: "some_future_event", data: 1 }), complete()].join("\n"),
    )
    expect(result).toEqual({ ok: true, findings: [], completed: true })
  })

  it("fails closed on a non-JSON line", () => {
    const result = parseAgentStream(["not json at all", complete()].join("\n"))
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected ok:false")
    expect(result.error).toContain("non-JSON line")
  })

  it("fails closed on an event with no 'type' field", () => {
    const result = parseAgentStream([JSON.stringify({ notType: "x" }), complete()].join("\n"))
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected ok:false")
    expect(result.error).toContain('no recognized "type"')
  })

  it("fails closed on a finding event missing a required field", () => {
    const result = parseAgentStream(
      [JSON.stringify({ type: "finding", severity: "major" }), complete()].join("\n"),
    )
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected ok:false")
    expect(result.error).toContain("missing a required field")
  })

  it("keeps two findings in the same file+severity distinct when their summary text differs", () => {
    const result = parseAgentStream(
      [
        finding({ codegenInstructions: "First problem." }),
        finding({ codegenInstructions: "A different, second problem in the same file." }),
        complete({ findings: 2 }),
      ].join("\n"),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected ok:true")
    expect(result.findings).toHaveLength(2)
    expect(result.findings[0]?.id).not.toBe(result.findings[1]?.id)
  })

  it("accepts a 'review_skipped' terminal status (nothing in scope to review -- an empty diff)", () => {
    const result = parseAgentStream(
      [REVIEW_CONTEXT, complete({ status: "review_skipped" })].join("\n"),
    )
    expect(result).toEqual({ ok: true, findings: [], completed: true })
  })

  it("fails closed on a 'complete' event whose status is neither 'review_completed' nor 'review_skipped'", () => {
    const result = parseAgentStream([finding(), complete({ status: "review_failed" })].join("\n"))
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected ok:false")
    expect(result.error).toContain("unexpected status")
  })

  it("fails closed on a 'complete' event with no status field at all", () => {
    const result = parseAgentStream([JSON.stringify({ type: "complete", findings: 0 })].join("\n"))
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected ok:false")
    expect(result.error).toContain("unexpected status")
  })

  it("fails closed on any event after the terminal 'complete' event", () => {
    const result = parseAgentStream(
      [REVIEW_CONTEXT, complete(), finding(), complete({ findings: 1 })].join("\n"),
    )
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected ok:false")
    expect(result.error).toContain('after its terminal "complete" event')
  })

  it("fails closed on a 'review_skipped' complete event that also carries findings", () => {
    const result = parseAgentStream(
      [finding(), complete({ status: "review_skipped", findings: 1 })].join("\n"),
    )
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected ok:false")
    expect(result.error).toContain("skipped review cannot also have findings")
  })

  it("reports completed: false when the stream ends without a 'complete' event", () => {
    const result = parseAgentStream([REVIEW_CONTEXT, STATUS, finding()].join("\n"))
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected ok:true")
    expect(result.completed).toBe(false)
  })
})
