import { requireParsedOutput } from "./shared/require-parsed-output.js"
import type { CheckDefinitionConfig } from "../src/types.js"

interface RunOutput {
  readonly repo: string
  readonly total: number
  readonly evidenceFound: number
}

/**
 * Dogfoods repo-contract's own contract/evidence mechanism a second time
 * (alongside `openssf-scorecard`) to produce
 * `docs/ISO-IEC-IEEE-12207-2017.md` -- a non-normative alignment report
 * mapping this repository's own gathered evidence against ISO/IEC/IEEE
 * 12207:2017's published process structure. See that document's own
 * generated disclaimer, scripts/iso-12207-alignment/process-map.ts's
 * sourcing comment, and scripts/iso-12207-alignment/README.md for the full
 * legal reasoning.
 *
 * Unlike `openssf-scorecard`, this check needs no `dependsOn`: its own
 * `run` script re-runs openssf-scorecard's pure evaluator functions
 * directly and reads coverage/mutation reports straight off disk, so the
 * document is written entirely within `run`, not `policy` -- the ordinary
 * pattern every other check in this repository already uses.
 *
 * Like `openssf-scorecard`, this check's own PASS/FAIL is about whether the
 * evidence was successfully gathered and the document successfully
 * regenerated -- never about how many processes have evidence. A repository
 * with fewer evidence-backed processes is not a worse repository; it is
 * information for a human reader.
 */
export const iso12207Alignment: CheckDefinitionConfig = {
  run: ["tsx", "scripts/iso-12207-alignment/run.ts"],
  output: { format: "json" },
  policy: ({ result }) => {
    const parsed = requireParsedOutput<RunOutput>(
      result.output,
      "ISO 12207 alignment evidence-gathering output could not be parsed as JSON.",
    )
    if (!parsed.ok) return parsed.result

    const { total, evidenceFound } = parsed.value
    return {
      outcome: "pass",
      rationale: `Wrote docs/ISO-IEC-IEEE-12207-2017.md: ${String(evidenceFound)}/${String(total)} processes have evidence-backed entries. This check passes on successful evidence-gathering and document regeneration, not on how many processes have evidence -- see docs/ISO-IEC-IEEE-12207-2017.md for the real results.`,
    }
  },
}
