export declare function parseNpmPackFilename(stdout: string, stderr?: string): string

export declare function packTarball(
  destinationDir: string,
  options?: { readonly cwd?: string },
): { readonly filename: string; readonly tarballPath: string }

export declare const NPM_COMMAND: string
