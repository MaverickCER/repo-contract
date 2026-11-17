export const INIT_USAGE: string
export type ParsedInitArgs =
  | { kind: "help" }
  | { kind: "error"; message: string }
  | { kind: "run"; tier?: "basic" | "app" | "library" | "strict" }
export function parseInitArgs(argv: readonly string[]): ParsedInitArgs
export interface InitOutcome {
  configCreated: boolean
  runnerCreated: boolean
  scriptStatus: "created" | "unchanged" | "conflict" | "tsx-missing"
  detected: readonly string[]
  skipped: readonly { preset: string; dependency: string | readonly string[] }[]
  flat: boolean
  headline: readonly string[]
  tier:
    | {
        name: string
        checks: readonly string[]
        missing: readonly { check: string; dependency: string }[]
      }
    | undefined
  rerun: string
}
export function renderInitReport(outcome: InitOutcome): string
export function runInit(input: {
  argv: readonly string[]
  cwd: string
  stdout: (text: string) => void
  stderr: (text: string) => void
  loadTiers: () => Promise<{ tierChecks: (name: string) => readonly string[] }>
}): Promise<number>
