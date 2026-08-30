import crossSpawn from "cross-spawn"
import { StringDecoder } from "node:string_decoder"
import { tokenizeRunString } from "../config/tokenize-command.js"
import { InvalidCheckConfigError } from "../errors.js"
import type { CheckDefinition, CheckEvidence, CheckStatus } from "../types.js"
import { composeSignals } from "./abort-signals.js"
import { killTree, shouldSpawnDetached } from "./process-tree.js"

// A configured check's command is repository-controlled, not attacker-input
// in the usual sense, but its OUTPUT is whatever that command chooses to
// print -- a misbehaving or compromised tool can still write without bound.
// Every check's stdout/stderr is retained in full for the life of the
// process (concatenated into a JS string) and then persisted verbatim into
// evidence/history.json forever, so leaving this uncapped is an unbounded
// memory and disk sink, not just a cosmetic concern. None of this
// repository's own checks rely on more than a few hundred KB of stdout
// content (the ones that produce large structured output write it to a
// `reports/*.json` file via `--output` instead -- see securitySecrets and
// arethetypeswrong's own run arrays -- precisely so stdout stays small); 10
// MiB per stream is generous headroom above that while still bounding a
// pathological or malicious command.
const MAX_CAPTURED_OUTPUT_BYTES = 10 * 1024 * 1024

// SIGTERM asks a process tree to exit cooperatively; nothing obliges it to.
// A check that traps or ignores SIGTERM (or a detached descendant that
// never receives it at all) would otherwise hang this promise -- and with
// it, the whole run -- forever, silently defeating both `timeoutMs` and a
// host SIGINT/SIGTERM. 2 seconds is generous for the short-lived CLI tools
// (linters, test runners, formatters) this library spawns to flush output
// and exit; it is not meant to accommodate a long-running service's graceful
// shutdown. Exported so run-checks.ts's own host-signal handler can wait out
// this same window before letting the host process itself exit -- otherwise
// the escalation this constant times would never get a chance to fire.
export const SIGKILL_GRACE_PERIOD_MS = 2000

/**
 * Accumulates a child process's stdout or stderr up to
 * `MAX_CAPTURED_OUTPUT_BYTES`, appending a truncation marker and discarding
 * further chunks once the cap is hit -- the process itself keeps running to
 * its real exit, only the retained text is bounded.
 *
 * Decodes with a stateful `StringDecoder` rather than `chunk.toString("utf8")` per chunk: Node
 * delivers `"data"` events at arbitrary byte boundaries that don't respect UTF-8 character
 * boundaries, so a multi-byte character split across two chunks would otherwise decode to a
 * replacement character on both sides of the split -- `StringDecoder` buffers a trailing partial
 * sequence internally and completes it once the rest arrives. The cap itself is tracked in real
 * bytes fed in (`chunk.byteLength`), not `value.length` (UTF-16 code units) -- for 3-byte-per-
 * character UTF-8 text, code-unit length undercounts actual bytes 3:1, which would otherwise let
 * up to ~3x the documented byte cap accumulate before truncation fires.
 * @returns an `append`/`value` pair: feed it chunks as they arrive, read the (possibly truncated) accumulated text once the process ends
 */
function createBoundedCollector(): { append(chunk: Buffer): void; value(): string } {
  // Node's own encoding normalization treats a falsy/unrecognized encoding argument as "utf8"
  // (confirmed empirically: `new StringDecoder("").encoding === "utf8"`, and it decodes identically
  // to an explicit `new StringDecoder("utf8")`, including for a multi-byte character split across
  // writes) -- this is the only encoding this collector is ever used with, so no other string value
  // is reachable here to distinguish "utf8" from any other literal.
  // Stryker disable next-line StringLiteral -- Node's own encoding normalization treats a falsy/unrecognized encoding argument as "utf8" (confirmed empirically: `new StringDecoder("").encoding === "utf8"`, decoding identically to an explicit "utf8", including for a multi-byte character split across writes); this is the only encoding this collector is ever used with, so no other string value is reachable here to distinguish it.
  const decoder = new StringDecoder("utf8")
  let value = ""
  let byteCount = 0
  let truncated = false
  return {
    append(chunk) {
      // Once truncated, `value`'s retained prefix (positions 0..CAP-1) can
      // never change again no matter what further chunks arrive -- slicing
      // to the same CAP from a longer string always yields the same prefix
      // it already had. So skipping further chunks here is unobservable
      // from the *content* `value()` ever returns; what it actually saves
      // is the repeated O(cap) slice+concat this function would otherwise
      // redo on every single subsequent chunk for a process that keeps
      // writing past the cap -- real, unbounded-with-chunk-count CPU work a
      // pathological or malicious command could otherwise force. No
      // deterministic, non-flaky test can observe that difference (only
      // timing can, which this project's own mutation policy already
      // refuses to treat as a real kill -- see checks/mutation.ts's
      // "Timed out" handling).
      // Stryker disable next-line ConditionalExpression -- removing this guard has no effect on the content `value()` ever returns (see comment above); it only removes an unbounded-with-chunk-count amount of wasted repeated work for a process that keeps writing past the cap, which no deterministic test can observe without relying on flaky timing.
      if (truncated) return
      byteCount += chunk.byteLength
      value += decoder.write(chunk)
      if (byteCount > MAX_CAPTURED_OUTPUT_BYTES) {
        // Same reasoning as the `if (truncated) return` guard above: leaving
        // this `false` never changes any content `value()` returns, only
        // how much repeated, wasted slice+concat work later chunks cause.
        // Stryker disable next-line BooleanLiteral -- leaving this false has no effect on returned content (see comment above and the identical reasoning on the `if (truncated) return` guard); it only removes an unbounded-with-chunk-count amount of wasted repeated work, which no deterministic test can observe without relying on flaky timing.
        truncated = true
        value = `${value.slice(0, MAX_CAPTURED_OUTPUT_BYTES)}\n...[output truncated at ${String(MAX_CAPTURED_OUTPUT_BYTES)} bytes]`
      }
    },
    value: () => value,
  }
}

/** Handle a caller can use to forcibly terminate one in-flight check's process tree, independent of that check's own timeout/abort wiring -- used by run-checks.ts to clean up every active check when the host process itself receives SIGINT/SIGTERM. */
export interface ActiveCheckHandle {
  kill(signal: NodeJS.Signals): void
}

/**
 *
 * @param checkId - the check's id, used only to attach context to a thrown `InvalidCheckConfigError`
 * @param check - the check definition whose `run` (and `shell`) determines the command and args to execute
 * @returns the resolved `command` and `args` to spawn, with `args` empty when `run` is a shell string
 */
function resolveCommand(
  checkId: string,
  check: CheckDefinition,
): { command: string; args: readonly string[] } {
  const run = check.run
  // `typeof run === "string"` narrows this two-member union reliably;
  // `Array.isArray` does not narrow a `readonly T[]` union member the same
  // way it narrows a mutable `T[]` one.
  if (typeof run !== "string") {
    const [command, ...args] = run
    // validate-config.ts already rejects an empty run array before this
    // function is ever reached in the normal runRepoContract pipeline; this
    // check re-asserts that same invariant defensively at this function's
    // own boundary, since resolveCommand has no compile-time guarantee of
    // it if called some other way (e.g. directly from a test).
    if (command === undefined) {
      throw new InvalidCheckConfigError(checkId, "run array must not be empty.")
    }
    return { command, args }
  }
  if (check.shell === true) {
    // Passed to the platform shell as a single command line; cross-spawn's
    // own `shell` option handles the platform-specific invocation. There is
    // no meaningful separate argv to report, so the whole string is
    // recorded as `command` with empty `args`.
    return { command: run, args: [] }
  }
  const [command, ...args] = tokenizeRunString(run, checkId)
  // tokenizeRunString already rejects an empty/whitespace-only string, so
  // this is unreachable in practice -- kept for the same reason as above.
  // Unlike the array-form check above, this one has no way to be exercised
  // directly (tokenizeRunString's own contract guarantees a non-empty
  // result or a throw, with no way to bypass it short of calling this
  // private function directly, which isn't exported).
  // Stryker disable EqualityOperator,ConditionalExpression,BlockStatement,StringLiteral,CallExpression -- unlike the array-form check above, this one has no way to be exercised directly: tokenizeRunString's own contract guarantees a non-empty result or a throw, with no way to bypass it short of calling this private function directly, which isn't exported.
  if (command === undefined) {
    throw new InvalidCheckConfigError(checkId, "run string is empty or contains only whitespace.")
  }
  // Stryker restore all
  return { command, args }
}

/**
 *
 * @param check - the check definition; unless `inheritEnv` is explicitly `false`, this process's own env is inherited and then overlaid with `check.env`
 * @returns the environment variables to pass to the spawned process
 */
function buildEnv(check: CheckDefinition): Record<string, string> {
  const base: Record<string, string> = {}
  if (check.inheritEnv !== false) {
    // eslint-disable-next-line n/no-process-env -- reading the ambient environment isn't a config smell here, it's the feature: `inheritEnv` (on by default) means the spawned check inherits this process's real env, exactly what this loop builds.
    for (const [key, value] of Object.entries(process.env)) {
      // `process.env`'s index signature is typed `string | undefined`, but
      // a real Node process never actually produces an `undefined` value
      // here for an own enumerable key -- assigning `undefined` to an env
      // var coerces it to the literal string `"undefined"` (confirmed
      // empirically). Kept only to satisfy that type, not because it
      // changes observed behavior.
      // Stryker disable next-line ConditionalExpression -- process.env's index signature is typed string | undefined, but a real Node process never actually produces an undefined value here for an own enumerable key; kept only to satisfy that type, not because it changes observed behavior.
      if (value !== undefined) base[key] = value
    }
  }
  return { ...base, ...check.env }
}

/**
 *
 * @param command - the resolved executable that was (or would have been) run
 * @param args - the resolved argument list passed to `command`
 * @param startedAt - when the check began running; used with the current time to compute `durationMs`
 * @param status - the terminal status to record (e.g. "completed", "timed_out", "aborted", "spawn_error")
 * @param exitCode - the process's exit code, or null if it never exited normally
 * @param signal - the signal that terminated the process, or null if it exited normally or never spawned
 * @param stdout - the process's captured stdout, if any was produced before it ended
 * @param stderr - the process's captured stderr, if any was produced before it ended
 * @param spawnError - the underlying spawn error message, present only when `status` is "spawn_error"
 * @param spawnErrorCode - the underlying spawn error's structured `ErrnoException.code`, present only when `status` is "spawn_error" and Node provided one
 * @returns a fully-formed `CheckEvidence`, with `completedAt`/`durationMs` computed from `startedAt` to now
 */
function terminalEvidence(
  command: string,
  args: readonly string[],
  startedAt: Date,
  status: CheckStatus,
  exitCode: number | null,
  signal: NodeJS.Signals | null,
  stdout = "",
  stderr = "",
  spawnError?: string,
  spawnErrorCode?: string,
): CheckEvidence {
  const completedAt = new Date()
  return {
    command,
    args,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(),
    exitCode,
    signal,
    stdout,
    stderr,
    status,
    ...(spawnError !== undefined ? { spawnError } : {}),
    ...(spawnErrorCode !== undefined ? { spawnErrorCode } : {}),
  }
}

/**
 * Runs one configured check end to end: resolves its command, spawns it,
 * enforces its timeout (if any), reacts to the run-level `AbortSignal` (if
 * any), captures stdout/stderr, and resolves to a fully-formed
 * `CheckEvidence` no matter how the process ended -- this function never
 * rejects. `activeHandles` is a shared registry the caller (run-checks.ts)
 * uses to kill every in-flight check on a host-process SIGINT/SIGTERM; this
 * function adds its own handle once the process has a pid and removes it
 * once the process has settled.
 *
 * A check whose `runSignal` is already aborted before this function is even
 * invoked (queued behind the concurrency limit when the run was cancelled)
 * never spawns at all, but still resolves to a well-formed `status:
 * "aborted"` evidence entry -- every configured check gets evidence and a
 * policy invocation regardless of whether it ever ran (see
 * specs/architecture.md).
 * @param checkId - the check's id, used for logging and passed through to `resolveCommand`
 * @param check - the check definition to run (command, timeout, env, cwd, shell, etc.)
 * @param runSignal - the whole run's abort signal, if any; already-aborted before this is called means the check never spawns
 * @param activeHandles - the shared registry this check's kill handle is added to while running, so a host-process SIGINT/SIGTERM can terminate it
 * @returns a fully-formed `CheckEvidence` reflecting however the process ended; this function itself never rejects
 */
export async function spawnCheck(
  checkId: string,
  check: CheckDefinition,
  runSignal: AbortSignal | undefined,
  activeHandles: Set<ActiveCheckHandle>,
): Promise<CheckEvidence> {
  const startedAt = new Date()
  const { command, args } = resolveCommand(checkId, check)

  if (runSignal?.aborted === true) {
    return terminalEvidence(command, args, startedAt, "aborted", null, null)
  }

  const env = buildEnv(check)

  let terminationReason: "aborted" | "timed_out" | null = null
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  const timeoutController = new AbortController()
  if (check.timeoutMs !== undefined) {
    // `setTimeout` truncates any delay above the 32-bit signed limit to 1ms
    // (with a `TimeoutOverflowWarning`), so a caller asking for a genuinely
    // long timeout -- e.g. `timeoutMs: 2_592_000_000` (30 days) -- would
    // otherwise fire the abort almost immediately and record `status:
    // "timed_out"` milliseconds after spawn. Clamp to the maximum delay
    // `setTimeout` can actually represent; anything at or above it is, in
    // practice, "effectively no timeout".
    const MAX_TIMER_DELAY_MS = 2_147_483_647
    const delay = Math.min(check.timeoutMs, MAX_TIMER_DELAY_MS)
    timeoutHandle = setTimeout(() => {
      timeoutController.abort()
    }, delay)
  }

  const { signal: effectiveSignal, dispose: disposeEffectiveSignal } = composeSignals(
    runSignal !== undefined ? [runSignal, timeoutController.signal] : [timeoutController.signal],
  )

  return new Promise<CheckEvidence>((resolve) => {
    const child = crossSpawn(command, args, {
      cwd: check.cwd,
      env,
      shell: check.shell === true,
      detached: shouldSpawnDetached(),
      // Windows-only cosmetic behavior (suppresses a console window flash)
      // with no effect on stdout/stderr/exitCode/signal on any platform, and
      // no Node API exposes it back for a test to observe either way.
      // Stryker disable next-line BooleanLiteral -- Windows-only cosmetic behavior (suppresses a console window flash) with no effect on stdout/stderr/exitCode/signal on any platform, and no Node API exposes it back for a test to observe either way.
      windowsHide: true,
    })

    const stdoutCollector = createBoundedCollector()
    const stderrCollector = createBoundedCollector()
    let handle: ActiveCheckHandle | undefined
    let escalationHandle: ReturnType<typeof setTimeout> | undefined
    let hostTerminated = false

    /**
     * Best-effort: swallows whatever `killTree` throws rather than letting it
     * escape. `killTree` deliberately rethrows a genuinely unexpected errno
     * (see process-tree.test.ts) so a real bug there isn't silently hidden
     * from a caller equipped to handle it -- but `killWithEscalation` is
     * invoked from inside an `AbortSignal` "abort" listener and, via
     * `ActiveCheckHandle.kill`, a `process.once(signal, ...)` handler in
     * run-checks.ts, and an exception escaping either of those crashes the
     * whole host process instead of merely failing this one check's cleanup.
     * @param pid - the root pid of the process tree to kill
     * @param signal - the signal to send
     */
    const bestEffortKillTree = (pid: number, signal: NodeJS.Signals): void => {
      try {
        killTree(pid, signal)
      } catch {
        // best-effort; see doc comment above
      }
    }

    /**
     * Kills the tree with `signal`, then schedules a SIGKILL follow-up
     * unless `signal` already was SIGKILL -- see `SIGKILL_GRACE_PERIOD_MS`.
     * A prior pending escalation is replaced, not stacked, since only the
     * most recent kill's grace period should apply.
     * @param pid - the root pid of the process tree to kill, forwarded to `killTree`
     * @param signal - the signal to send now; anything other than SIGKILL schedules a SIGKILL follow-up if the tree hasn't exited by then
     */
    const killWithEscalation = (pid: number, signal: NodeJS.Signals): void => {
      bestEffortKillTree(pid, signal)
      clearTimeout(escalationHandle)
      if (signal === "SIGKILL") return
      escalationHandle = setTimeout(() => {
        bestEffortKillTree(pid, "SIGKILL")
      }, SIGKILL_GRACE_PERIOD_MS)
    }

    if (child.pid !== undefined) {
      const pid = child.pid
      handle = {
        kill: (signal) => {
          // `ActiveCheckHandle.kill` is invoked only by run-checks.ts's host-process
          // SIGINT/SIGTERM cleanup (see that interface's own doc comment) -- repo-contract itself
          // is requesting this signal, just not via `options.signal`/`timeoutMs`, so the eventual
          // "close" status must not fall through to `"signaled"` (reserved for a signal
          // repo-contract did *not* request) the way it would if `terminationReason` were left
          // unset here too.
          hostTerminated = true
          killWithEscalation(pid, signal)
        },
      }
      activeHandles.add(handle)
    }

    // `child.stdout`/`child.stderr` are typed `Readable | null` (Node is
    // only ever `null` when `stdio` overrides that stream to something
    // other than "pipe"), but this call site never passes a `stdio` option,
    // so both are always real streams in practice -- confirmed empirically,
    // including for a spawn that fails outright (ENOENT). Kept only to
    // satisfy the type, not because it changes observed behavior.
    // Stryker disable next-line OptionalChaining -- child.stdout is typed Readable | null (Node is only ever null when stdio overrides that stream to something other than "pipe"), but this call site never passes a stdio option, so it's always a real stream in practice, confirmed empirically including for a spawn that fails outright (ENOENT).
    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutCollector.append(chunk)
    })
    // Same reasoning as the stdout guard above (which already covers
    // "both"), confirmed empirically here too: un-exempting this mutant and
    // running Stryker scoped to this file showed `OptionalChaining`'s
    // `child.stderr.on` replacement survives.
    // Stryker disable next-line OptionalChaining -- same reasoning as the stdout guard above (which already covers "both"), confirmed empirically here too: un-exempting this mutant and running Stryker scoped to this file showed OptionalChaining's child.stderr.on replacement survives.
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrCollector.append(chunk)
    })

    const onEffectiveAbort = (): void => {
      terminationReason = runSignal?.aborted === true ? "aborted" : "timed_out"
      // Deliberately NOT simplified to an unconditional `killTree` call: if
      // `child.pid` were ever genuinely undefined here (spawn failed but
      // "error" hasn't been reported yet), calling `killTree(undefined,
      // ...)` would throw synchronously inside this AbortSignal listener,
      // which Node reschedules onto `process.nextTick` as an *uncaught*
      // exception -- verified directly, not assumed -- which would crash
      // the whole test process rather than fail one assertion, making this
      // guard's absence unsafe to exercise via a real test.
      // The ConditionalExpression guard is covered by the rationale just
      // above. The "SIGTERM" string literal is separately unkillable:
      // confirmed empirically that Node's own process.kill() normalizes a
      // falsy/empty signal argument back to SIGTERM, so the OS-observed
      // signal is identical either way.
      // Stryker disable next-line EqualityOperator,ConditionalExpression,StringLiteral,CallExpression -- if child.pid were ever genuinely undefined here, calling killWithEscalation(undefined, ...) would throw synchronously inside this AbortSignal listener, which Node reschedules onto process.nextTick as an uncaught exception, crashing the whole test process rather than failing one assertion; the "SIGTERM" string literal is separately unkillable since Node's own process.kill() normalizes a falsy/empty signal argument back to SIGTERM, so the OS-observed signal is identical either way.
      if (child.pid !== undefined) killWithEscalation(child.pid, "SIGTERM")
    }
    // `effectiveSignal` fires "abort" at most once in its lifetime (an
    // AbortSignal cannot transition from aborted back to unaborted, so it
    // can never fire "abort" a second time) and is discarded once this
    // function resolves, so `{ once: true }` is provably redundant --
    // omitted rather than kept only to be marked equivalent.
    effectiveSignal.addEventListener("abort", onEffectiveAbort)

    const cleanup = (): void => {
      // `clearTimeout` silently no-ops for `undefined` (confirmed
      // empirically), so the `timeoutHandle !== undefined` guard that used
      // to wrap this call was provably redundant -- omitted rather than
      // kept only to be marked equivalent. Same reasoning covers
      // `escalationHandle`: a check that exited before any kill was ever
      // issued leaves it `undefined`, and a check that died from the
      // initial signal (the common case) never lets its escalation fire.
      clearTimeout(timeoutHandle)
      clearTimeout(escalationHandle)
      // Removing the wrong event name here has no test-observable effect
      // within a short-lived test (the real listener is attached to an
      // AbortController that's garbage-collected with the test, and
      // `effectiveSignal` only ever fires "abort" once in its lifetime
      // regardless) -- it matters for a long-running consumer process
      // avoiding a listener leak, not for anything this suite can directly
      // assert on.
      // Stryker disable next-line StringLiteral,CallExpression -- removing the wrong event name here has no test-observable effect within a short-lived test: the real listener is attached to an AbortController that's garbage-collected with the test, and effectiveSignal only ever fires "abort" once in its lifetime regardless; it matters for a long-running consumer process avoiding a listener leak, not for anything this suite can directly assert on.
      effectiveSignal.removeEventListener("abort", onEffectiveAbort)
      // Releases the manual fallback's own listeners on `runSignal`/
      // `timeoutController.signal` (a no-op on the native AbortSignal.any
      // path) -- without this, every check spawned during a run would leave
      // one permanent listener on the run's own long-lived shared signal.
      // See abort-signals.ts's composeSignals doc comment.
      disposeEffectiveSignal()
      // `handle` is `ActiveCheckHandle | undefined` (undefined exactly when
      // spawning itself failed and no pid was ever obtained, see below) --
      // this guard exists to satisfy Set#delete's parameter type, not
      // because calling delete(undefined) would behave differently at
      // runtime (Set#delete on a non-member value is already a silent
      // no-op), so no test can observe a difference either way.
      // Stryker disable next-line ConditionalExpression -- handle is ActiveCheckHandle | undefined exactly when spawning itself failed and no pid was ever obtained (see below); this guard exists to satisfy Set#delete's parameter type, not because calling delete(undefined) would behave differently at runtime -- Set#delete on a non-member value is already a silent no-op.
      if (handle !== undefined) activeHandles.delete(handle)
    }

    // A spawn failure (e.g. the executable does not exist) emits "error" --
    // Node does not throw synchronously from spawn() for this case.
    child.once("error", (error: NodeJS.ErrnoException) => {
      cleanup()
      resolve(
        terminalEvidence(
          command,
          args,
          startedAt,
          "spawn_error",
          null,
          null,
          stdoutCollector.value(),
          stderrCollector.value(),
          error.message,
          error.code,
        ),
      )
    })

    // "close", not "exit": Node's own docs warn that "exit" can fire before
    // the child's stdio streams have finished delivering their final
    // buffered data -- resolving on "exit" risks silently truncating
    // stdout/stderr for a process that writes a lot of output right before
    // exiting (confirmed for real during implementation against secretlint's
    // own output, not a hypothetical). "close" fires only after every stdio
    // stream has ended, and still carries the same (code, signal) pair.
    child.once("close", (code, signal) => {
      cleanup()
      const status: CheckStatus =
        // A kill via ActiveCheckHandle.kill (host SIGINT/SIGTERM cleanup, see that interface's own
        // doc comment) is classified first -- ahead of terminationReason. run-checks.ts's handler
        // aborts `hostAbortController` (composed into `runSignal`) *before* calling handle.kill(),
        // which it must, so the scheduler stops launching queued checks synchronously; that abort
        // fires this check's own effectiveSignal listener, which sets terminationReason to
        // "aborted" (runSignal is aborted by then). Checking terminationReason first would
        // therefore misreport every host-Ctrl+C-killed check as "aborted" -- indistinguishable
        // from an options.signal cancellation -- and leave "host_terminated" unreachable.
        hostTerminated
          ? "host_terminated"
          : terminationReason === "aborted"
            ? "aborted"
            : terminationReason === "timed_out"
              ? "timed_out"
              : // Node's own child_process contract guarantees exactly one of
                // code/signal is non-null on a normal "exit" event, making
                // `signal !== null` here effectively redundant given
                // `code === null` already -- kept as a belt-and-suspenders
                // check against that contract rather than assumed absolute,
                // since it is difficult to construct a real counterexample to
                // test against (both null, or both non-null, simultaneously).
                // Stryker disable next-line ConditionalExpression,EqualityOperator,LogicalOperator -- Node's own child_process contract guarantees exactly one of code/signal is non-null on a normal "exit" event, making signal !== null here effectively redundant given code === null already; kept as a belt-and-suspenders check against that contract rather than assumed absolute, since it is difficult to construct a real counterexample to test against (both null, or both non-null, simultaneously).
                code === null && signal !== null
                ? "signaled"
                : "completed"
      resolve(
        terminalEvidence(
          command,
          args,
          startedAt,
          status,
          code,
          signal,
          stdoutCollector.value(),
          stderrCollector.value(),
        ),
      )
    })
  })
}
