# presets

Ready-made checks for common TypeScript and JavaScript tools. Spread a preset into your own
`checks` record and override what you need, most often `policy`.

A preset encodes how to run and read one tool, never what counts as good enough
(specs/decisions/0004-public-surface-stays-narrow-no-cli-experimental-presets.md). To change
what a factory preset runs, pass it options; overriding `run` directly is the escape hatch.

Experimental, and published under its own `./presets` subpath. It is never re-exported from the
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
The evidence keeps the agent's own stdout and stderr, so a value the agent prints lands there.
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
place of the text, for an agent that reads its prompt from a file. Defaults to a prompt that
asks for [AiReviewReply](#aireviewreply) and shows an example of it; a replacement must ask for the same
shape, or every reply goes to `fallback`.

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

## Variables

### arethetypeswrong

```ts
const arethetypeswrong: CheckDefinitionConfig;
```

**`Beta`**

Published-package type-resolution correctness via `@arethetypeswrong/cli`.

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

Dependency license compliance via licensee. The repository's own `.licensee.json` is the policy
when it exists; otherwise a dependency's license must be OSI-approved (`--osi`).

***

### publint

```ts
const publint: CheckDefinitionConfig;
```

**`Beta`**

publint has no machine-readable output mode: only a plain-text CLI
reporter (see its own `src/cli.js` `formatMessages`). Its process exit
code reflects only 'error'-level findings; 'warning'/'suggestion'-level
findings never affect it. This preset reads the same three section
headers publint's own CLI writes ("Errors:", "Warnings:", "Suggestions:")
to distinguish blocking findings from non-blocking ones, without
depending on any per-message structure publint doesn't expose. Relevant
only to repositories that publish an npm package.

***

### securityDeps

```ts
const securityDeps: CheckDefinitionConfig;
```

**`Beta`**

Dependency vulnerability scanning via `npm audit`.

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
[AiReviewReply](#aireviewreply), with a confidence score on every finding, and gates on those scores. A
model can answer differently on every run, so the policy reads only that structured reply,
never prose.

The output is read in three steps. The whole output is parsed as JSON. If that fails, the text
from its first `{` to its last `}` is parsed. If that fails too, or the JSON is not the
requested shape, `fallback` is judged in its place and the reason lists the problems.

The verdict: `fail` when an `error` finding scores at or above `errorThreshold`; `warn` for any
other `warn` or `error` finding, which includes the default fallback; `pass` for `info` findings
only. Each reason lists every `warn` and `error` finding with its file, line, rule and confidence.
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

#### Example

```ts
aiReview: aiReview({
  agent: ["claude", "-p", "{prompt}"],
  credentials: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY },
  errorThreshold: 0.8,
}),
```

***

### brokenLinks()

```ts
function brokenLinks(options?): CheckDefinitionConfig;
```

**`Beta`**

Broken-link detection via linkinator, recursing through local files and
following both local and remote links. `--skip node_modules` avoids
wasting the crawl on vendored files that were never authored content.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`BrokenLinksOptions`](#) | configuration for this check; see [BrokenLinksOptions](#). |

#### Returns

[`CheckDefinitionConfig`](index/README.md#checkdefinitionconfig)

the configured check.

***

### commitlint()

```ts
function commitlint(options?): CheckDefinitionConfig;
```

**`Beta`**

Commit-message governance via commitlint, using whatever commitlint
config the consumer's own repository already has (commitlint ships no
rules of its own: e.g. `@commitlint/config-conventional`). Exit-code
based rather than `--format json`: commitlint has no broadly-documented,
stable JSON CLI output, so this preset reads its plain-text report the
same way the `format`/`typecheck` presets already do for their tools,
rather than relying on an unconfirmed flag.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`CommitlintOptions`](#) | configuration for this check; see [CommitlintOptions](#). |

#### Returns

[`CheckDefinitionConfig`](index/README.md#checkdefinitionconfig)

the configured check.

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

***

### distNoUrls()

```ts
function distNoUrls(options?): CheckDefinitionConfig;
```

**`Beta`**

Fails when any URL (any scheme followed by a colon and two slashes) appears in any file of the build output directory, so
supply-chain scanners that flag shipped URLs (Socket.dev's "URL strings" alert, for one) have
nothing to flag. Scans every file, sourcemaps and declaration files included. Individual URLs can
be allowed with a mandatory, reviewable `reason`; there is no blanket opt-out.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`DistNoUrlsOptions`](#distnourlsoptions) | configuration for this check; see [DistNoUrlsOptions](#distnourlsoptions). |

#### Returns

[`CheckDefinitionConfig`](index/README.md#checkdefinitionconfig)

the configured check.

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
| `options?` | [`DuplicationOptions`](#) | configuration for this check; see [DuplicationOptions](#). |

#### Returns

[`CheckDefinitionConfig`](index/README.md#checkdefinitionconfig)

the configured check.

***

### lint()

```ts
function lint(options?): CheckDefinitionConfig;
```

**`Beta`**

Static analysis via ESLint, using whatever `eslint.config.js` the
consumer's own repository already has: this preset makes no assumption
about rule configuration, only about how to run the tool and interpret
its JSON output. Severity `2` (error) blocks; severity `1` (warning) is
reported but never blocks: ESLint's own severities already encode that
distinction, so this preset just respects it rather than treating every
finding as equally blocking.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`LintOptions`](#) | configuration for this check; see [LintOptions](#). |

#### Returns

[`CheckDefinitionConfig`](index/README.md#checkdefinitionconfig)

the configured check.

***

### markdownlint()

```ts
function markdownlint(options?): CheckDefinitionConfig;
```

**`Beta`**

Markdown structure/style lint via markdownlint-cli2. Unlike this
package's other file-based-report presets, the report path is
config-driven rather than a CLI flag: markdownlint-cli2 only writes
JSON when its own config file requests it. This preset assumes the
consumer's `.markdownlint-cli2.jsonc` includes:
```jsonc
"outputFormatters": [["markdownlint-cli2-formatter-json", { "name": "reports/markdownlint.json" }]]
```
which also requires the `markdownlint-cli2-formatter-json` package
alongside `markdownlint-cli2` itself.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`MarkdownlintOptions`](#) | configuration for this check; see [MarkdownlintOptions](#). |

#### Returns

[`CheckDefinitionConfig`](index/README.md#checkdefinitionconfig)

the configured check.

***

### stylelint()

```ts
function stylelint(options?): CheckDefinitionConfig;
```

**`Beta`**

CSS/SCSS lint via stylelint, using whatever stylelint config the
consumer's own repository already has. `severity: "error"` blocks;
`severity: "warning"` is reported but never blocks, matching how the
`lint` preset treats ESLint's own severities.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`StylelintOptions`](#) | configuration for this check; see [StylelintOptions](#). |

#### Returns

[`CheckDefinitionConfig`](index/README.md#checkdefinitionconfig)

the configured check.
