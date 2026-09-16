// The spawned entrypoint this check's `run: [...]` invokes. Unlike
// openssf-scorecard/run.ts, this script needs no cross-check evidence via
// `dependsOn` (it re-runs openssf-scorecard's own pure evaluator functions
// directly, and reads coverage/mutation reports straight off disk) -- so it
// writes docs/ISO-IEC-IEEE-12207-2017.md itself, here, rather than deferring
// to the check's `policy` function the way openssf-scorecard.ts has to.
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { repoSlug } from "../openssf-scorecard/gh-api.js"
import { gatherProcessEvidence } from "./gather-evidence.js"
import { renderAlignmentMarkdown } from "./render-markdown.js"

/** Gathers evidence, renders the document, writes it, and prints a small JSON summary to stdout for the check's own policy to build a rationale from. */
function main(): void {
  const root = process.cwd()
  const slug = repoSlug(root)
  const entries = gatherProcessEvidence(root)

  const markdown = renderAlignmentMarkdown({
    repo: slug,
    generatedAt: new Date().toISOString(),
    entries,
  })
  const outputPath = path.join(root, "docs/ISO-IEC-IEEE-12207-2017.md")
  mkdirSync(path.dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, markdown)

  const found = entries.filter((e) => e.status === "evidence-found").length
  process.stdout.write(JSON.stringify({ repo: slug, total: entries.length, evidenceFound: found }))
}

// Mirrors scripts/security-socket/scan.ts's own "only run when invoked directly, not when
// imported by a test" guard.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
