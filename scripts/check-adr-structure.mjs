// Static, permanent guardrail that this repository's own ADR set (specs/decisions/) stays
// structurally well-formed as it grows -- never executes anything, only reads the filesystem and
// each file's own text.
//
// Three checks, matching what `npm run adr:new` (scripts/adr-new.mjs) scaffolds and
// CONTRIBUTING.md's "Architecture Decision Records" section describes:
//   1. Every file's name matches NNNN-kebab-title.md.
//   2. No two files share the same NNNN number.
//   3. Every file contains the five required section headings.
//
// Scope discipline, deliberately: this validator checks only mechanical shape. It never attempts
// to detect stale prose, counts, or paths inside an ADR's own body -- that's not mechanically
// checkable, and is exactly why this repository's own documentation-vs-enforcement audit required
// a human-driven pass rather than a tool run. It also evaluates the *current* specs/decisions/
// tree only, never git history -- a numbering gap is accepted by design (scripts/adr-new.mjs
// takes highest-existing + 1, so a number reserved and then abandoned without a file ever
// existing for it leaves a permanent gap), never treated as a violation.
//
// Invoked by scripts/check-architecture.mjs as a third, clearly separate section of the
// `architecture` check's evidence -- not because ADR structure is architecture in the
// production-dependency-graph sense, but because both are cheap, static, no-execution checks
// about the shape of the repository.

import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

// A single flat character class (never a repeated group) -- avoids the nested-quantifier shape
// that trips security/detect-unsafe-regex, the same fix this repository's own suppression
// governance ADR documents choosing over a suppression when a real code-level fix is available.
const FILENAME_PATTERN = /^(\d{4})-[a-z0-9-]+\.md$/
const REQUIRED_HEADINGS = [
  "## Status",
  "## Context",
  "## Decision",
  "## Consequences",
  "## Alternatives considered",
]

export function checkAdrStructure(root = DEFAULT_ROOT) {
  try {
    const decisionsDir = path.join(root, "specs", "decisions")
    const files = readdirSync(decisionsDir).filter((f) => f.endsWith(".md"))
    const violations = []
    const filesByNumber = new Map()

    for (const file of files) {
      const match = FILENAME_PATTERN.exec(file)
      if (!match) {
        violations.push(`${file} does not match the required NNNN-kebab-title.md filename shape`)
        continue
      }
      const [, number] = match
      filesByNumber.set(number, [...(filesByNumber.get(number) ?? []), file])
    }

    for (const [number, filesForNumber] of filesByNumber) {
      if (filesForNumber.length > 1) {
        violations.push(
          `ADR number ${number} is used by more than one file: ${filesForNumber.join(", ")}`,
        )
      }
    }

    for (const file of files) {
      const text = readFileSync(path.join(decisionsDir, file), "utf8")
      const missing = REQUIRED_HEADINGS.filter((heading) => !text.includes(heading))
      if (missing.length > 0) {
        violations.push(`${file} is missing required heading(s): ${missing.join(", ")}`)
      }
    }

    return { ok: true, filesScanned: files.length, violations }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = checkAdrStructure()

  if (!result.ok) {
    console.error(`[check-adr-structure] ERROR: ${result.error}`)
    process.exitCode = 1
  } else {
    console.log(`[check-adr-structure] scanned ${String(result.filesScanned)} ADR file(s)`)

    for (const violation of result.violations) {
      console.error(`[check-adr-structure] VIOLATION: ${violation}`)
    }

    process.exitCode = result.violations.length > 0 ? 1 : 0
  }
}
