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
  entry: {
    index: "src/index.ts",
    presets: "src/presets/index.ts",
    helpers: "src/helpers/index.ts",
  },
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
  // repo-contract's root/presets entry points have zero runtime dependencies:
  // process spawning and ambient env access are consumer-supplied capabilities
  // (RepoContractConfig.spawn/env), not something this package imports itself
  // -- see
  // specs/decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md.
  // Neither `cross-spawn` nor any glob library is a dependency of this
  // package: `cross-spawn` is only a devDependency (used by scripts/npm-pack.mjs
  // and this repo's own tests), and exception-policy glob matching is the
  // hand-written, dependency-free src/helpers/glob-match.ts (see
  // specs/decisions/0017-own-glob-matcher-replaces-minimatch.md). The published
  // package therefore has zero runtime dependencies, so there is nothing to mark
  // external. (Format conversion -- e.g. YAML -- is deliberately not a core
  // concern of this package; see OutputFormat's own doc comment in src/types.ts.)
})
