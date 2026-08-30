// Single source of truth for the "no network calls" invariant's threat
// model (README's Enterprise/locked-down-environments section, SECURITY.md)
// -- imported directly by eslint.config.js (development-time enforcement)
// and by scripts/security-network/scan.ts (the independent, AST-based
// repository check), the same "one shared data module, two independent
// consumers" shape as scripts/coverage-thresholds.mjs. Kept as plain data
// (no logic) so neither consumer can silently diverge from the other on
// *what* is banned, only on *how* each detects it.
//
// Scope: src/**/*.ts only -- the entire built/published surface (see
// package.json's "files"/exports; `npm pack --dry-run` confirms dist/ is
// built from nothing else). checks/, scripts/, test/, and this file's own
// directory are repository-internal tooling, never shipped, and
// legitimately may need things this list forbids (e.g. this very script
// spawns tsx via child_process, and scripts/api-contract's tooling reads
// files by dynamic path) -- see specs/decisions/0007-no-network-surface.md
// for the full threat model and why it stops at this boundary.

/**
 * Node core network modules, both `node:`-prefixed and bare forms (Node
 * resolves both identically) -- direct network I/O capability built into
 * the runtime, reachable with zero new dependencies.
 */
export const NETWORK_CORE_MODULES = [
  "http",
  "https",
  "http2",
  "net",
  "tls",
  "dgram",
  "dns",
  "dns/promises",
]

/**
 * Third-party packages whose entire purpose is making network requests.
 * None of these are current dependencies (see package.json) -- banning the
 * import specifier is a zero-cost, defense-in-depth measure against a
 * future PR that both adds one of these as a dependency and imports it in
 * src/ in the same change. Deliberately not exhaustive (there is no bound
 * on how many HTTP-client packages exist on npm): this list covers the
 * well-known, commonly-reached-for ones. A genuinely novel network package
 * this list doesn't name would still need to be added as a new runtime
 * dependency first -- itself a highly visible, reviewable package.json
 * diff -- before it could be imported at all.
 */
export const NETWORK_THIRD_PARTY_PACKAGES = [
  "undici",
  "ws",
  "axios",
  "node-fetch",
  "got",
  "superagent",
  "request",
  "cross-fetch",
  "isomorphic-fetch",
]

/**
 * Named exports that, once imported, can be used to construct network (or
 * arbitrary CommonJS) capability indirectly -- `createRequire` in
 * particular is how ESM code can synthesize a `require()` and load a
 * network module by a computed string, bypassing a plain module-specifier
 * check entirely. Banning the import of `createRequire` itself (from either
 * specifier Node accepts) closes that path at its only real chokepoint:
 * repo-contract's src/ has never used `require`/`createRequire` anywhere
 * (confirmed: `grep -rn "createRequire|require(" src/` returns nothing),
 * so this costs nothing today. scan.ts enforces this across every form that
 * exposes the module object -- a static named import, a namespace or default
 * import, a dynamic `import("node:module")`, an `import x = require(...)`,
 * and a bare `require("module")` -- not only the static named-import form.
 */
export const RESTRICTED_NAMED_IMPORTS = [
  { specifier: "node:module", importedNames: ["createRequire"] },
  { specifier: "module", importedNames: ["createRequire"] },
]

/**
 * Global, import-free network capability available in this package's
 * supported Node runtime (engines.node >=20 -- `fetch` has been a stable
 * global since Node 18, `WebSocket` since Node 22, and `EventSource` is a
 * Node global too: added behind `--experimental-eventsource` in Node 22.3
 * and exposed by default on the newer lines this repository's own toolchain
 * runs on. It is real, undici-backed network capability in the runtime this
 * guarantee is about, so it belongs here alongside `fetch`/`WebSocket`).
 * Genuinely browser-only globals (`XMLHttpRequest`, `navigator.sendBeacon`)
 * stay excluded: this package has no browser build target (tsup builds only
 * for `target: "node20"`; package.json has no `browser` field), so those
 * APIs cannot exist in the runtime this guarantee is about -- banning them
 * would be theatrical, not defensive.
 */
export const NETWORK_GLOBALS = ["fetch", "WebSocket", "EventSource"]

/**
 * For every command a published preset is allowed to spawn: a direct link
 * to that command's own documentation, and the specific thing a reviewer
 * adding or re-reviewing this entry must check there -- not "is this tool
 * safe" in the abstract (unanswerable; repo-contract never bundles these
 * tools, a consumer installs and trusts each one separately, and nothing
 * here can see what's actually on PATH when a preset runs -- `run: ["attw",
 * ...]` and a hypothetical `run: ["curl", ...]` are equally unverified at
 * the binary level), but a concrete question that command's own
 * documentation actually answers. This is the record CODE_REVIEW.md's
 * Security-boundary review section points reviewers at when this list
 * changes. See specs/decisions/0007-no-network-surface.md's Decision
 * section for the full reasoning on what this list does and doesn't
 * establish.
 */
export const PRESET_COMMAND_REVIEW = [
  {
    command: "attw",
    docs: "https://arethetypeswrong.github.io/",
    reviewFor:
      "Determine from the documentation what network requests this command makes and under what conditions, and whether `--pack` (or any other flag) executes a script from the package under analysis rather than only inspecting it.",
  },
  {
    command: "commitlint",
    docs: "https://commitlint.js.org/",
    reviewFor:
      "Determine from the documentation whether commitlint's config resolution (`extends`, shareable configs) can load a config from a remote source, and what a loaded parser/plugin is able to execute.",
  },
  {
    command: "linkinator",
    docs: "https://github.com/JustinBeckwith/linkinator#readme",
    reviewFor:
      "Determine from the documentation exactly what `--recurse` causes this command to request, and whether any flag (used here or not) causes it to send data anywhere rather than only request URLs.",
  },
  {
    command: "knip",
    docs: "https://knip.dev/",
    reviewFor:
      "Determine from the documentation whether a knip plugin or reporter can load and execute code from outside this repository, and what `--reporter-options` can route a reporter to do with its data.",
  },
  {
    command: "jscpd",
    docs: "https://jscpd.dev/",
    reviewFor:
      "Determine from the documentation what each available reporter does with its output, and whether any reporter (used here or not) sends data anywhere other than the local `--output` path.",
  },
  {
    command: "prettier",
    docs: "https://prettier.io/docs/",
    reviewFor:
      "Determine from the documentation whether prettier's plugin resolution can load a plugin from a network source, and what a loaded plugin is able to execute.",
  },
  {
    command: "playwright",
    docs: "https://playwright.dev/docs/test-cli",
    reviewFor:
      "Determine, from the actual test suite this command runs (not the tool's documentation alone), which URLs/origins it navigates to, and whether any of them is a live remote origin rather than a local server/fixture.",
  },
  {
    command: "publint",
    docs: "https://publint.dev/",
    reviewFor:
      "Determine from the documentation whether any option queries the npm registry or another remote source beyond the local packed contents.",
  },
  {
    command: "markdownlint-cli2",
    docs: "https://github.com/DavidAnson/markdownlint-cli2#readme",
    reviewFor:
      "Determine from the documentation whether a custom rule this repository's config loads can execute code with capabilities beyond linting Markdown text, and where such a rule could be loaded from.",
  },
  {
    command: "licensee",
    docs: "https://github.com/jslicense/licensee.js#readme",
    reviewFor:
      "Determine from the documentation whether any option queries a remote license database, versus resolving license text only from each package's own local metadata.",
  },
  {
    command: "vitest",
    docs: "https://vitest.dev/",
    reviewFor:
      "Determine, from the actual test files this command runs (not the tool's documentation alone), whether any of them performs a real network call rather than only exercising code in-process.",
  },
  {
    command: "eslint",
    docs: "https://eslint.org/docs/latest/",
    reviewFor:
      "Determine from the documentation whether ESLint's config/plugin resolution (`extends`, shareable configs, plugins) can load from a remote source, and what a loaded plugin is able to execute.",
  },
  {
    command: "stylelint",
    docs: "https://stylelint.io/",
    reviewFor:
      "Determine from the documentation whether stylelint's plugin/config resolution can load from a remote source, and what a loaded plugin is able to execute.",
  },
  {
    command: "npm",
    docs: "https://docs.npmjs.com/cli/commands/npm-audit",
    reviewFor:
      "Determine from the documentation exactly what `npm audit` sends to and receives from the registry, and verify the exact subcommand/flags used here are the ones documented, not a different npm subcommand with different effects (e.g. `publish`, `install`).",
  },
  {
    command: "secretlint",
    docs: "https://github.com/secretlint/secretlint#readme",
    reviewFor:
      "Determine from the documentation whether any rule reports a finding (or a matched secret's value) to a destination other than the local `--output` file, and separately verify against src/presets/security-secrets.ts's own policy code that a matched secret's value is excluded from this package's own output.",
  },
  {
    command: "tsc",
    docs: "https://www.typescriptlang.org/docs/",
    reviewFor:
      "Determine from the documentation what a custom transformer configured in tsconfig.json is able to do during a compile, and whether this repository's own tsconfig.json configures one.",
  },
]

/**
 * The exact, reviewed set of external CLI tools every published preset
 * (src/presets/*.ts) is allowed to spawn as its `run` command's first
 * argument -- derived from `PRESET_COMMAND_REVIEW` above so the two can
 * never drift apart (one entry per preset, kept in sync by hand
 * deliberately -- see scripts/security-network/scan.ts's own doc comment
 * for why this list is manually maintained rather than derived from
 * anything else). A new preset spawning a tool not in this list fails the
 * check until a maintainer adds a full `PRESET_COMMAND_REVIEW` entry for it
 * -- exactly the "extremely obvious in code review" visibility a new
 * network-capable preset command should require.
 */
export const ALLOWED_PRESET_COMMANDS = PRESET_COMMAND_REVIEW.map((entry) => entry.command)
