export const MERGE_MUTATION_USAGE: string
export type ParsedMergeMutationArgs =
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "error"; message: string }
  | {
      kind: "run"
      options: {
        total: number
        reports: { shard: number; file: string }[]
        out?: string
        cwd?: string
      }
    }
export function parseMergeMutationArgs(argv: readonly string[]): ParsedMergeMutationArgs
export function runMergeMutation(input: Record<string, unknown>): Promise<number>
