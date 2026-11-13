// Lightweight, dependency-free bundle size reporter (Node builtins only:
// this is dev/CI tooling, not something that ships or runs at runtime).
//
// Report-only: measures gzip size for a fixed set of entry points and never
// fails on what it measures. A missing file or an over-budget size is a
// fact to report, not this script's judgment call to make.
//
// The one thing that IS this script's job to enforce is that it ran at all.
// A malformed --budget/--json argument still fails the process (an uncaught
// throw here). An inability to write --json's output file fails it too.
//
// The required size itself is owned by checks/size.ts. It passes the size in
// via --budget purely to annotate this script's own console/JSON output.
// The `size` check's policy in repo-contract makes the actual pass/fail
// decision from its own copy of that number. It never uses anything this
// script decides or echoes back.

import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { gzipSync } from "node:zlib"

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, "..")

// Which dist/ entry points exist is build shape, not policy. Unlike the
// budget, it's fine for this script to know it by default, so bare
// `npm run size` still works with zero arguments.
const ENTRIES = [
  // This reports only this package's own compiled source: there are no runtime dependencies, so
  // nothing is inlined from node_modules (see tsup.config.ts).
  { label: "index (esm)", file: "dist/index.js" },
  { label: "index (cjs)", file: "dist/index.cjs" },
  // Every published `exports` entry point is measured, in both formats; an entry missing here
  // would leave its budget in checks/size.ts permanently unmatchable.
  { label: "presets (esm)", file: "dist/presets.js" },
  { label: "presets (cjs)", file: "dist/presets.cjs" },
  { label: "helpers (esm)", file: "dist/helpers.js" },
  { label: "helpers (cjs)", file: "dist/helpers.cjs" },
  { label: "affected (esm)", file: "dist/affected.js" },
  { label: "affected (cjs)", file: "dist/affected.cjs" },
  { label: "metrics (esm)", file: "dist/metrics.js" },
  { label: "metrics (cjs)", file: "dist/metrics.cjs" },
]

function parseArgs(argv) {
  const budgets = new Map()
  let jsonOutPath

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]

    if (arg === "--budget") {
      const value = argv[i + 1]
      i += 1
      const separatorIndex = value?.lastIndexOf("=") ?? -1
      if (!value || separatorIndex === -1) {
        throw new Error(
          `--budget requires a "<label>=<maxGzipBytes>" argument, got ${String(value)}.`,
        )
      }
      const label = value.slice(0, separatorIndex)
      const maxGzipBytes = Number(value.slice(separatorIndex + 1))
      if (!Number.isFinite(maxGzipBytes)) {
        throw new Error(`--budget "${value}" does not end in a finite number of bytes.`)
      }
      budgets.set(label, maxGzipBytes)
      continue
    }

    if (arg === "--json") {
      jsonOutPath = argv[i + 1]
      i += 1
      if (!jsonOutPath) {
        throw new Error("--json requires a file path.")
      }
      continue
    }
  }

  return { budgets, jsonOutPath }
}

function measure(file) {
  const filePath = path.join(root, file)
  if (!existsSync(filePath)) return null
  return gzipSync(readFileSync(filePath)).length
}

const { budgets, jsonOutPath } = parseArgs(process.argv.slice(2))

const entries = ENTRIES.map(({ label, file }) => ({
  label,
  file,
  gzipBytes: measure(file),
  maxGzipBytes: budgets.has(label) ? budgets.get(label) : null,
}))

for (const { label, file, gzipBytes, maxGzipBytes } of entries) {
  if (gzipBytes === null) {
    console.log(
      `[size] ${label.padEnd(14)} ${file.padEnd(20)} missing -- run \`npm run build\` first.`,
    )
    continue
  }

  const budgetSuffix =
    maxGzipBytes === null
      ? ""
      : ` (budget ${String(maxGzipBytes)}B) ${gzipBytes <= maxGzipBytes ? "OK" : "OVER BUDGET"}`

  console.log(
    `[size] ${label.padEnd(14)} ${file.padEnd(20)} gzip=${String(gzipBytes)}B${budgetSuffix}`,
  )
}

if (jsonOutPath) {
  const { writeFileSync, mkdirSync } = await import("node:fs")
  const payload = {
    generatedAt: new Date().toISOString(),
    entries,
  }
  mkdirSync(path.dirname(path.resolve(jsonOutPath)), { recursive: true })
  writeFileSync(path.resolve(jsonOutPath), JSON.stringify(payload, null, 2), "utf8")
}
