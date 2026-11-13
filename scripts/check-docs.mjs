// Entry point for repo-contract's `docs` check (see repo-contract.config.ts).
// Runs two independent tools against the repository's documentation surface
// and combines their evidence into one JSON object:
//   - markdownlint-cli2: Markdown structural/style linting, scoped by
//     .markdownlint-cli2.jsonc (gitignore-aware, MD013 disabled, .changeset/
//     excluded: see that file's own comments). It has no stdout JSON mode.
//     Its own output formatter (markdownlint-cli2-formatter-json) writes to
//     reports/markdownlint.json instead, and this script reads it back after
//     the run. It is the same file-based pattern as the
//     mutation/size/duplication checks.
//   - linkinator: broken-link detection across the same Markdown surface
//     (`--markdown`), a devDependency (see package.json) invoked via its own
//     bin. Version 8 of linkinator requires Node `>=22`, which is fine. The
//     verification toolchain already runs only on the modern Node line
//     (`.nvmrc`, and `.github/workflows/ci.yml`'s own note). That is well
//     above the published package's `engines.node >=22` consumer floor. The
//     `published-floor` job proves that floor independently with no dev
//     dependencies installed.
//     The crawl is scoped to this repository's actual documentation
//     locations (root-level, specs/, .github/) rather than a blanket
//     recursive `*.md` glob. Linkinator has no .gitignore awareness of its
//     own and would otherwise crawl every vendored README under
//     node_modules. `--retry` lets it back off and retry on HTTP 429
//     (rate-limited) responses instead of misreporting a live link as
//     broken.
// Report-only: findings from either tool never fail this script's own
// process. That judgment belongs entirely to the `docs` check's policy,
// which reads this same JSON evidence. Only a genuine tool-infrastructure
// failure (a tool crashing, or producing output that can't be parsed) fails it.

import spawn from "cross-spawn"
import { mkdir, readdir, readFile, rm } from "node:fs/promises"
import { pathToFileURL } from "node:url"

const MARKDOWNLINT_REPORT_PATH = "reports/markdownlint.json"
const REPORTS_DIR = "reports"
const DOCS_GLOBS = ["*.md", "specs/**/*.md", ".github/**/*.md"]

// Linkinator's own CLI hard-fails whenever any glob argument it's given matches zero files. It
// then writes a plain-text warning to stdout instead of its documented JSON report. Pre-checking
// each pattern here and dropping the ones with no real match avoids ever triggering that failure
// mode. The alternative, pattern-matching its specific error text, would depend on a
// tool-implementation detail this script shouldn't rely on.
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
  // The markdownlint-cli2-formatter-json formatter writes MARKDOWNLINT_REPORT_PATH but does not
  // create its parent. `reports/` is git-ignored, so a clean checkout won't have it until some
  // other check happens to create it first. Don't depend on scheduling luck.
  await mkdir(REPORTS_DIR, { recursive: true })
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
// settings. That is a per-repo, per-account setting no docs link can be
// "correct" or "incorrect" about. Verifying that toggle is a
// release-checklist concern, not a link-integrity one. Before the repo even
// exists remotely it is moot. This URL shape is therefore exempted from the
// live crawl rather than kept permanently red.
//
// CHANGELOG.md (generated by Changesets; older entries by release-please) links each release heading at
// github.com/maverickcer/repo-contract/compare/<prev>...<next> and
// .../releases/tag/<tag>. The `<next>` tag is created only when the Release
// PR merges. While that PR's own CI runs, the newest link 404s transiently
// even though it is correct by construction. Exempt only this repo's own
// version URLs rather than let a mid-release CI go red. A compare/tag link
// under any other owner (a fork, a typo) is still crawled.
//
// README.md links the generated HTML API reference at its deployed GitHub
// Pages URL. That is docs/api/, built by `npm run docs:api` with TypeDoc and
// internal-package-contract's shared config (see specs/decisions/0008's
// "a real, browsable HTML API reference" amendment).
// Pages serves docs/ only from `main`. By construction, that URL is never
// verifiable from a PR branch's own perspective. It is not flaky: it is
// structurally unreachable until the exact PR that adds/changes it has
// already merged. The exemption is scoped to the /api/ subpath only, not the
// whole maverickcer.github.io/repo-contract/ site. An unrelated broken link
// to the already-live landing page is still caught.
//
// TypeDoc's default theme (docs/api/; see specs/decisions/0008's matching amendment) stamps a
// "Defined in" link on every documented symbol at
// github.com/maverickcer/repo-contract/blob/<current HEAD SHA>/<path>. The `.githooks/pre-push`
// hook runs the full `npm run contract`, including this crawl, before the push happens. That SHA
// cannot exist on GitHub yet, so linkinator cannot resolve it locally. The link is not broken.
// The same URL resolves once the commit is pushed, since GitHub serves a blob URL for any commit
// on any pushed ref. CI never hits this, because the `contract` job runs on an already-pushed SHA.
// This exemption therefore matters only before a push and never hides a broken source link in CI.
//
// Linkinator applies each `--skip` value as a bare `new RegExp(x)`: no flags,
// unanchored, tested against the full href. The pattern therefore anchors the
// scheme and host itself. Otherwise `https://evil.example/?x=github.com/maverickcer/
// repo-contract/compare/` or `https://notgithub.com/maverickcer/...` would also
// be skipped.
//
// The owner is spelled with per-letter `[Xx]` classes rather than an inline
// `(?i:...)` group. The older release-please entries wrote GitHub's canonical
// `MaverickCER` casing, while package.json's own URLs use `maverickcer`. The
// case-expanded form needs no modern-regex-engine support. Both compare/tag
// links and this exemption predate the Changesets migration. Changesets writes
// the same shape of link in CHANGELOG.md, so the exemption's reasoning still
// applies verbatim.
export const LINKINATOR_SKIP_PATTERNS = [
  "security/advisories/new",
  "^https?://github\\.com/[Mm][Aa][Vv][Ee][Rr][Ii][Cc][Kk][Cc][Ee][Rr]/repo-contract/(compare|releases/tag)/",
  "^https?://maverickcer\\.github\\.io/repo-contract/api/",
  "^https?://github\\.com/[Mm][Aa][Vv][Ee][Rr][Ii][Cc][Kk][Cc][Ee][Rr]/repo-contract/blob/",
]

async function runLinkinatorOn(targets, extraArgs) {
  if (targets.length === 0) {
    return { ok: true, value: { links: [] } }
  }

  const spawned = await runTool("linkinator", [
    ...targets,
    ...extraArgs,
    "--retry",
    // GitHub answers a burst of link checks with transient 503/504s, and `--retry` only covers HTTP
    // 429. Retry 5xx and unknown responses with jitter and keep the crawl modest in parallelism.
    "--retry-errors",
    "--retry-errors-count",
    "5",
    "--retry-errors-jitter",
    "3000",
    "--concurrency",
    "8",
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

async function runMarkdownLinkinator() {
  const matches = await Promise.all(DOCS_GLOBS.map((pattern) => globHasMatch(pattern)))
  const matchingGlobs = DOCS_GLOBS.filter((_pattern, index) => matches[index])
  return runLinkinatorOn(matchingGlobs, ["--markdown"])
}

// A second, HTML-mode crawl over docs/. It covers the site's own index.html and, once
// `npm run docs:api` has run, the generated .html pages under docs/api/. Neither was covered by
// the markdown-only crawl above, because DOCS_GLOBS never included docs/. This closes a real,
// confirmed gap rather than adding a new requirement invented for its own sake.
// Internal (docs/-relative) links get no special tolerance. A broken one fails this check the
// same as any markdown link would. External links get the same `--retry` +
// LINKINATOR_SKIP_PATTERNS treatment already established above. A transient third-party hiccup
// therefore can't turn into a contract failure.
// Unlike DOCS_GLOBS above, `docs/index.html` is a permanent, always-committed part of this
// repository (the site itself). This target therefore needs no globHasMatch-style existence
// pre-check.
async function runHtmlLinkinator() {
  // --recurse: linkinator's default is "crawl only the given start file/URL". Without it, this
  // would check docs/index.html alone and never descend into the docs/api/ tree.
  return runLinkinatorOn(["docs"], ["--recurse"])
}

async function runLinkinator() {
  const [markdown, html] = await Promise.all([runMarkdownLinkinator(), runHtmlLinkinator()])

  if (!markdown.ok) return markdown
  if (!html.ok) return html

  return { ok: true, value: { links: [...markdown.value.links, ...html.value.links] } }
}

// Run the two tools only when invoked as a script (`node scripts/check-docs.mjs`,
// as repo-contract.config.ts's `docs` check does), not when imported. The tests
// in test/unit/docs/ can then pull in LINKINATOR_SKIP_PATTERNS without spawning
// markdownlint + a live linkinator crawl.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [markdownlint, linkinator] = await Promise.all([runMarkdownlint(), runLinkinator()])

  process.stdout.write(JSON.stringify({ markdownlint, linkinator }))

  process.exitCode = markdownlint.ok && linkinator.ok ? 0 : 1
}
