export declare function parseNpmPackFilename(stdout: string, stderr?: string): string

export declare function packTarball(
  destinationDir: string,
  options?: { readonly cwd?: string },
): { readonly filename: string; readonly tarballPath: string }

export declare function runNpm(
  args: readonly string[],
  options?: { readonly cwd?: string },
): {
  readonly status: number | null
  // `null` when the child process never started (cross-spawn/spawnSync returns
  // `stdout`/`stderr` as `null` in that case, alongside `error`).
  readonly stdout: string | null
  readonly stderr: string | null
  readonly error?: Error
}
