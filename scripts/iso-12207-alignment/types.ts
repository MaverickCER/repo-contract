/**
 * One process's evidence status -- the unit this whole generator assembles
 * and renders. Every `"evidence-found"` entry's `summary` must trace to a
 * specific, named evidence source (a check name, a file, a computed number)
 * per this whole initiative's evidentiary-traceability rule: no claim
 * without a traceable evidence source.
 */
export interface ProcessEvidence {
  readonly category: string
  readonly process: string
  readonly status: "evidence-found" | "no-evidence"
  /** For `"evidence-found"`: what the evidence shows, citing its source. For `"no-evidence"`: why this repository's technical contract has nothing to say about this process (e.g. it's an organizational/business process, not something a source-controlled repository's own evidence can speak to). */
  readonly summary: string
}
