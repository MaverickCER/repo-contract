// Entry point for repo-contract's `docs` check (see repo-contract.config.ts).
// Runs two independent tools against the repository's documentation surface
// and combines their evidence into one JSON object:
//   - markdownlint-cli2: Markdown structural/style linting, scoped by
//     .markdownlint-cli2.jsonc (gitignore-aware, MD013 disabled, .changeset/
//     excluded -- see that file's own comments). It has no stdout JSON mode;
//     its own output formatter (markdownlint-cli2-formatter-json) writes to
//     reports/markdownlint.json instead, read back here after it runs -- the
//     same file-based pattern as the mutation/size/duplication checks.
//   - linkinator: broken-link detection across the same Markdown surface
//     (`--markdown`), a pinned devDependency (see package.json) invoked via
//     its own bin. Held on the `7` major rather than latest -- linkinator 8
//     raises its own engines requirement to Node `>=22`, incompatible with
//     this repository's own `>=20.0.0` floor
//     (specs/decisions/0009-self-hosting-tool-and-dependency-choices.md); `7.6.1` targets
//     `>=20`, comfortably inside that floor. Scoped to this repository's
//     actual documentation locations (root-level, specs/, .changeset/,
//     .github/) rather than a blanket "**/*.md" -- linkinator has no .gitignore
//     awareness of its own and would otherwise crawl every vendored README
//     under node_modules. `--retry` lets it back off and retry on HTTP 429
//     (rate-limited) responses instead of misreporting a live link as
//     broken.
// Report-only: findings from either tool never fail this script's own
// process -- that judgment belongs entirely to the `docs` check's policy,
// which reads this same JSON evidence. Only a genuine tool-infrastructure
// failure (a tool crashing, or producing output that can't be parsed) fails it.

import spawn from "cross-spawn"
import { readdir, readFile, rm } from "node:fs/promises"

const MARKDOWNLINT_REPORT_PATH = "reports/markdownlint.json"
const DOCS_GLOBS = ["*.md", "specs/**/*.md", ".changeset/**/*.md", ".github/**/*.md"]

// linkinator's own CLI hard-fails -- writing a plain-text warning to stdout instead of its
// documented JSON report -- whenever any glob argument it's given matches zero files (e.g. no
// changesets currently pending, so ".changeset/**/*.md" matches nothing). Pre-checking each
// pattern here and dropping the ones with no real match avoids ever triggering that failure mode,
// rather than pattern-matching its specific error text (a tool-implementation detail this script
// shouldn't depend on).
/**
 * @param pattern - One of DOCS_GLOBS's own two shapes: `"*.md"` (root directory only) or `"<dir>/**\/*.md"` (recursive within `<dir>`).
 * @returns Whether `pattern` matches at least one real `.md` file on disk.
 */
async function globHasMatch(pattern) {
  if (pattern === "*.md") {
    const entries = await readdir(".")
    return entries.some((entry) => entry.endsWith(".md"))
  }

  const dir = pattern.slice(0, pattern.indexOf("/**/"))
  let entries
  try {
    entries = await readdir(dir, { recursive: true })
  } catch {
    return false
  }
  return entries.some((entry) => entry.endsWith(".md"))
}

function runTool(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "inherit"] })

    let stdout = ""
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8")
    })

    child.once("error", (error) => {
      resolve({ ok: false, error: error.message })
    })
    child.once("close", () => {
      resolve({ ok: true, stdout })
    })
  })
}

async function runMarkdownlint() {
  await rm(MARKDOWNLINT_REPORT_PATH, { force: true })

  const spawned = await runTool("markdownlint-cli2", ["**/*.md"])

  if (!spawned.ok) {
    return { ok: false, error: spawned.error }
  }

  try {
    const raw = await readFile(MARKDOWNLINT_REPORT_PATH, "utf8")
    return { ok: true, value: JSON.parse(raw) }
  } catch (error) {
    return {
      ok: false,
      error: `markdownlint-cli2 did not produce its expected JSON report: ${error.message}`,
    }
  }
}

// GitHub returns 404 for a repo's `/security/advisories/new` unless that
// repo has "Private vulnerability reporting" explicitly toggled on in its
// settings -- a per-repo, per-account setting no docs link can be "correct"
// or "incorrect" about. Verifying that toggle is a release-checklist concern
// (and, before the repo even exists remotely, moot), not a link-integrity
// one, so this URL shape is exempted from the live crawl rather than kept
// permanently red.
const LINKINATOR_SKIP_PATTERNS = ["security/advisories/new"]

async function runLinkinator() {
  const matches = await Promise.all(DOCS_GLOBS.map((pattern) => globHasMatch(pattern)))
  const matchingGlobs = DOCS_GLOBS.filter((_pattern, index) => matches[index])

  if (matchingGlobs.length === 0) {
    return { ok: true, value: { links: [] } }
  }

  const spawned = await runTool("linkinator", [
    ...matchingGlobs,
    "--markdown",
    "--retry",
    ...LINKINATOR_SKIP_PATTERNS.flatMap((pattern) => ["--skip", pattern]),
    "--format",
    "json",
  ])

  if (!spawned.ok) {
    return { ok: false, error: spawned.error }
  }

  try {
    return { ok: true, value: JSON.parse(spawned.stdout) }
  } catch (error) {
    return { ok: false, error: `linkinator did not produce valid JSON: ${error.message}` }
  }
}

const [markdownlint, linkinator] = await Promise.all([runMarkdownlint(), runLinkinator()])

process.stdout.write(JSON.stringify({ markdownlint, linkinator }))

process.exitCode = markdownlint.ok && linkinator.ok ? 0 : 1
