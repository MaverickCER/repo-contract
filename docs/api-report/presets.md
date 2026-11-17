# presets

Ready-made checks for common TypeScript and JavaScript tools. Spread a preset into your
`checks` record and override what you need, most often `policy`.

A preset encodes how to run and read one tool, never what counts as good enough
(specs/decisions/0004-public-surface-stays-narrow-no-cli-experimental-presets.md). To change
what a factory preset runs, pass it options; overriding `run` directly is the escape hatch.

Experimental, and published under its `./presets` subpath. It is never re-exported from the
package root, and it re-exports nothing from there.

## Interfaces

### AiReviewFinding

**`Beta`**

One finding in an AI reviewer's reply.

#### Properties

##### file

```ts
readonly file: string;
```

**`Beta`**

The file the finding is about, relative to the repository root. `""` when it is about no one file.

##### line

```ts
readonly line: number;
```

**`Beta`**

The 1-based line in `file`, or `0` when the finding has no single line.

##### reason

```ts
readonly reason: string;
```

**`Beta`**

What is wrong and why, in the reviewer's words.

##### rule

```ts
readonly rule: string;
```

**`Beta`**

A short name for the concern, such as `no-logging-in-library`.

##### score

```ts
readonly score: number;
```

**`Beta`**

The reviewer's confidence that the finding is real, from 0 to 1.

##### severity

```ts
readonly severity: "warn" | "error" | "info";
```

**`Beta`**

`error` for a defect, `warn` for a concern, `info` for a remark. Only `error` can fail the check.

***

### AiReviewOptions

**`Beta`**

Options accepted by [aiReview](#aireview). Only `agent` is required.

#### Properties

##### agent

```ts
readonly agent: readonly string[];
```

**`Beta`**

The agent's command line: its executable, then its arguments, for example
`["claude", "-p", "{prompt}"]`. Every `{prompt}` inside an argument becomes the prompt. With no
`{prompt}`, the prompt is appended as the last argument. The evidence records this command line.

##### credentials?

```ts
readonly credentials?: Readonly<Record<string, string | undefined>>;
```

**`Beta`**

Environment variables the agent authenticates with, by name, for example
`{ ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY }`. Each value reaches the agent's process
through the check's `env`, so it works when the runner sets `inheritEnv: false`. A value never
enters the command line, and every occurrence of it in a reason is replaced with `[redacted]`.
The evidence keeps the agent's stdout and stderr, so a value the agent prints lands there.
A name whose value is `undefined` or `""` is left unset and turns a `pass` into a `warn`.

##### cwd?

```ts
readonly cwd?: string;
```

**`Beta`**

The agent's working directory. Defaults to the runner's.

##### errorThreshold?

```ts
readonly errorThreshold?: number;
```

**`Beta`**

An `error` finding at or above this confidence fails the check; below it, the finding warns. From 0 to 1. Defaults to `0.8`.

##### fallback?

```ts
readonly fallback?: AiReviewReply;
```

**`Beta`**

The review used when the output cannot be parsed into an [AiReviewReply](#aireviewreply). Defaults to one
`warn` finding (rule `unparsed-output`, score 1) whose reason is "the reviewer's output could
not be parsed", so an unusable reply never passes silently. An `error` finding at score 1 here
makes an unusable reply fail the check.

##### files?

```ts
readonly files?: readonly string[];
```

**`Beta`**

Files the review is limited to, listed at the end of a string prompt. Empty by default: the agent reviews the repository's changes.

##### label?

```ts
readonly label?: string;
```

**`Beta`**

How the reasons name the reviewer. Defaults to `"The AI reviewer"`.

##### prompt?

```ts
readonly prompt?: 
  | string
  | {
  file: string;
};
```

**`Beta`**

What the agent is asked. A string is the prompt text. `{ file }` hands the agent that path in
place of the text, for an agent that reads its prompt from a file. The default prompt asks for
[AiReviewReply](#aireviewreply) and shows an example of it. A replacement must ask for the same shape, or
every reply goes to `fallback`.

##### timeoutMs?

```ts
readonly timeoutMs?: number;
```

**`Beta`**

Milliseconds before the agent's process is stopped and the check fails. Defaults to `600_000` (10 minutes).

***

### AiReviewReply

**`Beta`**

The JSON reply [aiReview](#aireview) asks the reviewer for, and the shape of its `fallback`.

#### Properties

##### findings

```ts
readonly findings: readonly AiReviewFinding[];
```

**`Beta`**

Every finding, in any order. Empty when the reviewer found nothing.

##### summary

```ts
readonly summary: {
  score: number;
};
```

**`Beta`**

The reviewer's confidence in the change as a whole, from 0 to 1. The policy gates on `findings` only.

###### score

```ts
readonly score: number;
```

***

### ArethetypeswrongOptions

Options accepted by [arethetypeswrong](#arethetypeswrong).

#### Properties

##### ignoreResolutions?

```ts
readonly ignoreResolutions?: readonly AttwResolutionKind[];
```

Resolutions whose problems are dropped before judging. `["node10"]` suits a package that supports only `exports`-aware resolution. Defaults to none.

***

### BrokenLinksOptions

Options accepted by [brokenLinks](#brokenlinks).

#### Properties

##### start?

```ts
readonly start?: string | readonly BrokenLinksStart[];
```

Where the crawl starts. A string is one HTML start point. Defaults to `"."`. A list runs one
crawl over every start point, served from the working directory. linkinator's Markdown mode
is all or nothing, so one `"markdown"` start turns it on for the whole crawl.

***

### BrokenLinksStart

One place a crawl starts, and how its files are read.

#### Properties

##### mode?

```ts
readonly mode?: "html" | "markdown";
```

`"markdown"` follows links in Markdown files; `"html"` (the default) reads HTML only.

##### path

```ts
readonly path: string;
```

A file or directory, relative to the working directory.

***

### CoverageOptions

Options accepted by [coverage](#coverage-1).

#### Properties

##### summary?

```ts
readonly summary?: string;
```

The `json-summary` report a test run wrote. Defaults to `"coverage/coverage-summary.json"`.

##### thresholds?

```ts
readonly thresholds?: CoverageThresholds;
```

Defaults to 80 on lines and statements. Given, it replaces the default whole.

***

### CoverageThresholds

Minimum coverage per metric, in percent. A metric left out is not judged.

#### Properties

##### branches?

```ts
readonly branches?: number;
```

##### functions?

```ts
readonly functions?: number;
```

##### lines?

```ts
readonly lines?: number;
```

##### statements?

```ts
readonly statements?: number;
```

***

### CrapOptions

Options accepted by [crap](#crap).

#### Properties

##### coverage?

```ts
readonly coverage?: string;
```

The Istanbul `coverage-final.json` to score against. Defaults to `"coverage/coverage-final.json"`.

##### ignore?

```ts
readonly ignore?: readonly string[];
```

Globs crap4ts skips.

##### maxComplexity?

```ts
readonly maxComplexity?: number;
```

The highest cyclomatic complexity a function may have, however well covered. Defaults to `20`.

##### report?

```ts
readonly report?: string;
```

Where crap4ts writes its JSON report. Defaults to `"reports/crap.json"`.

##### src?

```ts
readonly src?: string | readonly string[];
```

The source directories to score. Defaults to `"src"`.

##### threshold?

```ts
readonly threshold?: number;
```

The highest CRAP score a function may have. Defaults to `30`.

***

### DistNoUrlsAllowEntry

One allowlisted URL (glob) and the reviewable reason it may ship.

#### Properties

##### reason

```ts
readonly reason: string;
```

Why this URL must ship in the build output. Required and non-empty: an allowlist entry without one fails the check.

##### url

```ts
readonly url: string;
```

A URL, or a glob (`*`, `**`, `?`, `[...]`, `{a,b}`; escape literals with ``) matched against each whole URL found.

***

### DistNoUrlsOptions

Options accepted by [distNoUrls](#distnourls).

#### Properties

##### allow?

```ts
readonly allow?: readonly DistNoUrlsAllowEntry[];
```

URLs permitted in the output, each with a reason. Empty by default: the strictest policy is the default.

##### dir?

```ts
readonly dir?: string;
```

Build-output directory to scan, relative to the working directory. Defaults to `"dist"`.

***

### DuplicationOptions

Options accepted by [duplication](#duplication).

#### Properties

##### maxPercentage?

```ts
readonly maxPercentage?: number;
```

The largest share of scanned lines that may be duplicated, in percent. A pass still lists every block. Defaults to `0`: any duplicated block fails.

##### path?

```ts
readonly path?: string;
```

Directory to scan for duplicated code, passed straight through to jscpd as its positional target. Defaults to `"."`: narrow it (e.g. `"src"`) to scope the scan to your source tree.

***

### MarkdownlintOptions

Options accepted by [markdownlint](#markdownlint).

#### Properties

##### config?

```ts
readonly config?: string;
```

A markdownlint config file, passed as `--config`.

##### glob?

```ts
readonly glob?: string;
```

Glob passed straight through to markdownlint-cli2 as its positional target. Defaults to `"**/*.md"`. Ignored when `globs` is set.

##### globs?

```ts
readonly globs?: readonly string[];
```

Globs passed to markdownlint-cli2 in place of `glob`. Explicit globs such as `["*.md", "docs/**/*.md"]` keep the run out of `node_modules`.

##### verdict?

```ts
readonly verdict?: "json" | "exit-code";
```

How the verdict is read. `"json"` (the default) reads the JSON formatter's report file. `"exit-code"` reads the exit code and printed output, so no formatter is needed.

***

### MutationOptions

Options accepted by [mutation](#mutation).

#### Properties

##### cache?

```ts
readonly cache?: "read-write" | "read-only" | "off";
```

Reuse a clean run while nothing it depends on has changed. Defaults to `"off"`; a CI run should keep it off.

##### config?

```ts
readonly config?: string;
```

The Stryker config file. Defaults to the first `stryker.config.*` or `stryker.conf.*` found.

##### confirmTimeouts?

```ts
readonly confirmTimeouts?: number;
```

Re-run at most this many timed-out mutants alone before a timeout counts. Defaults to `5`.

##### minScore?

```ts
readonly minScore?: number;
```

The lowest mutation score that passes, in percent. `100` demands every mutant detected or recorded. Defaults to `80`.

##### mutate?

```ts
readonly mutate?: readonly string[];
```

Mutate only these files. An empty list passes with nothing to mutate.

##### patchVitestRunner?

```ts
readonly patchVitestRunner?: boolean;
```

Patch `@stryker-mutator/vitest-runner` when Vitest 5 needs it. Defaults to `true`. The patch
changes the runner's test-name separator to Vitest 5's (stryker-js#6210). Without it, every
mutant runs 0 tests. Only an install inside the project is patched. `false` passes
`--no-patch-vitest-runner`.

##### registry?

```ts
readonly registry?: string | false;
```

The registry of hand-verified mutants. Defaults to `".repo-contract/exceptions/mutation.json"`; `false` reads none.

##### report?

```ts
readonly report?: string;
```

Judge this Stryker report and mutate nothing, such as the merged report of a sharded run.

##### shard?

```ts
readonly shard?: string;
```

Mutate one slice, written `<index>/<total>`. A sharded run cannot call a record stale.

##### timeoutMs?

```ts
readonly timeoutMs?: number;
```

Time the whole run may take, in milliseconds.

***

### NpmScriptOptions

Options accepted by [npmScript](#npmscript).

#### Properties

##### label?

```ts
readonly label?: string;
```

The name rationales use. Defaults to the script name.

##### mustNotChange?

```ts
readonly mustNotChange?: readonly string[];
```

Paths the script must leave byte-identical. Set them for a script that regenerates committed files: a change means the committed copy is stale.

##### script

```ts
readonly script: string;
```

The npm script to run.

##### timeoutMs?

```ts
readonly timeoutMs?: number;
```

Time the script may take, in milliseconds.

##### whenMissing?

```ts
readonly whenMissing?: "fail" | "skip";
```

When package.json has no such script: `"skip"` (the default) passes as not applicable; `"fail"` fails.

***

### QuickStartOptions

Options accepted by [quickStart](#quickstart).

#### Properties

##### readme?

```ts
readonly readme?: string;
```

The Markdown file that holds the marked quick start, relative to the working directory. Defaults to `"README.md"`.

##### timeoutMs?

```ts
readonly timeoutMs?: number;
```

Time all of the quick start's commands together may take, in milliseconds. Defaults to `300000` (five minutes).

***

### SbomOptions

**`Beta`**

Options for [sbom](#sbom).

#### Properties

##### fix?

```ts
readonly fix?: string;
```

**`Beta`**

The command a failure message tells the reader to run to regenerate the documents.

##### lockfile?

```ts
readonly lockfile?: string;
```

**`Beta`**

The npm lockfile the SBOM is built from. It must have a `packages` map (lockfileVersion 2 or 3). Defaults to `"package-lock.json"`.

##### output?

```ts
readonly output?: string;
```

**`Beta`**

The SBOM of every locked package, dev dependencies included (their `scope` is `"excluded"`). Defaults to `"docs/sbom.cdx.json"`.

##### productionOutput?

```ts
readonly productionOutput?: string | null;
```

**`Beta`**

The SBOM of what installing the package brings in: every locked package not marked `dev`. Defaults to `"docs/sbom.production.cdx.json"`; `null` skips it.

##### write?

```ts
readonly write?: boolean;
```

**`Beta`**

Write the documents instead of checking them. Defaults to `false`: the check fails when a committed document is missing or out of date. Write mode refuses a path that is a symbolic link, is not a regular file, or resolves outside the working directory. It also refuses the lockfile: its path, a hard link to it, or a case-variant name on a case-insensitive file system. A refusal writes nothing and exits 1.

***

### SecurityDepsOptions

Options accepted by [securityDeps](#securitydeps).

#### Properties

##### registry?

```ts
readonly registry?: string | false;
```

The exception registry, such as `".repo-contract/exceptions/security-deps.json"`. With one, a
`critical` advisory still fails, and a lower one passes only while a complete record accepts
it. The check writes a blank record for each new advisory and fails on a record whose advisory
is gone. An `info` finding warns and gets no record. Defaults to `false`: no registry,
so any low, moderate, high or critical advisory fails.

## Type Aliases

### AttwResolutionKind

```ts
type AttwResolutionKind = "node10" | "node16-cjs" | "node16-esm" | "bundler";
```

A module resolution attw judges a package under.

## Variables

### bundledDependencies

```ts
const bundledDependencies: CheckDefinitionConfig;
```

**`Beta`**

Fails when package.json bundles a package (`bundleDependencies` or `bundledDependencies`) that
its `dependencies` do not declare. npm writes each such name into the published registry
manifest as `"*"`, and supply-chain scanners such as Socket report the mismatch as manifest
confusion. Passes a package that bundles nothing. Reads package.json in the working directory
with `node -e`; no external tool.

***

### e2e

```ts
const e2e: CheckDefinitionConfig;
```

**`Beta`**

End-to-end test execution via Playwright, reading its JSON reporter output.

***

### format

```ts
const format: CheckDefinitionConfig;
```

**`Beta`**

Code formatting via Prettier, applied in place.

***

### license

```ts
const license: CheckDefinitionConfig;
```

**`Beta`**

Dependency license compliance via licensee. The repository's `.licensee.json` is the policy
when it exists; otherwise a dependency's license must be OSI-approved (`--osi`).

***

### publint

```ts
const publint: CheckDefinitionConfig;
```

**`Beta`**

publint has no machine-readable output mode: only a plain-text CLI
reporter (see its `src/cli.js` `formatMessages`). Its process exit
code reflects only 'error'-level findings; 'warning'/'suggestion'-level
findings never affect it. This preset reads the three section headers
publint's CLI writes ("Errors:", "Warnings:", "Suggestions:") to tell
blocking findings from non-blocking ones. It depends on no per-message
structure, which publint doesn't expose. Relevant only to repositories
that publish an npm package.

***

### securitySecrets

```ts
const securitySecrets: CheckDefinitionConfig;
```

**`Beta`**

Secret-leak scanning via secretlint.

***

### test

```ts
const test: CheckDefinitionConfig;
```

**`Beta`**

Unit/integration test execution via Vitest, reading its JSON reporter output.

***

### typecheck

```ts
const typecheck: CheckDefinitionConfig;
```

**`Beta`**

Type checking via `tsc --noEmit`.

## Functions

### aiReview()

```ts
function aiReview(options): CheckDefinitionConfig;
```

**`Beta`**

An AI review as a check. It runs your agent with a prompt that asks for one fixed JSON shape,
[AiReviewReply](#aireviewreply). Every finding carries a confidence score, and the check gates on them. A
model can answer differently on every run, so the policy reads only that structured reply,
never prose.

The output is read in three steps. The whole output is parsed as JSON. If that fails, the text
from its first `{` to its last `}` is parsed. If that fails too, or the JSON is not the
requested shape, `fallback` is judged in its place and the reason lists the problems.

The verdict is `fail` when an `error` finding scores at or above `errorThreshold`. It is `warn`
for any other `warn` or `error` finding, including the default fallback. It is `pass` for `info`
findings only. Each reason lists every `warn` and `error` finding with its file, line, rule and
confidence.
A timeout, a missing agent or a process killed by a signal fails. A non-zero exit code alone
does not: a well-formed reply still counts, and an unreadable one names the code. The tests prove
the parsing and the policy; they do not prove a model's judgement.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`AiReviewOptions`](#aireviewoptions) | The agent to run and how to judge it; see [AiReviewOptions](#aireviewoptions). |

#### Returns

[`CheckDefinitionConfig`](index/README.md#checkdefinitionconfig)

The configured check.

#### Throws

When `options` is not an object.

#### Example

```ts
aiReview: aiReview({
  agent: ["claude", "-p", "{prompt}"],
  credentials: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY },
  errorThreshold: 0.8,
}),
```

***

### arethetypeswrong()

```ts
function arethetypeswrong(options?): CheckDefinitionConfig;
```

**`Beta`**

Published-package type-resolution correctness via `@arethetypeswrong/cli`.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`ArethetypeswrongOptions`](#arethetypeswrongoptions) | configuration for this check; see [ArethetypeswrongOptions](#arethetypeswrongoptions). |

#### Returns

[`CheckDefinitionConfig`](index/README.md#checkdefinitionconfig)

the configured check.

#### Throws

when `options` is not an object.

#### Throws

when `ignoreResolutions` names a resolution attw does not use.

***

### brokenLinks()

```ts
function brokenLinks(options?): CheckDefinitionConfig;
```

**`Beta`**

Broken-link detection via linkinator, recursing through local files and following both local
and remote links. `--skip node_modules` avoids wasting the crawl on vendored files that were
never authored content. A link that answered HTTP 429 passes, since a rate limit says nothing
about whether the page exists. A local link linkinator could not serve passes when it exists
on disk, resolved from the working directory: linkinator reports a bare directory link as
broken, though every git host renders it.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`BrokenLinksOptions`](#brokenlinksoptions) | configuration for this check; see [BrokenLinksOptions](#brokenlinksoptions). |

#### Returns

[`CheckDefinitionConfig`](index/README.md#checkdefinitionconfig)

the configured check.

#### Throws

when `options` is not an object.

#### Throws

when `start` is an empty list.

***

### commitlint()

```ts
function commitlint(options?): CheckDefinitionConfig;
```

**`Beta`**

Commit-message governance via commitlint, using whatever commitlint
config the consumer's repository already has (commitlint ships no
rules of its own: e.g. `@commitlint/config-conventional`). It judges the
exit code, not `--format json`: commitlint has no broadly-documented,
stable JSON CLI output. This preset reads its plain-text report as the
`format`/`typecheck` presets do for their tools, instead of relying on an
unconfirmed flag.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`CommitlintOptions`](#) | configuration for this check; see [CommitlintOptions](#). |

#### Returns

[`CheckDefinitionConfig`](index/README.md#checkdefinitionconfig)

the configured check.

#### Throws

when `options` is not an object.

***

### coverage()

```ts
function coverage(options?): CheckDefinitionConfig;
```

**`Beta`**

Package-wide test coverage, read from the `json-summary` report a test run wrote. It runs no
tests: declare `dependsOn` on the check that does. Fails on any judged metric below its
threshold, and when the report is missing or unreadable. Warns, not evaluated, when a check it
depends on failed: that check is already red, and its coverage would describe a broken run.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`CoverageOptions`](#coverageoptions) | configuration for this check; see [CoverageOptions](#coverageoptions). |

#### Returns

[`CheckDefinitionConfig`](index/README.md#checkdefinitionconfig)

the configured check.

#### Throws

when `options` is not an object.

#### Throws

when `thresholds` is not an object of metrics from 0 to 100.

***

### crap()

```ts
function crap(options?): CheckDefinitionConfig;
```

**`Beta`**

No function both complex and poorly covered, via `@danibram/crap4ts`. Fails on a function above
the CRAP threshold or the complexity ceiling, and on an unreadable score. Reads the coverage a
test run wrote: declare `dependsOn` on that check. Warns, not evaluated, when a check it depends
on failed.

crap4ts writes its report to a file, not stdout: it exits before a large report drains through a
pipe, which cuts the JSON at 64 KiB.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`CrapOptions`](#crapoptions) | configuration for this check; see [CrapOptions](#crapoptions). |

#### Returns

[`CheckDefinitionConfig`](index/README.md#checkdefinitionconfig)

the configured check.

#### Throws

when `options` is not an object.

#### Throws

when `threshold` or `maxComplexity` is not a finite number above 0.

***

### deadCode()

```ts
function deadCode(options?): CheckDefinitionConfig;
```

**`Beta`**

Dead/unused-code detection via knip.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`DeadCodeOptions`](#) | configuration for this check; see [DeadCodeOptions](#). |

#### Returns

[`CheckDefinitionConfig`](index/README.md#checkdefinitionconfig)

the configured check.

#### Throws

when `options` is not an object.

***

### distNoUrls()

```ts
function distNoUrls(options?): CheckDefinitionConfig;
```

**`Beta`**

Fails when any URL (any scheme followed by a colon and two slashes) appears in any file of the
build output directory. Supply-chain scanners that flag shipped URLs then have nothing to flag
(Socket.dev's "URL strings" alert, for one). Scans every file, sourcemaps and declaration files
included. Individual URLs can be allowed with a mandatory, reviewable `reason`; there is no
blanket opt-out.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`DistNoUrlsOptions`](#distnourlsoptions) | configuration for this check; see [DistNoUrlsOptions](#distnourlsoptions). |

#### Returns

[`CheckDefinitionConfig`](index/README.md#checkdefinitionconfig)

the configured check.

#### Throws

when `options` is not an object.

***

### duplication()

```ts
function duplication(options?): CheckDefinitionConfig;
```

**`Beta`**

Duplicated-code detection via jscpd.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`DuplicationOptions`](#duplicationoptions) | configuration for this check; see [DuplicationOptions](#duplicationoptions). |

#### Returns

[`CheckDefinitionConfig`](index/README.md#checkdefinitionconfig)

the configured check.

#### Throws

when `options` is not an object.

#### Throws

when `maxPercentage` is not a number from 0 to 100.

***

### lint()

```ts
function lint(options?): CheckDefinitionConfig;
```

**`Beta`**

Static analysis via ESLint, using whatever `eslint.config.js` the
consumer's repository already has. This preset assumes nothing about
rule configuration, only how to run the tool and read its JSON output.
Severity `2` (error) blocks. Severity `1` (warning) is reported but
never blocks. ESLint's severities already encode that distinction, and
this preset keeps it instead of treating every finding as blocking.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`LintOptions`](#) | configuration for this check; see [LintOptions](#). |

#### Returns

[`CheckDefinitionConfig`](index/README.md#checkdefinitionconfig)

the configured check.

#### Throws

when `options` is not an object.

***

### markdownlint()

```ts
function markdownlint(options?): CheckDefinitionConfig;
```

**`Beta`**

Markdown structure/style lint via markdownlint-cli2. The default `"json"` verdict reads a
report file whose path comes from config, not a CLI flag. markdownlint-cli2 writes JSON only
when its config asks for it, so this verdict assumes the consumer's `.markdownlint-cli2.jsonc`
includes:
```jsonc
"outputFormatters": [["markdownlint-cli2-formatter-json", { "name": "reports/markdownlint.json" }]]
```
which also requires the `markdownlint-cli2-formatter-json` package alongside
`markdownlint-cli2` itself. The `"exit-code"` verdict needs neither: it reads the exit code and
the printed findings.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`MarkdownlintOptions`](#markdownlintoptions) | configuration for this check; see [MarkdownlintOptions](#markdownlintoptions). |

#### Returns

[`CheckDefinitionConfig`](index/README.md#checkdefinitionconfig)

the configured check.

#### Throws

when `options` is not an object.

#### Throws

when `globs` is an empty list.

***

### mutation()

```ts
function mutation(options?): CheckDefinitionConfig;
```

**`Beta`**

Mutation testing via Stryker, run through `repo-contract mutation run --json`. Fails below
`minScore`, on any Timeout still standing after it is re-run alone, and on an incomplete or
stale registry record. Killed, RuntimeError and CompileError count as detected; Ignored mutants
are left out of the score. A run in which a Survived mutant ran 0 tests fails: it proves nothing.

The command always runs Stryker cold: it deletes the incremental file and passes `--force`.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`MutationOptions`](#mutationoptions) | configuration for this check; see [MutationOptions](#mutationoptions). |

#### Returns

[`CheckDefinitionConfig`](index/README.md#checkdefinitionconfig)

the configured check.

#### Throws

when `options` is not an object.

***

### npmScript()

```ts
function npmScript(options): CheckDefinitionConfig;
```

**`Beta`**

Runs one of the package's own npm scripts as a check, through `repo-contract npm-script --json`.
Fails when the script exits non-zero, runs out of time, or changes a `mustNotChange` path. The
paths are hashed before and after, so the verdict does not depend on git state.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`NpmScriptOptions`](#npmscriptoptions) | configuration for this check; see [NpmScriptOptions](#npmscriptoptions). |

#### Returns

[`CheckDefinitionConfig`](index/README.md#checkdefinitionconfig)

the configured check.

#### Throws

when `options` is not an object.

#### Throws

when `script` is blank or starts with `-`, a `mustNotChange` entry is not a
non-empty path that does not start with `-`, or `timeoutMs` is not a whole number above 0.

***

### quickStart()

```ts
function quickStart(options?): CheckDefinitionConfig;
```

**`Beta`**

Runs the README's marked quick start, one line at a time, against the tarball npm would publish.
The commands run in an empty project: a directory holding only a package.json. The command that
installs this package installs the packed tarball instead. Fails when any command exits non-zero or the time
budget runs out, and when the README has no marked block. Mark the block by putting
`<!-- quick-start:begin -->` on the line before its fenced `sh` block and
`<!-- quick-start:end -->` on the line after it.

Runs `repo-contract quick-start`, so the package must be built first, and the commands reach
whatever network they reach (an install usually reaches the registry).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`QuickStartOptions`](#quickstartoptions) | configuration for this check; see [QuickStartOptions](#quickstartoptions). |

#### Returns

[`CheckDefinitionConfig`](index/README.md#checkdefinitionconfig)

the configured check.

#### Throws

when `options` is not an object.

***

### sbom()

```ts
function sbom(options?): CheckDefinitionConfig;
```

**`Beta`**

Keeps a CycloneDX 1.6 SBOM of the package's locked dependencies current. It builds the document
from the npm lockfile with no external tool, deterministically: the same lockfile always gives
the same document. By default it writes nothing. It fails when a committed document is missing
or differs from what the lockfile gives. The comparison ignores only `serialNumber` and
`metadata.timestamp`. So a document another tool regenerated, or a reformatted one, still counts
as current when its content matches. With `write: true` it writes the documents instead, for a
regenerate command.

The documents list every package in the lockfile's `packages` map. Each carries its purl, the
hashes from `integrity`, the declared license and the resolved URL. The full dependency graph
follows. The production document leaves out packages marked `dev`. It describes what the
lockfile pins, not what is installed in `node_modules`.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`SbomOptions`](#sbomoptions) | configuration for this check; see [SbomOptions](#sbomoptions). |

#### Returns

[`CheckDefinitionConfig`](index/README.md#checkdefinitionconfig)

the configured check.

#### Throws

when `options` is not an object.

#### Throws

when `lockfile`, `output` or `productionOutput` is not a non-empty path,
when `output` or `productionOutput` is spelled as the lockfile's path, or when `write` is not a
boolean.

***

### securityDeps()

```ts
function securityDeps(options?): CheckDefinitionConfig;
```

**`Beta`**

Dependency vulnerability scanning via `npm audit`.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`SecurityDepsOptions`](#securitydepsoptions) | configuration for this check; see [SecurityDepsOptions](#securitydepsoptions). |

#### Returns

[`CheckDefinitionConfig`](index/README.md#checkdefinitionconfig)

the configured check.

#### Throws

when `options` is not an object.

***

### stylelint()

```ts
function stylelint(options?): CheckDefinitionConfig;
```

**`Beta`**

CSS/SCSS lint via stylelint, using whatever stylelint config the
consumer's repository already has. `severity: "error"` blocks;
`severity: "warning"` is reported but never blocks, matching how the
`lint` preset treats ESLint's severities.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`StylelintOptions`](#) | configuration for this check; see [StylelintOptions](#). |

#### Returns

[`CheckDefinitionConfig`](index/README.md#checkdefinitionconfig)

the configured check.

#### Throws

when `options` is not an object.
