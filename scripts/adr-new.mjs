// Scaffolds the next Architecture Decision Record under specs/decisions/.
//
//   npm run adr:new "the decision, stated as a sentence"
//
// Computes the next number (highest existing + 1 -- a reserved-then-abandoned
// number is never reused, so gaps are left alone), writes
// specs/decisions/NNNN-kebab-title.md with the five section headings
// scripts/check-adr-structure.mjs requires, and prints the path. Refuses to
// overwrite an existing file.
//
// The template lives here as a string, not as a file under specs/decisions/ --
// check-adr-structure.mjs flags any file there that isn't NNNN-kebab-title.md.

import { readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"

const ADR_DIR = "specs/decisions"
const FILENAME_NUMBER = /^(\d{4})-/

export function toKebabSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

// Highest existing NNNN + 1, zero-padded to four digits. Gaps are left alone.
export function nextAdrNumber(entries) {
  let max = 0
  for (const entry of entries) {
    const match = FILENAME_NUMBER.exec(entry)
    if (match) max = Math.max(max, Number(match[1]))
  }
  return String(max + 1).padStart(4, "0")
}

function template(number, title) {
  return `# ${number}: ${title}

## Status

Proposed.

## Context

## Decision

## Consequences

## Alternatives considered
`
}

export async function createAdr(root, title) {
  const trimmed = title.trim()
  if (!trimmed) throw new Error('Provide a title: npm run adr:new "the decision as a sentence"')

  const slug = toKebabSlug(trimmed)
  if (!slug) throw new Error(`Title "${title}" has no usable letters or digits for a filename.`)

  const dir = path.join(root, ADR_DIR)
  const entries = await readdir(dir)
  const number = nextAdrNumber(entries)
  const filePath = path.join(dir, `${number}-${slug}.md`)

  // "wx": fail rather than overwrite an existing file.
  await writeFile(filePath, template(number, trimmed), { encoding: "utf8", flag: "wx" })

  return { number, slug, filePath }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { filePath } = await createAdr(process.cwd(), process.argv.slice(2).join(" "))
    console.log(`Created ${path.relative(process.cwd(), filePath)}`)
    console.log("Fill in the sections; see the neighbouring files for the expected depth.")
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
