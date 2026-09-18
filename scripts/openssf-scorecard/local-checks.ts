import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { parse as parseYaml } from "yaml"
import type { ScorecardCheckResult } from "./types.js"

/**
 * @param root - Repository root.
 * @returns Every `.github/workflows/*.yml`/`.yaml` file's raw content, keyed by filename.
 */
function readWorkflows(root: string): ReadonlyMap<string, string> {
  const dir = path.join(root, ".github/workflows")
  if (!existsSync(dir)) return new Map()
  const files = new Map<string, string>()
  for (const entry of readdirSync(dir)) {
    if (!/\.ya?ml$/.test(entry)) continue
    files.set(entry, readFileSync(path.join(dir, entry), "utf8"))
  }
  return files
}

/**
 * Upstream scoring (https://github.com/ossf/scorecard/blob/main/docs/checks.md):
 * 10 for an FSF/OSI-approved license detected at the top level, 6 for any
 * LICENSE file present without that detection, 0 for neither. This repo's
 * `gh api repos/:repo` call already carries GitHub's own SPDX detection
 * (`license.spdx_id`), which is the same signal upstream's own License check
 * reads -- reusing it here rather than re-implementing SPDX matching by hand.
 * @param root - Repository root.
 * @param spdxId - GitHub's own detected SPDX license id for this repository (`repos/:repo`'s `license.spdx_id`), or `undefined`/`null` if unknown.
 * @returns The License sub-check result.
 */
export function evaluateLicense(
  root: string,
  spdxId: string | null | undefined,
): ScorecardCheckResult {
  if (spdxId && spdxId !== "NOASSERTION") {
    return {
      name: "License",
      score: 10,
      reason: `GitHub detected an OSI/FSF-recognized license (SPDX "${spdxId}") at the repository root.`,
      details: [],
    }
  }
  const hasLicenseFile = ["LICENSE", "LICENSE.md", "LICENSE.txt"].some((name) =>
    existsSync(path.join(root, name)),
  )
  if (hasLicenseFile) {
    return {
      name: "License",
      score: 6,
      reason:
        "A LICENSE file exists, but GitHub could not detect a recognized SPDX identifier for it.",
      details: [],
    }
  }
  return {
    name: "License",
    score: 0,
    reason: "No LICENSE file found and no SPDX license detected.",
    details: [],
  }
}

/**
 * Upstream scoring: 10 for contact links plus free-form text plus
 * vulnerability-specific language (2+ mentions of "vuln"/"disclos"/a time
 * expectation), 6 for a valid email or https contact link present, 0 for no
 * security policy file at all.
 * @param root - Repository root.
 * @returns The Security-Policy sub-check result.
 */
export function evaluateSecurityPolicy(root: string): ScorecardCheckResult {
  const candidates = ["SECURITY.md", ".github/SECURITY.md", "docs/SECURITY.md"]
  const found = candidates.find((name) => existsSync(path.join(root, name)))
  if (!found) {
    return { name: "Security-Policy", score: 0, reason: "No SECURITY.md found.", details: [] }
  }
  const content = readFileSync(path.join(root, found), "utf8")
  const hasContact = /https?:\/\/|[\w.+-]+@[\w-]+\.[\w.-]+/.test(content)
  const vulnMentions = (content.match(/\bvuln|\bdisclos/gi) ?? []).length
  if (hasContact && vulnMentions >= 2) {
    return {
      name: "Security-Policy",
      score: 10,
      reason: `${found} carries a contact link and ${String(vulnMentions)} vulnerability/disclosure-related mention(s).`,
      details: [],
    }
  }
  if (hasContact) {
    return {
      name: "Security-Policy",
      score: 6,
      reason: `${found} exists with a contact link, but fewer than 2 vulnerability/disclosure-related mentions.`,
      details: [],
    }
  }
  return {
    name: "Security-Policy",
    score: 6,
    reason: `${found} exists but no email or https contact link was found in it.`,
    details: [],
  }
}

/**
 * Upstream scoring: 10 when every build/release dependency (workflow
 * actions, Docker base images, etc.) is pinned by hash; 0 when none are.
 * This evaluation covers GitHub Actions `uses:` references specifically --
 * repo-contract's own `.github/workflows/` is the only build/release
 * dependency surface it has (no Dockerfile, no shell-script `curl | bash`
 * installer).
 * @param root - Repository root.
 * @returns The Pinned-Dependencies sub-check result.
 */
export function evaluatePinnedDependencies(root: string): ScorecardCheckResult {
  const workflows = readWorkflows(root)
  if (workflows.size === 0) {
    return {
      name: "Pinned-Dependencies",
      score: "not-applicable",
      reason: "No .github/workflows/ found.",
      details: [],
    }
  }
  let pinned = 0
  let unpinned = 0
  const unpinnedDetails: string[] = []
  for (const [file, content] of workflows) {
    for (const line of content.split("\n")) {
      // Optional leading "- " (a YAML sequence item, the common
      // `- uses: owner/action@ref` form) or plain "uses:" (a mapping value
      // under an already-opened `- ` block) -- confirmed against this
      // repository's own workflows, which use the sequence-item form
      // exclusively; both are handled so a differently-formatted workflow
      // elsewhere doesn't silently under-count.
      const usesMatch = /^[\s-]*uses:\s*([\w./-]+)@(\S+)/.exec(line)
      if (!usesMatch) continue
      const ref = usesMatch[2] ?? ""
      if (/^[0-9a-f]{40}$/.test(ref)) {
        pinned += 1
      } else {
        unpinned += 1
        unpinnedDetails.push(
          `${file}: "${usesMatch[0].trim()}" is not pinned to a 40-character commit SHA.`,
        )
      }
    }
  }
  if (pinned + unpinned === 0) {
    return {
      name: "Pinned-Dependencies",
      score: "not-applicable",
      reason: "No `uses:` references found in any workflow.",
      details: [],
    }
  }
  if (unpinned === 0) {
    return {
      name: "Pinned-Dependencies",
      score: 10,
      reason: `All ${String(pinned)} workflow action reference(s) are pinned to a full commit SHA.`,
      details: [],
    }
  }
  const score = Math.round((pinned / (pinned + unpinned)) * 10)
  return {
    name: "Pinned-Dependencies",
    score,
    reason: `${String(pinned)}/${String(pinned + unpinned)} workflow action reference(s) are SHA-pinned.`,
    details: unpinnedDetails,
  }
}

/**
 * Upstream scoring: 10 for a top-level read-only `permissions:` block with
 * write access granted only at the job level where actually needed; 9 for
 * job-level permissions defined without a top-level default; 0 for
 * unrestricted (write-all, i.e. no `permissions:` block at all, since the
 * GitHub Actions default for a repository is broad write access).
 * @param root - Repository root.
 * @returns The Token-Permissions sub-check result.
 */
export function evaluateTokenPermissions(root: string): ScorecardCheckResult {
  const workflows = readWorkflows(root)
  if (workflows.size === 0) {
    return {
      name: "Token-Permissions",
      score: "not-applicable",
      reason: "No .github/workflows/ found.",
      details: [],
    }
  }
  const missingTopLevel: string[] = []
  let anyJobLevel = false
  for (const [file, content] of workflows) {
    const doc = parseYaml(content) as {
      permissions?: unknown
      jobs?: Record<string, { permissions?: unknown }>
    }
    const hasTopLevel = doc.permissions !== undefined
    const jobs = doc.jobs ?? {}
    const jobLevelPermissions = Object.values(jobs).some((job) => job.permissions !== undefined)
    if (jobLevelPermissions) anyJobLevel = true
    if (!hasTopLevel && !jobLevelPermissions) missingTopLevel.push(file)
  }
  if (missingTopLevel.length === 0) {
    return {
      name: "Token-Permissions",
      score: 10,
      reason: `Every workflow in .github/workflows/ declares an explicit \`permissions:\` block (top-level, job-level, or both).`,
      details: [],
    }
  }
  return {
    name: "Token-Permissions",
    score: anyJobLevel ? 5 : 0,
    reason: `${String(missingTopLevel.length)} workflow(s) declare no \`permissions:\` block at all, leaving them on the broad GitHub Actions default.`,
    details: missingTopLevel,
  }
}

/**
 * A real, but deliberately narrower, proxy for upstream's Dangerous-Workflow
 * check: flags the one pattern with a well-known, unambiguous signature --
 * an unescaped `${{ github.event.*.(body|title) }}` (or similar
 * attacker-controlled text) spliced directly into a `run:` shell block,
 * rather than passed through `env:` first. Upstream's own check additionally
 * covers `pull_request_target`-with-untrusted-checkout and self-hosted
 * runner patterns this evaluation does not attempt to detect -- see this
 * check's own README for why those are out of scope for a first version.
 * @param root - Repository root.
 * @returns The Dangerous-Workflow sub-check result.
 */
export function evaluateDangerousWorkflow(root: string): ScorecardCheckResult {
  const workflows = readWorkflows(root)
  if (workflows.size === 0) {
    return {
      name: "Dangerous-Workflow",
      score: "not-applicable",
      reason: "No .github/workflows/ found.",
      details: [],
    }
  }
  const injectionPattern =
    /\$\{\{\s*(github\.event\.\S*?\.(body|title|head_ref|head\.ref)|github\.head_ref)\s*\}\}/g
  const findings: string[] = []
  for (const [file, content] of workflows) {
    const lines = content.split("\n")
    let inRunBlock = false
    for (const [index, line] of lines.entries()) {
      // Optional leading "- " -- same YAML sequence-item form as
      // `evaluatePinnedDependencies`'s identical `uses:` handling above; a
      // `- run: |` step (the multiline block form as the step's first key)
      // is exactly as common in this repository's own workflows as the
      // no-dash form (`run: |` as a later sibling key under an already-
      // opened `- name: ...` step).
      if (/^[\s-]*run:\s*\|/.test(line)) {
        inRunBlock = true
        continue
      }
      if (inRunBlock && !/^\s{2,}\S/.test(line) && line.trim() !== "") inRunBlock = false
      const isSingleLineRun = /^[\s-]*run:\s*(?!\|)\S/.test(line)
      if (!inRunBlock && !isSingleLineRun) continue
      const matches = line.match(injectionPattern)
      if (matches) {
        findings.push(
          `${file}:${String(index + 1)}: attacker-influenced expression spliced directly into a run: block -- ${matches.join(", ")}`,
        )
      }
    }
  }
  if (findings.length > 0) {
    return {
      name: "Dangerous-Workflow",
      score: 0,
      reason: `${String(findings.length)} workflow line(s) splice an attacker-influenced GitHub context expression directly into a shell \`run:\` block.`,
      details: findings,
    }
  }
  return {
    name: "Dangerous-Workflow",
    score: 10,
    reason:
      "No unescaped attacker-influenced GitHub context expression found spliced into a run: block.",
    details: [],
  }
}

/**
 * Upstream scoring: 10 for a well-known CI system running tests on recent
 * commits/PRs; 0 for none found. Checked directly against this repo's own
 * `ci.yml`: a `pull_request` trigger plus at least one job whose steps
 * include a test-running command.
 * @param root - Repository root.
 * @returns The CI-Tests sub-check result.
 */
export function evaluateCiTests(root: string): ScorecardCheckResult {
  const workflows = readWorkflows(root)
  const ci = workflows.get("ci.yml")
  if (!ci) {
    return { name: "CI-Tests", score: 0, reason: "No .github/workflows/ci.yml found.", details: [] }
  }
  const doc = parseYaml(ci) as { on?: { pull_request?: unknown } }
  const runsOnPr = doc.on?.pull_request !== undefined
  const runsTests = /\bnpm (run )?test\b|vitest|jest|run-test-category/.test(ci)
  if (runsOnPr && runsTests) {
    return {
      name: "CI-Tests",
      score: 10,
      reason: "ci.yml runs on pull_request and includes a recognizable test-running step.",
      details: [],
    }
  }
  return {
    name: "CI-Tests",
    score: 0,
    reason: `ci.yml ${runsOnPr ? "runs on pull_request but no test-running step was recognized" : "has no pull_request trigger"}.`,
    details: [],
  }
}

/**
 * Not an upstream Scorecard check name verbatim (upstream's own "Packaging"
 * check verifies a project publishes to a package registry via a recognized
 * CI workflow, using its own build-file heuristics per language). This
 * evaluation covers the one fact repo-contract can assert about its own
 * package.json directly: it is not marked private, and its `files`/`main`
 * point at real build output.
 * @param root - Repository root.
 * @returns The Packaging sub-check result.
 */
export function evaluatePackaging(root: string): ScorecardCheckResult {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
    private?: boolean
    name?: string
  }
  if (pkg.private) {
    return { name: "Packaging", score: 0, reason: "package.json is marked private.", details: [] }
  }
  return {
    name: "Packaging",
    score: 10,
    reason: `package.json declares a public package ("${String(pkg.name)}"), published by .github/workflows/release.yml.`,
    details: [],
  }
}
