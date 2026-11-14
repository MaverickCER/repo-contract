# Security policy

**In short:**

- Commands run with **no shell interpretation** unless a check opts in with `shell: true`.
- Process spawning and environment access are capabilities **the consumer supplies**, not
  owned by the package.
- The `init` CLI only scaffolds local config/hook files. Neither it nor the library engine
  makes network calls or collects telemetry. An AST scan of `src/` fails the contract on any
  network import or global. A scan of the packed tarball rejects `child_process` and
  `process.env` outside `bin/`.

The rest of this document defines the security boundaries and threat model for
`repo-contract`. It covers the protections the package intentionally provides, the
responsibilities that remain with the application that configures it, and why those boundaries
exist. `specs/decisions/` holds the ADRs behind specific choices referenced below.

## Reporting a vulnerability

Report privately via a
[GitHub security advisory](https://github.com/maverickcer/repo-contract/security/advisories/new).
If that form is unavailable to you, open a public issue that says only "requesting a private
security contact", with no details. A maintainer will follow up. Please do not disclose the
substance of a suspected vulnerability in a public issue before it has been triaged.

## Disclosure

Reports are handled in private until they can be disclosed without helping an attacker. A report is
acknowledged, assessed and prioritised by severity, exploitability and impact. Acknowledgement does not
promise that it is accepted as a vulnerability or that a fix can be provided.

When a fix is available, a security advisory is published on this repository. It names:

- the affected versions and the patched version;
- the severity;
- what a user can do if they cannot upgrade at once;
- whether exploitation is known to have occurred.

It does not publish a working exploit, or details that expose other systems before their owners have
had time to update. If a vulnerability is being exploited, or a fix cannot be released promptly, users
are warned and given mitigations before the fix is complete. Resolved advisories stay public: a record
of vulnerabilities handled openly is part of what this package asks you to trust.

## Runtime security model

repo-contract's core job is spawning processes you configured. That makes command construction
the most security-sensitive part of the package.

- **No shell by default, except where Windows itself requires one to resolve a command at all.**
  - `run` as a `string` is tokenized into an executable and its arguments. `run` as an array is
    used as argv verbatim.
  - On POSIX, neither ever passes through a shell. No untrusted value interpolated into `run` can
    inject a second command, a redirect, or a pipeline there, because no shell is invoked at all.
  - On Windows, resolving a `.cmd`/`.bat` shim unavoidably routes through `cmd.exe`. That is how
    essentially every npm-installed CLI is actually invoked there (e.g.
    `node_modules/.bin/eslint.cmd`). This is a Windows/PATHEXT constraint, not something
    repo-contract can opt out of while still resolving those shims. `cross-spawn` (see
    [ADR 0003](specs/decisions/0003-cross-platform-command-execution-and-process-cleanup.md))
    exists specifically to handle it correctly. On that path, injection safety comes from
    `cross-spawn`'s own argument escaping for `cmd.exe`'s parsing rules, not from the absence of a
    shell.
  - On every platform, a string `run` with unquoted shell/multi-command operators (`;`, `&`, `|`,
    backticks, `$(`, `<`, `>`, newlines) is rejected outright as a configuration error. These
    characters are not silently passed through as literal arguments. Their presence almost always
    signals a mistaken assumption that shell interpretation is happening.
- **`shell: true` is an explicit, informed opt-in**, not a hidden default. When set, `run` (a
  `string`) is passed to the platform shell as-is. This is a deliberate escape hatch for
  legitimate uses (pipelines, redirects) that argv-only execution cannot express. It also means
  the same injection risks as any other shell invocation apply.
  - **Never build a `shell: true` `run` string by concatenating untrusted input** (content from a
    pull request, an issue body, an HTTP response, etc.) into it.
- **Glob characters are not shell metacharacters here.** `*`, `?`, `~`, `[`, `]`, `{`, `}` are
  deliberately _not_ rejected in string-form `run`. Many CLI tools (eslint, prettier, tsc)
  accept and internally expand glob patterns themselves. Since no shell is ever invoked, these
  characters carry no injection risk wherever they appear in the string.
- **Environment inheritance is deliberate, not automatic-by-accident.** A check inherits
  `process.env` by default (`inheritEnv: true`). Most real commands (npm scripts, locally
  installed CLIs) need `PATH` and similar to resolve at all. Set `inheritEnv: false` to run a check
  with a minimal environment: only what you explicitly pass via `env`, plus
  whatever the OS itself always provides. The package never filters or redacts specific
  environment variables on your behalf. If a check's environment could contain a secret it
  shouldn't have access to, control that via `inheritEnv`/`env`. Do not assume repo-contract
  will do it for you.
- **Process-tree cleanup is a resource-exhaustion mitigation, not a sandbox.**
  - A timeout, an aborted run, or an external signal all terminate the _entire_ process tree a
    check spawned, not only the immediate child. This prevents orphaned processes from
    accumulating.
  - This is best-effort. A process that has already exited, or one repo-contract lacks permission
    to signal, is treated as a no-op, never a crash.
  - On POSIX, cleanup signals the whole process group. A descendant that detaches itself into its
    own group (e.g. via `setsid`) is not reachable this way and can survive cleanup. That is an
    inherent limitation of process-group-based termination, not specific to repo-contract.
  - Termination itself escalates. SIGTERM is sent first. If the tree hasn't exited within a short
    grace period, SIGKILL follows, so a check that traps or ignores SIGTERM cannot hang a run
    indefinitely.
- **stdout/stderr are captured verbatim, up to a bound.**
  - repo-contract does not scan, redact, or otherwise reinterpret a check's output. Whatever the
    command printed becomes `result.stdout`/`stderr`, and (if requested) `result.output`.
  - Capture per stream is capped (currently 10 MiB). The cap bounds memory and evidence size
    against a misbehaving or malicious command. Content beyond the cap is replaced with a
    truncation marker, not retained.
  - **A secret (an API key, a token) that a command prints to stdout or stderr becomes part of
    the evidence object**, exactly as captured.
  - repo-contract does not persist evidence anywhere itself (see
    [No package-owned persistence](#application-responsibilities) below). If _you_ log, store, or
    transmit evidence, you are responsible for whatever your checks printed.
  - **Worst-case memory is bounded but not small.** The `Evidence` object retains every check's
    captured output for the whole run. Peak retained output is therefore roughly
    `checks × 2 × 10 MiB` (stdout + stderr per check). A 30-check run whose commands all flood
    their output can hold ~600 MiB of strings before truncation caps each stream. Checks that
    legitimately produce large structured output should write it to a file
    (`--output report.json`) and keep stdout small. Every preset in this package that emits bulk
    data already does. `history.json`-style local logging is the consumer's own code; cap it
    yourself.
- **Parsing failures never execute anything.** `output: { format: "json" | "text" }` only ever
  calls `JSON.parse` (or a trimmed passthrough) on captured text. A malformed or even
  maliciously-crafted string cannot cause repo-contract to execute code, only to fail to parse
  (`{ success: false, error }`).
- **No `eval`, no `Function` construction, no dynamic code execution anywhere in the package.**
  CI enforces this: `no-eval`/`no-implied-eval`/`no-new-func` are lint errors, not only
  documentation.
- **No network calls anywhere in the package's shipped surface.** That surface is `src/**` (the
  programmatic API and every published preset) and `bin/**` (the CLI). Two independent layers
  enforce it mechanically:
  - An ESLint rule (`no-restricted-imports`/`no-restricted-globals`) rejects network-capable
    imports and globals at development time.
  - An independent, ESLint-free repository check (`scripts/security-network/scan.ts`) statically
    scans both `src/` and the shipped `bin/`. It also checks every preset's spawned command
    against a reviewed allowlist. A silently weakened lint rule or a suppressed violation
    therefore still fails the build.

  The one reviewed exception is the CLI's `createRequire(...)("typescript")`, which loads the
  project's own compiler for `affected` (`.repo-contract/exceptions/security-network.json`).
  This governs repo-contract's own code. It does not, and cannot, prevent a command _you_
  configure from making network calls. Nor can it stop a preset's spawned external tool (e.g.
  `brokenLinks`'s `linkinator`) from doing so on your explicit behalf.
  [ADR 0007](specs/decisions/0007-no-network-surface.md) has the full threat model, exactly
  what's covered, and what's deliberately excluded.

## Application responsibilities

repo-contract executes what you configure; it does not sandbox, restrict, or review it. In
particular:

- **You own what commands you configure.** repo-contract does not attempt to detect or block a
  dangerous `run` command. If you configure `rm -rf /` with `shell: true`, it will run it.
- **You own persistence.** repo-contract never writes evidence, reports, or baseline files to
  disk on its own initiative. The opt-in result cache writes only to the path you pass, and run
  records are appended by the caller. If you persist evidence (for baseline comparison, audit
  trails, etc.), you are responsible for where it goes and who can read it. That includes
  whatever secrets a check's captured output might contain.
- **You own secret hygiene in check output.** Mind what a configured command might print before
  you persist or transmit the resulting evidence.
- **You own environment scoping.** `inheritEnv`/`env` are the tools. Deciding what a given check
  actually needs is a per-repository judgment call repo-contract does not make for you.

  Concretely, for this repository's own pipeline:
  - Every check of `npm run contract` runs with `inheritEnv: false` and the explicit allowlist
    in `scripts/contract-env.mjs`. The allowlist covers the shell's furniture, Node's settings,
    CI metadata and the two tokens checks are written to use. A check therefore never sees the
    rest of the environment of the process that started it.
  - The release path is the shared `release-npm-changesets.yml` workflow from
    `internal-package-contract`, at the version `package.json` pins.
  - Its check job runs `npm run verify` with no publishing credential. It requires a passing
    `contract` run on the exact commit being released.
  - Its publish job is the only one holding the npm OIDC token, and it runs no repository code
    (`--ignore-scripts`).
  - `prepublishOnly` is not part of that path.

## SBOMs

This repository commits two [CycloneDX](https://cyclonedx.org/) 1.6 Software Bills of Materials.
Every `npm run contract` run regenerates them via
[`@cyclonedx/cyclonedx-npm`](https://github.com/CycloneDX/cyclonedx-node-npm) (`checks/sbom.ts`).
They answer different questions:

- [`docs/sbom.production.cdx.json`](https://github.com/MaverickCER/repo-contract/blob/main/docs/sbom.production.cdx.json) is the **runtime inventory**: what installing `repo-contract` brings in. The package declares no runtime dependencies, so the document lists the package alone. This is the one to import into a vulnerability scanner to describe what you would deploy.
- [`docs/sbom.cdx.json`](https://github.com/MaverickCER/repo-contract/blob/main/docs/sbom.cdx.json) is the **build-environment inventory**: every direct and transitive dependency of this repository's own tooling, as resolved in `package-lock.json`. It is for auditing how the package is built and is not what installing the package adds.

Both cover npm only. Both are deterministic given an unchanged lockfile. They therefore stay normal,
diff-gated committed files rather than a special-cased exclusion.

## Supported versions

This project has not reached a `1.0` release.

**Today, before `1.0`:** security fixes are provided on the latest published `0.x` version only.
There is no separate long-term-support branch and no extended security-support policy yet. An
application pinned to an older `0.x` release does not receive backported fixes. Upgrading to the
latest `0.x` is the only supported remediation path. See [VERSIONING.md](VERSIONING.md) for how
the Stable/Experimental/Private tiers carry forward.

**Starting at `1.0`:** once this project ships a `1.0` release, security fixes will be backported
to the latest minor release of the previous major version. The window lasts a minimum of six
months after a new major version ships.

- The window may be extended at the maintainer's discretion, for example to give large downstream
  consumers more migration time.
- Once a minimum end date has been stated for a given major version's backport window, it will
  never be shortened.
- Fixes for the current major version continue to target its latest published minor/patch
  release, exactly as fixes do today for `0.x`.
- The backport commitment only extends that same treatment one major version back, for a bounded
  time.

See [ADR 0015](specs/decisions/0015-security-backport-window.md).

This is a forward commitment about a future release line, not a claim that
backporting has already been exercised.
