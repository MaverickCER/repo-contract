# 0007: The "no network calls" guarantee is mechanically enforced, in two independent layers

## Status

Accepted. Implemented in `eslint.config.js` (development-time layer) and
`scripts/security-network/scan.ts` + `checks/security-network.ts` (independent repository-check
layer). Shared threat-model data: `scripts/security-network/network-surface.mjs`.

## Context

README's "Enterprise / locked-down environments" section has long claimed the programmatic API has
"no network calls" and "no telemetry." Until now this was true by inspection only -- nothing would
fail if a future change (accidental or malicious) introduced one. A prior audit of this repository
flagged it as exactly the kind of normative claim Section 16 of that audit's own standard requires
either governing or removing: "a documented guarantee contradicted by implementation" is a release
blocker, and an unenforced guarantee is one contradiction away from becoming exactly that.

## Decision

**Scope**: `src/**/*.ts` only -- the entire built/published surface. `package.json`'s `files`
(`dist`, `presets`, `schemas`) and `npm pack --dry-run` confirm `dist/index.js`/`dist/presets.js`
are built from nothing else. This deliberately includes `src/presets/*.ts`: a preset is executable
code this package ships and a consumer's `repo-contract.config.ts` invokes, not merely
configuration the consumer wrote themselves. `checks/`, `scripts/`, `test/`, and this feature's own
directory are never shipped and are explicitly out of scope -- they legitimately do things (spawn
tooling by dynamic path, read arbitrary files) this guarantee does not apply to.

**Threat model** (full list and rationale: `scripts/security-network/network-surface.mjs`):

- Node core network modules (`http`, `https`, `http2`, `net`, `tls`, `dgram`, `dns`,
  `dns/promises`), both bare and `node:`-prefixed.
- A short list of well-known third-party network packages (`undici`, `ws`, `axios`, `node-fetch`,
  `got`, `superagent`, `request`, `cross-fetch`, `isomorphic-fetch`) -- none are current
  dependencies; this is defense-in-depth against a future PR that adds one and imports it in the
  same change.
- `createRequire` (from either `node:module` or `module`) -- the mechanism ESM code would use to
  synthesize a `require()` and load a network module by a computed string, bypassing a plain
  specifier check. `src/` has never used `require`/`createRequire` anywhere.
- The globals `fetch`/`WebSocket`/`EventSource` -- all real, import-free network capability in this
  package's supported Node runtime (`engines.node >=20`). `EventSource` is a Node global (added
  behind `--experimental-eventsource` in Node 22.3, exposed by default on newer lines, undici-backed)
  and is banned for the same reason as `fetch`/`WebSocket`. Genuinely browser-only globals
  (`XMLHttpRequest`, `navigator.sendBeacon`) stay excluded: this package has no browser build
  target, so those APIs cannot exist in the runtime this guarantee is about.
- Every published preset's spawned command (`run`'s first argument) must be one of a small,
  explicit, hand-maintained allowlist of the real tools this repository's presets already spawn
  (`ALLOWED_PRESET_COMMANDS`) -- closing the "shell out to curl instead of importing an HTTP
  client" bypass. Deliberately manual, not derived: the whole point is that adding a new command
  requires a visible, reviewable diff to this one list, not that the list is guaranteed complete by
  construction. **This check does not, and cannot, verify that the binary a command name actually
  resolves to on any given machine is trustworthy** -- repo-contract never bundles `attw`/
  `eslint`/`jscpd`/etc.; a consumer installs and trusts each one separately, and repo-contract has
  no visibility into what's actually on `PATH` when a preset runs. `run: ["attw", ...]` and a
  hypothetical `run: ["malicious", ...]` are equally unverified at the binary level -- the
  allowlist does not distinguish "safe tool" from "unsafe tool" by name. What it actually checks is
  narrower: whether _repo-contract's own source code_ named an out-of-category command (`curl`,
  `wget`, `nc`, and the like have no legitimate reason to appear in a code-quality preset) versus
  one already reviewed and built into the catalog. It's a supply-chain-diff-visibility gate for
  this repository's own contribution process -- the same reason a new npm dependency is always a
  visible `package.json` diff, not a claim that the dependency is safe -- not a runtime sandbox
  over what a consumer's already-installed tools do. A colluding contributor with commit access
  could still add a new entry to `ALLOWED_PRESET_COMMANDS` in the same PR as a malicious preset;
  nothing here substitutes for human review of that diff (see this document's own repository-wide
  framing in `specs/verification-taxonomy.md`: "Automated verification does not replace human
  review") -- it only guarantees the change cannot be silent. Separately, note this allowlist
  governs _which binary a preset may spawn_, not _whether that binary itself ever touches the
  network_ -- `linkinator` (the `brokenLinks` preset) is allowlisted and does make HTTP requests,
  because doing so is its entire declared purpose, explicitly invoked by a consumer who added that
  preset to their own config. The guarantee this ADR enforces is about hidden, undeclared network
  capability in repo-contract's own code, not about whether a consumer-chosen external tool can
  reach the network on the consumer's own explicit behalf.
- Explicitly **not** attempted: verifying that a _dependency's own internal code_ never makes a
  network call. `cross-spawn` (the only runtime dependency) and `yaml` (the only peer dependency)
  were reviewed and are not network-capable. A new runtime dependency is already a highly visible
  `package.json` diff, reviewed by the existing `security-deps`/`license` checks for other
  properties; a full transitive supply-chain network-behavior audit is a materially different,
  larger problem this ADR does not solve.

**Two independent layers**, deliberately overlapping on the core invariant so that weakening one
does not silently defeat the guarantee:

1. **ESLint** (`eslint.config.js`, scoped to `src/**/*.ts`): `no-restricted-imports` (module
   specifiers and the `createRequire` named-import restriction) and `no-restricted-globals`
   (`fetch`, `WebSocket`). Development-time feedback, a red squiggle while typing.
2. **`security-network` check** (`scripts/security-network/scan.ts`, wired into
   `repo-contract.config.ts`): an independent AST scan using TypeScript's own compiler API (the
   same approach `scripts/suppression-governance/discover-suppressions.ts` already uses, for the
   same reason), covering every category above plus the preset-command allowlist. Never invokes
   ESLint or loads `eslint.config.js` -- a silently weakened/removed ESLint rule, or a suppressed
   violation, still fails here. Runs as part of the mandatory `npm run contract` gate (CI's
   `contract` job), not merely as an optional test a contributor could forget to run.

**Suppression governance**: deliberately **no** special-cased entry for `no-restricted-imports`/
`no-restricted-globals` in `scripts/suppression-governance/policy-config.ts`. Neither rule name is
used anywhere else in this repository, so the `eslint` domain's existing default policy already
applies to them: `exception` mode requiring `justification`, `alternatives`, `remediation`,
`category`, and `verificationMethod` all filled in. That is exactly the right bar -- not an
unconditional ban (a future preset with a genuine, reviewed need for network capability, e.g. a
health-check preset, should remain possible) but never silent (an `eslint-disable` on either rule
is itself a `disable-comments.json` entry a reviewer sees, with a full justification trail,
regardless). The independent `security-network` check still catches the same violation even if the
`eslint-disable` were somehow accepted, since it has no awareness of ESLint suppression comments at
all.

## Consequences

- `npm run contract` runs one additional check, `security-network` (see
  [`repo-contract.config.ts`](../../repo-contract.config.ts) for the current full list).
- A contributor introducing any of the above into `src/` gets a fast, precise ESLint error while
  editing, and (independently) a failed `security-network` check if they somehow bypass or disable
  the lint layer.
- A new preset that legitimately needs to spawn a new external tool must add that tool's name to
  `ALLOWED_PRESET_COMMANDS` -- a small, explicit, reviewable diff -- or the `security-network` check
  fails with a clear "not in the reviewed allowlist" message naming the exact command.
- README's guarantee can now say it is mechanically enforced, not merely true today by inspection.
- Known, accepted limitation: this does not audit a dependency's own transitive network behavior
  (see Decision above) or prevent a consumer's own `repo-contract.config.ts` from configuring a
  check that spawns a network-capable command directly -- both are explicitly out of scope, the
  latter being the tool's entire intended purpose (execute what the repository's own configuration
  says).

## Alternatives considered

- **A single custom ESLint rule instead of `no-restricted-imports`/`no-restricted-globals`.**
  Rejected: the built-in rules express every needed restriction (module specifiers, named-import
  restriction, restricted globals) without a new rule to maintain and test; a custom rule would
  only be justified if a built-in couldn't express the invariant reliably, which was not the case
  here.
- **Only the ESLint layer, no independent check.** Rejected: an ESLint rule can be silently removed
  or weakened in the same PR that introduces the violation, or suppressed with an
  `eslint-disable` -- the entire point of a second, independently-implemented layer is that it does
  not share that single point of failure.
- **Forbidding the underlying ESLint rules from ever being suppressed** (a `"forbidden"` entry in
  `policy-config.ts`, matching `security/*`'s existing treatment). Rejected: the goal is not to make
  legitimate future network-capable presets impossible, only to make adding one impossible to do
  silently -- `exception` mode with full justification already achieves that, and forbidding it
  outright would be a stronger claim than this guarantee actually needs to make.
- **Deriving `ALLOWED_PRESET_COMMANDS` automatically** (e.g. from `package.json`'s own
  dependencies). Rejected: presets spawn commands the _consumer_ is expected to have installed
  (`eslint`, `prettier`, `tsc`), which are deliberately not `repo-contract`'s own runtime
  dependencies at all -- there is no derivable source of truth to generate this list from, and
  inventing one would be more complex than the short, hand-maintained list it would replace.
