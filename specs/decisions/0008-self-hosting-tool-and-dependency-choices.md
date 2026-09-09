# 0008: Self-hosting tool and dependency choices

## Status

Accepted. Reflected across `repo-contract.config.ts`'s self-hosting checks and `package.json`.
This is a reference document, not a single decision — it records why this repository's own
self-assurance tooling picked what it picked, at a level future contributors can act on without
re-deriving it, without giving each narrow choice full individual ADR treatment. `dead-code`
joined the self-hosted set in the 2026-09 exception-registry unification (see the "dead-code
detection self-hosts, off the published preset" amendment below and
[ADR 0013](0013-reusable-exception-policy-helper.md)). `docs/api/`, a generated, browsable HTML
API reference, joined in a later 2026-09 amendment (see "a real, browsable HTML API reference,
generated at release cadence" below).

## Context

This repository's own self-assurance tooling makes several narrow, independent tool and
dependency choices that don't individually warrant a full ADR, but are still worth recording at a
level a future contributor can act on without re-deriving the reasoning from scratch.

## Decision

**Complexity/risk analysis** is done by a young, single-maintainer tool, chosen only after a real
compatibility spike — not vendor trust alone: generated real coverage from this repository's own
source, compared its output against hand-constructed fixtures with hand-counted expected
complexity, and verified its reported values against the canonical formula on real, non-trivial
cases before trusting it. The youth of the tool is a real, accepted risk, mitigated by that
independent verification; a fallback tool and, failing that, a fully-specified hand-rolled
alternative are both documented as an escape hatch if it ever becomes an issue.

The `crap` check's policy (`checks/crap.ts`) gates on **two** numbers this repository owns
outright, not just one: the CRAP score (`CRAP_THRESHOLD`, 30) _and_ an independent raw
cyclomatic-complexity ceiling (`MAX_COMPLEXITY`, 20 — ESLint's own default). The second exists
because CRAP is `complexity² · (1 − coverage)³ + complexity`, which collapses to plain
`complexity` as coverage approaches 100%; at this repository's coverage floor
(`scripts/coverage-thresholds.mjs`) the CRAP score alone therefore stops meaningfully
constraining a well-tested but deeply-branchy function — one such function sat at cyclomatic
30 / 100% covered / CRAP 30, passing the CRAP gate with zero downward pressure. crap4ts is not
asked to enforce the ceiling (it has no raw-complexity fail flag); the policy reads the
per-function `complexity` field already in crap4ts's JSON report and compares it itself, the
same "this repo owns the number, never the tool's echoed `report.threshold`" stance it already
takes for the CRAP score.

**Secret scanning** uses a pure-Node, npm-installable tool rather than a more established
Go-binary-distributed alternative — purely because this repository's own acceptance bar is a clean
checkout satisfying its complete self-assurance suite via package installation alone, with no
separately-installed system binaries. This ruled out the alternative directly, not as a stylistic
preference.

**Evidence resolution** listens for the child process's stream-close event, not its exit event.
This is not a hypothetical footnote: a real third-party CLI tool used by this repository's own
self-hosting suite silently truncated large captured output under the exit event specifically,
confirmed by reading that tool's own source — a well-known Node.js pitfall on the writing side that
only the close event reliably survives.

**An optional YAML output format** is loaded via a dynamic import only when a check actually
requests it, declared as an optional peer dependency rather than a hard one — the large majority of
consumers who only ever use JSON or plain text never install it and never pay for it, keeping the
Windows-command-resolution dependency (see
[ADR 0003](0003-cross-platform-command-execution-and-process-cleanup.md)) the package's only
hard runtime dependency.

**Published JSON Schema generation** targets a dedicated, non-generic source file rather than the
real (generic) `Evidence`/`Verdict` interfaces directly — the schema-generation tool this repository
uses cannot resolve a generic interface as a root schema type, confirmed via an isolated repro, not
assumed. The dedicated file declares concrete, non-generic instantiations that are direct type
aliases of the real interfaces, so the published schema still cannot drift from the actual
TypeScript types it describes; this adds one extra layer of indirection in the generated output, a
cosmetic cost, not a correctness one.

**Accessibility testing** against the `docs/` landing page uses `pa11y`, an npm-installable tool
that drives a real headless-Chromium accessibility tree via `puppeteer` — not static markup
analysis — so contrast, focus order, and ARIA issues are caught the same way a real browser would
surface them. Verified directly, not assumed: a real run against `docs/index.html` found a genuine
WCAG2AA contrast failure (inline `<code>` text on its background, in dark mode specifically,
~4.04:1 against the required 4.5:1 — a static analyzer checking only markup shape would have missed
this, since contrast depends on computed, rendered color values) before the underlying CSS was
fixed and the same run confirmed zero findings afterward. The real cost accepted here, unlike this
repository's other self-hosting tools: `puppeteer` downloads its own Chromium at install time,
adding real weight and install time this repository's other choices above deliberately avoid.

**The supported Node version floor** tracks actively-maintained runtimes rather than an inherited
convention from this package's sibling projects — verified against every Node API this package
actually uses, not assumed: one real API landed slightly above the chosen floor, so a manual
fallback exists for that narrow version range regardless of exactly where the floor is set. A
newer local Node version is required only for this repository's own mutation-testing self-check,
never for the published package's own supported runtime — every other self-hosting check still
runs on the published floor.

## Consequences

- Each of these choices is independently revisitable; none of them constrains the published
  package's own public contract or runtime dependency footprint beyond what's stated above.
- A future contributor changing any one of these tools should re-verify the specific property that
  motivated the original choice (installability without extra binaries; real output correctness;
  correct large-output capture) rather than assuming a newer or more popular alternative
  automatically preserves it.

## Alternatives considered

Documented per-choice above, briefly, since each is independent: a hand-rolled complexity analyzer
was fully designed but not built once a verified existing tool was found; a Go-binary secret
scanner was rejected purely on the installability constraint, not on detection quality; a fixed
delay before resolving evidence was rejected as inherently racy where the close event provides a
correct, event-driven guarantee at no cost; shipping the YAML parser as a hard dependency was
rejected as unnecessary weight for the common case; a static-analysis-only accessibility tool
(checking markup/ARIA attributes without rendering the page) was rejected for the same reason a
Go-binary secret scanner's alternative-installability concern doesn't apply here — the real defect
this check found on its first run was a rendered contrast failure, invisible to a tool that never
computes actual on-screen color values.

## Amendment (2026-09): dead-code detection self-hosts, off the published preset

The 2026-09 exception-registry unification ([ADR 0013](0013-reusable-exception-policy-helper.md)'s
"The exception registry is the review surface" amendment) reconciled every guardrail exception in
this repository, including its own unused-dependency exemptions, onto the generic
`.repo-contract/exceptions/*.json` mechanism. `dead-code` is the one check this repository does not
run via the published preset catalog (`src/presets/dead-code.ts`, still published and unchanged for
external consumers) to do it — it self-hosts `scripts/dead-code/check.ts` / `checks/dead-code.ts`
instead, alongside the other self-hosting checks this ADR already documents.

**The reason is a structural boot-time loop, not a preference.** The published `deadCode` preset
takes a config-time `exemptUnusedDevDependencies` option: a list of package names knip is told to
ignore _before it ever runs_. A reconciled exception registry cannot supply that list, because the
registry that would suppress a finding can only be built from findings that already ran
unsuppressed — reconciliation needs knip's raw, complete output first, and a config-time exempt
list needs its answer before knip runs at all. The two models are incompatible in the direction
this repository's own governance needs (every finding discoverable and reconciled against a
reviewed record, never silently excluded before it is ever seen).

**The fix: run knip with no exempt list, at all, ever, for this repository's own build.**
`scripts/dead-code/check.ts` spawns `knip --reporter json` raw, flattens every category of its
report into one `DeadCodeFinding[]` (`dead-code:<kind>:<name>` — the package/export name is the
subject; deliberately no file/line, so a rename of the surrounding file does not stale an otherwise
still-valid exemption), and reconciles that finding set against
`.repo-contract/exceptions/dead-code.json` the same way every other self-hosted check does. A
finding permitted by a justified record passes; an unbacked or under-justified finding fails,
naming the package/export and its kind; a stale record (the finding it once justified is gone)
fails until a human deletes it. `scripts/lint-config.mjs`'s `EXEMPT_UNUSED_DEV_DEPENDENCIES` (nine
entries) is deleted entirely; its per-entry rationale comments became the seed `justification` text
for the equivalent records. Seven of the nine genuinely need a record: `@arethetypeswrong/cli`,
`@commitlint/cli`, `licensee`, `linkinator`, `oxlint`, `publint`, and `@socketsecurity/cli` are all
spawned by literal command name (a `run: [...]` array or `cross-spawn`), never `import`ed, so knip
cannot see the use. The other two turned out not to need one at all once knip ran raw:
`github-actionlint` is resolved via `require.resolve("github-actionlint/dist/bin/actionlint.js")`
in `scripts/github-actions/lint.mjs`, and `pa11y` via a real `import pa11y from "pa11y"` in
`scripts/check-accessibility.mjs` — both are static references knip's own resolution already sees,
so raw knip reports zero finding for either and no exception record exists for them.

**The published `deadCode` preset is untouched.** Its `exemptUnusedDevDependencies` option remains
exactly as-is for external consumers, who have no equivalent to this repository's own
`.repo-contract/exceptions/` reconciliation loop and still need a config-time exempt list to use
the preset at all. This repository choosing not to consume its own published preset for this one
check is the accepted cost of dogfooding the stricter, fully-reconciled model for itself.

## Amendment (2026-09): a real, browsable HTML API reference, generated at release cadence

Before this amendment, the only generated API reference was `docs/api-report/*.api.md` --
signature-only markdown (API Extractor's own report format deliberately strips TSDoc prose),
committed and kept fresh on every commit by the `api-docs` check, but never rendered anywhere a
reader could actually browse it. `docs/api/` (via `scripts/api-docs-html/`) closes that gap: one
HTML page per exported API item, across all three published entry points, with the real TSDoc
prose intact.

**Tool choice: API Extractor's Doc Model + `@microsoft/api-documenter`, not TypeDoc.** TypeDoc
would perform its own, independent AST analysis of the public surface -- a second computation of
"what's public and how it's documented," alongside the one API Extractor's Doc Model already
performs and that `api-contract`/`api-docs` already treat as canonical. Two independently-computed
answers to the same question is exactly the kind of duplicated source of truth this repository's
own conventions avoid elsewhere (see the CRAP-threshold and API-report reasoning above). API
Extractor already writes a Doc Model JSON (`.api.json`) on every run `scripts/api-docs/report-targets.ts`
makes -- previously discarded into a scratch directory once the human-readable report was written,
now optionally preserved (`generateApiReports`'s `docModelFolder` option) for `scripts/api-docs-html/`
to render, at the cost of zero additional API Extractor invocations.

**`@microsoft/api-documenter` emits Markdown, not HTML** -- there is no HTML output mode in this
toolchain, confirmed against the installed package's own `exports` map and type declarations, not
assumed. `scripts/api-docs-html/render.ts` renders that markdown to HTML via a new `marked`
devDependency (chosen for zero runtime dependencies of its own, and because the copies already
present transitively via other tools cannot be imported directly without violating
dependency-cruiser's `no-non-package-json` rule -- it must be a declared dependency). The one thing
this repository's own code does beyond plain markdown rendering: rewrite each page's internal `.md`
links to `.html`, at marked's token level (a custom `Renderer.link`, not a text-level regex) so it
can't misfire inside a fenced code block or on an already-external URL.

**Per-symbol page granularity, mirroring api-documenter's own native output**, rather than a
handful of hand-assembled long pages: less new code (a link-suffix rewrite, vs. hand-building
page-concatenation and cross-reference rewriting), and more reviewable per-symbol diffs in the
generated output.

**Generated and committed, at release cadence, matching `docs/api-report/*.api.md`'s own
established pattern -- not deploy-time generation via GitHub Actions Pages hosting.** This
repository's Pages site serves `docs/` directly from `main` with no build step at all (confirmed:
no Pages-deploy workflow exists in `.github/workflows/`); switching to Actions-based deployment
would require a one-time manual change to this repository's own GitHub Settings, a real but
avoidable cost this decision declines to pay. `.github/workflows/api-baseline.yml`'s existing
Release-PR-branch job (already checking out with write access, already running `npm run build`)
runs the new generator too and commits `docs/api/` alongside the existing baseline commit, rather
than a sibling workflow racing a second `git push` to the same branch. `docs/api/` therefore
carries near-zero transitive dependency cost (`@microsoft/api-documenter` and `marked` add almost
nothing not already in the tree via API Extractor/other tooling) at the accepted cost of
**release-cadence, not every-commit, freshness** -- an explicit limitation, stated on
`docs/api/index.html` itself, with the always-fresh `docs/api-report/*.api.md` linked as the
fallback for anyone checking against an unreleased commit.
