// Stands in for an AI reviewer so the example gives the same output on every
// run. It takes the prompt a real reviewer would receive (the aiReview
// preset's default, as its last argument) and prints one recorded reply from
// ai-review.responses/. `AI_REVIEW_RESPONSE` picks the reply (default
// `confident`); CI replays each one.
import { readFileSync } from "node:fs"

const prompt = process.argv.at(-1) ?? ""
if (!prompt.includes('"findings"')) {
  process.stderr.write("The prompt does not ask for the JSON shape.\n")
  process.exit(2)
}
const reply = process.env.AI_REVIEW_RESPONSE ?? "confident"
process.stdout.write(
  readFileSync(new URL(`./ai-review.responses/${reply}.txt`, import.meta.url), "utf8"),
)
