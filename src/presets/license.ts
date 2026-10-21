import type { CheckDefinitionConfig } from "../types.js"
import { exitCodeFailRationale } from "./shared/exit-code-fail-rationale.js"
import { checkDependencyInstalled, missingDependencyResult } from "./shared/missing-dependency.js"
import { checkTerminatedAbnormally } from "./shared/terminal-status.js"

interface LicenseeEntry {
  readonly name: string
  readonly version: string
  readonly license?: string
}

/** The launcher's first stderr line when it found `.licensee.json` and left the policy to it. */
const CONFIG_FILE_MARKER = "repo-contract license preset: using .licensee.json"
/** The launcher's first stderr line when there is no `.licensee.json`, so it passed `--osi`. */
const OSI_MARKER = "repo-contract license preset: no .licensee.json, using --osi"
/** The launcher's only stderr line when `licensee` cannot be resolved from the working directory. */
const MISSING_MARKER = "repo-contract license preset: licensee is not installed"
/** The launcher's exit code alongside `MISSING_MARKER` -- the shell's own "command not found". */
const MISSING_EXIT_CODE = 127

// licensee reads `.licensee.json` only when no policy flag (`--osi`,
// `--spdx`, `--blueoak`, `--packages`) is on its command line -- any one of
// them replaces the file entirely. A fixed `run` can't pass `--osi` "only
// when there is no file", so the preset runs this launcher instead: it looks
// for `.licensee.json` in the check's own working directory at spawn time
// (the same directory licensee itself reads it from), adds `--osi` only when
// there is none, and then runs the consumer's installed licensee CLI
// in-process with those arguments. The repository's own file is the policy
// when it exists; OSI approval is the default when it doesn't.
//
// `--production` scopes evaluation to the dependency graph actually shipped
// to consumers -- devDependencies never end up in a consumer's install, so
// their licenses carry no obligation onto this package's own license. Same
// runtime-only rationale the securityDeps preset already applies to `npm
// audit --omit=dev`. `--errors-only` keeps the ndjson evidence limited to
// the packages actually driving the verdict, matching the
// deadCode/duplication presets' report-issues-only shape.
//
// licensee is resolved from the working directory with Node's own module
// resolution (a local devDependency, as `missingDependencyResult` tells a
// consumer to install), and loaded with `require` -- no second spawn, so no
// PATH lookup and no Windows `.cmd` shim. The first stderr line records
// which policy applied, so the verdict can say so; stderr keeps its prefix
// when it is truncated, so that line always survives.
const LAUNCHER_SOURCE = `
const fs = require("node:fs")
const path = require("node:path")
const cwd = process.cwd()
let manifestPath
try {
  manifestPath = require.resolve("licensee/package.json", { paths: [cwd] })
} catch (error) {
  if (error.code !== "MODULE_NOT_FOUND") throw error
  process.stderr.write(${JSON.stringify(MISSING_MARKER)} + "\\n")
  process.exit(${String(MISSING_EXIT_CODE)})
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
const bin = typeof manifest.bin === "string" ? manifest.bin : manifest.bin.licensee
const binPath = path.resolve(path.dirname(manifestPath), bin)
const useConfigFile = fs.existsSync(path.join(cwd, ".licensee.json"))
process.stderr.write((useConfigFile ? ${JSON.stringify(CONFIG_FILE_MARKER)} : ${JSON.stringify(OSI_MARKER)}) + "\\n")
const policyFlags = useConfigFile ? [] : ["--osi"]
process.argv = [process.argv[0], binPath, "--production", ...policyFlags, "--errors-only", "--ndjson"]
require(binPath)
`

/**
 * Dependency license compliance via licensee. The repository's own `.licensee.json` is the policy
 * when it exists; otherwise a dependency's license must be OSI-approved (`--osi`).
 * @beta
 */
export const license: CheckDefinitionConfig = {
  run: ["node", "-e", LAUNCHER_SOURCE],
  policy: ({ result }) => {
    // A config that overrides `run` to spawn licensee directly still gets the
    // ENOENT "not installed" verdict. The launcher's own `node` being missing
    // is not a missing licensee, so it falls through to the spawn-error result.
    if (result.command !== "node") {
      const missing = checkDependencyInstalled(result, "licensee")
      if (missing) return missing
    }

    const terminated = checkTerminatedAbnormally(result, "licensee")
    if (terminated) return terminated

    if (result.exitCode === MISSING_EXIT_CODE && result.stderr.startsWith(MISSING_MARKER)) {
      return missingDependencyResult("licensee")
    }

    const usesConfigFile = result.stderr.startsWith(CONFIG_FILE_MARKER)
    const passSubject = usesConfigFile
      ? "with a license .licensee.json does not approve"
      : "with a non-OSI-approved license"
    const failSubject = usesConfigFile
      ? "that .licensee.json does not approve"
      : "without an OSI-approved license"

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
          rationale: `licensee found 0 production dependencies ${passSubject}.`,
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
        `licensee found ${String(details.length)} production dependency(ies) ${failSubject}:`,
        ...details.map((detail) => `- ${detail}`),
      ].join("\n"),
    }
  },
}
