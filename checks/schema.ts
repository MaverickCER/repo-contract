import type { CheckDefinitionConfig } from "../src/types.js"
import { TARGETS } from "../scripts/generate-json-schema.mjs"

// Regenerates every schema target from its source type (see
// scripts/generate-json-schema.mjs's TARGETS -- schemas/*.schema.json plus
// one internal, non-published schema) -- it always overwrites its output,
// so a clean exit code alone doesn't prove anything was actually produced.
// This policy re-reads every target's `outputFile` back off disk afterward
// and confirms it's valid JSON carrying the same `$id`/`title` that
// generator's own TARGETS declares -- imported directly, never duplicated
// here, so this check can't silently drift from what the generator itself
// considers "every schema" if a target is ever added, renamed, or removed.
export const schema: CheckDefinitionConfig = {
  run: ["node", "scripts/generate-json-schema.mjs"],
  policy: async ({ result }) => {
    if (result.exitCode !== 0) {
      const output = [result.stdout.trim(), result.stderr.trim()]
        .filter((value): value is string => Boolean(value))
        .join("\n")

      return {
        outcome: "fail",
        rationale:
          output.length > 0
            ? `Schema generation failed:\n${output}`
            : `Schema generation failed (exit code ${String(result.exitCode)}).`,
      }
    }

    const { readFile } = await import("node:fs/promises")

    const problems: string[] = []

    for (const target of TARGETS) {
      let raw: string

      try {
        raw = await readFile(target.outputFile, "utf8")
      } catch {
        problems.push(`${target.outputFile} -- was not written`)
        continue
      }

      let parsed: unknown

      try {
        parsed = JSON.parse(raw)
      } catch {
        problems.push(`${target.outputFile} -- is not valid JSON`)
        continue
      }

      if (typeof parsed !== "object" || parsed === null) {
        problems.push(`${target.outputFile} -- did not produce a JSON object`)
        continue
      }

      const schemaObject = parsed as Record<string, unknown>

      if (typeof schemaObject.$schema !== "string" || schemaObject.$schema.length === 0) {
        problems.push(`${target.outputFile} -- missing a $schema draft identifier`)
      }

      if (schemaObject.$id !== target.id) {
        problems.push(
          `${target.outputFile} -- $id is ${JSON.stringify(schemaObject.$id)}, expected ${JSON.stringify(target.id)}`,
        )
      }

      if (schemaObject.title !== target.title) {
        problems.push(
          `${target.outputFile} -- title is ${JSON.stringify(schemaObject.title)}, expected ${JSON.stringify(target.title)}`,
        )
      }
    }

    if (problems.length > 0) {
      return {
        outcome: "fail",
        rationale: [
          `Schema generation exited 0 but produced ${String(problems.length)} problem(s):`,
          ...problems.map((problem) => `- ${problem}`),
        ].join("\n"),
      }
    }

    return {
      outcome: "pass",
      rationale: `Generated ${String(TARGETS.length)} schema(s): ${TARGETS.map((target) => target.outputFile).join(", ")}.`,
    }
  },
}
