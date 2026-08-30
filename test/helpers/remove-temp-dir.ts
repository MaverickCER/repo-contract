import { rm } from "node:fs/promises"

/**
 * Recursively removes a scratch directory (typically an `os.tmpdir()` entry from `mkdtemp`),
 * tolerating the transient locks Windows holds on a file a just-returned process wrote -- a
 * Defender scan mid-flight, or the OS releasing the handle lazily. Several api-contract test
 * suites run real `@microsoft/api-extractor` / `tsc` passes against files under such a directory
 * and then remove it in `afterEach`; a bare `rm(dir, { recursive: true, force: true })` there
 * intermittently throws `EBUSY`/`EPERM` on windows-latest CI (never on Linux/macOS).
 *
 * `maxRetries`/`retryDelay` is Node's own backoff for exactly that errno set (`EBUSY`, `EMFILE`,
 * `ENFILE`, `ENOTEMPTY`, `EPERM`). A removal that still fails after the retries is swallowed: the
 * directory is a throwaway under `os.tmpdir()`, which the OS reaps regardless, and a suite's own
 * cleanup should never be what fails the run.
 * @param dir - Absolute path of the directory to remove; a nullish value is a no-op, so an
 * `afterEach` that runs before its `beforeEach` ever assigned the path stays harmless.
 */
export async function removeTempDir(dir: string | undefined | null): Promise<void> {
  if (dir === undefined || dir === null) return
  try {
    await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  } catch {
    // Best-effort -- see the doc comment.
  }
}
