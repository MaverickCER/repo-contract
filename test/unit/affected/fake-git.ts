import type { GitCapabilities } from "../../../src/affected/index.js"

export interface FakeRepo {
  /** The tree at the merge base. */
  readonly base: Record<string, string>
  /** Tracked files in the working tree (a path absent here but present in `base` is deleted). */
  readonly work: Record<string, string>
  /** Untracked, non-ignored files. */
  readonly untracked?: Record<string, string>
  /** Refs `git merge-base <ref> HEAD` succeeds for. */
  readonly refs?: readonly string[]
  /** Commands (joined with spaces) that fail, returning undefined. */
  readonly failing?: readonly string[]
  /** Paths `readFile` cannot read even though git lists them. */
  readonly unreadable?: readonly string[]
}

export interface FakeCalls {
  readonly git: string[]
  readonly read: string[]
}

const SHA = "b".repeat(40)

/**
 * An in-memory stand-in for the handful of git commands the collector uses, with the real
 * `-z` output formats. Only what the collector needs is modelled.
 * @param repo - The repository state to serve.
 * @returns The capabilities and a record of every call made.
 */
export function fakeGit(repo: FakeRepo): { capabilities: GitCapabilities; calls: FakeCalls } {
  const calls: FakeCalls = { git: [], read: [] }
  const untracked = repo.untracked ?? {}
  const refs = repo.refs ?? ["origin/main"]

  const nameStatus = (): string => {
    const deleted = Object.keys(repo.base).filter((path) => !(path in repo.work))
    const added = Object.keys(repo.work).filter((path) => !(path in repo.base))
    const lines: string[] = []
    const renamedTo = new Set<string>()
    const renamedFrom = new Set<string>()
    for (const from of deleted) {
      const to = added.find((path) => repo.work[path] === repo.base[from] && !renamedTo.has(path))
      if (to !== undefined) {
        renamedTo.add(to)
        renamedFrom.add(from)
        lines.push(`R100\0${from}\0${to}\0`)
      }
    }
    for (const path of Object.keys(repo.work)) {
      if (path in repo.base && repo.base[path] !== repo.work[path]) {
        lines.push(`M\0${path}\0`)
      } else if (!(path in repo.base) && !renamedTo.has(path)) {
        lines.push(`A\0${path}\0`)
      }
    }
    for (const path of deleted) {
      if (!renamedFrom.has(path)) {
        lines.push(`D\0${path}\0`)
      }
    }
    return lines.join("")
  }

  const git = async (args: readonly string[]): Promise<string | undefined> => {
    const command = args.join(" ")
    calls.git.push(command)
    if (repo.failing?.includes(command) === true) {
      return undefined
    }
    if (args[0] === "merge-base") {
      return args[1] !== undefined && refs.includes(args[1]) && args[2] === "HEAD"
        ? `${SHA}\n`
        : undefined
    }
    if (args[0] === "diff") {
      return nameStatus()
    }
    if (args[0] === "ls-files") {
      const names = args.includes("--cached")
        ? [...Object.keys(repo.work), ...Object.keys(untracked)]
        : Object.keys(untracked)
      return names.map((name) => `${name}\0`).join("")
    }
    if (args[0] === "show") {
      const path = (args[1] ?? "").slice(SHA.length + 1)
      return (args[1] ?? "").startsWith(`${SHA}:`) ? repo.base[path] : undefined
    }
    return undefined
  }

  const readFile = async (path: string): Promise<string | undefined> => {
    calls.read.push(path)
    return repo.unreadable?.includes(path) === true
      ? undefined
      : (repo.work[path] ?? untracked[path])
  }

  return { capabilities: { git, readFile }, calls }
}
