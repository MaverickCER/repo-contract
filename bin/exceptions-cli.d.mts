export const EXCEPTIONS_USAGE: string
export type ParsedExceptionsArgs =
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "error"; message: string }
  | { kind: "run"; options: { dir: string; json: boolean; cwd?: string } }
export function parseExceptionsArgs(argv: readonly string[]): ParsedExceptionsArgs
export function runExceptions(input: Record<string, unknown>): Promise<number>
