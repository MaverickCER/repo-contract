export const QUICK_START_USAGE: string
export const BEGIN_MARKER: string
export const END_MARKER: string
export type ParsedQuickStartArgs =
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "error"; message: string }
  | { kind: "run"; options: { readme: string; timeoutMs: number; json: boolean; cwd?: string } }
export function parseQuickStartArgs(argv: readonly string[]): ParsedQuickStartArgs
export type QuickStartBlock =
  { kind: "none" } | { kind: "invalid"; reason: string } | { kind: "found"; commands: string[] }
export function extractQuickStart(markdown: string): QuickStartBlock
export function installTarball(
  commands: readonly string[],
  packageName: string,
  tarball: string,
): { commands: string[]; installs: number }
export function runQuickStart(input: Record<string, unknown>): Promise<number>
