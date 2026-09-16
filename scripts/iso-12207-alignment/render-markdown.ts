import { PROCESS_CATEGORIES } from "./process-map.js"
import type { ProcessEvidence } from "./types.js"

/**
 * Renders `docs/ISO-IEC-IEEE-12207-2017.md`. The disclaimer subtitle is
 * load-bearing, not decorative -- this document maps this repository's own
 * gathered evidence against ISO/IEC/IEEE 12207:2017's published process
 * STRUCTURE (a freely-available, non-infringing fact: the standard's four
 * process-category names and the named processes within them, corroborated
 * against two independent public summaries -- see process-map.ts's own
 * comment). It never quotes or reproduces the standard's own copyrighted
 * text describing what each process entails, and it is never a certification
 * or conformity assessment of any kind.
 * @param input - What to render.
 * @param input.repo - The `owner/repo` slug this evidence was gathered against.
 * @param input.generatedAt - ISO 8601 timestamp of this render.
 * @param input.entries - Every process's evidence status.
 * @returns The full Markdown document.
 */
export function renderAlignmentMarkdown(input: {
  readonly repo: string
  readonly generatedAt: string
  readonly entries: readonly ProcessEvidence[]
}): string {
  const { repo, generatedAt, entries } = input
  const lines: string[] = []

  lines.push("# ISO/IEC/IEEE 12207:2017 evidence and alignment report")
  lines.push("")
  lines.push(
    "> **Informational Evidence and Alignment Report -- not a certification, conformity assessment, or reproduction of the standard.** " +
      "This document maps `" +
      repo +
      "`'s own, already-gathered evidence (from `repo-contract`'s own contract/evidence mechanism -- the same `npm run contract` this repository dogfoods on every run) against the published PROCESS STRUCTURE of [ISO/IEC/IEEE 12207:2017](https://www.iso.org/standard/63712.html) (\"Systems and software engineering -- Software life cycle processes\") -- its four process categories and the named processes within them, a freely-available, non-infringing fact about the standard's structure (corroborated against two independent public summaries; see [`scripts/iso-12207-alignment/process-map.ts`](../scripts/iso-12207-alignment/process-map.ts)). " +
      "**This document never quotes or reproduces the standard's own copyrighted text** describing what each process entails, does not claim conformance with any clause of the standard, and is not an ISO, IEC, or IEEE certification of any kind. " +
      'Every "Evidence found" entry below traces to a specific, named source (a `repo-contract` check, a computed number, a committed file) -- no claim here is made without a traceable evidence source. Every "No evidence" entry says so explicitly, rather than being silently omitted.',
  )
  lines.push("")
  lines.push(`_Generated ${generatedAt} against \`${repo}\`._`)
  lines.push("")

  const found = entries.filter((e) => e.status === "evidence-found").length
  lines.push(
    `**${String(found)} of ${String(entries.length)} processes have evidence-backed entries below** -- the remainder are explicitly marked "No evidence" with a stated reason, most commonly because a process is an organizational or business-management concern outside what a single source-controlled repository's own technical evidence can establish.`,
  )
  lines.push("")

  for (const category of PROCESS_CATEGORIES) {
    lines.push(`## ${category.name}`)
    lines.push("")
    lines.push("| Process | Status | Evidence |")
    lines.push("| --- | --- | --- |")
    for (const processDef of category.processes) {
      const entry = entries.find(
        (e) => e.category === category.name && e.process === processDef.name,
      )
      const status = entry?.status === "evidence-found" ? "Evidence found" : "No evidence"
      const summary = (entry?.summary ?? "Not evaluated by this generator.")
        .replace(/\|/g, "\\|")
        .replace(/\n/g, " ")
      lines.push(`| ${processDef.name} | ${status} | ${summary} |`)
    }
    lines.push("")
  }

  return lines.join("\n")
}
