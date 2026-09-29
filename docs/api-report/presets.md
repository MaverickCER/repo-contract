# presets

Curated, growing catalog of preset checks for tools common across
TypeScript/JavaScript repositories -- each preset encodes how to execute
and interpret a common tool, never a repository's definition of quality
(see specs/decisions/0004-public-surface-stays-narrow-no-cli-experimental-presets.md). Import a preset,
spread it into your own `checks` record, and override whatever you need
-- most often `policy`; a factory preset's options are the preferred way
to change what it executes, a direct `run` override is an escape hatch.
Never re-exported from the package root (`src/index.ts`) -- presets are
an opt-in extra, not part of the core execution/evidence/policy surface
those exports describe, and this barrel never re-exports anything from
there either; the two stay independent.

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

Dependency license compliance via licensee.

***

### publint

```ts
const publint: CheckDefinitionConfig;
```

**`Beta`**

publint has no machine-readable output mode -- only a plain-text CLI
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
| `options` | [`BrokenLinksOptions`](#) | configuration for this check; see [BrokenLinksOptions](#). |

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
rules of its own -- e.g. `@commitlint/config-conventional`). Exit-code
based rather than `--format json`: commitlint has no broadly-documented,
stable JSON CLI output, so this preset reads its plain-text report the
same way the `format`/`typecheck` presets already do for their tools,
rather than relying on an unconfirmed flag.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`CommitlintOptions`](#) | configuration for this check; see [CommitlintOptions](#). |

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
| `options` | [`DeadCodeOptions`](#) | configuration for this check; see [DeadCodeOptions](#). |

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
| `options` | [`DuplicationOptions`](#) | configuration for this check; see [DuplicationOptions](#). |

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
consumer's own repository already has -- this preset makes no assumption
about rule configuration, only about how to run the tool and interpret
its JSON output. Severity `2` (error) blocks; severity `1` (warning) is
reported but never blocks -- ESLint's own severities already encode that
distinction, so this preset just respects it rather than treating every
finding as equally blocking.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`LintOptions`](#) | configuration for this check; see [LintOptions](#). |

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
config-driven rather than a CLI flag -- markdownlint-cli2 only writes
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
| `options` | [`MarkdownlintOptions`](#) | configuration for this check; see [MarkdownlintOptions](#). |

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
| `options` | [`StylelintOptions`](#) | configuration for this check; see [StylelintOptions](#). |

#### Returns

[`CheckDefinitionConfig`](index/README.md#checkdefinitionconfig)

the configured check.
