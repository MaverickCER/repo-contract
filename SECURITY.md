# Security policy

This document defines the security boundaries and threat model for `repo-contract`:
what protections the package intentionally provides, what responsibilities remain with the
application that configures it, and why those boundaries exist. See the README's
[Security model](README.md#security-model) section for a shorter summary, and
`specs/decisions/` for the ADRs behind specific choices referenced below.

## Reporting a vulnerability

Report privately via a
[GitHub security advisory](https://github.com/maverickcer/repo-contract/security/advisories/new),
or via the contact information on the npm package page. Please do not open a public issue for a
suspected vulnerability before it has been triaged.

## Runtime security model

repo-contract's core job is spawning processes you configured. That makes command construction
the most security-sensitive part of the package.

- **No shell by default, except where Windows itself requires one to resolve a command at all.**
  `run` as a `string` is tokenized into an executable and its arguments; `run` as an array is used
  as argv verbatim. On POSIX, neither ever passes through a shell — no untrusted value interpolated
  into `run` can inject a second command, a redirect, or a pipeline there, because no shell is
  invoked at all. On Windows, resolving a `.cmd`/`.bat` shim — how essentially every npm-installed
  CLI is actually invoked there (e.g. `node_modules/.bin/eslint.cmd`) — unavoidably routes through
  `cmd.exe`; this is a Windows/PATHEXT constraint that `cross-spawn` (see
  [ADR 0004](specs/decisions/0004-cross-platform-command-execution-and-process-cleanup.md)) exists
  specifically to handle correctly, not something repo-contract can opt out of while still
  resolving those shims. On that path, injection safety comes from `cross-spawn`'s own argument
  escaping for `cmd.exe`'s parsing rules, not from the absence of a shell. Independently of
  platform, unquoted occurrences of shell/multi-command operators (`;`, `&`, `|`, backticks, `$(`,
  `<`, `>`, newlines) in a string `run` are rejected outright as a configuration error rather than
  silently passed through as literal arguments, since their presence almost always signals a
  mistaken assumption that shell interpretation is happening.
- **`shell: true` is an explicit, informed opt-in**, not a hidden default. When set, `run` (a
  `string`) is passed to the platform shell as-is. This is a deliberate escape hatch for
  legitimate uses (pipelines, redirects) that argv-only execution cannot express — but it means
  the same injection risks as any other shell invocation apply. **Never build a `shell: true`
  `run` string by concatenating untrusted input** (content from a pull request, an issue body,
  an HTTP response, etc.) into it.
- **Glob characters are not shell metacharacters here.** `*`, `?`, `~`, `[`, `]`, `{`, `}` are
  deliberately _not_ rejected in string-form `run` — many CLI tools (eslint, prettier, tsc)
  accept and internally expand glob patterns themselves, and since no shell is ever invoked,
  these characters carry no injection risk regardless of where they appear in the string.
- **Environment inheritance is deliberate, not automatic-by-accident.** A check inherits
  `process.env` by default (`inheritEnv: true`) because most real commands — npm scripts,
  locally installed CLIs — need `PATH` and similar to resolve at all. Set `inheritEnv: false` for
  a check that should run with a minimal environment (only what you explicitly pass via `env`,
  plus whatever the OS itself always provides). repo-contract never filters or redacts specific
  environment variables on your behalf; if a check's environment could contain a secret it
  shouldn't have access to, control that via `inheritEnv`/`env`, not by assuming repo-contract
  will do it for you.
- **Process-tree cleanup is a resource-exhaustion mitigation, not a sandboxing guarantee.** A
  timeout, an aborted run, or an external signal all terminate the _entire_ process tree a check
  spawned (not just the immediate child), preventing orphaned processes from accumulating. This
  is best-effort: a process that has already exited, or one repo-contract lacks permission to
  signal, is treated as a no-op, never a crash. On POSIX, cleanup signals the whole process
  group; a descendant that detaches itself into its own group (e.g. via `setsid`) is not
  reachable this way and can survive cleanup — an inherent limitation of process-group-based
  termination, not specific to repo-contract. Termination itself escalates: SIGTERM is sent
  first, and if the tree hasn't exited within a short grace period, SIGKILL follows, so a check
  that traps or ignores SIGTERM cannot hang a run indefinitely.
- **stdout/stderr are captured verbatim, up to a bound.** repo-contract does not scan, redact,
  or otherwise reinterpret a check's output — whatever the command printed becomes
  `result.stdout`/`stderr`, and (if requested) `result.output` — but capture per stream is capped
  (currently 10 MiB) to bound memory and evidence size against a misbehaving or malicious
  command; content beyond the cap is replaced with a truncation marker, not retained. **If a
  command might print a secret (an API key, a token) to stdout or stderr, that secret becomes
  part of the evidence object** exactly as captured. repo-contract does not persist evidence
  anywhere itself (see [No package-owned persistence](#application-responsibilities) below), but
  if _you_ log, store, or transmit evidence, you are responsible for whatever your checks
  printed.
- **Parsing failures never execute anything.** `output: { format: "json" | "yaml" }` only ever
  calls `JSON.parse`/a YAML parser on captured text — a malformed or even maliciously-crafted
  string cannot cause repo-contract to execute code, only to fail to parse
  (`{ success: false, error }`).
- **No `eval`, no `Function` construction, no dynamic code execution anywhere in the package.**
  This is enforced by CI (`no-eval`/`no-implied-eval`/`no-new-func` are lint errors, not just
  documentation), not just asserted here.
- **No network calls anywhere in the package's shipped surface (`src/**` — the programmatic API
  and every published preset).** Mechanically enforced in two independent layers: an ESLint rule
  (`no-restricted-imports`/`no-restricted-globals`) rejects network-capable imports and globals at
  development time, and an independent, ESLint-free repository check
  (`scripts/security-network/scan.ts`) statically scans the same surface — including every
  preset's spawned command against a reviewed allowlist — so a silently weakened lint rule or a
  suppressed violation still fails the build. This governs repo-contract's own code; it does not,
  and cannot, prevent a command _you_ configure from making network calls, or a preset's spawned
  external tool (e.g. `brokenLinks`'s `linkinator`) from doing so on your explicit behalf — see
  [ADR 0013](specs/decisions/0013-no-network-surface.md) for the full threat model, exactly what's
  covered, and what's deliberately excluded.

## Application responsibilities

repo-contract executes what you configure; it does not sandbox, restrict, or review it. In
particular:

- **You own what commands you configure.** repo-contract does not attempt to detect or block a
  dangerous `run` command — if you configure `rm -rf /` with `shell: true`, it will run it.
- **You own persistence.** repo-contract never writes evidence, reports, or baseline files to
  disk on its own initiative. If you persist evidence (for baseline comparison, audit trails,
  etc.), you are responsible for where it goes and who can read it — including whatever secrets
  a check's captured output might contain.
- **You own secret hygiene in check output.** If a configured command might print sensitive
  values, keep that in mind before persisting or transmitting the resulting evidence.
- **You own environment scoping.** `inheritEnv`/`env` are the tools; deciding what a given check
  actually needs is a per-repository judgment call repo-contract does not make for you.
  Concretely, for this repository's own release job: `.github/workflows/release.yml`'s `release`
  job grants `id-token: write` (npm OIDC trusted publishing) and receives `GITHUB_TOKEN`; its
  `prepublishOnly` hook (`package.json`) re-runs the full `npm run contract` at `npm publish` time,
  and no check in `repo-contract.config.ts` sets `inheritEnv: false`/`env`, so every third-party CLI
  that run spawns (eslint, stryker, `npm audit`, ...) inherits those credentials in its environment.
  This repository has reviewed and accepted that exposure rather than left it unexamined: the
  spawned tools are the same pinned, already-vetted devDependencies used throughout local
  development (not arbitrary or untrusted code), and a separate, non-privileged `verify` job in the
  same workflow runs the identical contract first, with no credentials in scope, so the credentialed
  re-run is a fast confirmation in the ordinary case rather than the primary place a real failure
  surfaces while those credentials are live. A repository with a lower risk tolerance should instead
  set `inheritEnv: false` plus an explicit, minimal `env` on every check reachable from a
  credentialed CI job.

## Supported versions

repo-contract is pre-1.0. Security fixes target only the latest published `0.x` release; there
is no long-term-support branch yet. Once 1.0 ships, this document will be updated with a
longer-term support policy — see [VERSIONING.md](VERSIONING.md) in the meantime for how the
Stable/Experimental/Private tiers will carry forward.
