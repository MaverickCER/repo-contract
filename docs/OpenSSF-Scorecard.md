# OpenSSF Scorecard-informed evidence

> **Informational evidence, not a certification.** This document is `repo-contract`'s own evaluation of `MaverickCER/repo-contract`, informed by [OpenSSF Scorecard's published check methodology](https://github.com/ossf/scorecard/blob/main/docs/checks.md) (Apache-2.0) -- it is **not** a run of the upstream `scorecard` binary, does not claim numeric parity with it, and is not an OpenSSF certification of any kind. Every score below traces to a specific, cited piece of evidence (a file, a GitHub API field, or another check's own result from this same run) gathered by [`scripts/openssf-scorecard/`](../scripts/openssf-scorecard/) -- generated automatically by `repo-contract`'s own `npm run contract`, dogfooding this repository's own contract/evidence mechanism rather than a separate, bespoke script.

_Generated 2026-09-16T09:42:56.202Z against `MaverickCER/repo-contract`._

## Checks

| Check               | Score | Why                                                                                                                                                                                            |
| ------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| License             | 10/10 | GitHub detected an OSI/FSF-recognized license (SPDX "MIT") at the repository root.                                                                                                             |
| Security-Policy     | 10/10 | SECURITY.md carries a contact link and 3 vulnerability/disclosure-related mention(s).                                                                                                          |
| Pinned-Dependencies | 10/10 | All 29 workflow action reference(s) are pinned to a full commit SHA.                                                                                                                           |
| Token-Permissions   | 10/10 | Every workflow in .github/workflows/ declares an explicit `permissions:` block (top-level, job-level, or both).                                                                                |
| Dangerous-Workflow  | 10/10 | No unescaped attacker-influenced GitHub context expression found spliced into a run: block.                                                                                                    |
| CI-Tests            | 10/10 | ci.yml runs on pull_request and includes a recognizable test-running step.                                                                                                                     |
| Packaging           | 10/10 | package.json declares a public package ("repo-contract"), published by .github/workflows/release.yml.                                                                                          |
| Branch-Protection   | 0/10  | Branch "main" has no branch protection configured.                                                                                                                                             |
| Code-Review         | 0/10  | Branch "main" has no branch protection, so no review requirement is enforced.                                                                                                                  |
| Signed-Releases     | 9/10  | GitHub releases carry no signature assets, but the published npm package has real SLSA provenance attestation (predicateType `https://slsa.dev/provenance/v1`) via `npm publish --provenance`. |
| Contributors        | 0/10  | 1 distinct human contributor(s) found -- upstream's >=3-organization bar is not met.                                                                                                           |
| Maintained          | N/A   | Repository is 22 day(s) old -- upstream's Maintained check requires >90 days of history to assess.                                                                                             |
| Vulnerabilities     | 10/10 | This run's security-deps check (npm audit) found 0 critical/high/moderate/low vulnerabilities.                                                                                                 |

## Details

### Signed-Releases

- npm registry attestation URL: `https://registry.npmjs.org/-/npm/v1/attestations/repo-contract@0.5.1`

### Contributors

- Contributors: MaverickCER

## Checks not evaluated

Upstream OpenSSF Scorecard also defines CII-Best-Practices, Fuzzing, SAST, SBOM, and Webhooks. None are evaluated here:

- **CII-Best-Practices** -- requires a separate submission to the OpenSSF Best Practices Badge program, an action outside this repository's own automation.
- **Fuzzing** -- this repository has no fuzz-testing infrastructure to report on.
- **SAST** -- this repository's own `lint`/`security-network` checks cover a meaningfully overlapping but not identical surface to a dedicated SAST tool; not mapped to this specific upstream check yet.
- **SBOM** -- no Software Bill of Materials is currently generated.
- **Webhooks** -- requires org-admin-level GitHub API access this repository's automation does not have.
