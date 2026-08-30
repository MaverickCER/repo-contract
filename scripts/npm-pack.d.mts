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
  readonly stdout: string
  readonly stderr: string
  readonly error?: Error
}
