export const NPM_SCRIPT_USAGE: string
export type ParsedNpmScriptArgs =
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "error"; message: string }
  | {
      kind: "run"
      options: {
        script: string
        mustNotChange: string[]
        timeoutMs?: number
        json: boolean
        cwd?: string
      }
    }
export function parseNpmScriptArgs(argv: readonly string[]): ParsedNpmScriptArgs
export function runNpmScript(input: Record<string, unknown>): Promise<number>
export const MAX_OUTPUT_CHARS: number
export function outputTail(limit?: number): { push(chunk: string): void; text(): string }
export function stopProcessGroup(
  kill: (pid: number, signal: string) => unknown,
  pid: number | undefined,
): boolean
