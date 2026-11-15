import { spawn } from "node:child_process"

/**
 * The default `Spawner` for tests that don't exercise the spawn-injection
 * contract itself. It re-exports `node:child_process.spawn` without a
 * wrapper, so tests run the same function a zero-dependency consumer would
 * pass. See
 * specs/decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md.
 * `test/unit/execution/spawner-compatibility.test.ts` separately exercises
 * cross-spawn (dev-only) for parity.
 */
export const testSpawn = spawn
