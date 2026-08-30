import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { evaluateGitHubActionsPolicy } from "../../../checks/github-actions.js"
import { lintWorkflows } from "../../../scripts/github-actions/lint.mjs"
import { removeTempDir } from "../../helpers/remove-temp-dir.js"

/**
 * The complete real path: a real scratch `.github/workflows/` directory, a real `actionlint` run
 * (its binary resolved and cached by the `github-actionlint` devDependency on first use), through
 * to a real policy verdict -- no mocking, per the project's real-behavior-over-mocking house style.
 * The `github-actions` check itself owns none of the analysis; this proves the wrapper +
 * normalization + policy actually agree with what actionlint reports.
 */

let root: string

async function writeWorkflow(name: string, yaml: string): Promise<void> {
  await writeFile(path.join(root, ".github", "workflows", name), yaml, "utf8")
}

const CLEAN_WORKFLOW = `name: CI
on:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo hello
`

// `runs-on: ubunt-latest` -- a stable actionlint catch ("label \"ubunt-latest\" is unknown").
const WORKFLOW_WITH_ERROR = `name: Broken
on:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  build:
    runs-on: ubunt-latest
    steps:
      - run: echo hello
`

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "repo-contract-github-actions-integration-"))
  await mkdir(path.join(root, ".github", "workflows"), { recursive: true })
})

afterEach(async () => {
  await removeTempDir(root)
})

describe("github-actions check -- full real path", () => {
  it("passes on a clean workflow tree", async () => {
    await writeWorkflow("ci.yml", CLEAN_WORKFLOW)

    const evidence = lintWorkflows(root)
    expect(evidence).toEqual({ ok: true, filesScanned: 1, findings: [] })
    expect(evaluateGitHubActionsPolicy({ evidence }).outcome).toBe("pass")
  }, 30_000)

  it("fails and surfaces the actionlint finding on a workflow with an error", async () => {
    await writeWorkflow("ci.yml", CLEAN_WORKFLOW)
    await writeWorkflow("broken.yml", WORKFLOW_WITH_ERROR)

    const evidence = lintWorkflows(root)
    expect(evidence.ok).toBe(true)
    if (!evidence.ok) return

    expect(evidence.filesScanned).toBe(2)
    expect(evidence.findings.length).toBeGreaterThan(0)
    expect(evidence.findings.every((f) => f.file === ".github/workflows/broken.yml")).toBe(true)

    const result = evaluateGitHubActionsPolicy({ evidence })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain(".github/workflows/broken.yml")
  }, 30_000)

  it("passes trivially when there are no workflow files", async () => {
    const evidence = lintWorkflows(root)
    expect(evidence).toEqual({ ok: true, filesScanned: 0, findings: [] })
    expect(evaluateGitHubActionsPolicy({ evidence }).outcome).toBe("pass")
  }, 30_000)
})
