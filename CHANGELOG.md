# Changelog

## 0.9.0

### Minor Changes

- d01088b: Add `renderMarkdownSummary` and `serializeRun`, pure helpers that turn a run's evidence and verdict into a Markdown summary (for a CI step summary or a pull-request comment) and into the two stored JSON documents, so a runner can keep a durable, machine-readable record instead of printing the verdict and discarding it. The SBOM is now published as a runtime inventory (what installing the package brings in: nothing) and a separate build-environment inventory, and the documentation corrects how a 0.x release is chosen and how the package relates to the rest of the toolkit.
- d01088b: Audit fixes ahead of 1.0.

  - Breaking (pre-1.0 minor): Node.js `>=22` (Node 20 is end-of-life); `@types/node` is `^22`.
  - `repo-contract/helpers` is Stable (ADR 0019); `presets` and `init` stay Experimental.
  - Added `renderMarkdownSummary` and `serializeRun` so a runner can write durable, machine-readable reports and a job summary.
  - Documentation: how a 0.x bump is chosen (nothing automated can publish 1.0.0), the bootstrap cycle with `internal-package-contract`, a shared glossary and the toolkit overview.

### Patch Changes

- fix(mutation): align the Stryker runner with Vitest 5 before every run
- fix(tests): make the vitest preset and test checks independent of the Vitest major
- 4e7f685: `npm run version` now regenerates the committed SBOMs, which embed the package's own version, so the release pull request no longer leaves the working tree dirty and fails the contract.

## 0.8.8

### Patch Changes

- chore(benchmarks): refresh results.json
- a5383d3: Resolve the repository's open Dependabot alerts (`js-yaml` updated; `adm-zip`, reached only through `github-actionlint`, overridden to 0.6.1), drop the cross-repository release notification and its expired token in favor of internal-package-contract pulling the latest release on its own schedule, and re-pin internal-package-contract to its 0.8 release.

## 0.8.7

### Patch Changes

- chore(benchmarks): refresh results.json
- chore(benchmarks): refresh results.json
- chore(docs): record the throttled release-workflow link as known-good
- 30e7147: Re-pin internal-package-contract (lockfile and reusable-workflow references) to its 0.7.0 release, whose shared workflows no longer use npm caches.

## 0.8.6

### Patch Changes

- chore(benchmarks): refresh results.json
- e1e556d: Make the documentation link check retry transient HTTP 5xx responses (with jitter) and crawl with modest concurrency, so a throttled github.com no longer fails the contract and the release pull request.
- abfc060: Re-pin internal-package-contract (lockfile and reusable-workflow references) to its 0.6.0 release.

## 0.8.5

### Patch Changes

- chore(benchmarks): refresh results.json
- chore(benchmarks): refresh results.json
- b07c91a: Re-pin internal-package-contract (lockfile and reusable-workflow references) to its 0.5.0 release.
- 2000ec3: Move the repository's own benchmarks onto internal-package-contract's shared benchmark kit (documented suites, cost-first `BENCHMARKS.md`, `benchmarks/README.md`, WRITING/READING docs) and re-pin internal-package-contract to its 0.4 release.

## 0.8.4

### Patch Changes

- 9549cf9: Accept npm 12's `npm pack --json` output (an object keyed by package name) as well as the older array form, so the consumer-install E2E suites and the `arethetypeswrong` check no longer fail under the latest npm during the release job.

## 0.8.3

> **Never published to npm.** The release pipeline failed for this version (it is not on the registry and has no tag); its changes first shipped in 0.8.4.

### Patch Changes

- chore(benchmarks): refresh results.json
- 8bcc7d4: Send the publish-time contract run's report to stderr so a failing check is visible in the release job's log instead of being swallowed by the Changesets action.

## 0.8.2

> **Never published to npm.** The release pipeline failed for this version (it is not on the registry and has no tag); its changes first shipped in 0.8.4.

### Patch Changes

- chore(benchmarks): refresh results.json
- e0f4cd4: Generate the gitignored `docs/api/` and `docs/benchmarks/` pages before the publish-time contract run, so the `docs` check no longer 404s on them in the release job's fresh checkout.

## 0.8.1

> **Never published to npm.** The release pipeline failed for this version (it is not on the registry and has no tag); its changes first shipped in 0.8.4.

### Patch Changes

- chore(sbom): regenerate for 0.8.0
- chore(benchmarks): refresh results.json
- chore: sync generated API baseline for release

## 0.8.0

> **Never published to npm.** The release pipeline failed for this version (it is not on the registry and has no tag); its changes first shipped in 0.8.4.

### Minor Changes

- feat(sbom): add a real CycloneDX SBOM generator check
- feat: consume internal-package-contract's ApiContract/ApiDocsReport engine
- feat(benchmarks): add repo-contract's own benchmark suite, wire into CI, add site nav
- 4cd248d: Add the `distNoUrls({ dir?, allow? })` preset (`repo-contract/presets`). It fails when any URL
  (any scheme followed by a colon and two slashes) appears in any file of the build output --
  code, declarations and sourcemaps included -- so supply-chain scanners such as Socket.dev have no
  URL strings to flag. `allow` takes `{ url, reason }` entries (`url` may be a glob); a missing
  `reason` fails the check. repo-contract's own build output is now URL-free and the check runs in
  its own contract.
- 65b74f0: Remove the `minimatch` runtime dependency. Exception-policy category globs are now matched by a
  dependency-free, environment-free matcher (`src/helpers/glob-match.ts`, ADR 0017), so the package
  has zero runtime dependencies. **Breaking (0.x minor):** only `*`, `**`, `?`, `[...]` classes,
  `{a,b}` alternation and `\` escapes are supported; extglobs, POSIX classes, dotfile exclusion and
  case folding are no longer interpreted, and a malformed character class now throws.

### Patch Changes

- fix(checks): read the crap4ts report from a file instead of a pipe
- fix(ci): prettier-ignore the generated release-bump file
- fix(sbom): derive generate.test.ts's expected paths via path.join
- fix: waive the OpenSSF-Scorecard docs-links false positive; re-pin IPC workflows to latest SHA
- chore(benchmarks): refresh results.json
- fix: prevent TypeDoc/marked GFM autolink from mangling bare VERSIONING.md mentions
- fix(checks): keep the crap report where a fresh checkout can write it
- docs: update remaining release-please mentions after the Changesets migration
- fix(sbom): exclude docs/sbom.cdx.json from Prettier reformatting
- chore(benchmarks): refresh results.json
- chore(benchmarks): refresh results.json
- fix(helpers): reject glob patterns over 1000 characters so brace expansion fails fast
- chore(main): release repo-contract 0.7.3 (#85)
- chore: regenerate schemas for the VERSIONING.md backtick fix
- docs: update prose referencing the old local api-contract/api-docs engine
- fix: generate docs/api/ before the docs check; fix a stale RELEASING.md anchor
- fix(benchmarks): strip trailing whitespace before nested blocks in RESULTS.md
- fix(openssf-scorecard): stop Dangerous-Workflow from misreading past its first run: block
- fix: skip TypeDoc's own unpushed-HEAD source links in the local pre-push docs crawl
- chore(benchmarks): refresh results.json
- chore(benchmarks): refresh results.json
- chore: remove iso-12207-alignment compliance-document generator
- a52a06d: The `openssf-scorecard` self-evaluation now computes a weighted aggregate (`Σ(score × weight) / Σ(weight)`), with per-check weights fetched live from `ossf/scorecard`'s own published `docs/checks/internal/checks.yaml` risk tiers and `pkg/scorecard/scorecard_result.go` risk-weight table, rather than a simple average -- mirroring upstream's own `Result.GetAggregateScore` for closer methodology fidelity. `docs/OpenSSF-Scorecard.md` also now records provenance metadata (run date, evaluated repo + commit, and this evaluator's own version -- explicitly distinguished from the upstream `scorecard` binary's version, since this evaluation never runs that binary). Internal tooling only (`checks/`, `scripts/`); no public API change.

## [0.7.3](https://github.com/MaverickCER/repo-contract/compare/repo-contract-v0.7.2...repo-contract-v0.7.3) (2026-09-27)

### Bug Fixes

- exclude typescript@7 and vitest@5 from this dependency-group bump ([12b9ad0](https://github.com/MaverickCER/repo-contract/commit/12b9ad03bb808006612fc79f598252633ed4fd53))

## [0.7.2](https://github.com/MaverickCER/repo-contract/compare/repo-contract-v0.7.1...repo-contract-v0.7.2) (2026-09-27)

### Bug Fixes

- badges/docs-evidence carry forward checks instead of failing every push ([#83](https://github.com/MaverickCER/repo-contract/issues/83)) ([215db16](https://github.com/MaverickCER/repo-contract/commit/215db1666ec334a2cc341a8eedba38cc343abd7c))

## [0.7.1](https://github.com/MaverickCER/repo-contract/compare/repo-contract-v0.7.0...repo-contract-v0.7.1) (2026-09-26)

### Bug Fixes

- branch-protection-compatible CI, TS-compat check, dev-audit cleanup ([#78](https://github.com/MaverickCER/repo-contract/issues/78)) ([076461b](https://github.com/MaverickCER/repo-contract/commit/076461bb45b59a5859a3f4bef0da9828c95d10e6))

## [0.7.0](https://github.com/MaverickCER/repo-contract/compare/repo-contract-v0.6.0...repo-contract-v0.7.0) (2026-09-23)

### ⚠ BREAKING CHANGES

- OutputFormat no longer includes "yaml", and ParserDependencyMissingError (thrown only for a missing "yaml" peer dependency) is removed from the public API. A config using output.format: "yaml" will now fail config validation.

### Features

- drop first-class YAML output-format support ([99f7b6d](https://github.com/MaverickCER/repo-contract/commit/99f7b6db13ef60e159b2eb589317fdf0e99f0726))
- **security-socket:** reject supplyChainRisk alerts on shipped dependencies outright ([bf7f2b3](https://github.com/MaverickCER/repo-contract/commit/bf7f2b32ed47c496aea4877b20adb474592b85ad))
- **security-socket:** reject supplyChainRisk alerts on shipped dependencies outright ([d0a0563](https://github.com/MaverickCER/repo-contract/commit/d0a0563eb7f783577333291e94383408bb9e8c53))

### Bug Fixes

- **security-socket:** peerDependencies also count as shipped for supplyChainRisk ([e5db3cd](https://github.com/MaverickCER/repo-contract/commit/e5db3cd443c46c131ab0afc076451484132edede))

## [0.6.0](https://github.com/MaverickCER/repo-contract/compare/repo-contract-v0.5.2...repo-contract-v0.6.0) (2026-09-20)

### Features

- **docs:** waive known-good-but-flaky external links; release as 0.6.0 ([2ffdd8f](https://github.com/MaverickCER/repo-contract/commit/2ffdd8fbf9d767f537939da40cd750af2fb5d0b7))

### Miscellaneous Chores

- release repo-contract as 0.6.0 ([8282f70](https://github.com/MaverickCER/repo-contract/commit/8282f70f7727ee7f2c517acf7e65e93fc51388c9))

## [0.5.2](https://github.com/MaverickCER/repo-contract/compare/repo-contract-v0.5.1...repo-contract-v0.5.2) (2026-09-18)

### Features

- OpenSSF Scorecard + ISO 12207 alignment, mutation zero-tolerance ([#68](https://github.com/MaverickCER/repo-contract/issues/68)) ([76de4af](https://github.com/MaverickCER/repo-contract/commit/76de4af16cc681e88e3fe85439537848aad096ad))

## [0.5.1](https://github.com/MaverickCER/repo-contract/compare/repo-contract-v0.5.0...repo-contract-v0.5.1) (2026-09-14)

### Bug Fixes

- correct repository/bugs URL casing to match GitHub (MaverickCER) ([55d563c](https://github.com/MaverickCER/repo-contract/commit/55d563c06ec7b9fe1b26c73239e693f189aa31c8))

## [0.5.0](https://github.com/MaverickCER/repo-contract/compare/repo-contract-v0.4.0...repo-contract-v0.5.0) (2026-09-12)

Administrative republish -- 0.4.0 is already published on npm at its current content hash, so a fresh version number is needed to publish again. No functional change beyond the previous release.

## [0.4.0](https://github.com/MaverickCER/repo-contract/compare/repo-contract-v0.3.2...repo-contract-v0.4.0) (2026-09-09)

### ⚠ BREAKING CHANGES

- adds the new Experimental repo-contract/helpers subpath (exception-policy primitive). No existing export's shape changes; classified as minor per VERSIONING.md's "a new preset -> minor" convention for the Experimental tier, not a literal incompatibility.

### Features

- add a narrow `repo-contract init` scaffolding command ([#63](https://github.com/MaverickCER/repo-contract/issues/63)) ([a1d4e4a](https://github.com/MaverickCER/repo-contract/commit/a1d4e4a242cb0253e0a62e486e86a475a5c8ddbd))
- add a verified-exception waiver path to security-network ([94dbf43](https://github.com/MaverickCER/repo-contract/commit/94dbf4321b9288b10c65e7efc3e2596a40f4c628))
- add security-socket and coderabbitai checks ([cb7d3ca](https://github.com/MaverickCER/repo-contract/commit/cb7d3cad8d8015e85c82731075abe48e12371b15))
- add security-socket and coderabbitai checks ([31374ee](https://github.com/MaverickCER/repo-contract/commit/31374eebe5c35ff54e3efd37d5ed756cc8b8cdc4))
- add the checks/shared exception-matching and identity layer ([0d711f5](https://github.com/MaverickCER/repo-contract/commit/0d711f5f17d382af507cfafab4a441d620a8b220))
- add the generic exception-policy core primitive ([8d8f670](https://github.com/MaverickCER/repo-contract/commit/8d8f6704c20bc2c5a4b07e68dcb8e328ee48b9c7))
- content-bound verification for suppression-governance ([fb6a838](https://github.com/MaverickCER/repo-contract/commit/fb6a838da76247cc42ab316ad9d420ff174a4124))
- content-bound verification for suppression-governance (disable-comments.json) ([8da651a](https://github.com/MaverickCER/repo-contract/commit/8da651a0f76ab0464ed3b22ac5113b837ea3ecc1))
- **helpers:** add the exception-registry lifecycle primitives ([de8e855](https://github.com/MaverickCER/repo-contract/commit/de8e8558a26ca238aafc69d736e576aafddd8fa0))
- publish the repo-contract/helpers subpath ([35f168c](https://github.com/MaverickCER/repo-contract/commit/35f168ca9fbde4f46d1a29624f112e0d4d3b296d))
- retrofit security-network onto the exception-policy primitive ([62b8d0a](https://github.com/MaverickCER/repo-contract/commit/62b8d0afae9f3958b60666531d58a25a6f5b796e))

### Bug Fixes

- address CodeRabbit findings on the security-network retrofit ([e53313e](https://github.com/MaverickCER/repo-contract/commit/e53313ecf2973649cc2dca045a220f27f0e205db))
- address CodeRabbit findings on the two new checks ([255e495](https://github.com/MaverickCER/repo-contract/commit/255e49584a2b6622cee174f560221e731932d840))
- address CodeRabbit findings on the verification retrofit ([3d91878](https://github.com/MaverickCER/repo-contract/commit/3d91878407dd006f82239d034cb319d3856a0c46))
- address round-2 CodeRabbit findings on the helpers primitive ([fabb9df](https://github.com/MaverickCER/repo-contract/commit/fabb9df2261051cc35fbe15faf3e6df9317afdf5))
- backfill verification baseline onto records merged in from main ([286e877](https://github.com/MaverickCER/repo-contract/commit/286e8775ad66d7d727f68c0ba269ad2cfa036d56))
- harden exception-policy config validation and smoke/license accuracy ([e23c069](https://github.com/MaverickCER/repo-contract/commit/e23c069f422ac8967cf8c3a65605bdfb85c07abc))
- reject impossible calendar dates in verifiedAt, sync ADR 0013 ([6df0911](https://github.com/MaverickCER/repo-contract/commit/6df0911c8bbbfe99bd97095e811b9d762aeb6438))
- reject trailing newline in verifiedAt; PATH-aware socket probe in the integration test ([ef01ba6](https://github.com/MaverickCER/repo-contract/commit/ef01ba65950041838a3e43f8d8f440add6c4a97c))
- remove duplicate StandardSchemaV1 re-export in src/helpers/index.ts ([a0d8ee7](https://github.com/MaverickCER/repo-contract/commit/a0d8ee7a490d05fc99d9cbb7150706f7c1494694))
- skip the real-source drift test inside a Stryker mutation sandbox ([e9e64f6](https://github.com/MaverickCER/repo-contract/commit/e9e64f6dbe57a9e0612209bb568b584961d130cc))
- validate exception registries on every run and tighten verification ([8d6993f](https://github.com/MaverickCER/repo-contract/commit/8d6993fb94299a50c7b2589d400e592e43767df5))
- validate the coderabbit terminal event findings count ([a7acd09](https://github.com/MaverickCER/repo-contract/commit/a7acd0950b54f3bd2dbde3956a697d97d80daf9c))

## [0.3.2](https://github.com/MaverickCER/repo-contract/compare/repo-contract-v0.3.1...repo-contract-v0.3.2) (2026-09-04)

### Features

- validate and transform check output with a Standard Schema ([d53cb17](https://github.com/MaverickCER/repo-contract/commit/d53cb17a9e3a3f939cd403226ab5256be0de79ac))
- validate and transform check output with a Standard Schema ([fbb7925](https://github.com/MaverickCER/repo-contract/commit/fbb79259f4a6cede1da64a0abd7e1f1541e1d505))

### Bug Fixes

- address CodeRabbit findings and close mutation-testing gaps in Standard Schema support ([53baf87](https://github.com/MaverickCER/repo-contract/commit/53baf877d367fd17dbe1ec2f312ab9ed790e6ae6))
- **api-contract:** don't classify a required property on a brand-new container as breaking ([27ad5d5](https://github.com/MaverickCER/repo-contract/commit/27ad5d5c57811d90393b00f48ae8a8bbd413407b))
- **test:** harden isRuntimeAvailable against spawnSync throwing under load ([60c76b6](https://github.com/MaverickCER/repo-contract/commit/60c76b642dfd6187888f02d31639e68468e77b17))

## [0.3.1](https://github.com/MaverickCER/repo-contract/compare/repo-contract-v0.3.0...repo-contract-v0.3.1) (2026-09-03)

### Bug Fixes

- correct the release runbook that shipped types-less tarballs ([f56ea34](https://github.com/MaverickCER/repo-contract/commit/f56ea342606cfc92a09943ea5eb787936e7b7ba9))
- published tarball missing types; simplify CI matrix ([7ec8fd9](https://github.com/MaverickCER/repo-contract/commit/7ec8fd946bd584098255c5d2ab3f07b98b55ba1f))

## [0.3.0](https://github.com/MaverickCER/repo-contract/compare/repo-contract-v0.2.1...repo-contract-v0.3.0) (2026-09-03)

### ⚠ BREAKING CHANGES

- defineRepoContract/runRepoContract now require spawn and env on the config (e.g. spawn: child_process.spawn, env: process.env). See ADR 0011 and README's "Supplying spawn/env" section for migration.

### Features

- contract engine, self-hosting checks and CI workflows ([97ae128](https://github.com/MaverickCER/repo-contract/commit/97ae128bd96f2c631057f1150068af58cc66b224))
- contract engine, self-hosting checks and CI workflows ([22b2a3b](https://github.com/MaverickCER/repo-contract/commit/22b2a3b03fe4e44ad7a01b82342d86583926416a))
- make process spawning and env access consumer-supplied capabilities ([640a961](https://github.com/MaverickCER/repo-contract/commit/640a961b65fd73511586c3b4f6274284bf5172a9))

### Bug Fixes

- clear Socket supply-chain alerts (unminified dist, no prepare script) ([71c9230](https://github.com/MaverickCER/repo-contract/commit/71c92306fcf00e3858f0596c2d56f3272199339d))
- publish the dist bundle unminified ([266ae47](https://github.com/MaverickCER/repo-contract/commit/266ae47919753c55f10364713fe0c7c5876815b7))
- remove the prepare install script from the published package ([9153540](https://github.com/MaverickCER/repo-contract/commit/9153540e4f0f1a069e07c12ddfee8ba62827ce5b))

## [0.2.1](https://github.com/MaverickCER/repo-contract/compare/repo-contract-v0.2.0...repo-contract-v0.2.1) (2026-09-03)

### Documentation

- add Socket security badge to README

## [0.2.0](https://github.com/MaverickCER/repo-contract/compare/repo-contract-v0.1.1...repo-contract-v0.2.0) (2026-09-03)

### ⚠ BREAKING CHANGES

- defineRepoContract/runRepoContract now require spawn and env on the config (e.g. spawn: child_process.spawn, env: process.env). See ADR 0011 and README's "Supplying spawn/env" section for migration.

### Features

- make process spawning and env access consumer-supplied capabilities ([640a961](https://github.com/MaverickCER/repo-contract/commit/640a961b65fd73511586c3b4f6274284bf5172a9))

## [0.1.1](https://github.com/MaverickCER/repo-contract/compare/repo-contract-v0.1.0...repo-contract-v0.1.1) (2026-09-01)

### Bug Fixes

- clear Socket supply-chain alerts (unminified dist, no prepare script) ([71c9230](https://github.com/MaverickCER/repo-contract/commit/71c92306fcf00e3858f0596c2d56f3272199339d))
- publish the dist bundle unminified ([266ae47](https://github.com/MaverickCER/repo-contract/commit/266ae47919753c55f10364713fe0c7c5876815b7))
- remove the prepare install script from the published package ([9153540](https://github.com/MaverickCER/repo-contract/commit/9153540e4f0f1a069e07c12ddfee8ba62827ce5b))

## Changelog
