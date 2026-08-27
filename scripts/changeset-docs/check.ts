// Entry point for the "changeset-docs" self-hosting check, invoked via
// `run: ["tsx", "scripts/changeset-docs/check.ts", "--base=origin/main"]` in repo-contract.config.ts.
// Prints ONLY the JSON evidence to stdout (for `output: { format: "json" }` to parse) -- mirrors
// scripts/api-contract/check.ts's own stdout contract.

import { readFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { listChangedFiles } from "../diff-files.js"
import type { ChangesetDocsEvidence } from "./evidence-types.js"
import { applyChangesetDocs } from "./table-manager.js"

/**
 * @returns The `--base=<ref>` CLI flag's value, or `"origin/main"` if the flag wasn't passed.
 */
function parseBaseArg(): string {
  const arg = process.argv.find((a) => a.startsWith("--base="))
  return arg?.slice("--base=".length) ?? "origin/main"
}

/**
 * The check's full logic, factored out of the bottom-of-file script invocation so
 * `test/integration/changeset-docs/check.integration.test.ts` can exercise the complete real path
 * (git diff -> reconciliation -> evidence) in-process against a scratch fixture repository, without
 * spawning a subprocess -- matching scripts/api-contract/check.ts's own testing convention.
 * @param root - Absolute path to the repository being checked.
 * @param baseRef - Git ref to diff against, e.g. `origin/main`.
 * @returns The evidence for `output: { format: "json" }`: the base ref, reconciled table rows, the changeset file's relative path (if any), and whether every row is described.
 */
export async function runChangesetDocsCheck(
  root: string,
  baseRef: string,
): Promise<ChangesetDocsEvidence> {
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as {
    name: string
  }

  const files = await listChangedFiles(root, baseRef)
  const { rows, changesetPath } = await applyChangesetDocs({
    root,
    packageName: packageJson.name,
    files,
  })

  return {
    baseRef,
    rows,
    changesetPath,
    allDescribed: rows.every((row) => row.description !== undefined),
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const evidence = await runChangesetDocsCheck(process.cwd(), parseBaseArg())
  process.stdout.write(JSON.stringify(evidence))
}
