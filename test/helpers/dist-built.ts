import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")

// The values CI tools use to mean "not CI"; anything else non-empty means CI.
const NOT_CI = new Set(["", "0", "false"])

/**
 * Whether `dist/` holds every file a suite imports or spawns. A local run without a build skips
 * the suite. In CI every job builds first, so a missing file is a broken job. The suite then
 * fails instead of passing with nothing run.
 * @param files - paths under `dist/`.
 * @param env - where `CI` is read; a test passes its own.
 * @param root - the package root; a test passes a scratch directory.
 * @returns whether every file exists.
 * @throws {Error} naming the missing files when `CI` is set.
 */
export function distBuilt(
  files: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
  root: string = packageRoot,
): boolean {
  const missing = files.filter((file) => !existsSync(path.join(root, "dist", file)))
  if (missing.length === 0) return true
  if (!NOT_CI.has(env.CI ?? "")) {
    throw new Error(
      `CI is set, but dist/ lacks ${missing.join(", ")}. Run npm run build before the tests.`,
    )
  }
  return false
}
