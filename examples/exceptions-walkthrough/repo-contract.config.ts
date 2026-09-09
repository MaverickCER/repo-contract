/**
 * Advanced / Experimental example: a governed, justified exception to an otherwise-blocking
 * finding, built on `repo-contract/helpers`.
 *
 * `repo-contract/helpers` is Experimental -- its signature and behavior may change in a minor or
 * patch release (see ../../VERSIONING.md). Start with [`../day-one-walkthrough`](../day-one-walkthrough)
 * for the mainline adoption story; this one is for when a repository needs to say "this specific
 * advisory is reviewed and accepted, here is why" without weakening the check for everything else.
 *
 * See ./README.md for the full walkthrough and ./exception-policy.ts for the helper flow.
 */
import { spawn } from "node:child_process"

import { defineRepoContract } from "repo-contract"

import { buildAdvisoryPolicy } from "./exception-policy.js"

export default defineRepoContract({
  spawn,
  env: process.env,
  checks: {
    // A real check would run `npm audit --json` here with `output: { format: "json" }` and parse
    // the report in the policy. This example hard-codes the advisory list in findings.ts so its
    // output is deterministic, so the command itself just needs to succeed -- the decision comes
    // entirely from findings.ts reconciled against exceptions.json.
    DependencyAdvisories: {
      run: ["node", "--version"],
      policy: buildAdvisoryPolicy(),
    },
  },
})
