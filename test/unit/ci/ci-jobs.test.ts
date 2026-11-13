import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { parse as parseYaml } from "yaml"
import { auditCiJobs, ciJobsOptions } from "../../_ipc/ci-jobs.js"

/**
 * The default branch's ruleset requires three status checks: `contract`, `lint` and `required`. GitHub
 * counts a skipped or cancelled required job as passing and cannot name a matrix job as one context,
 * so `required` is an aggregator that needs every other gate job and fails unless each finished
 * `success`. This test keeps that list complete: a job added to ci.yml that is not in
 * `jobs.required.needs` would otherwise become advisory without anyone deciding so.
 */

interface Job {
  readonly needs?: string | readonly string[]
  readonly if?: string
  readonly "continue-on-error"?: boolean | string
  readonly steps?: readonly { readonly name?: string; readonly if?: string }[]
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const workflowText = readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8")
const workflow = parseYaml(workflowText) as { jobs: Record<string, Job> }

/** Jobs that are required directly, the aggregator itself, or that run only after a merge to main. */
const NOT_AGGREGATED = new Set([
  "contract",
  "lint",
  "required",
  "pages-content",
  "deploy",
  "pr-title",
  // Node "current" is informational: a new Node release must not block a merge (see its comment).
  "verify-current",
])

const needsOf = (job: Job | undefined): readonly string[] =>
  job?.needs === undefined ? [] : typeof job.needs === "string" ? [job.needs] : job.needs

describe("ci.yml: the `required` aggregator stands for every gate job", () => {
  const required = workflow.jobs.required

  it("exists, runs whatever happened upstream, and fails on anything but success", () => {
    expect(required).toBeDefined()
    expect(required?.if).toBe("always()")
    const script = required?.steps?.[0]
    expect(script?.name).toBe("Every gate job succeeded")
  })

  it("needs every job that is neither required directly nor a post-merge job", () => {
    const expected = Object.keys(workflow.jobs).filter((id) => !NOT_AGGREGATED.has(id))
    const needs = needsOf(required)
    for (const id of expected) {
      expect(needs, `${id} must be in jobs.required.needs`).toContain(id)
    }
    expect(
      needs.filter((id) => NOT_AGGREGATED.has(id) && id !== "contract" && id !== "lint"),
    ).toEqual([])
  })

  // The standard's own audit (test/_ipc/ci-jobs.ts, the managed copy every package in the fleet enrols)
  // reads the same workflow. This repository keeps its test under test/unit/ because its Vitest categories
  // run only there, so the shared audit is called from here instead of from the template's location.
  it("passes the fleet's shared audit of the aggregator", () => {
    const manifest: unknown = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"))
    expect(auditCiJobs(workflowText, ciJobsOptions(manifest))).toEqual([])
  })

  it("keeps `lint` and `contract` as direct required checks too", () => {
    expect(workflow.jobs.lint).toBeDefined()
    expect(workflow.jobs.contract).toBeDefined()
  })

  it("lets only the informational Node-current job continue on error", () => {
    for (const [id, job] of Object.entries(workflow.jobs)) {
      const tolerated = job["continue-on-error"] === true
      expect(tolerated, `${id} continue-on-error`).toBe(id === "verify-current")
    }
  })

  it("makes `contract` fail, not skip, when verify or lint fails", () => {
    const contract = workflow.jobs.contract
    expect(contract?.if).not.toMatch(/needs\.verify|needs\.lint/)
    const guard = contract?.steps?.find((step) => step.name === "verify and lint passed")
    expect(guard?.if).toContain("needs.verify.result != 'success'")
    expect(guard?.if).toContain("needs.lint.result != 'success'")
  })
})
