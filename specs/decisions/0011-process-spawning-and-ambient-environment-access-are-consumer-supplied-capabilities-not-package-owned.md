# 0011: process spawning and ambient environment access are consumer-supplied capabilities, not package-owned

## Status

Accepted. Implemented in `src/types.ts`, `src/config/validate-config.ts`,
`src/execution/spawn-check.ts`, `src/execution/run-checks.ts`,
`src/execution/process-tree.ts`, `src/run-repo-contract.ts`,
`scripts/verify-no-ambient-capabilities.mjs`.

## Context

A supply-chain scan (Socket.dev) flagged two things against
`repo-contract@0.1.1` itself, not a dependency: a "Shell access" alert on the
`child_process` module and an "Environment variable access" alert on
`process.env`, both located at `dist/index.cjs`/`dist/index.js` — the
package's own build output, not a nested dependency's files (a dependency's
own alerts in the same report point inside that dependency's own package,
e.g. `which.js`, confirming the distinction). Swapping `cross-spawn` for
`node:child_process.spawn` alone would not close either alert: Socket doesn't
distinguish "a dependency does this" from "the package's own code does this
via a Node builtin."

While these alerts reflect legitimate, non-malicious functionality, their presence
creates immediate friction for package adoption. In enterprise and security-conscious
environments, third-party scanner flags trigger manual security reviews, policy
exemptions, or outright procurement blocks. `repo-contract` intends to reach `1.0.0`
eventually, once real-world adoption and feedback justify it -- no fixed timeline
or scope is committed yet -- but closing these alerts now, while the API is still
pre-1.0 and breaking changes are cheap, is what keeps that eventual release
unencumbered by a supply-chain posture worth fixing today rather than later.

Both capabilities were load-bearing, not incidental:

- [ADR 0003](0003-cross-platform-command-execution-and-process-cleanup.md)
  already decided `cross-spawn` is "the package's one runtime dependency,
  used specifically to solve `.cmd`/PATHEXT resolution correctly," and its
  own Alternatives Considered section explicitly rejected hand-rolling
  Windows command resolution as "exactly the class of subtle,
  security-adjacent bug that's notoriously easy to get wrong." On Windows, npm-installed CLI commands commonly resolve to `.cmd` shims.
  Native `child_process.spawn()` does not provide the same command-shim
  handling as `cross-spawn` when `shell` is disabled. Enabling `shell` as a
  workaround changes the command-execution security model and must not be
  combined with unsafe argument construction. ADR 0003 therefore established
  `cross-spawn` as the package-owned solution for this concern; this ADR moves
  that choice to the consumer boundary rather than reimplementing it.
- `spawn-check.ts`'s `buildEnv` reads `process.env` directly to implement
  `inheritEnv` (default `true`) — necessary because most check commands
  (npm scripts, locally-installed CLIs) need `PATH` and similar to resolve
  at all.

The underlying invariant worth having — independent of what any particular
scanner reports — is that `repo-contract`'s published runtime artifact must not itself import, require, or otherwise
reference a process-spawning implementation or `process.env`. Process execution
and ambient environment access must enter the package exclusively through
consumer-supplied capabilities. Getting there without
breaking checks (no `PATH`) or reintroducing CVE-2024-27980's failure mode
means `repo-contract` cannot supply either capability internally by default;
the consumer has to.

It is one thing for a utility package to claim or promise "secure execution" by internally bundling and managing capabilities. In practice, that model creates an opaque boundary: security scanners (and security engineers) are forced to trust the package's internal handling of sensitive Node builtins (`child_process`, `process.env`).

By shifting process spawning and ambient environment access to consumer-supplied capabilities, `repo-contract` changes its threat-model posture:

1. **Security Assurances via Composition:** Rather than making sweeping internal security guarantees, the package delegates process execution and environment handling to explicit injection.
2. **Auditable at the Consumer Boundary:** Consumers retain explicit control over the implementation of the execution capabilities and can independently instrument, restrict, mock, or audit them without relying on `repo-contract`'s internal implementation details.
3. **Decoupled Trust:** Third-party testing and SAST/DAST tooling can analyze the consumer’s provided spawner wrapper directly, leaving `repo-contract` purely as an orchestration engine with zero package-owned ambient capability.

**This narrows, but does not contradict, ADR 0003.** ADR 0003's rejection of
hand-rolling Windows command resolution still holds — this decision doesn't
hand-roll it either. What changes is _who owns supplying a working
implementation_: cross-spawn stops being bundled as the package's own
dependency and becomes one of potentially several spawners a consumer may
choose to supply (still the recommended choice for Windows `.cmd`
correctness — now documented rather than bundled). ADR 0003's tokenization,
process-tree cleanup, and Bun/Deno-support decisions are unaffected.

## Decision

`RepoContractConfig` gains two required fields and two optional fields:

- **`spawn: Spawner`** - required. `Spawner` is modeled directly on `node:child_process`'s own `spawn(command, args, options)` signature, so both `node:child_process.spawn` and cross-spawn's exported `spawn` are valid, drop-in-compatible values (verified with a compile-time assignment check, not just asserted). No default is provided - the only "default" that doesn't require the consumer to opt in would be importing `node:child_process` internally, which is precisely the alert this decision exists to close.
- **`env: NodeJS.ProcessEnv`** - required, typed to match `process.env` itself exactly so `env: process.env` needs no casting. An empty-object default would be technically capability-free, but would silently break `PATH` resolution (and therefore most real check commands) for every existing config with no warning - required forces an explicit, informed choice instead of a silent footgun.
- **`shell?: boolean`** - optional, a new global default for checks that don't set their own `check.shell` (existing field, unchanged meaning, still defaults to `false`, the safe argv-only mode). Precedence: `check.shell ?? config.shell ?? false`.
- **`killProcessTree?: SyncSpawner`** - optional. `SyncSpawner` mirrors `Spawner` but for `node:child_process`'s own `spawnSync(command, args, options)` signature, so both `node:child_process.spawnSync` and cross-spawn's exported `sync` are valid, drop-in-compatible values. Used only on Windows, only by `process-tree.ts`'s `killTree`, which owns _what_ gets invoked (the fixed command `"taskkill"` with OS-derived args) -- the consumer supplies only the synchronous-execution primitive, the same relationship `spawn` has to running a check's own command. Optional, unlike `spawn`/`env`, because a safe fallback exists that doesn't require importing `child_process`: when omitted, Windows cleanup on a timeout/abort/host-SIGINT falls back to terminating just the check's own tracked process handle (a plain method call, no spawn needed), not its full descendant tree. POSIX needs no such capability at all -- `process.kill(-pid, signal)` reaches the whole process group directly.

```ts
export interface RepoContractConfig {
  spawn: (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess
  env: NodeJS.ProcessEnv
  shell?: boolean
  killProcessTree?: (
    command: string,
    args: readonly string[],
    options: SpawnSyncOptions,
  ) => SpawnSyncReturns<Buffer | string>
}
```

`repo-contract` treats `spawn`, `env`, and `killProcessTree` as trusted capabilities supplied by the consumer. It does not inspect, wrap, sanitize, or otherwise modify them - it only calls `spawn`/`killProcessTree` with a resolved command/argv/options, and merges `env` with each check's own `env`/`inheritEnv` settings.

**Security & Audit Posture:** This architectural shift moves `repo-contract` away from attempting to promise or manage "secure execution" internally - a promise that inherently creates an opaque boundary for supply-chain scanners and static analysis. Instead, security guarantees are asserted through explicit composition:

1. **Zero Package-Owned Ambient Privilege:** `repo-contract` serves purely as a deterministic orchestration layer without built-in system access.
2. **Transparent Consumer Boundaries:** Because process spawning and environment access are injected at the consumer boundary, consumers can directly instrument, sandbox, or audit these capabilities via third-party security tooling and automated tests without relying on `repo-contract`'s internal implementation details.
3. **Explicit Capability Delegation:** A consumer who passes a customized, restricted spawner (e.g., inside a container, a sandbox wrapper, or a logged/audited proxy) receives exactly those execution constraints. `repo-contract` guarantees nothing about the underlying security properties of the injected functions beyond the fact that it never reaches for system capabilities on its own.

`cross-spawn` does not mean "shell execution" - that distinction is documented explicitly (README) because it's the exact misunderstanding to guard against in a package whose purpose is enforcing engineering standards:

| Spawner Primitive  | `shell` Option | Resulting Execution Mode                                          |
| ------------------ | -------------- | ----------------------------------------------------------------- |
| **Native `spawn`** | `false`        | Argv-only, no shell interpretation                                |
| **`cross-spawn`**  | `false`        | Windows `.cmd` shim resolution, safe `cmd.exe` quoting, argv-only |
| **Either**         | `true`         | Shell metacharacters interpreted (opts into shell execution)      |

cross-spawn provides Windows command-shim resolution and safe `cmd.exe` quoting while still spawning argv-oriented (`shell: false`) unless the caller separately opts into `shell: true`.

An internal `ExecutionCapability` type (`{ spawn, env, shell }`, `shell` already resolved to its effective boolean) is threaded once through `runChecks`/`spawnCheck` instead of three independent parameters - not part of the public API.

The invariant is mechanically checked against the published artifact, not merely documented. `scripts/verify-no-ambient-capabilities.mjs` inspects a real `npm pack` tarball for forbidden runtime imports (`cross-spawn`, `child_process`) and `process.env` references in the packed JS, and for `cross-spawn` in the packed `package.json`'s `dependencies` - wired into `precommit` and `prepublishOnly`.

## Consequences

- **A clean supply-chain posture ahead of any eventual `1.0.0`:** a published
  bundle with zero ambient capabilities passes automated supply-chain audits
  (Socket.dev, Snyk, Dependabot) clean out of the box, today, regardless of
  when or whether a `1.0.0` release happens -- teams adopting the package at
  any version can integrate it without requiring security exemptions or
  internal policy overrides.
- **Cross-platform execution becomes a consumer responsibility:** `repo-contract`
  no longer selects or ships a process-spawning implementation. Consumers targeting
  Windows must select a spawner appropriate for Windows command shims, while
  consumers targeting POSIX environments may use the native Node implementation.
  `repo-contract` validates the capability shape but does not guarantee that a
  particular spawner supports every target operating system.
- **Verifiable Security Boundary:** Static analysis, SAST tools, and supply-chain
  scanners run against the consumer's repository can now directly verify and audit
  how processes are spawned and environment variables are accessed. The consumer controls the implementation and trust boundary of the
  process-spawning and environment capabilities
  supplied to `repo-contract`.
- `cross-spawn` moves out of `dependencies` entirely (to `devDependencies`,
  used only by `scripts/npm-pack.mjs` and this package's own dev-only
  spawner-compatibility tests) — a default `npm install repo-contract` pulls
  in zero new packages, closing the dependency-tree alerts along with the
  two package-level ones.
- This is a breaking API change to `defineRepoContract`/`runRepoContract`,
  acceptable at the current pre-1.0 (`0.1.1`) version per `VERSIONING.md`.
  Every existing call site — including this package's own tests, examples,
  and the three E2E consumer-install suites (Node/Bun/Deno, per ADR 0003) —
  needs `spawn`/`env` added.
- Windows `.cmd`/`.bat` correctness is no longer guaranteed out of the box;
  it becomes an explicit, documented consumer choice (`spawn: crossSpawn` or
  `shell: true`), not a package-owned default. A consumer who installs
  `repo-contract` and passes only `spawn: child_process.spawn` will see a
  check spawning a `.cmd` shim fail with a clear `spawn_error` evidence
  entry on Windows rather than a silent hang — documented, not hidden.
- Removing `src/`'s only `process.env` read means `buildEnv` must receive
  the ambient environment by reference (never snapshotted early), so a
  long-running consumer's mutation of `process.env` between checks is still
  observed by later-spawned checks, exactly as it is today.
- `repo-contract`'s own dist output can be mechanically verified to contain
  no ambient-capability reference, on every commit and publish, rather than
  relying on a one-time manual audit.
- Windows process-tree cleanup (a timed-out/aborted/host-SIGINT-killed check)
  is no longer guaranteed to reach a check's full descendant tree out of the
  box either -- omitting `killProcessTree` means only the check's own
  immediate process is terminated on Windows. A consumer whose checks spawn
  their own subprocesses (`npm test` spawning the real test runner) and who
  needs full-tree cleanup on Windows opts in with
  `killProcessTree: crossSpawn.sync` (or `child_process.spawnSync`).
  `repo-contract`'s own self-hosting config (`repo-contract.config.ts`)
  supplies it, since its own checks run on Windows CI and are exactly this
  case.

## Alternatives considered

- **Keeping `cross-spawn` as a mandatory dependency and accepting the Socket
  alerts as false positives**: doesn't satisfy the actual invariant (no
  ambient capability reference in the published bundle) even though the
  alerts themselves reflect legitimate, non-malicious behavior — see
  Context.
- **An optional `spawn` with an internal `node:child_process.spawn`
  fallback**: rejected — the only fallback that doesn't require the consumer
  to opt in is importing `child_process` internally, which is exactly the
  alert this decision exists to close.
- **Defaulting `env` to `{}` instead of requiring it**: rejected — silently
  breaks `PATH` resolution (and therefore most real check commands) for
  essentially every existing config with no signal to the consumer that
  anything changed.
- **Hand-rolling Windows `.cmd`/PATHEXT resolution to avoid depending on
  cross-spawn at all, even as an optional consumer choice**: rejected for
  the same reason ADR 0003 already rejected it — a subtle,
  security-adjacent class of bug that's notoriously easy to get wrong,
  better left to an existing, widely-vetted implementation the consumer
  opts into than reimplemented here.
- **Shipping `repo-contract/spawners/*` reference subpath exports** (thin
  wrappers around `node:child_process.spawn` and `cross-spawn`): rejected
  for this change — adds public surface area for something a three-line
  example in the README already covers, and the E2E/compatibility tests
  already prove both work without a shipped wrapper.
- **A required `killProcessTree`, matching `spawn`/`env`**: rejected — unlike
  `spawn`/`env`, a safe fallback exists that doesn't require importing
  `child_process` internally (terminate just the tracked child process
  handle, a plain method call), so there is no forced choice to make
  explicit the way there is for `spawn`/`env`; making it required would add
  friction for every POSIX-only consumer for a Windows-only concern.
- **A `killProcessTree` shaped as `(pid, signal) => void`**, with the
  consumer owning the full kill implementation (deciding to invoke
  `taskkill` themselves, formatting its Windows-specific arguments):
  rejected — pushes platform-specific knowledge onto every consumer that
  `process-tree.ts` already owns and has tested; `killProcessTree` mirrors
  `Spawner`'s own narrower relationship instead (the consumer supplies only
  a synchronous-execution primitive, `repo-contract` decides what to run),
  consistent with how `spawn` itself works.
- **Re-bundling `cross-spawn` or an internal spawner default later**:
  deferred, not decided against permanently. If real-world consumer feedback
  (once this package has enough adoption to gather any) indicates that
  passing explicit `spawn` primitives imposes too much onboarding friction
  relative to the security benefit, reintroducing a package-owned or
  optional spawner export can be evaluated then, for whatever future
  major/minor version is current at the time -- there is no committed
  `1.0.0` scope this decision is locked against.
