import { spawn } from "node:child_process"

/**
 * The default `Spawner` for tests that don't specifically exercise the
 * spawn-injection contract itself -- a plain re-export of
 * `node:child_process.spawn`, not a wrapper, so tests exercise the exact
 * function a zero-dependency consumer would pass. See
 * specs/decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md.
 * `test/unit/execution/spawner-compatibility.test.ts` separately exercises
 * cross-spawn (dev-only) for parity.
 */
export const testSpawn = spawn
