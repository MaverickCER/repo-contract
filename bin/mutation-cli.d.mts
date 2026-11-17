export const MUTATION_USAGE: string
export const CAUGHT_ALONE: string
export interface MutationRunOptions {
  json: boolean
  shard?: string
  mutate?: string[]
  report?: string
  config?: string
  cache: "read-write" | "read-only" | "off"
  confirmTimeouts: number
  patchVitestRunner: boolean
  cwd?: string
}
export type ParsedMutationArgs =
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "error"; message: string }
  | { kind: "plan"; options: { json: boolean; config?: string; cwd?: string } }
  | { kind: "run"; options: MutationRunOptions }
export function parseMutationArgs(argv: readonly string[]): ParsedMutationArgs
export function runMutation(input: Record<string, unknown>): Promise<number>
