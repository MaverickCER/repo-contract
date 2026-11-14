// Single source of truth for the "no network calls" invariant's threat
// model (README's Enterprise/locked-down-environments section, SECURITY.md).
// Two consumers import it directly: eslint.config.js (development-time
// enforcement) and scripts/security-network/scan.ts (the independent,
// AST-based repository check). This is the same "one shared data module, two
// independent consumers" shape as scripts/coverage-thresholds.mjs. Kept as
// plain data (no logic) so neither consumer can silently diverge from the
// other on *what* is banned, only on *how* each detects it.
//
// Scope: src/**/*.ts only, the entire built/published surface. See
// package.json's "files"/exports; `npm pack --dry-run` confirms dist/ is
// built from nothing else. checks/, scripts/, test/, and this file's own
// directory are repository-internal tooling, never shipped. They may
// legitimately need things this list forbids. For example, several .mjs
// scripts under scripts/ spawn tools via child_process, and
// scripts/suppression-governance's tooling reads files by dynamic path.
// specs/decisions/0007-no-network-surface.md has the full threat model and
// says why it stops at this boundary.

/**
 * Node core network modules, both `node:`-prefixed and bare forms (Node
 * resolves both identically): direct network I/O capability built into
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
 * None of these are current dependencies (see package.json). Banning the
 * import specifier is a zero-cost, defense-in-depth measure against a
 * future PR that both adds one of these as a dependency and imports it in
 * src/ in the same change. Deliberately not exhaustive, since there is no
 * bound on how many HTTP-client packages exist on npm. This list covers the
 * well-known, commonly-reached-for ones. A novel network package this list
 * doesn't name would still need to be added as a new runtime dependency
 * before it could be imported at all. That is itself a highly visible,
 * reviewable package.json diff.
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
 * arbitrary CommonJS) capability indirectly. `createRequire` in particular
 * is how ESM code can synthesize a `require()` and load a network module by
 * a computed string, bypassing a plain module-specifier check entirely.
 * Banning the import of `createRequire` itself (from either specifier Node
 * accepts) closes that path at its only real chokepoint. repo-contract's
 * src/ has never used `require`/`createRequire` anywhere (confirmed:
 * `grep -rn "createRequire|require(" src/` returns nothing), so this costs
 * nothing today. The scan.ts check enforces this across every form that
 * exposes the module object, not only the static named-import form. Those
 * forms are a static named import, a namespace or default import, a dynamic
 * `import("node:module")`, an `import x = require(...)`, and a bare
 * `require("module")`.
 */
export const RESTRICTED_NAMED_IMPORTS = [
  { specifier: "node:module", importedNames: ["createRequire"] },
  { specifier: "module", importedNames: ["createRequire"] },
]

/**
 * Global, import-free network capability available in this package's
 * supported Node runtime (engines.node >=22). `fetch` has been a stable
 * global since Node 18 and `WebSocket` since Node 22. `EventSource` is a
 * Node global too. It was added behind `--experimental-eventsource` in Node
 * 22.3 and is exposed by default on the newer lines this repository's own
 * toolchain runs on. It is real, undici-backed network capability in the
 * runtime this guarantee is about, so it belongs here alongside
 * `fetch`/`WebSocket`. Genuinely browser-only globals (`XMLHttpRequest`,
 * `navigator.sendBeacon`) stay excluded. This package has no browser build
 * target: tsup builds only for `target: "node22"`, and package.json has no
 * `browser` field. Those APIs cannot exist in the runtime this guarantee is
 * about, so banning them would be theatrical, not defensive.
 */
export const NETWORK_GLOBALS = ["fetch", "WebSocket", "EventSource"]
