import { rm } from "node:fs/promises"

/**
 * Recursively removes a scratch directory (typically an `os.tmpdir()` entry from `mkdtemp`). It
 * tolerates the transient locks Windows holds on a file a just-returned process wrote. A
 * Defender scan may be mid-flight, or the OS may release the handle lazily. Several integration suites run
 * subprocesses against files in such a directory, then remove it in `afterEach`. Examples:
 * pack-consumer.ts's `npm pack`, github-actions's `tsc` pass, and suppression-governance's
 * discover-suppressions. A bare `rm(dir, { recursive: true, force: true })` there intermittently
 * throws `EBUSY`/`EPERM` on windows-latest CI (never on Linux/macOS).
 *
 * `maxRetries`/`retryDelay` is Node's backoff for that errno set (`EBUSY`, `EMFILE`, `ENFILE`,
 * `ENOTEMPTY`, `EPERM`). A removal that still fails after the retries is swallowed. The directory
 * is a throwaway under `os.tmpdir()`, which the OS reaps regardless. Cleanup must never be what
 * fails the run.
 * @param dir - Absolute path of the directory to remove; a nullish value is a no-op, so an
 * `afterEach` that runs before its `beforeEach` ever assigned the path stays harmless.
 */
export async function removeTempDir(dir: string | undefined | null): Promise<void> {
  if (dir === undefined || dir === null) return
  try {
    await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  } catch {
    // Best-effort: see the doc comment.
  }
}
