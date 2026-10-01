import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { evaluateDangerousWorkflow } from "../../../../scripts/openssf-scorecard/local-checks.js"

let root: string

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "repo-contract-dangerous-workflow-test-"))
  mkdirSync(path.join(root, ".github/workflows"), { recursive: true })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function writeWorkflow(content: string): void {
  writeFileSync(path.join(root, ".github/workflows/ci.yml"), content, "utf8")
}

describe("evaluateDangerousWorkflow", () => {
  it("is not-applicable when there is no .github/workflows directory", () => {
    rmSync(path.join(root, ".github"), { recursive: true, force: true })
    expect(evaluateDangerousWorkflow(root)).toEqual({
      name: "Dangerous-Workflow",
      score: "not-applicable",
      reason: "No .github/workflows/ found.",
      details: [],
    })
  })

  it("scores 10 when no workflow splices an attacker-influenced expression into a run: block", () => {
    writeWorkflow(
      [
        "jobs:",
        "  test:",
        "    steps:",
        "      - name: safe",
        "        run: |",
        '          echo "hello"',
      ].join("\n"),
    )
    expect(evaluateDangerousWorkflow(root)).toEqual({
      name: "Dangerous-Workflow",
      score: 10,
      reason:
        "No unescaped attacker-influenced GitHub context expression found spliced into a run: block.",
      details: [],
    })
  })

  it("scores 0 and cites the exact line for a real multi-line run: block splice", () => {
    writeWorkflow(
      [
        "jobs:",
        "  test:",
        "    steps:",
        "      - name: vulnerable",
        "        run: |",
        '          echo "title: ${{ github.event.pull_request.title }}"',
      ].join("\n"),
    )
    const result = evaluateDangerousWorkflow(root)
    expect(result.score).toBe(0)
    expect(result.details).toEqual([
      "ci.yml:6: attacker-influenced expression spliced directly into a run: block -- ${{ github.event.pull_request.title }}",
    ])
  })

  it("scores 0 for a single-line run: splice", () => {
    writeWorkflow(
      [
        "jobs:",
        "  test:",
        "    steps:",
        "      - name: vulnerable",
        "        run: echo ${{ github.head_ref }}",
      ].join("\n"),
    )
    expect(evaluateDangerousWorkflow(root).score).toBe(0)
  })

  it("does not flag a context expression passed safely through env:, even when it appears after an earlier run: block in the same file", () => {
    // Regression test: an earlier version of this check's own run:-block
    // tracker only reset `inRunBlock` on a line with fewer than 2 leading
    // spaces, which virtually no line in a real workflow ever has -- so once
    // any run: block was entered, every subsequent line (including a later
    // step's own env: block) stayed misclassified as still being inside it.
    writeWorkflow(
      [
        "jobs:",
        "  test:",
        "    steps:",
        "      - name: first step has a real run block",
        "        run: |",
        '          echo "unrelated"',
        "      - name: second step passes the attacker-influenced value safely",
        "        env:",
        "          HEAD_REF: ${{ github.event.pull_request.head.ref }}",
        "        run: |",
        '          git push origin HEAD:"$HEAD_REF"',
      ].join("\n"),
    )
    expect(evaluateDangerousWorkflow(root)).toEqual({
      name: "Dangerous-Workflow",
      score: 10,
      reason:
        "No unescaped attacker-influenced GitHub context expression found spliced into a run: block.",
      details: [],
    })
  })

  it("closes a run: block at a dedent back to the step-list level, even across a blank line", () => {
    writeWorkflow(
      [
        "jobs:",
        "  test:",
        "    steps:",
        "      - name: first",
        "        run: |",
        '          echo "one"',
        "",
        "      - name: second",
        "        env:",
        "          HEAD_REF: ${{ github.event.pull_request.head.ref }}",
        "        run: |",
        '          echo "$HEAD_REF"',
      ].join("\n"),
    )
    expect(evaluateDangerousWorkflow(root).score).toBe(10)
  })

  it("does not let a heredoc's own literal 'run: |' text reset block tracking, and still scans the real unsafe line after it", () => {
    // Regression test: an earlier version of this check always re-evaluated every line for a
    // new `run: |` key, even while already inside a block scalar's own content -- so a script
    // that writes out literal YAML (e.g. a heredoc containing the text "run: |", indented
    // deeper than the real key) got misread as a second block opening, corrupting `runIndent`
    // for everything that followed.
    writeWorkflow(
      [
        "jobs:",
        "  test:",
        "    steps:",
        "      - name: generate another workflow file",
        "        run: |",
        "          cat <<'EOF' > other.yml",
        "          jobs:",
        "            x:",
        "              run: |",
        "                echo hi",
        "          EOF",
        '          echo "unsafe: ${{ github.event.pull_request.title }}"',
      ].join("\n"),
    )
    const result = evaluateDangerousWorkflow(root)
    expect(result.score).toBe(0)
    expect(result.details).toEqual([
      "ci.yml:12: attacker-influenced expression spliced directly into a run: block -- ${{ github.event.pull_request.title }}",
    ])
  })

  it("aggregates findings across multiple workflow files, each cited under its own filename", () => {
    writeWorkflow(
      [
        "jobs:",
        "  a:",
        "    steps:",
        "      - run: |",
        '          echo "${{ github.event.pull_request.body }}"',
      ].join("\n"),
    )
    writeFileSync(
      path.join(root, ".github/workflows/other.yml"),
      ["jobs:", "  b:", "    steps:", "      - run: echo ${{ github.event.issue.body }}"].join(
        "\n",
      ),
      "utf8",
    )
    const result = evaluateDangerousWorkflow(root)
    expect(result.score).toBe(0)
    expect(result.details).toHaveLength(2)
    expect(result.details.some((line) => line.startsWith("ci.yml:"))).toBe(true)
    expect(result.details.some((line) => line.startsWith("other.yml:"))).toBe(true)
  })
})
