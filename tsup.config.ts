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
  // This package is Node-only by nature -- it uses node:os/node:fs-promises
  // throughout, and its public types reference node:child_process (type-only,
  // erased at build time -- see below). There is no isomorphic entry point to
  // keep "neutral", unlike env-cap/data-cap.
  platform: "node",
  target: "node20",
  dts: false,
  sourcemap: true,
  treeshake: true,
  // repo-contract has zero runtime dependencies: process spawning and ambient
  // env access are consumer-supplied capabilities (RepoContractConfig.spawn/env),
  // not something this package imports itself -- see
  // specs/decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md.
  // `cross-spawn` is not a dependency of this package at all anymore (only a
  // devDependency, used by scripts/npm-pack.mjs and this repo's own tests);
  // it never appears in src/'s import graph, so there's nothing to mark
  // external for it. yaml remains an optional peerDependency, dynamically
  // imported only when a check requests output.format:"yaml" -- it must
  // never be inlined into dist/index.js even though it's present in
  // node_modules as a devDependency for our own tests, so it's marked
  // external explicitly rather than relying on tsup's implicit
  // externalization of package.json dependencies, since that behavior
  // differs between esm/cjs output and isn't worth trusting silently for a
  // security-relevant boundary like this.
  external: ["yaml"],
})
