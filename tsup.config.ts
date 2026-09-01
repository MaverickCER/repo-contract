import { defineConfig } from "tsup"

// The bundle ships unminified -- esbuild's default pretty-printed output, with
// real line breaks and indentation -- so the published dist/ reads like the
// source and static analysers (Socket's `minifiedFile` alert, etc.) don't flag
// it. `dts: false` because declarations (with working declaration maps) are
// emitted separately by `tsc -p tsconfig.build.json` and shimmed into place by
// scripts/emit-dts-shims.mjs -- tsup's own dts pipeline can't produce
// declaration maps.
export default defineConfig({
  name: "index",
  entry: { index: "src/index.ts", presets: "src/presets/index.ts" },
  format: ["esm", "cjs"],
  // This package is Node-only by nature -- it spawns child processes, reads
  // process.env, and uses node:child_process/node:os throughout. There is no
  // isomorphic entry point to keep "neutral", unlike env-cap/data-cap.
  platform: "node",
  target: "node20",
  dts: false,
  sourcemap: true,
  treeshake: true,
  // cross-spawn is the package's one runtime dependency -- bundle only our
  // own source and let npm resolve it normally, rather than inlining a copy.
  // yaml is an optional peerDependency, dynamically imported only when a
  // check requests output.format:"yaml" -- it must never be inlined into
  // dist/index.js even though it's present in node_modules as a
  // devDependency for our own tests. Both marked external explicitly rather
  // than relying on tsup's implicit externalization of package.json
  // dependencies, since that behavior differs between esm/cjs output and
  // isn't worth trusting silently for a security-relevant boundary like this.
  external: ["cross-spawn", "yaml"],
})
