import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { AFFECTED_USAGE, parseAffectedArgs } from "../../../bin/affected-cli.mjs"
import { CACHE_USAGE, parseCacheArgs } from "../../../bin/cache-cli.mjs"
import { DOCTOR_USAGE, parseDoctorArgs } from "../../../bin/doctor-cli.mjs"
import { MERGE_MUTATION_USAGE, parseMergeMutationArgs } from "../../../bin/merge-mutation-cli.mjs"
import { METRICS_USAGE, parseMetricsArgs } from "../../../bin/metrics-cli.mjs"
import { parseFailFastArgs, parseScopeArgs } from "../../../src/affected/index.js"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const guide = readFileSync(path.join(root, "GUIDE.md"), "utf8")
const readme = readFileSync(path.join(root, "README.md"), "utf8")

type Parse = (argv: readonly string[]) => { kind: string; message?: string }

/** Each `repo-contract` command that takes options: its `--help` text and its argument parser. */
const COMMANDS: Record<string, { readonly usage: string; readonly parse: Parse }> = {
  affected: { usage: AFFECTED_USAGE, parse: parseAffectedArgs },
  cache: { usage: CACHE_USAGE, parse: parseCacheArgs },
  doctor: { usage: DOCTOR_USAGE, parse: parseDoctorArgs },
  metrics: { usage: METRICS_USAGE, parse: parseMetricsArgs },
  "merge-mutation": { usage: MERGE_MUTATION_USAGE, parse: parseMergeMutationArgs },
}

/** `--help` and `--version` work the same in every command, so GUIDE.md need not repeat them. */
const UNIVERSAL = new Set(["-h", "--help", "-V", "--version"])

const FLAG = /^(--[a-z][a-z-]*|-[A-Za-z])(=.*)?$/

/**
 * @param parse - A command's argument parser.
 * @param flag - An option name.
 * @returns Whether the parser knows the option. A known option given alone may still be a usage
 * error (a missing value), but never an unknown one.
 */
function knows(parse: Parse, flag: string): boolean {
  return parse([flag]).message !== `unknown option '${flag}'`
}

/**
 * @param flag - An option name GUIDE.md shows outside a command line.
 * @returns Whether a `repo-contract` command, or a runner-argument parser GUIDE.md documents
 * (`parseScopeArgs`, `parseFailFastArgs`), knows it.
 */
function knownAnywhere(flag: string): boolean {
  if (Object.values(COMMANDS).some(({ parse }) => knows(parse, flag))) return true
  const scope = parseScopeArgs([flag])
  if (!scope.ok || !scope.rest.includes(flag)) return true
  return !parseFailFastArgs([flag]).rest.includes(flag)
}

/** GUIDE.md's "Running less" section, where the commands and their options are documented. */
function runningLessSection(): string {
  const start = guide.indexOf("\n## Running less")
  const end = guide.indexOf("\n## ", start + 1)
  return guide.slice(start, end)
}

/**
 * @param text - Markdown.
 * @returns The inline code spans outside fenced blocks, and the lines inside them.
 */
function codeOf(text: string): { readonly spans: string[]; readonly blockLines: string[] } {
  const spans: string[] = []
  const blockLines: string[] = []
  let fenced = false
  for (const line of text.split("\n")) {
    if (line.startsWith("```")) fenced = !fenced
    else if (fenced) blockLines.push(line)
    else spans.push(...[...line.matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? ""))
  }
  return { spans, blockLines }
}

/**
 * @param code - One inline code span or one line of a fenced block.
 * @returns The `repo-contract <command> ...` line it shows, with the shell comment and any pipe cut
 * off, or `undefined` when it shows none.
 */
function invocationIn(
  code: string,
): { readonly command: string; readonly argv: string[] } | undefined {
  // An install line names the package, not a command: `npm install --save-dev repo-contract tsx`.
  if (/\b(?:install|add)\b/.test(code)) return undefined
  const match = /(?:^|\s)repo-contract ([a-z-]+)((?: [^#|]*)?)/.exec(code)
  if (match?.[1] === undefined) return undefined
  return { command: match[1], argv: (match[2] ?? "").trim().split(/\s+/).filter(Boolean) }
}

/**
 * @param text - Markdown.
 * @returns Every `repo-contract <command> ...` line the text shows, in a fenced block or an inline
 * code span.
 */
function invocations(text: string): { readonly command: string; readonly argv: string[] }[] {
  const { spans, blockLines } = codeOf(text)
  return [...spans, ...blockLines].flatMap((code) => {
    const found = invocationIn(code)
    return found === undefined ? [] : [found]
  })
}

/**
 * @param found - Command lines a document shows.
 * @returns One message for each line its command's argument parser rejects.
 */
function rejectedInvocations(
  found: readonly { readonly command: string; readonly argv: string[] }[],
): string[] {
  return found.flatMap(({ command, argv }) => {
    const line = `repo-contract ${[command, ...argv].join(" ")}`
    if (command === "init") return argv.length === 0 ? [] : [`${line}: init takes no arguments`]
    const entry = COMMANDS[command]
    if (entry === undefined) return [`${line}: no such command`]
    const parsed = entry.parse(argv)
    return parsed.kind === "run" ? [] : [`${line}: ${parsed.message ?? parsed.kind}`]
  })
}

/**
 * README.md names a command's options beside its command line, in their own code spans on the
 * same line (`affected --base ...`, then `--explain`).
 * @param text - Markdown.
 * @returns For each line outside fenced blocks that shows a command line, the command and every
 * flag the line's code spans name.
 */
function flagsBesideInvocations(
  text: string,
): { readonly command: string; readonly flags: string[] }[] {
  let fenced = false
  return text.split("\n").flatMap((line) => {
    if (line.startsWith("```")) fenced = !fenced
    if (fenced || line.startsWith("```")) return []
    const spans = [...line.matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? "")
    const command = spans.map(invocationIn).find((found) => found !== undefined)?.command
    if (command === undefined) return []
    const flags = spans.flatMap((span) =>
      span
        .split(/\s+/)
        .map((word) => FLAG.exec(word)?.[1])
        .filter((flag): flag is string => flag !== undefined),
    )
    return [{ command, flags }]
  })
}

/**
 * @param usage - A command's `--help` text.
 * @returns Every option its "Options:" list names, except the universal ones.
 */
function usageFlags(usage: string): string[] {
  const options = usage.slice(usage.indexOf("\nOptions:\n")).split("\n\n")[0] ?? ""
  const flags = [
    ...options.matchAll(/^ {2}(-[A-Za-z]|--[a-z][a-z-]*)(?:, (--[a-z][a-z-]*))?/gm),
  ].flatMap((match) => [match[1], match[2]].filter((flag) => flag !== undefined))
  return flags.filter((flag) => !UNIVERSAL.has(flag))
}

describe("GUIDE.md's CLI commands and flags", () => {
  it("shows command lines that each command's own argument parser accepts", () => {
    const found = invocations(guide)
    expect(found.map(({ command }) => command)).toEqual(
      expect.arrayContaining(["affected", "cache", "doctor", "metrics", "merge-mutation", "init"]),
    )
    expect(rejectedInvocations(found)).toEqual([])
  })

  it("names only flags that a command or a documented runner-argument parser knows", () => {
    const { spans } = codeOf(runningLessSection())
    const flags = spans.flatMap((span) =>
      span
        .split(/\s+/)
        .map((word) => FLAG.exec(word)?.[1])
        .filter((flag): flag is string => flag !== undefined),
    )
    expect(flags.length).toBeGreaterThan(0)
    expect([...new Set(flags)].filter((flag) => !knownAnywhere(flag))).toEqual([])
  })

  it("lists in each command's --help only options its parser accepts", () => {
    const unknown = Object.entries(COMMANDS).flatMap(([command, { usage, parse }]) =>
      usageFlags(usage)
        .filter((flag) => !knows(parse, flag))
        .map((flag) => `${command} ${flag}`),
    )
    expect(unknown).toEqual([])
  })

  it("documents every option each command's --help lists", () => {
    const { spans, blockLines } = codeOf(runningLessSection())
    const shown = new Set(
      [...spans, ...blockLines].flatMap((code) =>
        code
          .split(/\s+/)
          .map((word) => FLAG.exec(word)?.[1])
          .filter((flag): flag is string => flag !== undefined),
      ),
    )
    const missing = Object.entries(COMMANDS).flatMap(([command, { usage }]) =>
      usageFlags(usage)
        .filter((flag) => !shown.has(flag))
        .map((flag) => `${command} ${flag}`),
    )
    expect(missing).toEqual([])
  })

  it("rejects an option no command has, and reads each --help option list, so the probes can fail", () => {
    expect(knownAnywhere("--no-such-option")).toBe(false)
    expect(usageFlags(AFFECTED_USAGE)).toEqual(expect.arrayContaining(["--tsconfig", "-C"]))
    expect(usageFlags(CACHE_USAGE)).toEqual(expect.arrayContaining(["--inputs", "--max-age"]))
  })
})

describe("README.md's CLI commands and flags", () => {
  it("shows command lines that each command's own argument parser accepts", () => {
    const found = invocations(readme)
    expect(found.map(({ command }) => command)).toEqual(
      expect.arrayContaining(["affected", "init"]),
    )
    expect(rejectedInvocations(found)).toEqual([])
  })

  it("names beside a command line only flags that command's parser knows", () => {
    const lines = flagsBesideInvocations(readme)
    expect(lines.flatMap(({ flags }) => flags)).toEqual(
      expect.arrayContaining(["--base", "--explain"]),
    )
    const unknown = lines.flatMap(({ command, flags }) => {
      const parse = COMMANDS[command]?.parse
      return flags
        .filter((flag) => parse === undefined || !knows(parse, flag))
        .map((flag) => `${command} ${flag}`)
    })
    expect(unknown).toEqual([])
  })

  it("rejects a flag the command does not have, so the probe can fail", () => {
    const probe = flagsBesideInvocations(
      "`repo-contract affected --base x`, and `--no-such-option`",
    )
    expect(probe).toEqual([{ command: "affected", flags: ["--base", "--no-such-option"] }])
    expect(knows(parseAffectedArgs, "--no-such-option")).toBe(false)
  })
})
