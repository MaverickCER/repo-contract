import eslintComments from "@eslint-community/eslint-plugin-eslint-comments"
import js from "@eslint/js"
import rnxKit from "@rnx-kit/eslint-plugin"
import eslintConfigPrettier from "eslint-config-prettier/flat"
import boundaries from "eslint-plugin-boundaries"
import importXPlugin, { configs as importXConfigs } from "eslint-plugin-import-x"
import { configs as jsdocConfigs } from "eslint-plugin-jsdoc"
import n from "eslint-plugin-n"
import { configs as nodeDependenciesConfigs } from "eslint-plugin-node-dependencies"
import packageJson, { configs as packageJsonConfigs } from "eslint-plugin-package-json"
import secureCoding from "eslint-plugin-secure-coding"
import security from "eslint-plugin-security"
import toplevel from "eslint-plugin-toplevel"
import globals from "globals"
import tseslint from "typescript-eslint"
import requireStrykerRationale from "./eslint-rules/require-stryker-rationale.mjs"
import {
  NETWORK_CORE_MODULES,
  NETWORK_GLOBALS,
  NETWORK_THIRD_PARTY_PACKAGES,
  RESTRICTED_NAMED_IMPORTS,
} from "./scripts/security-network/network-surface.mjs"

// The eslint-plugin-security / eslint-plugin-secure-coding rule set applied to every one of this
// repository's source layers. `src/**` and `checks/**` take it verbatim. `scripts/**` /
// `eslint-rules/**` override one entry: `detect-non-literal-fs-filename` -> "off". Those are
// one-shot local tooling scripts that build paths from `import.meta`/`process.cwd()`, never network
// input (see that block's comment). One source of truth means the two scopes can differ only by an
// explicit override, not by drift.
const SECURITY_RULES = {
  ...secureCoding.configs.strict.rules,
  "secure-coding/detect-object-injection": "off",
  "security/detect-buffer-noassert": "error",
  "security/detect-child-process": "error",
  "security/detect-disable-mustache-escape": "error",
  "security/detect-eval-with-expression": "error",
  "security/detect-new-buffer": "error",
  "security/detect-no-csrf-before-method-override": "error",
  "security/detect-non-literal-fs-filename": "error",
  "security/detect-non-literal-regexp": "error",
  "security/detect-non-literal-require": "error",
  "security/detect-object-injection": "off",
  "security/detect-possible-timing-attacks": "error",
  "security/detect-pseudoRandomBytes": "error",
  "security/detect-unsafe-regex": "error",
  "security/detect-bidi-characters": "error",
}

/**
 * Scoped to this package's own source (src/, test/, checks/) plus root-level
 * scripts/config files. test/e2e/*\/fixtures/** are self-contained
 * throwaway consumer projects the package-acceptance test installs the
 * packed tarball into: not source, not linted here.
 */
export default tseslint.config(
  {
    ignores: [
      "dist",
      "coverage",
      "node_modules",
      "**/node_modules",
      "test/e2e/*/fixtures",
      // A throwaway local scratch dir for manually testing `repo-contract init` (see
      // GUIDE.md/README.md's Quick Start). It is never tracked (see .gitignore) and never source.
      // Its generated files (an arbitrary consumer's package.json/scripts/contract.mjs) fit no
      // element in this repo's module-boundary model.
      "temp",
      // examples/ is a self-contained npm workspace with its own package.json, tsconfig, and
      // ESLint/Prettier configs. It is a demonstration consumer of the published package (see
      // examples/README.md), not this package's source. It carries its own toolchain, and this
      // repo's CI and `npm run contract` never install, build, or run it. Linting it here would
      // fail `boundaries/no-unknown-files` (it fits no element model) for no benefit.
      "examples",
      // benchmarks/ is a standalone tooling tree that measures this package's internals directly.
      // It imports from src/ via relative paths and runs via tsx (see benchmarks/README.md). It is
      // not a curated consumer of the published public API. So it fits no element in this repo's
      // `boundaries` module-boundary model. The reasoning matches `examples` above, and
      // env-cap/data-cap exclude their analogous benchmark/benchmarks/ trees the same way. Prettier
      // still formats it like ordinary source (.prettierignore does NOT exclude it). Only this
      // repo's stricter TypeScript/boundaries lint rules are skipped.
      "benchmarks",
      // Stryker's scratch workspace: a full copy of the project tree it mutates and runs tests
      // against. It is never source, and its presence or absence between runs shouldn't affect lint
      // results.
      ".stryker-tmp",
      "reports",
      // TypeDoc's generated HTML API reference (`npm run docs:api`). It is gitignored and never
      // committed (see .gitignore/RELEASING.md's "GitHub Pages" section). Unlike docs/script.js
      // below, it is entirely machine-generated. TypeDoc's default theme ships its own client-side
      // JS assets (docs/api/assets/{hierarchy,icons,main,navigation,search}.js). None of them fit
      // this repo's module-boundary model or were hand-authored here.
      "docs/api",
      // Tooling-owned data, not source. api-contract/ holds one subdirectory per ApiContract target
      // (index/, presets/, helpers/). Each holds API-Extractor-backed snapshots of src/'s public
      // surface. baseline.* is committed as the compatibility diffing target; current.* is
      // regenerated every run. `eslint --fix` rewriting baseline.* would corrupt that diff.
      // internal-package-contract's scripts/api-contract/baseline-store.ts now owns this engine.
      // exceptions/ holds the reviewed-exception registries. They include this repository's
      // disable-comments.json suppression registry, which scripts/suppression-governance/check.ts
      // serializes deterministically, not by hand.
      ".repo-contract",
      // A static, zero-logic legacy-module-resolution compatibility shim for the `./presets`
      // subpath export (see
      // specs/decisions/0004-public-surface-stays-narrow-no-cli-experimental-presets.md). It is not
      // TypeScript or source in any sense `boundaries`'s element model applies to. It is never
      // hand-edited after its initial creation.
      "presets/package.json",
      // Same shim, same reasoning, for the `./helpers` subpath (see
      // specs/decisions/0013-reusable-exception-policy-helper.md).
      "helpers/package.json",
      // Same shim, same reasoning, for the `./affected` subpath.
      "affected/package.json",
      // Same shim, same reasoning, for the `./metrics` subpath.
      "metrics/package.json",
      // docs/ is the published static site (docs/index.html), not a TypeScript/source layer covered
      // by the module-boundary model (`boundaries/elements` below). Its one plain-JS asset,
      // docs/script.js, runs in the browser against browser globals this config never defines. It
      // has no dependency edges for `boundaries` to police either way.
      "docs/script.js",
    ],
  },
  {
    // eslint-plugin-boundaries enforces this repository's module-boundary invariants as ESLint
    // diagnostics. The separate `architecture` check (.dependency-cruiser.cjs) covers only `src/**`
    // and runs out-of-band via `npm run test:architecture`. Here a violation is a red squiggle
    // while typing, not something that surfaces only on the next full verification run.
    //
    // Every element/file pattern below deliberately covers the *entire* surface every `files:`
    // block in this config lints. `boundaries/no-unknown-files` and
    // `boundaries/no-unknown-dependencies` below are both "error". So any new file or import target
    // outside an existing pattern fails lint immediately instead of going unclassified. That keeps
    // this coverage complete as the repository grows, not merely accurate on the day it was
    // written.
    //
    // This codebase imports `.ts` sources via `../foo.js`-style specifiers (their compiled `.js`
    // extension). Resolving those to their `.ts` files needs a TypeScript-aware resolver; plain
    // Node/ESLint resolution can't do it. Without one, every element/dependency classification
    // below would degrade to "unresolvable". `import/resolver: { typescript }` (from
    // eslint-import-resolver-typescript) provides that resolution; `eslint-plugin-boundaries`
    // consumes it.
    plugins: { boundaries },
    settings: {
      "boundaries/root-path": import.meta.dirname,
      "import/resolver": {
        typescript: { alwaysTryTypes: true },
      },
      "boundaries/elements": [
        // The layered src/ pipeline documented in
        // specs/architecture.md#module-boundaries and enforced today by
        // .dependency-cruiser.cjs, mirrored here.
        { type: "config", pattern: "src/config" },
        { type: "execution", pattern: "src/execution" },
        { type: "evidence", pattern: "src/evidence" },
        // Not named in specs/architecture.md's module-boundaries diagram or in
        // .dependency-cruiser.cjs, but real. src/parsing/ is a foundational leaf: only
        // src/evidence/ consumes it, and it depends only on src/types.ts and src/errors.ts. Same
        // shape as src/config/, so it gets the same "must not depend on the layers built on top of
        // it" policy below.
        { type: "parsing", pattern: "src/parsing" },
        // Hand-vendored, pure-type Standard Schema interface
        // (specs/decisions/0012-hand-vendored-standard-schema-support-for-optional-output-validation.md):
        // It is the most foundational leaf of all: it has zero imports, and src/types.ts,
        // src/index.ts and src/parsing consume it.
        { type: "standard-schema", pattern: "src/standard-schema" },
        { type: "policy", pattern: "src/policy" },
        // src/report/: pure renderers over a finished run (Markdown summary, stored JSON). Reached only
        // through src/index.ts; imports types only, so it cannot influence a run it reports on.
        { type: "report", pattern: "src/report" },
        // src/presets/ (including src/presets/shared/) is production code like every other layer
        // above, but architecturally different. It is a second, independent public barrel
        // (src/presets/index.ts), not an internal layer reachable only through src/index.ts. So the
        // root-config policy below deliberately does NOT list "presets" among the layers
        // root-config must reach only through src/index.ts.
        { type: "presets", pattern: "src/presets" },
        // src/helpers/ is a third, independent public barrel (src/helpers/index.ts), published
        // under its own `./helpers` subpath. It has the same architectural shape as src/presets/
        // above (see specs/decisions/0013-reusable-exception-policy-helper.md), not an internal
        // layer reachable only through src/index.ts.
        { type: "helpers", pattern: "src/helpers" },
        // src/affected/ is a fourth independent public barrel (src/affected/index.ts), published
        // under `./affected`. It is pure analysis over data and injected capabilities: it spawns
        // nothing and reads nothing. So like src/helpers/ it is not an internal layer.
        { type: "affected", pattern: "src/affected" },
        // src/metrics/ is a fifth independent public barrel (src/metrics/index.ts), published under
        // `./metrics`: pure record keeping and summaries over supplied data.
        { type: "metrics", pattern: "src/metrics" },
        // checks/ (including checks/shared/), scripts/ (including its
        // suppression-governance/architecture/adr-governance subdirectories), and eslint-rules/ are
        // each one architectural unit. None needs a finer internal boundary than "the whole tree
        // participates in the policies below".
        { type: "checks", pattern: "checks" },
        { type: "scripts", pattern: "scripts" },
        // bin/repo-contract.mjs: the one published executable surface (see
        // specs/decisions/0004-public-surface-stays-narrow-no-cli-experimental-presets.md's
        // 2026-09-09 amendment). It is hand-written and unbundled, and imports nothing from src/.
        // That amendment's ambient-capability constraints forbid such imports. The default "allow"
        // below is fine as-is; this entry only exists so boundaries/no-unknown-files doesn't reject
        // it.
        { type: "bin", pattern: "bin" },
        { type: "eslint-rules", pattern: "eslint-rules" },
        { type: "test", pattern: "test" },
      ],
      "boundaries/files": [
        // src/index.ts, src/types.ts, src/errors.ts, src/run-repo-contract.ts: the four files
        // directly in src/ rather than in a layer folder above. They are classified by file
        // category, not element type. eslint-plugin-boundaries elements are always folder-based,
        // and these are standalone files.
        { category: "src-root", pattern: "src/*.ts" },
        // Every root-level tool config file this repository has today. The glob also covers any
        // future `*.config.ts`/`*.config.mjs` sibling, with no change needed here. package.json
        // joins them too: it's linted now (see the package-json/node-dependencies blocks below). It
        // has no import statements for `boundaries/dependencies` to police. But
        // `boundaries/no-unknown-files` still requires every non-ignored file to classify as
        // *something*.
        {
          category: "root-config",
          pattern: [
            "*.config.ts",
            "*.config.mjs",
            ".dependency-cruiser.cjs",
            "eslint.config.js",
            "package.json",
          ],
        },
        // The one legitimate import of compiled output by source in this repository.
        // scripts/run-contract.mjs dogfoods the built package (`precontract` runs `npm run build`
        // first) rather than its TypeScript source. dist/ itself is never linted (see `ignores`
        // above). This only classifies it as a known dependency target, so that one edge doesn't
        // trip `boundaries/no-unknown-dependencies`.
        { category: "build-output", pattern: "dist/**" },
      ],
    },
    rules: {
      "boundaries/no-unknown-files": "error",
      "boundaries/no-unknown-dependencies": "error",
      "boundaries/dependencies": [
        "error",
        {
          default: "allow",
          policies: [
            {
              from: { element: { type: "execution" } },
              disallow: { to: { element: { types: { anyOf: ["evidence", "policy"] } } } },
              message:
                "src/execution must not import src/evidence or src/policy -- ADR 0001 requires execution and policy evaluation to stay strictly phased.",
            },
            {
              from: { element: { type: "config" } },
              disallow: {
                to: { element: { types: { anyOf: ["execution", "evidence", "policy"] } } },
              },
              message:
                "src/config is the most foundational layer and must not depend on execution, evidence, or policy.",
            },
            {
              from: { element: { type: "parsing" } },
              disallow: {
                to: {
                  element: { types: { anyOf: ["config", "execution", "evidence", "policy"] } },
                },
              },
              message:
                "src/parsing is a foundational leaf (see its element definition above) and must not depend on config, execution, evidence, or policy.",
            },
            {
              from: { element: { type: "standard-schema" } },
              disallow: {
                to: {
                  element: {
                    types: { anyOf: ["config", "execution", "evidence", "parsing", "policy"] },
                  },
                },
              },
              message:
                "src/standard-schema is a hand-vendored, dependency-free leaf (see its element definition above) and must not depend on config, execution, evidence, parsing, or policy.",
            },
            {
              from: { element: { type: "presets" } },
              disallow: {
                to: { element: { types: { anyOf: ["execution", "evidence", "policy"] } } },
              },
              message:
                "src/presets defines plain check configs (run + policy over already-parsed evidence) and must not depend on the runtime layers that consume them -- execution, evidence, or policy.",
            },
            {
              from: { element: { type: "helpers" } },
              disallow: {
                to: { element: { types: { anyOf: ["execution", "evidence", "policy"] } } },
              },
              message:
                "src/helpers is a second, independent published barrel (repo-contract/helpers) and must not depend on the runtime layers that consume checks -- execution, evidence, or policy.",
            },
            {
              from: { element: { type: "metrics" } },
              disallow: {
                to: { element: { types: { anyOf: ["execution", "evidence", "policy"] } } },
              },
              message:
                "src/metrics is a fifth, independent published barrel (repo-contract/metrics) -- pure record keeping over supplied data -- and must not depend on the runtime layers that consume checks -- execution, evidence, or policy.",
            },
            {
              from: { element: { type: "affected" } },
              disallow: {
                to: { element: { types: { anyOf: ["execution", "evidence", "policy"] } } },
              },
              message:
                "src/affected is a fourth, independent published barrel (repo-contract/affected) -- pure analysis over supplied data -- and must not depend on the runtime layers that consume checks -- execution, evidence, or policy.",
            },
            {
              from: [
                {
                  element: {
                    types: {
                      anyOf: [
                        "config",
                        "execution",
                        "evidence",
                        "parsing",
                        "policy",
                        "presets",
                        "helpers",
                        "affected",
                        "metrics",
                        "standard-schema",
                      ],
                    },
                  },
                },
                { file: { categories: "src-root" } },
              ],
              disallow: {
                to: {
                  element: { types: { anyOf: ["checks", "scripts", "eslint-rules", "test"] } },
                },
              },
              message:
                "src/ is production code; it must never depend on checks/, scripts/, eslint-rules/, or test/ (generalizes .dependency-cruiser.cjs's src-must-not-import-scripts rule to every non-src directory).",
            },
            {
              from: { file: { categories: "root-config" } },
              disallow: {
                to: {
                  element: {
                    types: {
                      anyOf: [
                        "config",
                        "execution",
                        "evidence",
                        "parsing",
                        "policy",
                        "standard-schema",
                      ],
                    },
                  },
                },
              },
              message:
                "Only src/index.ts -- this package's curated public barrel -- may be imported from outside src/; reach its internals through it, never directly (specs/architecture.md#module-boundaries).",
            },
            {
              from: [
                { element: { types: { anyOf: ["checks", "scripts", "eslint-rules"] } } },
                { file: { categories: "root-config" } },
              ],
              disallow: { to: { element: { type: "test" } } },
              message:
                "checks/, scripts/, eslint-rules/, and root config files are consumed by test/ (and by each other); none of them may depend on test/ itself.",
            },
            {
              from: { element: { type: "scripts" } },
              disallow: { to: { element: { type: "checks" } } },
              message:
                "scripts/ is lower-level tooling that checks/ builds on -- checks/ -> scripts/ is the only allowed direction between them.",
            },
            {
              // Mirrors the root-config policy above ("Only src/index.ts... may be imported from
              // outside src/"). It also mirrors .dependency-cruiser.cjs's
              // checks-and-scripts-must-not-import-src-internals rule. checks/ and scripts/ are
              // equally outside src/. So they must reach it only through src/index.ts or the
              // public-ish surfaces already reachable directly: the four src-root files,
              // src/presets/, and src/helpers/. Never through an internal layer.
              from: { element: { types: { anyOf: ["checks", "scripts"] } } },
              disallow: {
                to: {
                  element: {
                    types: {
                      anyOf: [
                        "config",
                        "execution",
                        "evidence",
                        "parsing",
                        "policy",
                        "standard-schema",
                      ],
                    },
                  },
                },
              },
              message:
                "checks/ and scripts/ must reach src/ only through src/index.ts (its curated public barrel), src/types.ts/src/errors.ts, src/presets/, or src/helpers/ -- never an internal layer (config/execution/evidence/parsing/policy/standard-schema) directly (specs/architecture.md#module-boundaries).",
            },
          ],
        },
      ],
    },
  },
  // package.json itself, checked by two complementary plugins: package-json (field
  // validity/shape/ordering) and node-dependencies (dependency version-range/semver hygiene). Both
  // ship their own languageOptions (a JSON-aware parser) in their exported flat configs. So those
  // configs are spread wholesale rather than copying only `.rules`. Losing the parser would
  // silently stop these from linting JSON at all.
  {
    ...packageJsonConfigs.recommended,
    files: ["package.json"],
  },
  {
    files: ["package.json"],
    plugins: { "package-json": packageJson },
    rules: packageJsonConfigs.stylistic.rules,
  },
  ...nodeDependenciesConfigs["flat/recommended"],
  // The original eslint-plugin-eslint-comments (last released 2021) calls the removed
  // `context.getSourceCode()` API and crashes under ESLint 10. Its actively maintained successor is
  // @eslint-community/eslint-plugin-eslint-comments (same rule set, same authors' org). It is
  // registered under the shorter `eslint-comments/*` rule namespace rather than its default
  // `@eslint-community/eslint-comments/*` prefix. The 7 rules below are every rule except two, all
  // at "error". `no-restricted-disable` is a no-op without an explicit restricted-rules list, which
  // this repo has no use for. `no-use` forbids every disable comment outright: opinion rather than
  // hygiene. It conflicts with this repo's pattern of precise, justified inline suppressions, e.g.
  // `local/require-stryker-rationale` above.
  {
    files: [
      "src/**/*.ts",
      "test/**/*.ts",
      "checks/**/*.ts",
      "scripts/**/*.ts",
      "scripts/**/*.mjs",
      "eslint-rules/**/*.mjs",
      "stryker.config.mjs",
      "eslint.config.js",
      "*.config.ts",
      "repo-contract.config.ts",
    ],
    plugins: { "eslint-comments": eslintComments },
    rules: {
      "eslint-comments/disable-enable-pair": "error",
      "eslint-comments/no-aggregating-enable": "error",
      "eslint-comments/no-duplicate-disable": "error",
      "eslint-comments/no-unlimited-disable": "error",
      "eslint-comments/no-unused-disable": "error",
      "eslint-comments/no-unused-enable": "error",
      "eslint-comments/require-description": "error",
    },
  },
  {
    // TypeScript-parsed first-party sources. import-x's `configs.typescript` turns `import-x/named`
    // off here, because a type-checked TS build catches a bad named import more precisely than
    // syntactic analysis. It also points the resolver at eslint-import-resolver-typescript.
    // `boundaries` above depends on the same resolver to follow this repo's
    // `.js`-extension-importing-`.ts`-source convention.
    files: [
      "src/**/*.ts",
      "test/**/*.ts",
      "checks/**/*.ts",
      "scripts/**/*.ts",
      "*.config.ts",
      "repo-contract.config.ts",
    ],
    plugins: { "import-x": importXPlugin },
    settings: {
      ...importXConfigs.typescript.settings,
      "import-x/resolver": { typescript: { alwaysTryTypes: true } },
    },
    rules: {
      ...importXConfigs.recommended.rules,
      ...importXConfigs.typescript.rules,
      "import-x/no-named-as-default": "error",
      "import-x/no-named-as-default-member": "error",
      "import-x/no-duplicates": "error",
    },
  },
  {
    // fast-check's documented usage is `import fc from "fast-check"` followed by property access:
    // `fc.integer()`, `fc.property()`, `fc.assert()`, etc. Every one of those is *also* a named
    // export. That is the ambiguous shape `no-named-as-default-member` exists to flag elsewhere.
    // Here it's not a mistaken import: every property test follows the library's convention. So the
    // rule is off for this directory alone, rather than rewriting tests against upstream's docs.
    files: ["test/property/**/*.ts"],
    plugins: { "import-x": importXPlugin },
    rules: {
      "import-x/no-named-as-default-member": "off",
    },
  },
  {
    // Plain ESM scripts import-x can resolve with plain Node resolution:
    // no TS build to defer to, so `import-x/named` stays on here.
    files: [
      "scripts/**/*.mjs",
      "eslint-rules/**/*.mjs",
      "stryker.config.mjs",
      "commitlint.config.mjs",
      "eslint.config.js",
    ],
    plugins: { "import-x": importXPlugin },
    rules: {
      ...importXConfigs.recommended.rules,
      "import-x/no-named-as-default": "error",
      "import-x/no-named-as-default-member": "error",
      "import-x/no-duplicates": "error",
    },
  },
  {
    // eslint-plugin-n's `flat/all` config (every rule it ships, all "error") rather than
    // `flat/recommended`. Its Node-specific correctness and forward-compat checks apply equally to
    // library source, tests, and tooling scripts. `no-missing-import` is off. eslint-plugin-n's
    // resolver produces false positives on existing files throughout this repo, e.g.
    // checks/coverage.ts's relative import of scripts/coverage-thresholds.mjs. This package's root
    // `package.json#exports` map appears to leak into how the resolver treats plain relative
    // imports. That map curates only the *published* subpaths, not every internal relative import.
    // import-x's `no-unresolved` (see the import-x blocks above) covers the same "does this import
    // target exist" concern without the false positives.
    files: [
      "src/**/*.ts",
      "test/**/*.ts",
      "checks/**/*.ts",
      "scripts/**/*.ts",
      "scripts/**/*.mjs",
      "eslint-rules/**/*.mjs",
      "stryker.config.mjs",
      "eslint.config.js",
      "*.config.ts",
      "repo-contract.config.ts",
    ],
    ...n.configs["flat/all"],
    rules: {
      ...n.configs["flat/all"].rules,
      "n/no-missing-import": "off",
    },
  },
  {
    // `src/**` ships as published source (package.json's `files`: see the "src" entry's comment
    // there). So a *runtime* devDependency import there would be a defect `no-unpublished-import`
    // should keep catching. `ignoreTypeImport` narrows that to runtime imports. Line 1 of
    // src/presets/shared/vitest-json-policy.ts has `import type ... from "vitest/reporters"`. The
    // TypeScript compiler erases it entirely (confirmed:
    // `grep vitest dist/presets.d.ts dist/presets.d.cts` -> 0 hits). It never becomes a dependency
    // on the devDependency-only `vitest` package. `.dependency-cruiser.cjs`'s not-to-dev-dep rule
    // grants the same "type-only dependencies are not a problem" exemption.
    files: ["src/**/*.ts"],
    rules: {
      "n/no-unpublished-import": ["error", { ignoreTypeImport: true }],
    },
  },
  {
    // `no-unsupported-features/node-builtins` checks usages against this package's published
    // `engines.node` floor (>=22.0.0). That is right for src/ and test/, which run under that
    // floor. It is wrong for these files, because none of them ship. (package.json's `files`
    // allowlist names the barrel directories, bin, dist, schemas, src and the Markdown docs.) Their
    // runtime is whatever Node the contributor's machine or CI job uses: Node 24 in CI.
    files: [
      "checks/**/*.ts",
      "scripts/**/*.ts",
      "scripts/**/*.mjs",
      "eslint-rules/**/*.mjs",
      "stryker.config.mjs",
      "eslint.config.js",
      "*.config.ts",
      "repo-contract.config.ts",
    ],
    plugins: { n },
    rules: {
      "n/no-unsupported-features/node-builtins": "off",
    },
  },
  {
    // Both flagged for the same reason. `composeSignals` in src/execution/abort-signals.ts
    // feature-detects `AbortSignal.any` (`typeof AbortSignal.any === "function"`). It was added in
    // Node 20.3, after the Node 20 floor this package once had. Where it's absent, composeSignals
    // falls back to a manual composition. The fallback stays so it keeps its tests (see that file's
    // doc comment). Its own test and two others deliberately delete and restore `AbortSignal.any`
    // to exercise that branch. The two others are spawn-check.test.ts's "disposes its composed
    // abort signal" test and run-checks.test.ts's "disposes the composed run signal..." test. Each
    // needs the fallback forced to get an observable dispose() to assert on. runChecks composes
    // hostAbortController's signal with a caller-supplied options.signal. spawnCheck composes
    // runSignal with its timeout signal the same way. The rule can't see the guard, only the bare
    // `AbortSignal.any` syntax. It would otherwise flag the code this package wrote to handle the
    // version gap safely.
    files: [
      "src/execution/abort-signals.ts",
      "test/unit/execution/abort-signals.test.ts",
      "test/unit/execution/spawn-check.test.ts",
      "test/unit/execution/run-checks.test.ts",
    ],
    plugins: { n },
    rules: {
      "n/no-unsupported-features/node-builtins": "off",
    },
  },
  {
    // no-sync/no-process-exit/no-process-env are off for CLI tooling scripts and tests. Their
    // rationales: don't block an event loop other work depends on; don't hard-exit code a caller
    // might want to catch; don't read ambient env instead of explicit config. None applies to a
    // one-shot script that IS the whole process for a single `npm run` invocation. None applies to
    // test setup/teardown code either. `no-process-exit` in particular is how
    // scripts/run-mutation.mjs and scripts/run-test-category.mjs propagate a spawned child's exit
    // code. They do it from inside an `"exit"` event callback, where `throw` can't.
    files: ["scripts/**/*.mjs", "scripts/**/*.ts", "test/**/*.ts"],
    plugins: { n },
    rules: {
      "n/no-sync": "off",
      "n/no-process-exit": "off",
      "n/no-process-env": "off",
    },
  },
  {
    // Security-focused static analysis, scoped to production and tooling code, not test/. It
    // combines secure-coding's `strict` config (its widest rule set) and eslint-plugin-security.
    // The latter's rules all default to "warn" and are raised to "error" here. Tests for this
    // repo's execution layer deliberately construct the shapes these rules catch (spawned commands,
    // dynamic regexes). They are fixtures asserting this package rejects or handles them safely.
    // Flagging that intent as the vulnerability would be a false positive on the tests that prove
    // it is handled.
    //
    // `detect-object-injection` (both plugins' variant) is off everywhere. Each of its ~30 hits
    // across this repo falls in one of two groups. Some are numeric array indexes
    // (`results[index]`, `argv[i + 1]`, `dependents[depIndex]`). They are never string-keyed, so no
    // `__proto__`/`constructor`-style prototype-pollution vector exists. Others are string keys
    // validated moments earlier (`checks[checkId]` after `if (!check) throw`, `total[metric]`
    // iterating `Object.entries` of the same object). Both are the rule's well-known false-positive
    // category. It flags any computed member expression, whether the key is a `number` or an
    // attacker-influenced `string`. This codebase already carries per-site invariant comments
    // (search `noUncheckedIndexedAccess`) explaining why each read is safe. Duplicating that as ~30
    // near-identical disable comments would be noise, not rigor.
    files: ["src/**/*.ts", "checks/**/*.ts"],
    plugins: { "secure-coding": secureCoding, security },
    rules: SECURITY_RULES,
  },
  {
    // Same rule set as the src/checks block above, except `detect-non-literal-fs-filename` is also
    // off. Every hit under scripts/ builds its path from `path.join(root, ...)`. `root` comes from
    // `import.meta.url` (this repo's directory) or a caller-supplied root threaded through internal
    // function calls. It never comes from network/request input, which is the vulnerability this
    // rule exists to catch. These are one-shot local tooling scripts (build the package, generate a
    // schema, diff against a base branch), not a service accepting untrusted filenames.
    files: ["scripts/**/*.ts", "scripts/**/*.mjs", "eslint-rules/**/*.mjs"],
    plugins: { "secure-coding": secureCoding, security },
    rules: {
      ...SECURITY_RULES,
      // One-shot local tooling: paths come from `import.meta`/`process.cwd()`, never network input.
      "security/detect-non-literal-fs-filename": "off",
    },
  },
  {
    // Same narrow carve-out as the scripts/ block above, for the same reason, scoped to four files
    // in src/helpers/: load-exception-registry.ts, write-exception-registry.ts, file-cache-store.ts
    // and contract-logs.ts. The registry helpers
    // (specs/decisions/0013-reusable-exception-policy-helper.md) take a caller-supplied `path`: the
    // calling application's registry-file location, e.g. from its check config. contract-logs.ts
    // writes under the caller's `directory` option, inside the caller's `cwd`. They access these
    // paths via their `readFile`/`writeFile`/`rename`/`lstat` capabilities, defaulting to
    // `node:fs/promises`. That `path` sits on the same trusted-capability boundary that
    // `RepoContractConfig.spawn`/`env` establish (see
    // specs/decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md).
    // It is never derived from network/request input, which is the vulnerability this rule exists
    // to catch. Every other file under src/helpers/ keeps the rule at "error" (see the src/checks
    // block above). These files are the only structurally unavoidable exceptions, since their
    // published contract is "read/replace this caller-supplied path." This is not a
    // suppression-governance-tracked inline `eslint-disable`. The "security/*" domain's policy
    // (`suppressionPolicy.eslint.rules["security/*"]`) forbids exactly that. Instead, this is a
    // deliberate, narrowly scoped configuration decision, the same mechanism used for scripts/
    // above.
    files: [
      "src/helpers/load-exception-registry.ts",
      "src/helpers/write-exception-registry.ts",
      "src/helpers/contract-logs.ts",
      // The cache directory is the caller's (`.repo-contract/cache` by default). Every path inside
      // it is validated segment by segment: no `..`, absolute, drive or backslash form.
      "src/helpers/file-cache-store.ts",
    ],
    plugins: { "secure-coding": secureCoding, security },
    rules: {
      ...SECURITY_RULES,
      "security/detect-non-literal-fs-filename": "off",
    },
  },
  {
    // Development-time layer of the "no network calls" invariant (README's
    // Enterprise/locked-down-environments section, SECURITY.md). It is scoped to the TypeScript
    // under src/ only: the entire built/published surface (see package.json's "files"/exports).
    // checks/, scripts/, and test/ are never shipped and are out of this guarantee's scope. This is
    // layer one of two independent mechanisms. Layer two is scripts/security-network/scan.ts, an
    // AST-based scan run as its own repo-contract check (see checks/security-network.ts). It does
    // not invoke ESLint. So it still catches a violation even if this configuration were silently
    // weakened, or an eslint-disable comment suppressed it. See
    // specs/decisions/0007-no-network-surface.md for the full threat model and rationale.
    //
    // This block deliberately does NOT add a suppression-governance policy override for these two
    // rule names. The "eslint" domain's default policy already applies to any rule with no specific
    // entry (scripts/suppression-governance/policy-config.ts). It requires justification +
    // alternatives + remediation + category + verificationMethod. That is the "extremely obvious in
    // code review, and why" bar this invariant needs. It is not an unconditional ban: a preset that
    // needs network capability (e.g. a future health-check preset) should remain possible, but
    // never silent.
    files: ["src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            ...[...NETWORK_CORE_MODULES, ...NETWORK_THIRD_PARTY_PACKAGES].flatMap((name) => [
              {
                name,
                message: `"${name}" performs network I/O. repo-contract's src/ tree must never do so directly -- see SECURITY.md's network-free surface guarantee. A preset that genuinely needs this requires a fully justified disable-comments.json entry (scripts/suppression-governance/policy-config.ts's "eslint" default policy), not a silent import.`,
              },
              {
                name: `node:${name}`,
                message: `"node:${name}" performs network I/O. repo-contract's src/ tree must never do so directly -- see SECURITY.md's network-free surface guarantee. A preset that genuinely needs this requires a fully justified disable-comments.json entry (scripts/suppression-governance/policy-config.ts's "eslint" default policy), not a silent import.`,
              },
            ]),
            ...RESTRICTED_NAMED_IMPORTS.map(({ specifier, importedNames }) => ({
              name: specifier,
              importNames: importedNames,
              message: `Importing ${importedNames.join(", ")} from "${specifier}" can be used to synthesize a dynamic require() and load a network module by a computed string, bypassing this same rule's static specifier checks. repo-contract's src/ tree has never needed require()/createRequire anywhere -- see SECURITY.md's network-free surface guarantee.`,
            })),
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        ...NETWORK_GLOBALS.map((name) => ({
          name,
          message: `"${name}" performs network I/O. repo-contract's src/ tree must never do so directly -- see SECURITY.md's network-free surface guarantee. A preset that genuinely needs this requires a fully justified disable-comments.json entry (scripts/suppression-governance/policy-config.ts's "eslint" default policy), not a silent usage.`,
        })),
      ],
      // `no-restricted-globals` only matches a bare identifier reference (e.g. `fetch(...)`). It
      // cannot see `globalThis.fetch(...)`, the same capability reached through a property access.
      // `no-restricted-properties` closes that gap; both rules are needed to cover the
      // NETWORK_GLOBALS list. See scripts/security-network/scan.ts's `globalThis.<name>` handling
      // for the AST-scan layer's matching coverage.
      "no-restricted-properties": [
        "error",
        ...NETWORK_GLOBALS.map((name) => ({
          object: "globalThis",
          property: name,
          message: `"globalThis.${name}" performs network I/O. repo-contract's src/ tree must never do so directly -- see SECURITY.md's network-free surface guarantee. A preset that genuinely needs this requires a fully justified disable-comments.json entry (scripts/suppression-governance/policy-config.ts's "eslint" default policy), not a silent usage.`,
        })),
      ],
    },
  },
  {
    // @rnx-kit/eslint-plugin's six rules, registered directly rather than through its
    // `recommended`/`strict` configs. Those configs bundle a whole standalone React Native ESLint
    // setup: @eslint/js, typescript-eslint, and the @react-native plugin's `platform-colors` rule.
    // That would duplicate and fight this config's type-aware typescript-eslint setup. And React
    // Native is an ecosystem this Node CLI package has nothing to do with.
    files: ["src/**/*.ts", "test/**/*.ts", "checks/**/*.ts", "scripts/**/*.ts"],
    plugins: { "@rnx-kit": rnxKit },
    rules: {
      "@rnx-kit/no-const-enum": "error",
      "@rnx-kit/no-export-all": "error",
      "@rnx-kit/no-foreach-with-captured-variables": "error",
      "@rnx-kit/no-unnecessary-arrays": "error",
      "@rnx-kit/restricted-asset-imports": "error",
    },
  },
  {
    // `type-definitions-only` requires every top-level statement in a file to be a type
    // declaration. That is correct only for ambient declaration files. In this repo those are the
    // hand-written *.d.mts siblings of the .mjs files under scripts/, eslint-rules/ and bin/. (The
    // bin/ executables carry the eval ban in their own block near the end of this config.)
    files: ["scripts/**/*.d.mts", "eslint-rules/**/*.d.mts", "bin/**/*.d.mts"],
    plugins: { "@rnx-kit": rnxKit },
    rules: {
      "@rnx-kit/type-definitions-only": "error",
    },
  },
  {
    // no-toplevel-var is safe everywhere first-party code runs. It only forbids a declaration
    // keyword at module scope, whether or not the module also has legitimate top-level side
    // effects.
    files: [
      "src/**/*.ts",
      "test/**/*.ts",
      "checks/**/*.ts",
      "scripts/**/*.ts",
      "scripts/**/*.mjs",
      "eslint-rules/**/*.mjs",
      "stryker.config.mjs",
      "eslint.config.js",
      "*.config.ts",
      "repo-contract.config.ts",
    ],
    plugins: { toplevel },
    rules: {
      "toplevel/no-toplevel-var": "error",
    },
  },
  {
    // no-toplevel-let, by contrast, excludes test/**/*.ts and scripts/**/*.mjs. Every test file's
    // top-level fixture (`let root: string`, assigned inside `beforeEach` or reassigned across
    // tests) is the standard Vitest setup/teardown idiom. `const` can't express it without
    // restructuring the whole suite. The same goes for the CLI scripts' `let` variables, assigned
    // inside a top-level `try` block or accumulated across a loop (e.g. run-coverage.mjs's
    // `anyTestFailure`). A `const` cannot express either shape.
    files: [
      "src/**/*.ts",
      "checks/**/*.ts",
      "scripts/**/*.ts",
      "eslint-rules/**/*.mjs",
      "stryker.config.mjs",
      "eslint.config.js",
      "*.config.ts",
      "repo-contract.config.ts",
    ],
    plugins: { toplevel },
    rules: {
      "toplevel/no-toplevel-let": "error",
    },
  },
  {
    // no-toplevel-side-effect, by contrast, is scoped narrowly to src/, checks/, and
    // scripts/**/*.ts. Those are the layers where a bare top-level statement would be a real
    // import-time side effect. It is deliberately left off three groups. In test/**/*.ts, every
    // file's top-level `describe(...)` call is the correct, idiomatic Vitest shape, not a side
    // effect. scripts/**/*.mjs and eslint-rules/**/*.mjs are executable entrypoints whose purpose
    // is to run code at the top level when invoked. This rule can't flag the root *.config.ts /
    // *.config.mjs files anyway. Their `export default someBuilder(...)` shape is an
    // ExportDefaultDeclaration, a node type this rule doesn't listen for.
    files: ["src/**/*.ts", "checks/**/*.ts", "scripts/**/*.ts"],
    ignores: [
      // These scripts are dual-purpose: importable modules of functions (used by tests and by other
      // scripts/checks) that also run as standalone CLI entrypoints. The standard
      // `if (process.argv[1] && import.meta.url === pathToFileURL(...))` guard gates that: "only
      // run main when executed directly, not when imported". That is a top-level `IfStatement`, the
      // shape this rule exists to catch, but here it is the correct idiom rather than a smell.
      "scripts/adr-governance/check.ts",
      "scripts/coderabbitai/review.ts",
      "scripts/dead-code/check.ts",
      "scripts/openssf-scorecard/run.ts",
      "scripts/preset-commands/scan.ts",
      "scripts/sbom/run.ts",
      "scripts/security-network/scan.ts",
      "scripts/security-socket/scan.ts",
      "scripts/suppression-governance/check.ts",
    ],
    plugins: { toplevel },
    rules: {
      "toplevel/no-toplevel-side-effect": "error",
    },
  },
  {
    // jsdoc's TypeScript-flavored "error" preset. `no-types: error` bans redundant type annotations
    // inside JSDoc comments. This is a fully typed TS codebase: TS syntax is the single source of
    // truth for types, never a duplicate `{string}`-style JSDoc annotation. The preset still
    // requires and validates the rest of JSDoc's structural contract (params, descriptions, etc.
    // line up with the signature).
    ...jsdocConfigs["flat/recommended-typescript-error"],
    files: ["src/**/*.ts", "checks/**/*.ts", "scripts/**/*.ts"],
    rules: {
      ...jsdocConfigs["flat/recommended-typescript-error"].rules,
      // `check-tag-names`'s `typed: true` (the preset's default) treats
      // `@public`/`@private`/`@protected` as redundant with TypeScript's visibility keywords. That
      // is true for a class member. But here these tags serve a different purpose: API Extractor's
      // release-tag requirement on every exported symbol. (The tags are
      // `@alpha`/`@beta`/`@public`/`@internal`, per api-extractor.com's doc-model convention.)
      // TypeScript has no equivalent concept. `typed: false` keeps every other structural check
      // this rule performs (unknown tag names, etc.). Only the TS-redundancy opinion is off, since
      // it doesn't apply to this tag usage.
      "jsdoc/check-tag-names": ["error", { typed: false }],
    },
  },
  {
    files: ["src/**/*.ts", "test/**/*.ts"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Encodes "this package executes what it's told, never interprets
      // output as code" as something CI enforces, not just documents: see
      // SECURITY.md.
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      // TypeScript's own compiler already catches genuinely undefined
      // identifiers, more accurately than this base rule.
      "no-undef": "off",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/consistent-type-exports": "error",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/require-await": "off",
    },
  },
  {
    // `// Stryker disable` directives are only meaningful where stryker.config.mjs mutates
    // (`src/**/*.ts`). So this is scoped separately from the shared src+test block above, making
    // that scope explicit rather than incidental.
    files: ["src/**/*.ts"],
    plugins: { local: { rules: { "require-stryker-rationale": requireStrykerRationale } } },
    rules: {
      "local/require-stryker-rationale": "error",
    },
  },
  {
    // scripts/**/*.ts (e.g. scripts/suppression-governance/) is substantial logic, unlike the thin
    // .mjs wrapper scripts in scripts/ below. It gets the same type-aware strict linting src/ does.
    files: ["scripts/**/*.ts"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/consistent-type-exports": "error",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // stryker.config.mjs, commitlint.config.mjs and eslint.config.js are root-level, plain-ESM
    // config files. They have the same linting needs as scripts/**/*.mjs below: no type-aware
    // rules, only recommended JS rules against Node/ESM. So they share this block rather than
    // getting one each.
    files: [
      "scripts/**/*.mjs",
      "eslint-rules/**/*.mjs",
      "stryker.config.mjs",
      "commitlint.config.mjs",
      "eslint.config.js",
    ],
    extends: [js.configs.recommended],
    languageOptions: {
      parserOptions: { sourceType: "module" },
      globals: globals.node,
    },
  },
  {
    // dependency-cruiser loads this as CommonJS regardless of this package's `"type": "module"`.
    // The `.cjs` extension is load-bearing, not incidental. So this gets its own sourceType rather
    // than joining the ESM config-files block above.
    files: [".dependency-cruiser.cjs"],
    extends: [js.configs.recommended],
    languageOptions: {
      sourceType: "commonjs",
      globals: globals.node,
    },
  },
  {
    // Hand-written ambient declaration files for their sibling .mjs implementations in scripts/ and
    // eslint-rules/. They cover ts-json-schema-generator, the coverage-thresholds helper, and
    // require-stryker-rationale's rule module. All need types that JSDoc can't express cleanly in
    // plain .mjs. These are pure type declarations with no runtime code. They get the same
    // syntax-only treatment as the root *.config.ts block below, for the same reason: they are not
    // part of tsconfig.json's projectService-driven type checking.
    files: ["scripts/**/*.d.mts", "eslint-rules/**/*.d.mts", "bin/**/*.d.mts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
  },
  {
    // Root-level config files aren't part of tsconfig.json's `include` the way source is. So these
    // get syntax-only TS linting (no `projectService`, hence no type-aware rules) rather than
    // failing to resolve a TS project.
    // (`*.config.ts` already matches `repo-contract.config.ts`: no separate block for it).
    files: ["*.config.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
  },
  {
    // checks/**/*.ts holds the run/policy logic for each self-hosting check;
    // repo-contract.config.ts is only the assembly point. So it gets the same type-aware strict
    // linting src/ and scripts/ do.
    files: ["checks/**/*.ts"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/consistent-type-exports": "error",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // Preventive, across every type-aware layer: a `switch` over a union or
    // enum must handle every member or carry a `default`. Without it, adding a
    // member to `CheckStatus` / `OutputFormat` / a release-tag union leaves
    // existing switches silently falling through (the regression in
    // src/presets/shared/terminal-status.ts this was added for). Rules-only
    // block: `languageOptions`/plugins are merged in from the type-aware
    // blocks above that already match these same globs.
    files: ["src/**/*.ts", "checks/**/*.ts", "scripts/**/*.ts", "test/**/*.ts"],
    rules: {
      "@typescript-eslint/switch-exhaustiveness-check": [
        "error",
        { considerDefaultExhaustiveForUnions: true },
      ],
    },
  },
  {
    // The shipped executables. SECURITY.md promises no eval, no Function construction and no
    // dynamic code execution anywhere in the package. `src/` has these rules above. The published
    // `bin/` must carry the same ban, or the promise stops at the library.
    files: ["bin/**/*.mjs"],
    rules: {
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
    },
  },
  // Last on purpose: turns off every core/stylistic rule that would
  // otherwise fight Prettier's own formatting decisions.
  eslintConfigPrettier,
)
