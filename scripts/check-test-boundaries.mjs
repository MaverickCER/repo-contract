// Static, permanent guardrail that each Vitest verification category's
// execution boundary is actually mutually exclusive -- never executes the
// test suite or spawns Vitest to discover this; it only walks the
// filesystem and reads each category's own vitest.<name>.config.ts as text.
//
// Two checks:
//   1. Every *.test.ts file under test/ belongs to exactly one of the four
//      category directories.
//   2. Each category's vitest config `include` array only references that
//      category's own directory.
//
// Invoked by scripts/check-architecture.mjs as a second, clearly separate
// section of the `architecture` check's evidence -- not because test-category
// boundaries are architecture in the production-dependency-graph sense, but
// because both are cheap, static, no-execution checks about the shape of the
// repository.

import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const CATEGORY_DIRS = {
  unit: "test/unit",
  integration: "test/integration",
  property: "test/property",
  e2e: "test/e2e",
}

function walkTestFiles(root) {
  const testRoot = path.join(root, "test")
  const entries = readdirSync(testRoot, { recursive: true, withFileTypes: true })
  const files = []

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".test.ts")) continue

    // `entry.parentPath` (Node >=20.12) falls back to `entry.path` on older
    // Node 20.x patch releases where only the deprecated alias exists.
    const parentPath = entry.parentPath ?? entry.path
    const absolute = path.join(parentPath, entry.name)

    files.push(path.relative(root, absolute).split(path.sep).join("/"))
  }

  return files
}

function checkFileOwnership(files) {
  const violations = []

  for (const file of files) {
    const owners = Object.entries(CATEGORY_DIRS).filter(([, dir]) => file.startsWith(`${dir}/`))

    if (owners.length !== 1) {
      violations.push(
        `${file} belongs to ${owners.length} category director${owners.length === 1 ? "y" : "ies"} (expected exactly 1): ${owners.map(([name]) => name).join(", ") || "none"}`,
      )
    }
  }

  return violations
}

function checkConfigIncludes(root) {
  const violations = []

  for (const [name, dir] of Object.entries(CATEGORY_DIRS)) {
    const configPath = path.join(root, `vitest.${name}.config.ts`)
    const text = readFileSync(configPath, "utf8")
    const match = /include:\s*\[([^\]]*)\]/.exec(text)

    if (!match) {
      violations.push(`vitest.${name}.config.ts has no readable "include" array`)
      continue
    }

    const patterns = [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1])

    if (patterns.length === 0) {
      violations.push(`vitest.${name}.config.ts's "include" array is empty`)
      continue
    }

    for (const pattern of patterns) {
      if (!pattern.startsWith(`${dir}/`)) {
        violations.push(
          `vitest.${name}.config.ts's "include" pattern "${pattern}" does not stay within ${dir}/`,
        )
      }
    }
  }

  return violations
}

export function checkTestBoundaries(root = DEFAULT_ROOT) {
  try {
    const files = walkTestFiles(root)
    const violations = [...checkFileOwnership(files), ...checkConfigIncludes(root)]

    return {
      ok: true,
      filesScanned: files.length,
      violations,
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = checkTestBoundaries()

  if (!result.ok) {
    console.error(`[check-test-boundaries] ERROR: ${result.error}`)
    process.exitCode = 1
  } else {
    console.log(`[check-test-boundaries] scanned ${String(result.filesScanned)} test file(s)`)

    for (const violation of result.violations) {
      console.error(`[check-test-boundaries] VIOLATION: ${violation}`)
    }

    process.exitCode = result.violations.length > 0 ? 1 : 0
  }
}
