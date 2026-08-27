# 0004: Cross-platform command execution and process-tree cleanup

## Status

Accepted. Implemented in `src/config/tokenize-command.ts`, `src/execution/spawn-check.ts`,
`src/execution/process-tree.ts`.

## Context

`run: string` needs to become an executable and arguments without invoking a shell, so that no
untrusted value interpolated into it can inject a second command. An early design rejected every
character that _could_ be shell-significant, including glob characters — which would have rejected
extremely common, legitimate check commands (`eslint "src/**/*.ts"`), since many CLI tools
glob-expand their own arguments internally rather than relying on the shell to do it.

Separately, plain process spawning does not resolve Windows `.cmd`/shebang-based shims without
shell mode — a command like `npm run mutation`, this package's own canonical example, fails outright
on Windows without help. And a spawned command is often itself a wrapper (`npm test` spawns `npm`,
which spawns the real test runner) — a timeout or abort needs to kill the _whole_ tree, not just
the directly-spawned process, or it orphans the real work underneath it.

## Decision

**Tokenization**: only true shell/multi-command operators are rejected in unquoted position (`;`,
`&`, `|`, backtick, `$(`, `<`, `>`, a literal newline). Glob characters and a bare `$` are passed
through as literal argv content — since no shell is ever invoked in this path, they carry no
injection risk regardless of where they appear; the receiving tool decides what to do with the
literal text.

**Windows command resolution**: `cross-spawn` is the package's one runtime dependency, used
specifically to solve `.cmd`/PATHEXT resolution correctly. This is a deliberate, documented
deviation from this package's sibling projects' zero-runtime-dependency convention — justified
because this is the first package in the family that actually spawns processes at all.

**Process-tree cleanup** is hand-rolled, not a dependency: on POSIX, the check is spawned as a
process-group leader and the signal is sent to the whole group; on Windows, cleanup shells out to
the OS's own process-tree-kill facility. Already-exited PIDs and permission errors are treated as
no-ops, never crashes — a best-effort cleanup should never itself bring down the run.

## Consequences

- `run: "eslint 'src/**/*.ts'"` and its array-form equivalent behave identically; both tokenize and
  execute correctly.
- `run: "npm run test"`-style commands work on Windows without the consumer needing to opt into
  shell mode, which would reintroduce shell-injection surface for no reason.
- A timeout, an abort, or an external signal all terminate the _entire_ process tree a check
  spawned, not just its immediate child — preventing orphaned processes from accumulating.
- The Windows cleanup path cannot be exercised on any CI runner other than a real Windows one; it's
  covered by a dedicated Windows-only test, skipped elsewhere.

## Alternatives considered

- **Rejecting every shell-special character, including globs**: rejected once review found this
  would break the package's own primary example category (glob patterns in lint/format commands)
  for no actual security benefit, since no shell is ever invoked to expand them either way.
- **Hand-rolling Windows argument resolution/escaping** instead of depending on `cross-spawn`:
  rejected — this is exactly the class of subtle, security-adjacent bug that's notoriously easy to
  get wrong, and `cross-spawn` is already widely vetted (it's used internally by the npm CLI
  itself).
- **Adding a small `tree-kill`-style dependency** for process-tree cleanup: rejected — unlike the
  Windows command-resolution problem above, this pattern is small and bounded enough to hand-roll
  with full control over its exact "never throw from cleanup" contract, and to test directly against
  a real spawned process tree.
