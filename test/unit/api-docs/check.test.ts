import { fileURLToPath } from "node:url"
import { beforeAll, describe, expect, it } from "vitest"
import { runApiDocsCheck } from "../../../scripts/api-docs/check.js"
import type { ApiDocsEvidence } from "../../../scripts/api-docs/evidence-types.js"

// Runs against this repository's own real dist/ and docs/api-report/ -- deliberately not a
// synthetic fixture, unlike policy.test.ts. This is what makes the check's own claim true: if a
// future PR adds, removes, or un-documents an export without running `npm run api-docs:generate`,
// this test (and the `api-docs` self-hosting check it mirrors) fails immediately, by construction,
// rather than relying on anyone remembering to check by hand. Requires `npm run build` to have
// already produced dist/.dts/index.d.ts and dist/.dts/presets/index.d.ts.
const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url))

describe("runApiDocsCheck (real repository files)", () => {
  // One real api-extractor pass shared across the suite -- it's the same
  // repository state for every assertion, and the pass is expensive.
  let evidence: ApiDocsEvidence

  beforeAll(async () => {
    evidence = await runApiDocsCheck(REPO_ROOT)
  })

  it("finds every committed report up to date with the real public surface", () => {
    // Asserts a real report count first: comparing `.map(r => r.upToDate)` against
    // `.map(() => true)` of the *same* array passes vacuously on an empty `reports` array, which
    // would silently hide a regression that stopped this check from finding any report at all.
    expect(evidence.reports.length).toBeGreaterThan(0)
    for (const report of evidence.reports) {
      expect(report.upToDate, report.committedPath).toBe(true)
    }
  })

  it("finds no undocumented symbol in any committed report", () => {
    expect(evidence.reports.length).toBeGreaterThan(0)
    expect(evidence.reports.flatMap((report) => report.undocumentedMarkers)).toEqual([])
  })

  it("covers both the root and presets entry points", () => {
    expect(evidence.reports.map((report) => report.reportFileName).sort()).toEqual([
      "repo-contract",
      "repo-contract-presets",
    ])
  })
})
