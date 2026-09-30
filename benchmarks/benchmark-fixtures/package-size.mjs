// Reuses scripts/check-size.mjs's own gzip-measurement approach, as context metadata only -- NOT a
// benchmark in its own right. Adapted from env-cap's/data-cap's own benchmark-fixtures/
// package-size.mjs: repo-contract ships three tsup entry points (index/presets/helpers -- see
// tsup.config.ts) instead of a runtime/helpers pair, and carries no hard-gated size budget the way
// env-cap's/data-cap's runtime/helpers entries do (repo-contract's own `size` check -- checks/
// size.ts -- budgets the published tarball as a whole, not a single dist file) -- this just records
// what a given run's build actually produced, so a reader can tell "was this build's bundle
// unusually large."

import { existsSync, readFileSync } from "node:fs"
import { gzipSync } from "node:zlib"
import path from "node:path"

const ENTRIES = [
  { label: "index", file: "dist/index.js" },
  { label: "presets", file: "dist/presets.js" },
  { label: "helpers", file: "dist/helpers.js" },
]

export function collectPackageSize(repoRoot) {
  const result = {}
  for (const { label, file } of ENTRIES) {
    const filePath = path.join(repoRoot, file)
    const exists = existsSync(filePath)
    result[`${label}BundleBytes`] = exists ? readFileSync(filePath).length : null
    result[`${label}BundleGzipBytes`] = exists ? gzipSync(readFileSync(filePath)).length : null
  }
  return result
}
