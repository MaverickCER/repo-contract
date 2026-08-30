import type { CheckDefinitionConfig } from "../types.js"
import { exitCodeFailRationale } from "./shared/exit-code-fail-rationale.js"
import { checkDependencyInstalled } from "./shared/missing-dependency.js"
import { checkTerminatedAbnormally } from "./shared/terminal-status.js"

interface LicenseeEntry {
  readonly name: string
  readonly version: string
  readonly license?: string
}

// `--production` scopes evaluation to the dependency graph actually shipped
// to consumers -- devDependencies never end up in a consumer's install, so
// their licenses carry no obligation onto this package's own license. Same
// runtime-only rationale the securityDeps preset already applies to `npm
// audit --omit=dev`. `--osi` treats Open Source Initiative approval as the
// approval criterion rather than a repository-maintained SPDX allowlist --
// the same "policy is repository policy, not a repo-contract opinion"
// stance securityDeps documents, just resolved to the broadest
// widely-recognized standard instead of a bespoke list. `--errors-only`
// keeps the ndjson evidence limited to the packages actually driving the
// verdict, matching the deadCode/duplication presets' report-issues-only
// shape.
/** Dependency license compliance via licensee. */
export const license: CheckDefinitionConfig = {
  run: ["licensee", "--production", "--osi", "--errors-only", "--ndjson"],
  policy: ({ result }) => {
    const missing = checkDependencyInstalled(result, "licensee")
    if (missing) return missing

    const terminated = checkTerminatedAbnormally(result, "licensee")
    if (terminated) return terminated

    const trimmed = result.stdout.trim()

    // `--errors-only` makes licensee exit non-zero *because* it found an
    // offending dependency -- so a non-zero exit with ndjson on stdout is the
    // expected failure path, handled below. But a non-zero exit with *empty*
    // stdout means licensee never evaluated anything (node_modules not
    // installed, an unreadable dependency tree, an internal `die()`): the
    // error is on stderr and there is nothing to parse. Treating that as
    // "found 0 offending dependencies" would let the compliance gate pass on
    // a run that never actually ran. Only an empty stdout from a process that
    // exited cleanly on its own is a genuine "nothing offending" pass.
    if (trimmed.length === 0) {
      if (result.status === "completed" && result.exitCode === 0) {
        return {
          outcome: "pass",
          rationale: "licensee found 0 production dependencies with a non-OSI-approved license.",
        }
      }

      return {
        outcome: "fail",
        rationale: exitCodeFailRationale(
          result,
          "licensee did not evaluate any dependency licenses (it produced no output)",
        ),
      }
    }

    let entries: readonly LicenseeEntry[]

    try {
      entries = trimmed
        .split("\n")
        // licensee emits one JSON object per line; a blank line between
        // records (some versions/locales do this, as can a leading
        // informational line) is not invalid evidence -- skip it rather than
        // feeding "" to JSON.parse and discarding the real violation list.
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as LicenseeEntry)
    } catch {
      return { outcome: "fail", rationale: "licensee produced invalid JSON evidence." }
    }

    const details = entries
      .map((entry) => `${entry.name}@${entry.version}: ${entry.license ?? "unknown license"}`)
      .sort()

    return {
      outcome: "fail",
      rationale: [
        `licensee found ${String(details.length)} production dependency(ies) without an OSI-approved license:`,
        ...details.map((detail) => `- ${detail}`),
      ].join("\n"),
    }
  },
}
