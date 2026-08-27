// Entry point for the "adr-governance" self-hosting check, invoked via
// `run: ["tsx", "scripts/adr-governance/check.ts", "--base=origin/main"]` in repo-contract.config.ts.
// Prints ONLY the JSON evidence to stdout (for `output: { format: "json" }` to parse) -- mirrors
// scripts/changeset-docs/check.ts's own stdout contract.

import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { locateTargetFileName } from "../changeset-file-locator.js"
import { CHANGESET_DIR } from "../contracts.js"
import { listChangedFiles } from "../diff-files.js"
import type { AdrGovernanceEvidence } from "./evidence-types.js"

const GOVERNED_PATH_PREFIXES = ["src/execution/", "src/policy/"]
const ADR_DIR = "specs/decisions"
const ADR_REFERENCE_PATTERN = /\bADR[- ]?(\d{4})\b/gi

/**
 * @returns The `--base=<ref>` CLI flag's value, or `"origin/main"` if the flag wasn't passed.
 */
function parseBaseArg(): string {
  const arg = process.argv.find((a) => a.startsWith("--base="))
  return arg?.slice("--base=".length) ?? "origin/main"
}

/**
 * Every syntactically valid `ADR NNNN` reference found anywhere in `text`, deduplicated.
 * @param text - The changeset file's raw content to scan.
 * @returns Each captured 4-digit number, as a string, in first-seen order.
 */
function findReferencedAdrNumbers(text: string): string[] {
  const seen = new Set<string>()
  for (const match of text.matchAll(ADR_REFERENCE_PATTERN)) {
    const number = match[1]
    if (number) seen.add(number)
  }
  return [...seen]
}

/**
 * Which of the referenced numbers actually correspond to a real, currently-existing file under
 * `specs/decisions/` -- cross-validated against the real directory listing, not just regex-shape.
 * @param root - Absolute path to the repository being checked.
 * @param numbers - Candidate 4-digit ADR numbers to resolve.
 * @returns The subset of `numbers` that resolve to a real file.
 */
async function resolveAdrNumbers(root: string, numbers: readonly string[]): Promise<string[]> {
  if (numbers.length === 0) return []
  let entries: string[]
  try {
    entries = await readdir(path.join(root, ADR_DIR))
  } catch {
    return []
  }
  return numbers.filter((number) => entries.some((entry) => entry.startsWith(`${number}-`)))
}

/**
 * The check's full logic, factored out of the bottom-of-file script invocation so
 * `test/integration/adr-governance/check.integration.test.ts` can exercise the complete real path
 * (git diff -> changeset lookup -> ADR resolution -> evidence) in-process against a scratch fixture
 * repository, without spawning a subprocess -- matching scripts/changeset-docs/check.ts's own
 * testing convention.
 * @param root - Absolute path to the repository being checked.
 * @param baseRef - Git ref to diff against, e.g. `origin/main`.
 * @returns The evidence for `output: { format: "json" }`.
 */
export async function runAdrGovernanceCheck(
  root: string,
  baseRef: string,
): Promise<AdrGovernanceEvidence> {
  const files = await listChangedFiles(root, baseRef)

  const governedFilesTouched = files
    .filter((f) => GOVERNED_PATH_PREFIXES.some((prefix) => f.path.startsWith(prefix)))
    .map((f) => f.path)
    .sort()

  const adrFilesTouched = files
    .filter((f) => f.path.startsWith(`${ADR_DIR}/`))
    .map((f) => f.path)
    .sort()

  if (governedFilesTouched.length === 0 || adrFilesTouched.length > 0) {
    return {
      baseRef,
      governedFilesTouched,
      adrFilesTouched,
      changesetPath: undefined,
      referencedAdrNumbers: [],
      resolvedAdrNumbers: [],
      satisfied: true,
    }
  }

  const changesetFileName = await locateTargetFileName(root)
  const changesetPath = path.join(CHANGESET_DIR, changesetFileName)
  const content = await readFile(path.join(root, changesetPath), "utf8").catch(() => undefined)

  const referencedAdrNumbers = content ? findReferencedAdrNumbers(content) : []
  const resolvedAdrNumbers = await resolveAdrNumbers(root, referencedAdrNumbers)

  return {
    baseRef,
    governedFilesTouched,
    adrFilesTouched,
    changesetPath: content === undefined ? undefined : changesetPath,
    referencedAdrNumbers,
    resolvedAdrNumbers,
    satisfied: resolvedAdrNumbers.length > 0,
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const evidence = await runAdrGovernanceCheck(process.cwd(), parseBaseArg())
  process.stdout.write(JSON.stringify(evidence))
}
