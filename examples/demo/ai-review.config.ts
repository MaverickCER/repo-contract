/**
 * A repository that runs a shared standard as its baseline and adds an AI
 * review check on top: the published `aiReview` preset. `./repo-contract.config.ts`
 * stands in for the standard, which in practice is an npm package the
 * repository depends on.
 *
 * Run it with `npm run ai-review` from this directory: see ./README.md.
 */
import { defineRepoContract } from "repo-contract"
import { aiReview } from "repo-contract/presets"
import standard from "./repo-contract.config.js"

export default defineRepoContract({
  ...standard,
  checks: {
    ...standard.checks,
    // fake-reviewer.mjs replays a recorded reply so this example is
    // repeatable. In your repository, `agent` is your reviewer's command, for
    // example ["claude", "-p", "{prompt}"], with its `credentials`.
    aiReview: aiReview({
      agent: ["node", "fake-reviewer.mjs"],
      errorThreshold: 0.8,
    }),
  },
})
