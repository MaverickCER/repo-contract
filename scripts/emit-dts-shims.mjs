// Writes thin re-export shims for the .d.ts/.d.cts files tsup doesn't
// generate for the bundled entry point. tsup's own dts pipeline
// (rollup-plugin-dts) hardcodes declarationMap: false and can't produce
// declaration maps -- see tsup.config.ts's `dts: false` comment and
// tsconfig.build.json. Real declarations (with working maps) are emitted
// separately by `tsc -p tsconfig.build.json` into dist/.dts/; this script
// just points package.json#exports's "." entry at the right file inside
// that tree.

import { writeFileSync, mkdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const ENTRIES = [
  { name: "index", dtsPath: "./.dts/index.js" },
  { name: "presets", dtsPath: "./.dts/presets/index.js" },
]

for (const { name, dtsPath } of ENTRIES) {
  const shim = `export * from "${dtsPath}";\n`
  const targetPath = path.join(root, "dist", name)
  mkdirSync(path.dirname(targetPath), { recursive: true })
  writeFileSync(`${targetPath}.d.ts`, shim, "utf8")
  writeFileSync(`${targetPath}.d.cts`, shim, "utf8")
  console.log(`[dts-shims] wrote dist/${name}.d.ts and dist/${name}.d.cts -> ${dtsPath}`)
}
