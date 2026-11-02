/** Facts about a repository, gathered by the caller; `diagnose` reads no file itself. */
export interface DoctorSnapshot {
  /** The root `.gitignore`'s content, or `undefined` if there is none. */
  readonly gitignore?: string | undefined
  /** Every vitest config file found, with its content. */
  readonly vitestConfigs: readonly { readonly path: string; readonly text: string }[]
  /** Every GitHub Actions workflow file, with its content. */
  readonly workflows: readonly { readonly path: string; readonly text: string }[]
  /** Whether the git hooks that run the contract are installed. */
  readonly hooksInstalled: boolean
  /** Source files that re-export with `export *`. */
  readonly starExportFiles: readonly string[]
}

/** A mechanical change a finding can be repaired with: text appended to a file. */
export interface DoctorFix {
  readonly file: string
  readonly append: string
}

export type FindingSeverity = "warn" | "info"

/** One thing worth changing, and how. */
export interface DoctorFinding {
  readonly id: string
  readonly severity: FindingSeverity
  readonly message: string
  readonly hint: string
  /** Present only when the repair is safe to apply without a human deciding anything. */
  readonly fix?: DoctorFix
}

export interface DoctorReport {
  /** True when there is nothing to report. */
  readonly clean: boolean
  readonly findings: readonly DoctorFinding[]
}

/** One file a set of fixes would change. */
export interface PlannedChange {
  readonly file: string
  readonly before: string | undefined
  readonly after: string
}

const CACHE_RULE = ".repo-contract/cache/"
const CACHE_IGNORED = /^\/?\.repo-contract\/cache\/?$/
const JSON_REPORTER = /["'`]json["'`]/
// The `reporter: [...]` that follows a `coverage:` key; a config that sets none is not judged.
const COVERAGE_REPORTERS = /\bcoverage\s*:[\s\S]*?\breporter\s*:\s*\[([^\]]*)\]/
const CHECKOUT = /uses:\s*actions\/checkout/
const FULL_HISTORY = /fetch-depth:\s*["']?0["']?\s*(?:$|#|\r?\n)/m
const USES_CONTRACT = /npm run contract|repo-contract|npx internal-package-contract/

const cacheNotIgnored = (snapshot: DoctorSnapshot): DoctorFinding[] =>
  snapshot.gitignore?.split("\n").some((line) => CACHE_IGNORED.test(line.trim())) === true
    ? []
    : [
        {
          id: "cache-not-ignored",
          severity: "warn",
          message: `${CACHE_RULE} is not in .gitignore, so cached results could be committed.`,
          hint: `Add ${CACHE_RULE} to .gitignore (other files under .repo-contract/ stay tracked).`,
          fix: { file: ".gitignore", append: `${CACHE_RULE}\n` },
        },
      ]

const coverageJsonReporter = (snapshot: DoctorSnapshot): DoctorFinding[] =>
  snapshot.vitestConfigs
    .filter(({ text }) => {
      const reporters = COVERAGE_REPORTERS.exec(text)?.[1]
      return reporters !== undefined && !JSON_REPORTER.test(reporters)
    })
    .map(({ path }) => ({
      id: "coverage-json-reporter",
      severity: "warn" as const,
      message: `${path} configures coverage without the "json" reporter, which affected-scope coverage reads.`,
      hint: 'Add "json" to coverage.reporter.',
    }))

const checkoutShallow = (snapshot: DoctorSnapshot): DoctorFinding[] =>
  snapshot.workflows
    .filter(
      ({ text }) => CHECKOUT.test(text) && USES_CONTRACT.test(text) && !FULL_HISTORY.test(text),
    )
    .map(({ path }) => ({
      id: "checkout-shallow",
      severity: "warn" as const,
      message: `${path} runs the contract after a shallow checkout, so the affected analysis cannot see the base commit and runs everything.`,
      hint: "Set fetch-depth: 0 on actions/checkout.",
    }))

const hooksMissing = (snapshot: DoctorSnapshot): DoctorFinding[] =>
  snapshot.hooksInstalled
    ? []
    : [
        {
          id: "hooks-missing",
          severity: "info",
          message: "The git hooks that run the contract are not installed.",
          hint: "Install them so a commit is checked before it leaves the machine.",
        },
      ]

const starExports = (snapshot: DoctorSnapshot): DoctorFinding[] =>
  snapshot.starExportFiles.length === 0
    ? []
    : [
        {
          id: "star-exports",
          severity: "info",
          message: `export * makes a change to any module behind it widen to everything that imports the barrel: ${snapshot.starExportFiles.join(", ")}.`,
          hint: "Re-export by name where the barrel is large.",
        },
      ]

/**
 * Looks for settings that make the affected-scope feature slower or wrong. Findings are ordered
 * by severity (warnings first), then id, so the most useful change is first.
 * @param snapshot - Facts about the repository.
 * @returns The findings.
 */
export function diagnose(snapshot: DoctorSnapshot): DoctorReport {
  // Rules run in id order, so within a severity the findings are in id order already.
  const found = [
    ...cacheNotIgnored(snapshot),
    ...checkoutShallow(snapshot),
    ...coverageJsonReporter(snapshot),
    ...hooksMissing(snapshot),
    ...starExports(snapshot),
  ]
  const findings = [
    ...found.filter((finding) => finding.severity === "warn"),
    ...found.filter((finding) => finding.severity === "info"),
  ]
  return { clean: found.length === 0, findings }
}

/**
 * Works out what applying the findings' fixes would change, without touching anything: the caller
 * shows the difference, then writes it. Idempotent: text already present is not appended again.
 * @param findings - Findings from {@link diagnose}.
 * @param files - The current content of every file a fix may touch (absent means it does not exist).
 * @returns One change per file that would differ.
 */
export function planFixes(
  findings: readonly DoctorFinding[],
  files: Readonly<Record<string, string | undefined>>,
): PlannedChange[] {
  const changes = new Map<string, PlannedChange>()
  for (const { fix } of findings) {
    if (fix === undefined) continue
    const before = files[fix.file]
    const current = changes.get(fix.file)?.after ?? before ?? ""
    if (current.split("\n").some((line) => line.trim() === fix.append.trim())) continue
    const separator = current === "" || current.endsWith("\n") ? "" : "\n"
    changes.set(fix.file, { file: fix.file, before, after: `${current}${separator}${fix.append}` })
  }
  return [...changes.values()]
}
