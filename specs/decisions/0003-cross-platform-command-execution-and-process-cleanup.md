# 0003: Cross-platform command execution, process-tree cleanup, and cross-runtime support

## Status

Accepted. Implemented in `src/config/tokenize-command.ts`, `src/execution/spawn-check.ts`,
`src/execution/process-tree.ts`, `test/helpers/pack-consumer.ts`,
`test/e2e/consumer-install-bun.test.ts`, `test/e2e/consumer-install-deno.test.ts`,
`.github/workflows/ci.yml`.

## Context

`run: string` needs to become an executable and arguments without invoking a shell, so that no
untrusted value interpolated into it can inject a second command. An early design rejected every
character that _could_ be shell-significant, including glob characters — which would have
rejected extremely common, legitimate check commands (`eslint "src/**/*.ts"`), since many CLI
tools glob-expand their own arguments internally rather than relying on the shell to do it.

Separately, plain process spawning does not resolve Windows `.cmd`/shebang-based shims without
shell mode — a command like `npm run mutation`, this package's own canonical example, fails
outright on Windows without help. And a spawned command is often itself a wrapper (`npm test`
spawns `npm`, which spawns the real test runner) — a timeout or abort needs to kill the _whole_
tree, not just the directly-spawned process, or it orphans the real work underneath it.

Once the package spawns processes and reads `process.env` at all, _which runtime_ a consumer
runs it under stops being cosmetic. README's runtime support matrix once listed Bun and Deno as
"Not tested; likely to work through Node compatibility layers, but not supported for v0.1.0" —
an honest placeholder, but an unverified one. A future change to `src/execution/` or a
`cross-spawn` bump could work under Node's real `child_process` implementation while silently
breaking under Bun's or Deno's compatibility layer — neither of which reimplements Node's APIs
with 100% fidelity — and nothing in CI would catch that regression. That is exactly the gap
between "asserted" and "verified" this package's own thesis (evidence over assertion) argues
against when applied to any other check.

## Decision

**Tokenization**: only true shell/multi-command operators are rejected in unquoted position
(`;`, `&`, `|`, backtick, `$(`, `<`, `>`, a literal newline). Glob characters and a bare `$` are
passed through as literal argv content — since no shell is ever invoked in this path, they carry
no injection risk regardless of where they appear; the receiving tool decides what to do with
the literal text.

**Windows command resolution**: `cross-spawn` is the package's one runtime dependency, used
specifically to solve `.cmd`/PATHEXT resolution correctly. This is a deliberate, documented
deviation from this package's sibling projects' zero-runtime-dependency convention — justified
because this is the first package in the family that actually spawns processes at all.

**Process-tree cleanup** is hand-rolled, not a dependency: on POSIX, the check is spawned as a
process-group leader and the signal is sent to the whole group; on Windows, cleanup shells out
to the OS's own process-tree-kill facility. Already-exited PIDs and permission errors are
treated as no-ops, never crashes — a best-effort cleanup should never itself bring down the run.

**Bun and Deno are tested, supported consumption runtimes.** They are promoted from "not
tested" to a tested, documented consumption path, verified end-to-end against the real packed
tarball — the same `npm pack` + fresh-install fixture the existing Node E2E test already used,
now shared via `test/helpers/pack-consumer.ts`. Each runtime's suite covers the same
compatibility-relevant surface: the ESM entry point, the CommonJS entry point (`require`,
proving `dist/index.cjs` and Deno/Bun's own CJS interop, not just their ESM resolution), and the
`./presets` subpath export. Deno requires `--allow-read --allow-run --allow-env` (verified as
the minimum working set — no broader permission is needed); Bun requires no non-default flags.
Both are documented in README's runtime support matrix. Both E2E suites skip cleanly
(`describe.skipIf`) when the runtime's own binary isn't on `PATH`, matching the existing
`distIsBuilt` skip pattern; a dedicated `runtime-compat` CI job installs both runtimes and runs
the full E2E suite there, once, on one OS and one Node version — proving Bun/Deno interop
doesn't depend on which Node version or OS also happens to be on the runner. `package.json`'s
`engines` field is unchanged: it stays Node-only, and this repository's own internal tooling
(`vitest`, coverage, mutation testing) still only ever runs under Node — this decision is scoped
to whether the _published, built artifact_ works when imported/required from Bun or Deno.

## Consequences

- `run: "eslint 'src/**/*.ts'"` and its array-form equivalent behave identically; both tokenize
  and execute correctly.
- `run: "npm run test"`-style commands work on Windows without the consumer needing to opt into
  shell mode, which would reintroduce shell-injection surface for no reason.
- A timeout, an abort, or an external signal all terminate the _entire_ process tree a check
  spawned, not just its immediate child — preventing orphaned processes from accumulating.
- The Windows cleanup path cannot be exercised on any CI runner other than a real Windows one;
  it's covered by a dedicated Windows-only test, skipped elsewhere.
- A future change that breaks Bun or Deno compatibility is caught by CI, not discovered by a
  consumer filing an issue. Local development without Bun/Deno installed is unaffected — the
  suites skip, `npm test` still passes.
- Deno's permission model is now a documented, consumer-facing contract, not something a Deno
  user has to reverse-engineer from a stack trace.

## Alternatives considered

- **Rejecting every shell-special character, including globs**: rejected once review found this
  would break the package's own primary example category (glob patterns in lint/format commands)
  for no actual security benefit, since no shell is ever invoked to expand them either way.
- **Hand-rolling Windows argument resolution/escaping** instead of depending on `cross-spawn`:
  rejected — this is exactly the class of subtle, security-adjacent bug that's notoriously easy
  to get wrong, and `cross-spawn` is already widely vetted (it's used internally by the npm CLI
  itself).
- **Adding a small `tree-kill`-style dependency** for process-tree cleanup: rejected — unlike
  the Windows command-resolution problem above, this pattern is small and bounded enough to
  hand-roll with full control over its exact "never throw from cleanup" contract, and to test
  directly against a real spawned process tree.
- **Updating the README claim to "supported" without adding tests**, on the strength of manual
  verification alone: rejected — an unverified compatibility claim is exactly the gap the prior
  "Not tested" wording already flagged. A claim with no regression coverage behind it decays the
  first time someone changes `src/execution/` without knowing Bun/Deno exist.
- **Adding `bun`/`deno` keys under `package.json`'s `engines`**: rejected — npm's `engines`
  field is only meaningfully enforced by npm itself, and only for `node`/`npm`/`yarn`; Bun and
  Deno don't read it at all. The keys would be decorative, and nothing would ever catch them
  drifting out of date.
- **Running the full internal Vitest suite (not just a consumer-install-style E2E smoke test)
  under Bun/Deno**: rejected — the internal suite exercises `src/` via Node-specific tooling
  (`vitest`, V8 coverage) that was never meant to run cross-runtime. What a consumer actually
  needs proven is that the _published_ artifact works when imported from their runtime, which
  the consumer-install pattern already proves directly, at far lower cost.
- **Running `runtime-compat` across the full OS/Node matrix** used by the `verify` job:
  rejected — Bun/Deno compatibility doesn't depend on which Node version happens to also be
  installed on the runner (the two runtimes don't invoke Node's own binary at all), so repeating
  it per-Node-version would inflate CI time for no additional signal. Cross-OS Bun/Deno coverage
  was also considered and rejected for now — Bun and Deno each ship the same real, single-binary
  executable per OS with no Windows-`.cmd`-shim-style resolution gap of the kind this ADR's
  Windows section had to solve for `npm`.
