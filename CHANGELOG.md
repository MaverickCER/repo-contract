# Changelog

## 0.16.0

### Minor Changes

- 1934cca: Four new commands guard the project's files and the run's memory: `mutation run`, `except`, `exceptions` and `npm-script`. `quick-start` and `loadExceptionRegistry` gain the same guards.
  
  - **`mutation run` deletes only inside the project.** It deletes Stryker's `tempDirName`, `incrementalFile` and `jsonReporter.fileName` before a cold run. It refuses an empty name, `.`, `..`, an absolute path, and a path that climbs out of the project. A path through a symbolic link that leads out counts as outside. On a refused path the run exits 1, runs nothing and deletes nothing.
  - **`mutation run --no-patch-vitest-runner`, and `mutation({ patchVitestRunner: false })`.** By default the run patches `@stryker-mutator/vitest-runner` on Vitest 5. The patch changes its test-name separator to `' > '` (stryker-js#6210). The option leaves `node_modules` as installed.
  - **The patch touches only an install inside the project.** A runner hoisted to a parent directory, or linked in from outside, is left untouched. The run prints a note naming it.
  - **`except` writes only a registry it could read.** On a registry that fails to parse, it exits 1 and names the file. The file stays byte-identical.
  - **`exceptions` never follows a symbolic link or quotes a registry.** `readExceptionRegistries`, which it calls, lists a symlinked or non-regular `*.json` as skipped. Each reason names an error code or a shape, never the file's bytes.
  - **`loadExceptionRegistry` no longer follows a symbolic link.** It refuses a symlinked registry, and takes an `isSymlink` option like `writeExceptionRegistry`. Its JSON errors no longer quote the file's bytes; they keep the line and column.
  - **`npm-script` keeps the last 65,536 characters of each output stream.** A timeout that finds the process group already gone counts the script as stopped. A script stopped on timeout reports `exitCode: null` on every platform, Windows included.
  - **`quick-start` no longer holds a README command's whole output.** It keeps the last 65,536 characters, as `npm-script` does. A timeout that finds the process group already gone no longer throws.
  - **`repo-contract doctor` no longer reports a false all-clear outside a git repository.** When `git ls-files` fails, it exits 1 with "git cannot list the tracked files" instead of printing "Nothing to change." With `--json` it prints `{ schemaVersion, error }` on stdout instead.
  - **A `-C` path that is not a usable directory is named.** Every command that takes `-C` checks the path first. It exits 1 through the command's usual failure line or JSON error, never a raw ENOENT, a stack trace or an empty result. The message is one of three:
    - `the directory <dir> does not exist`: nothing is at the path.
    - `<dir> is not a directory`: a file or other non-directory is there.
    - `cannot read the directory <dir>: <code>`: the check failed with an error code, such as `ENAMETOOLONG` or `ELOOP`, or the process may not list or enter the directory (`EACCES`).
- 1934cca: The runner `init` writes takes `--json`, and the package ships its agent skill.
  
  - **`--json` on `scripts/contract.mjs`.** `npm run --silent contract -- --json` prints one JSON object: `evidence` and `verdict`, the two documents `serializeRun` writes. Each is valid against its `repo-contract/schema` file. The exit code matches the text mode. `--silent` keeps npm's banner out of stdout.
  - **Existing runners stay as they are.** `init` never overwrites a file. To get `--json`, copy GUIDE.md's runner block, or delete `scripts/contract.mjs` and run `init` again.
  - **`init` repeats your arguments in its tsx hint.** Without tsx, `init --preset strict` now suggests `npx repo-contract init --preset strict` again, then `explain`. Before, the hint dropped `--preset`.
  - **Mutation needs `@stryker-mutator/vitest-runner` too.** `strykerConfig()` sets `testRunner: "vitest"`, which Stryker loads only from that plugin. `init --preset strict` now lists it when it is missing.
  - **The skill is in the tarball.** `package.json#files` now includes `skills/`, so an agent reads `node_modules/repo-contract/skills/repo-contract/SKILL.md` without a network call.
  - **New npm description and keywords.** The description leads with policies and says every governed exception is a reviewable record. The keywords are `quality-gate`, `policy-as-code` and `pre-commit`.
  - **README quick start uses a tier.** The marked block runs `init --preset strict` and `explain`, and the `quickStart` check runs it from an empty project. The README adds an Alternatives table under "How it differs".
- 1934cca: Tiers, four new presets, tool config helpers, the v2 exception record and six new commands. Breaking and behaviour changes come first.
  
  - **Breaking: `arethetypeswrong` and `securityDeps` are factories.** Write `arethetypeswrong()` and `securityDeps()` where a config spread the bare preset. `init` now writes `securityDeps: securityDeps()`.
  - **Behaviour change: `brokenLinks` passes two links it used to fail.** A link that answered HTTP 429 passes, since a rate limit says nothing about the page. A local link linkinator could not serve passes when the path exists on disk inside the working directory. The rationale lists both.
  - **New subpath `repo-contract/tiers` (Experimental).** `basic`, `app`, `library` and `strict` each return `checks` to spread into `defineRepoContract`, plus the tier's metadata. `tier(name)` picks one at run time. GUIDE.md's "Tiers" table lists each tier's checks and defaults; ADR 0025 records why.
  - **Tier overrides.** One object keyed by check id. An options object merges over the tier's options for that check, and Coverage thresholds merge per metric, so `Duplication: { path: "src" }` keeps the tier's budget. `false` keeps the check in the run as a pass that names the override. An unknown key or a bad value throws `TypeError`.
  - **Private packages.** On a `private: true` package, Packaging, TypeResolution, BundledDependencies and QuickStart pass as not applicable. Each tool still runs; only the verdict changes.
  - **Planned checks.** `plannedChecks(tier)` lists eight checks each tier will gain in a later release. None of them runs yet.
  - **`explainTier` and `renderExplain`.** They list what a config runs and every setting looser than its tier or a baseline you pass. They also list the tier checks it lacks and the planned checks. `LOOSENING_RULES` and `compareSetting` say which way each setting gets stricter. A config without tier metadata gets its checks compared but not its settings. A check replaced by hand keeps the metadata's settings.
  - **New presets.** `coverage` judges the `coverage-summary.json` a test run wrote and runs no tests (default 80 on lines and statements). `crap` wraps `@danibram/crap4ts` (CRAP 30, complexity 20). `coverage` and `crap` warn instead of judging when a check they depend on failed.
  - **New preset `mutation`.** It runs `repo-contract mutation run --json` and fails below a score of 80, on any Timeout left after re-runs, and on an incomplete or expired record. A full run also fails on a stale record; a shard or a `mutate` list never calls a record stale. A Survived mutant that ran no test fails the run as untrusted. No record covers a Timeout. `shard`, `mutate`, `report`, `cache` and `confirmTimeouts` are options, never environment variables. `report` with `shard` fails as invalid options.
  - **New preset `npmScript`.** It runs one of the package's npm scripts through `repo-contract npm-script --json`. It fails on a non-zero exit, a timeout, or a change to a `mustNotChange` path. A missing script passes as not applicable unless `whenMissing: "fail"`.
  - **New preset options.** `duplication` gains `maxPercentage` (default 0, so any block still fails; a pass within budget lists every block). `markdownlint` gains `globs`, `config` (passed as `--config`) and `verdict: "exit-code"`, which needs no JSON formatter. `brokenLinks` accepts a list of `{ path, mode }` start points, crawled in one linkinator run. `arethetypeswrong` gains `ignoreResolutions`, such as `["node10"]`. Invalid options throw `RangeError` when the config loads.
  - **`securityDeps({ registry })`.** With a registry path, a critical advisory always fails and a lower one passes only while a complete record accepts it. A record covers only its own severity: one written for a moderate advisory does not accept the same package once npm reports it as high. The check writes a blank record for each new advisory and fails on a stale record. An `info` advisory warns. The default, `registry: false`, keeps today's verdicts and writes nothing.
  - **New subpath `repo-contract/config` (Experimental),** with `repo-contract/config/{tsup,typedoc,knip,vitest,stryker}`. `entries` derives entry points from package.json `exports`; `sources` maps a subpath outside the convention. One exclude list feeds Stryker `mutate`, coverage `exclude`, knip `project` and TypeDoc `exclude`. Each helper returns a plain object to spread into that tool's config and imports nothing from the tool. The Stryker helper turns incremental mode off and keeps concurrency at 4.
  - **New `repo-contract/helpers` exports (Stable).** The v2 exception record: `validateExceptionRegistry`, `exceptionRegistryStandardSchema`, `ExceptionRegistrySchema`, the field-key constants, `emptyV2Fields`, `isLegacyRecord`, `isExpired`, `recordFieldValue`, `evaluateFindingVerdict`, `validateSecurityExceptionFields`, `isValidNonEmptyStringField` and `asFlatExceptionRecords`. Validation rejects an impossible date such as `2027-02-30` and names every problem in one pass. `isExpired` accepts any value for `expires` and returns `false` for anything that is not a past `YYYY-MM-DD` date.
  - **Exception vocabulary.** `EXCEPTION_TYPES` holds eight types and `EXCEPTION_METHODS` three, so `required-for-package-to-exist`, `dev-only-not-shipped` and `policy-rule` now validate.
  - **Exception persistence and inventory.** `loadAndReconcileExceptionRegistry` and `reconcileAndPersistExceptionRegistry` (result type `PersistExceptionRegistryResult`) write a blank stub per new finding and keep stale records for the policy. `readExceptionRegistries`, `summarizeExceptionRegistries`, `renderExceptionInventory` and `EXCEPTION_REGISTRY_DIRECTORY` count each registry's records by type, legacy, expired and incomplete.
  - **New `repo-contract/affected` exports.** `readContractConfig`, `mutationShardCount`, `planMutationShards`, `MUTATION_SHARD_BYTES` and `MAX_MUTATION_SHARDS` plan shards at one per 64 KiB of source, at most 256. `resolveMutants`, `mutationExceptionId` and `findMutantById` read a Stryker report; the ids match internal-package-contract's.
  - **New commands.** `repo-contract mutation plan` prints the shard matrix for the Stryker config's mutate set. `repo-contract mutation run` runs Stryker cold: it deletes the incremental file and the old report, and passes `--force`. `repo-contract npm-script <script>` runs one npm script and reports how it ended.
  - **`repo-contract init --preset <tier>`.** It writes a config that spreads the tier, the runner and `scripts.contract`, and writes no workflow. It names each tool the tier runs that package.json does not declare. `init` without `--preset` adds no `coverage`, `crap` or `mutation`, since they need the ordering a tier wires.
  - **`repo-contract explain`.** It loads the config through the project's own `tsx` and prints what it runs and every loosened setting. `--markdown` and `--json` print the same for a report or a script.
  - **`repo-contract except <id>`.** It fills in one exception record with `--set field=text` and lists the fields still blank. It writes only the registry it changed, and exits 1 while the record is incomplete. For a `mutation:` id with no record, it builds the record from the mutation report. It checks the shared v2 rules only; each registry's own rules apply when its check next runs. It reports every problem in the record at once, one per line. `--set expires=` adds the field to a version 2 record that lacks it. An id held by more than one registry fails and names each one. A registry it cannot read, or one with an entry that is not a record, is never written; the message names the file and the entry's index.
  - **`repo-contract exceptions`.** It counts each registry's records by type, legacy, expired and incomplete. It judges nothing.
  - **One argument grammar for `explain`, `except` and `exceptions`.** An option takes `--name value` or `--name=value`. A value that starts with `-` counts as missing, unless it follows `=`. `--help` and `--version` count only before `--`, and everything after `--` is a plain argument, never an option.
  - **`"contract".affected` replaces `"repo-contract".affected` in package.json.** The old key still reads. When both exist, `"contract".affected` wins and the old block is ignored. `repo-contract doctor` reports the old key (`legacy-affected-key`): info alone, warn when both exist. A top-level `"contract"` key that is not an object belongs to another tool. repo-contract then reads the old key, and `doctor` reports `contract-key-not-object`.
  - **`examples/ci/contract.yml`.** An example workflow: one contract job, a mutation shard matrix and the merge step. GUIDE.md also shows a three-line `pre-commit` hook.
  - **Bad options fail when the config loads.** `coverage` throws `RangeError` on a threshold outside 0 to 100 or for an unknown metric. `crap` throws it on a limit that is not above 0. `npmScript` throws it on a blank script or a timeout that is not a whole number above 0. It also throws when the script or a `mustNotChange` path starts with `-`, or `mustNotChange` is not a list of non-empty paths. `sbom` throws it on a path that is not a non-empty string, an output spelled as the lockfile's path, or a non-boolean `write`. Every preset that takes options throws `TypeError` when they are not an object, such as `lint(null)`, and names the preset. Before, `null` failed on a property read that named no preset, and some presets ignored a list. Every tier throws `TypeError` when its overrides are not an object.
  - **`writeExceptionRegistry` refuses an entry that is not a record.** An entry that is not an object with a string `id` returns `{ ok: false }` naming its index, and nothing is written. A `null` entry used to throw a `TypeError`.
- 1934cca: `repo-contract/presets` gains `sbom(options?)`, a check that keeps CycloneDX 1.6 SBOMs in step with `package-lock.json`.
  
  - **What it writes.** `docs/sbom.cdx.json` lists every locked package, dev dependencies with `scope: "excluded"`. `docs/sbom.production.cdx.json` lists every locked package not marked `dev`. Each component carries its purl, the hashes from `integrity`, its declared license and where it was resolved from. Each document holds the full dependency graph.
  - **How.** It builds the documents from the lockfile through `node -e`, with no tool to install, and never runs `npm ls`. The same lockfile gives byte-identical output. There is no timestamp, and the serial number is derived from the content.
  - **What it fails.** A document that is missing, is not a JSON object, or differs from what the lockfile gives. `serialNumber`, `metadata.timestamp`, key order and formatting are ignored. A lockfile also fails when it cannot be read, has no `packages` map (lockfileVersion 1), or holds a `packages` entry that is not an object.
  - **Regenerating.** `write: true` writes the documents instead. GUIDE.md shows a four-line script that runs it. `fix` names that command in the failure message.
  - **Not added by `init`.** The check fails until the documents exist, so `init` lists it under "Not detected".
  - **This repository dogfoods it.** repo-contract's own `docs/sbom.cdx.json` and `docs/sbom.production.cdx.json` now come from `sbom({ write: true })`, and `@cyclonedx/cyclonedx-npm` is no longer a dev dependency.
  - **Options are checked when the config loads.** `lockfile`, `output` and `productionOutput` must be non-empty strings; `productionOutput: null` turns off the production document. Neither output may be spelled as the lockfile's path, after normalizing, and `write` must be a boolean.
  - **Write mode stays inside the project.** It refuses a path that is a symbolic link or is not a regular file. It refuses a path that resolves outside the working directory, such as through a linked `docs/` or `..`. It refuses the lockfile itself: its path, a hard link to it, or a case-variant name on a case-insensitive file system. It then writes nothing, names the option and the path, and exits 1. Each document is written to a temporary file in its directory and renamed into place.

### Patch Changes

- 1934cca: Documentation corrections only. No exported type, flag, error `code`, JSON key or schema constraint changed.
  
  - The README and GUIDE now say CI tests Bun and Deno on Linux only. The `runtime-compat` job now fails when either runtime is missing.
  - GUIDE names all four presets that read their own report file, adding `test`. A unit test keeps that list in step with the preset sources.
  - GUIDE and the agent skill say the library, not the package, never spawns or reads `process.env`. The `bin/` CLI does both.
  - GUIDE links to the generated `Evidence` and `Verdict` reference in place of a hand-copied interface that had drifted.
  - SECURITY, CODE_REVIEW, RELEASING and VERSIONING drop stale details: the files `init` writes, where the declared bump comes from, the release PR title and the internal-package-contract range.

## 0.15.0

### Minor Changes

- 5215d0b: `repo-contract/presets` gains `bundledDependencies`, a check that fails when package.json bundles a package its `dependencies` do not declare. npm publishes each such name into the registry manifest as `"*"`, and Socket reports the mismatch as manifest confusion.
  
  - **What it reads.** `bundleDependencies` and `bundledDependencies` in the package.json of the working directory, through `node -e`; no tool to install. `true` bundles exactly the declared dependencies, so it passes.
  - **What it fails.** A bundled name missing from `dependencies`, each one listed. A field that is neither a list of names nor a boolean. A package.json that cannot be read. A package that bundles nothing passes.
  - **On by default for published packages.** `repo-contract init` now adds it unless package.json says `"private": true`. That matches how `init` adds `distNoUrls` for a package that publishes `dist/`. Its "Not detected" list names a private package's skip.
- 5215d0b: `repo-contract/presets` gains `quickStart(options?)`, and the CLI gains `repo-contract quick-start`. Together they run a README's quick start against the tarball npm would publish, so a broken first step fails before release.
  
  - **Marking the block.** Put `<!-- quick-start:begin -->` on the line before a fenced `sh` block and `<!-- quick-start:end -->` on the line after it. Each line is one command; comments and blank lines are skipped.
  - **What runs.** The command packs the package with install scripts off and makes an empty project (a directory holding only a package.json). A command that installs the package with npm, pnpm, yarn or bun installs the tarball instead. Each command then runs in a shell, in order.
  - **What fails.** A command that exits non-zero; the reason shows its last output. A run past the time budget. A README without a marked block, or a quick start that never installs the package.
  - **Options.** `readme` (default `README.md`) and `timeoutMs` (default five minutes, for all the commands together). The CLI takes `--readme`, `--timeout`, `--json` and `-C`.
  - **Opt-in.** `repo-contract init` never adds it. The commands reach whatever network they reach, so an install reaches the registry.
- 5215d0b: The optional `typescript` peer now starts at `>=5.8.0`, the oldest release CI proves. It was `>=5.0.0`, and nothing tested 5.0 to 5.7.
  
  - **Who is affected.** A project on TypeScript 5.0 to 5.7. Under them, a CommonJS project with `module: "nodenext"` fails to type-check the package's declarations (TS1479). Each `dist/*.d.cts` re-exports an ES module, which 5.8 is the first to allow. npm now warns about the peer on install.
  - **What to do.** Upgrade TypeScript to 5.8 or later. An ES module project, or one with `skipLibCheck`, may keep working on an older 5.x, but no release below 5.8 is tested.
  - **How it stays true.** CI's `typescript-compat` job now type-checks the packed tarball under the peer's floor as well as the newest 5, 6 and 7. A unit test fails when the floor in `package.json` and the job's list disagree, or when a document states another range.

### Patch Changes

- 5215d0b: Comment and description wording only. No exported type, flag, error `code`, JSON key or schema constraint changed.
  
  - TSDoc in the shipped `.d.ts` files is shorter and plainer, and so is the `description` text of the published Evidence and Verdict JSON Schemas.
  - No comment sentence in `src/` or `bin/` is longer than 25 words, except two coverage-directive reasons.

## 0.14.0

### Minor Changes

- 1ce78ae: `repo-contract/presets` gains `aiReview(options)`, an AI review check, with the `AiReviewOptions`, `AiReviewReply` and `AiReviewFinding` types. It was example code in `examples/demo`; it is now a published preset, Experimental like the rest of the catalog.
  
  - **What is called.** `agent` is your reviewer's command line. The prompt goes at `{prompt}` or as the last argument. `prompt` replaces the default text, or `{ file }` hands the agent a prompt file's path. `files` lists the files to review. `label`, `timeoutMs` (default 10 minutes) and `cwd` are options too.
  - **Credentials.** `credentials` takes variables by name and value and passes them through the check's `env`, so they work when the runner sets `inheritEnv: false`. A value never enters the command line, and every reason shows it as `[redacted]`. A credential with no value turns a `pass` into a `warn`.
  - **Reading the reply.** The preset parses the whole output as JSON, then the text from its first `{` to its last `}`. When neither gives the `{ findings: [{ rule, file, line, severity, score, reason }], summary: { score } }` shape, it judges `fallback` instead and lists the problems. The default fallback is one `warn` finding, "the reviewer's output could not be parsed", so an unreadable reply never passes silently.
  - **Policy.** An `error` finding at or above `errorThreshold` (default `0.8`) fails. Other `warn` and `error` findings, and the default fallback, warn. Only `info` findings pass. Each reason lists the findings with their confidence.
  - `repo-contract init` never adds `aiReview`. It lists it under "Not detected", because it needs your agent's command.
  - The `examples/demo` AI check now imports the preset. CI replays one more recorded reply, JSON wrapped in prose and a code fence, to prove the first-`{`-to-last-`}` recovery.

### Patch Changes

- 1ce78ae: Documentation, comment and message text only. No exported type, flag, error `code`, JSON key or schema constraint changed.
  
  - The header comment `repo-contract init` writes into a new `repo-contract.config.mts` is reworded. The first line of the generated `scripts/contract.mjs` no longer uses an em-dash. The generated code is unchanged.
  - TSDoc wording changed in the shipped `.d.ts` files and in the `description` text of the published JSON Schemas. The `Evidence` TSDoc now states the schema-version rule the `api-contract` check enforces, and its limit.
  - User-visible text no longer uses a spaced double hyphen as a dash. This covers the `init` and `doctor` `--help` text, the `init` notices, the error messages (for example `Invalid repo-contract config: <reason>`), the preset rationales, the `affected` reasons, and the Markdown run summary (`- **id**: <first line>`). The help-text changes are compatible, and a patch covers them.
  - The `deadCode`, `e2e` and `test` presets' failure detail lines use `: ` where they used an em-dash, for example `src/a.ts:5:1: unused export: unused` and `suite.test.ts: a failing test: boom`.
  
  - The README no longer mentions a `--checks a,b,c` flag, which never existed. `runRepoContract`'s `checks` option is what runs a subset.
  - The `affected` and `doctor` commands both run `git`. The README and ADOPTION said only `affected` did.
  - The `affected`, scope, cache and speed sections moved from the README to the GUIDE ("Running less: affected scope, cache and speed"). The README keeps a short pointer and fits the shared 220-line structure.
  - The quick start no longer promises a passing `securityDeps` check; it passes when `npm audit` finds nothing.
  - `PIN_SYNC_TOKEN` needs Actions write as well; RELEASING says so.
  - GUIDE's preset table gains a "Package `init` detects" column, and a test compares it with the mapping `init` uses.
  - Tests compare GUIDE's preset "Wraps" column with the command each preset runs, and GUIDE's CLI command lines and flags with each command's `--help` and argument parser. The `deadCode` row now shows `--reporter-options <options>`, and GUIDE names the `affected`, `metrics` and `-C` options it left out.
  - The npm description, README opening, landing page and agent skill now lead with one pitch: "Use deterministic and AI checks to enforce a baseline engineering standard across your org." A test fails when those copies differ. The README grounds each term: a deterministic check, an AI check, the **contract** (the config file) and the **standard** (a contract published as an npm package that repositories extend and add to).
  - GUIDE gains "AI review checks", built on the new `aiReview` preset (see its own changeset). `examples/demo` runs it against recorded replies, and CI checks each outcome.
  - The README's first screen shows the three install commands and the demo's real output. CI's `examples` job fails when the demo stops printing the quoted lines.
  - The entry points' TSDoc module comments, and the `defineRepoContract` and `runRepoContract` summaries, lead with what each gives a consumer. The root module comment no longer says the root exports "two functions"; it exports four.
  - A test now checks that the README's `repo-contract` command lines and the flags beside them are accepted by each command's argument parser.
  - The agent skill's example comment is two lines, and the skill states the `spawn`/`env` rule once.

## 0.13.0

### Minor Changes

- 761ad71: `buildEvidenceManifest` accepts an optional `subject` (`{ commit, ref? }`) and seals it into the manifest's digest, so a manifest says what a full run looked at, not only that one passed; manifests without a subject are unchanged.
  
  Gates widened: the `security-network` scan covers the shipped `bin/` as well as `src/` (one reviewed record: the CLI loads the project's own TypeScript for `affected`); every published barrel has a gzip budget (helpers 9 KiB, affected 23 KiB, metrics 5 KiB, both formats); `v8`/`c8`/`istanbul ignore` directives are governed suppressions with records, and `no-console` and `@ts-expect-error` disables need a record too; the Bun, Deno and Node consumer tests import every barrel and the Node one runs the CLI's `--help`; the TypeScript compat consumer imports every barrel, and under TypeScript 7 proves that `repo-contract/affected` fails with the compiler-API error its documentation names while every other barrel compiles; CI runs each example's main README command and checks its outcome; a `required` CI check stands for every job the ruleset could not name, and `contract` fails instead of skipping when `verify` or `lint` fails.
  
  Documentation now matches the tooling and the gates behind it. RELEASING and CONTRIBUTING describe the real release rules: changesets are generated from `feat`, `fix`, `perf` and `revert` commits on `main` (pre-1.0: breaking → minor, the rest → patch), other commit types release nothing, and a maintainer merges the Version Packages PR. `repo-contract/affected` and `repo-contract/metrics` now appear in VERSIONING (Experimental), `docs/surface.json`, the skill, the architecture spec's five barrels, the API-baseline list and the ADR-governance path list. The mutation sentence names what is excluded and the static mutants that are not counted; the network-scan sentence says what is scanned where; the persistence paragraph covers the opt-in cache and run log. Stale references to minimatch, release-please, a Node 20 floor, a TypeScript 5 toolchain, "three barrels" and an OS matrix for the contract are corrected, and `init` is no longer the only CLI command the architecture spec describes.
  
  The `benchmark-pr` job now fails on a worse growth class or an overhead ratio past its budget (`--gate`, judged against the last run on main and the last release), after posting the summary; the `performance-api-contract` suite measures again (its fixture's tsconfig lacked the `rootDir` TypeScript 6 requires, so every tier had failed silently since 2026-10-19). `npm run contract` writes an evidence manifest for its own passing full runs to `reports/evidence-manifest.json`.

### Patch Changes

- 761ad71: Claims now match the evidence behind them. `docs/OpenSSF-Scorecard.md` leads with the official OpenSSF Scorecard result fetched from the public Scorecard API, lists every check where this repository's own evaluation differs and why, and computes its "not evaluated" list from the upstream check list (it had said no SBOM was generated). The local evaluation now scores Code-Review from approvals on merged pull requests rather than the branch-protection setting, scores Maintained as 0 for a repository younger than 90 days as upstream does, and scores Contributors proportionally. The evidence manifest's documentation now says its digest detects accidental edits and is not a signature, and the README says which features the workflow test covers and which have unit tests instead.
  
  What installing the package adds is now generated into ADOPTION.md from `package.json` by `internal-package-contract generate`, and the contract gains the shared `GeneratedRegions` check so it cannot go stale.

## 0.12.0

### Minor Changes

- 8e74e7c: Add `repo-contract affected` and `repo-contract/affected` (Experimental). The command shows which tests and mutation targets the working tree's changes can affect, compared with a base commit: `--base <ref>`, `-C <dir>`, `--json` (versioned), `--explain`, and `--tests`/`--sources`/`--mutate` for one path per line. Data goes to stdout and diagnostics to stderr; exit status is 0 on success (including "run everything", reported on stderr), 1 if it could not run, 2 for a usage error. The analysis behind it is symbol-level and pure: anything it cannot reason about (an unplaced file, a lockfile, a module that does not parse, a dynamic load, git failing) widens the answer toward a full run instead of narrowing it on a guess. `typescript` is an optional peer dependency.
  
  `repo-contract` and `repo-contract init` now follow command-line conventions: `--help`/`--version` work at the top level, and an unknown command or misuse exits 2 (was 1).
  
  `repo-contract/affected` also exports `parseScopeArgs` and `resolveScope` (a run's scope from `--scope`, `CI_FULL`, `REPO_CONTRACT_SCOPE` and the CI event; a release is always full) and a content-addressed result cache, `createCache`, `cacheKey` and `resolveCacheMode`, with a file-backed store, `createFileCacheStore`, in `repo-contract/helpers`. A full run never reads or writes the cache. `repo-contract cache stats|clear|prune` inspects and tidies `.repo-contract/cache`.
  
  Speed features, all opt-in. `RunRepoContractOptions.failFast` and the per-check `expensive` option skip expensive checks once a cheap one has failed; a skipped check has `status: "aborted"` and the new `CheckEvidence.skipReason: "fail-fast"`, never passes, and `resolveFailFast`/`parseFailFastArgs` read `--fail-fast` and `REPO_CONTRACT_FAIL_FAST` (never for a release). `repo-contract affected` gains `--shard <i>/<n>`, `--plan-shards` (a GitHub Actions matrix), `--shards`, `--target-minutes`, `--max-shards` and `--timings`; `planShards`, `shardMatrix` and `mergeMutationReports` (which fails on a missing or overlapping shard) are exported, and `repo-contract merge-mutation --total <n> --out <file> <shard>=<file>...` runs the merge. `packArtifacts`/`unpackArtifacts` store build output with checksums. `findEscapes` is the soundness canary: given a full run's failures and the affected set, it names any failing test the narrow scope would have skipped. `repo-contract cache why <check> --inputs <file>` names the inputs that changed; `repo-contract doctor [--fix]` finds a shallow CI checkout, an unignored cache directory and similar; `repo-contract metrics` summarizes the run log.
  
  New `repo-contract/metrics` (Experimental): run records and their log format, `summarizeRuns` (pass rate, cache hit ratio, affected ratio, minutes saved, first-pass rate, mutation trend), `pillarCoverage`, `maturityLevel` (0 to 4, with what the next level needs) and an evidence manifest (`buildEvidenceManifest`, `verifyEvidenceManifest`).

## 0.11.4

### Patch Changes

- fix(sbom): satisfy type-aware lint in the generator and its test
- fix(sbom): drop the machine's npm from the SBOM tool list

## 0.11.3

### Patch Changes

- 489f372: - The `license` preset uses the repository's own `.licensee.json` when there is one. It used to always pass `--osi`, and licensee ignores `.licensee.json` whenever a policy flag is given, so the file had no effect. The preset now passes `--osi` only when there is no `.licensee.json` in the check's working directory, and the verdict names the policy it applied. licensee is now resolved from the working directory's `node_modules` (a local development dependency), not looked up on `PATH`. A config that overrides `run` to call `licensee` directly behaves as before.
  - The `e2e` preset fails when Playwright ran 0 tests (no test matched, or every test was skipped). It used to report a pass, because 0 tests means 0 failures.
  - The `test` preset fails when Vitest ran 0 tests (for example when every test is skipped), instead of reporting a pass.
  - The published package no longer lists files under a nested `examples/**/node_modules` directory, which `npm pack` included whenever one existed locally.

## 0.11.2

### Patch Changes

- 9caf04b: - Built with TypeScript 6 and tsup 9, with the rest of this month's development-tool updates; the API-contract check confirms the published API is unchanged.
  - The agent skill says a `run` string runs without a shell and rejects shell operators (`shell: true` opts into one), and that the helpers use `node:crypto` and an injectable `node:fs/promises`.
  - The landing page shows the current version, and the release's `version` step now regenerates the agent skill and landing page, so a release no longer needs a follow-up commit for them.
  - SBOM generation fails, naming the cause, when cyclonedx-npm writes a root component without the package's own repository reference. It did this silently whenever npm masked part of the checkout's path (npm hides UUID-shaped text), dropping the package's description and links from the SBOM.
  - Exception-record validation names a structured-field problem even when a core field is also wrong, so one run reports every problem with a record.
  - The benchmark pages measure every size up to 10,240 for the exception functions again, and describe the `slowest` sweep as it behaves: cost rises with the rows listed until they reach the checks being ranked.

## 0.11.1

### Patch Changes

- ffe6f21: - `repo-contract/helpers`: ADR 0019 made the exception-registry and exception-policy primitives Stable (`loadExceptionRegistry`, `reconcileExceptions`, `writeExceptionRegistry`, `evaluateExceptionRecord` and the rest, with their record types), and they are now tagged `@public` instead of `@beta`. `repoContractLogs` and its two hooks stay beta. ADR 0013 now says it was amended.
  - `SECURITY.md` says how a report is acknowledged, coordinated and published.
  - The README links an agent skill written from the package's own exports, and describes `dependsOn` as exposing the dependency's evidence to the policy.
  - ADR 0011 says where the ambient-capabilities tarball check runs; it is back in `precommit`.
  - ADR 0014 is amended: CodeRabbit's findings are advisory suggestions, reported as a warning, never a reason to stop a commit.
  - No behaviour of the published package changes.

## 0.11.0

### Minor Changes

- af65e10: feat: `RunRepoContractOptions.onEvidence` reports each check as soon as it finishes, so a caller can show progress and keep a check's raw output while the run is still going
- af65e10: feat: `RunRepoContractOptions.onVerdict` reports each check's `PolicyResult` as soon as its policy returns, beside `onEvidence`. `repo-contract/helpers` gains `onEvidenceSaveToRepoContractLogs` and `onVerdictPrependRepoContractLogs`, ready-made hooks that write one log per check as the run goes (the raw output when its evidence exists, the verdict prepended when its policy returns), plus `repoContractLogs` for the store behind them

### Patch Changes

- feat(ci): publish the mutation badge and the OpenSSF Scorecard result
- fix(site): readable inline code in the hero
- fix(sbom): change only the commit in the internal-package-contract purl

## 0.10.0

### Minor Changes

- 1adc26c: The published declarations are now proven against TypeScript 5, 6 and 7 (the native compiler) in CI: the packed tarball is installed into a scratch consumer under each major's newest release and type-checked with `moduleResolution: "nodenext"` and `strict`, instead of only against whatever `typescript@latest` happens to be. The repository's own source is also type-checked with the TypeScript 7 compiler. No runtime or API change.

## 0.9.1

### Patch Changes

- fix(release): build the generated docs before the release verify

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
