/**
 * One log file per check, written as a run goes: the check's raw output the moment its evidence exists
 * ({@link onEvidenceSaveToRepoContractLogs}), then the verdict prepended to the top of the same file the moment
 * its policy returns it ({@link onVerdictPrependRepoContractLogs}). The console only has room for a verdict's reason;
 * the log keeps everything the tool printed, with the part worth reading first at the top. Pass the two hooks to
 * `runRepoContract` as its `onEvidence` and `onVerdict` options.
 *
 * A log is overwritten if it exists, and creating the evidence hook removes the logs of an earlier run, so the
 * folder only ever describes the run that just happened. Neither hook ever throws or changes what a run does:
 * a disk problem is reported once through `onProblem` and the run carries on. Writes happen in the order they
 * were asked for, in the background; `await` the store's `flush()` before reading the logs or ending the process.
 * @packageDocumentation
 */
import {
  mkdir as mkdirFromFs,
  readdir as readdirFromFs,
  readFile as readFileFromFs,
  rm as rmFromFs,
  writeFile as writeFileFromFs,
} from "node:fs/promises"
import path from "node:path"
import type { CheckEvidence, PolicyResult } from "../types.js"

/**
 * Which logs are kept: every check's, only the checks that did not pass, or none.
 * @beta
 */
export type RepoContractLogMode = "all" | "failing" | "off"

/**
 * The file operations the logs use; every one defaults to `node:fs/promises`' own. For tests, or a non-`node:fs` environment.
 * @beta
 */
export interface RepoContractLogsFileSystem {
  /** Creates the folder, and any missing parents, if it does not exist. */
  readonly mkdir: (folder: string) => Promise<void>
  /** Lists the names of the entries in a folder. */
  readonly readdir: (folder: string) => Promise<readonly string[]>
  /** Reads a file as text. */
  readonly readFile: (file: string) => Promise<string>
  /** Removes a file; a file that is already gone is not an error. */
  readonly rm: (file: string) => Promise<void>
  /** Writes (or overwrites) a file with the text. */
  readonly writeFile: (file: string, text: string) => Promise<void>
}

/**
 * Where and how logs are written.
 * @beta
 */
export interface RepoContractLogsOptions {
  /** The repository root the folder is resolved against. Defaults to the current working directory. */
  readonly cwd?: string
  /** The folder, relative to `cwd`. Defaults to `reports/contract/logs`. */
  readonly directory?: string
  /** Which logs to keep. Defaults to `"failing"`: a log for a check that passed is removed once its verdict is known. */
  readonly mode?: RepoContractLogMode
  /** Told once, with the reason, the first time a log cannot be written. Defaults to ignoring it. */
  readonly onProblem?: (message: string) => void
  /** Overrides how files are read and written. A store with its own file operations is not shared with other hooks: wire its `saveEvidence` and `prependVerdict` yourself. */
  readonly fs?: Partial<RepoContractLogsFileSystem>
}

/**
 * Where the log of a check lives, and what is written to it. No function throws.
 * @beta
 */
export interface RepoContractLogs {
  /** The folder the logs are in, relative to the repository root. */
  readonly directory: string
  /** Removes the `.log` files of an earlier run and starts empty. */
  readonly begin: () => void
  /** Writes (or overwrites) a check's log with its evidence. */
  readonly saveEvidence: (checkId: string, evidence: CheckEvidence) => void
  /**
   * Puts a verdict at the top of a check's log, replacing one already there. With the `"failing"` mode, a passing
   * check's log is removed instead.
   * @param checkId - the check.
   * @param label - what to call the result, for example `FAIL (advisory)`.
   * @param rationale - the verdict's whole reason.
   * @param passed - whether the check passed.
   */
  readonly prependVerdict: (
    checkId: string,
    label: string,
    rationale: string,
    passed: boolean,
  ) => void
  /**
   * Whether a log for a check has been written this run.
   * @param checkId - the check.
   * @returns `true` when its log exists.
   */
  readonly has: (checkId: string) => boolean
  /**
   * How many logs exist this run.
   * @returns the count.
   */
  readonly count: () => number
  /**
   * Waits for every write asked for so far.
   * @returns a promise that settles once they have finished; it never rejects.
   */
  readonly flush: () => Promise<void>
}

/**
 * The default folder, relative to the repository root.
 * @beta
 */
export const REPO_CONTRACT_LOG_DIRECTORY = path.join("reports", "contract", "logs")

/**
 * Starts the part of a log that is the check's evidence, so the verdict above it can be rewritten alone.
 * @beta
 */
export const REPO_CONTRACT_LOG_EVIDENCE_MARKER = "=== evidence ==="

const quote = (argument: string): string =>
  /^[\w./:=@%+-]+$/.test(argument) ? argument : JSON.stringify(argument)

const orNothing = (text: string): string => {
  const trimmed = text.trimEnd()
  return trimmed === "" ? "(nothing)" : trimmed
}

/**
 * @param checkId - the check.
 * @param evidence - what its process did.
 * @returns the evidence section of a log.
 */
function renderEvidence(checkId: string, evidence: CheckEvidence): string {
  const ended =
    evidence.status === "completed"
      ? `completed (exit code ${String(evidence.exitCode)})`
      : evidence.signal === null
        ? evidence.status
        : `${evidence.status} (${evidence.signal})`
  return [
    REPO_CONTRACT_LOG_EVIDENCE_MARKER,
    `Check: ${checkId}`,
    `Command: ${[evidence.command, ...evidence.args].map(quote).join(" ")}`,
    `Ended: ${ended}`,
    ...(evidence.spawnError === undefined ? [] : [`Could not start: ${evidence.spawnError}`]),
    `Started: ${evidence.startedAt}`,
    `Duration: ${String(evidence.durationMs)} ms`,
    "",
    "--- stdout ---",
    orNothing(evidence.stdout),
    "",
    "--- stderr ---",
    orNothing(evidence.stderr),
    "",
  ].join("\n")
}

// One store per folder and mode, so the two hooks, created apart, share what has been written.
const stores = new Map<string, RepoContractLogs>()

/**
 * The logs for one folder. The same options give the same logs, so a hook created here and another created
 * elsewhere agree on which files exist.
 * @param options - where and how to write.
 * @returns the log store.
 * @beta
 */
export function repoContractLogs(options: RepoContractLogsOptions = {}): RepoContractLogs {
  const directory = options.directory ?? REPO_CONTRACT_LOG_DIRECTORY
  const mode = options.mode ?? "failing"
  const folder = path.resolve(options.cwd ?? process.cwd(), directory)
  const key = `${folder}\0${mode}`
  const existing = options.fs === undefined ? stores.get(key) : undefined
  if (existing !== undefined) return existing
  const fs: RepoContractLogsFileSystem = {
    mkdir: async (target) => {
      await mkdirFromFs(target, { recursive: true })
    },
    readdir: (target) => readdirFromFs(target),
    readFile: (target) => readFileFromFs(target).then((buffer) => buffer.toString()),
    rm: (target) => rmFromFs(target, { force: true }),
    writeFile: (target, text) => writeFileFromFs(target, text),
    ...options.fs,
  }

  const written = new Set<string>()
  let reported = false
  // Writes run one after another in the order they were asked for, so a verdict always lands on the log it
  // belongs to, whichever hook asked first.
  let queue: Promise<void> = Promise.resolve()
  const enqueue = (action: () => Promise<void>): void => {
    queue = queue.then(action).catch((error: unknown) => {
      if (reported) return
      reported = true
      options.onProblem?.(
        `could not write a log: ${error instanceof Error ? error.message : String(error)}`,
      )
    })
  }
  // A check id is a key in the caller's config, so it is encoded into one file name: a separator or `..` in it
  // can never reach outside the folder or create a nested path.
  const file = (checkId: string): string => path.join(folder, `${encodeURIComponent(checkId)}.log`)

  const store: RepoContractLogs = {
    directory,
    begin: () => {
      written.clear()
      reported = false
      if (mode === "off") return
      enqueue(async () => {
        await fs.mkdir(folder)
        for (const name of await fs.readdir(folder)) {
          if (name.endsWith(".log")) await fs.rm(path.join(folder, name))
        }
      })
    },
    saveEvidence: (checkId, evidence) => {
      if (mode === "off") return
      written.add(checkId)
      enqueue(async () => {
        await fs.mkdir(folder)
        await fs.writeFile(file(checkId), renderEvidence(checkId, evidence))
      })
    },
    prependVerdict: (checkId, label, rationale, passed) => {
      // In off mode nothing is ever written, so `written` is empty and this also covers it.
      if (!written.has(checkId)) return
      if (mode === "failing" && passed) {
        written.delete(checkId)
        enqueue(() => fs.rm(file(checkId)))
        return
      }
      enqueue(async () => {
        const current = await fs.readFile(file(checkId))
        const markedAt = current.indexOf(REPO_CONTRACT_LOG_EVIDENCE_MARKER)
        const evidence = markedAt === -1 ? current : current.slice(markedAt)
        await fs.writeFile(
          file(checkId),
          `Verdict: ${label}\n\n${rationale.trimEnd()}\n\n${evidence}`,
        )
      })
    },
    has: (checkId) => written.has(checkId),
    count: () => written.size,
    flush: () => queue,
  }
  if (options.fs === undefined) stores.set(key, store)
  return store
}

/**
 * The `onEvidence` hook that saves each check's raw output to its log. Creating it removes the logs of an
 * earlier run.
 * @param options - where and how to write.
 * @returns the hook to pass as `onEvidence`.
 * @beta
 */
export function onEvidenceSaveToRepoContractLogs(
  options: RepoContractLogsOptions = {},
): (checkId: string, evidence: CheckEvidence) => void {
  const logs = repoContractLogs(options)
  logs.begin()
  return (checkId, evidence) => {
    logs.saveEvidence(checkId, evidence)
  }
}

/**
 * The `onVerdict` hook that puts each check's verdict at the top of its log. With the default `"failing"` mode, the
 * log of a check that passed is removed.
 * @param options - where and how to write; the same options as {@link onEvidenceSaveToRepoContractLogs}.
 * @returns the hook to pass as `onVerdict`.
 * @beta
 */
export function onVerdictPrependRepoContractLogs(
  options: RepoContractLogsOptions = {},
): (checkId: string, result: PolicyResult) => void {
  const logs = repoContractLogs(options)
  return (checkId, result) => {
    logs.prependVerdict(
      checkId,
      result.outcome.toUpperCase(),
      result.rationale,
      result.outcome === "pass",
    )
  }
}
