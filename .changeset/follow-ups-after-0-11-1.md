---
"repo-contract": patch
---

- Built with TypeScript 6 and tsup 9, with the rest of this month's development-tool updates; the API-contract check confirms the published API is unchanged.
- The agent skill says a `run` string runs without a shell and rejects shell operators (`shell: true` opts into one), and that the helpers use `node:crypto` and an injectable `node:fs/promises`.
- The landing page shows the current version, and the release's `version` step now regenerates the agent skill and landing page, so a release no longer needs a follow-up commit for them.
- SBOM generation fails, naming the cause, when cyclonedx-npm writes a root component without the package's own repository reference. It did this silently whenever npm masked part of the checkout's path (npm hides UUID-shaped text), dropping the package's description and links from the SBOM.
- Exception-record validation names a structured-field problem even when a core field is also wrong, so one run reports every problem with a record.
- The benchmark pages measure every size up to 10,240 for the exception functions again, and describe the `slowest` sweep as it behaves: cost rises with the rows listed until they reach the checks being ranked.
