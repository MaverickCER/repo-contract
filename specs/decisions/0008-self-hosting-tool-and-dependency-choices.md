# 0008: Self-hosting tool and dependency choices

## Status

Accepted. Reflected across `repo-contract.config.ts`'s self-hosting checks and `package.json`.
This is a reference document, not a single decision — it records why this repository's own
self-assurance tooling picked what it picked, at a level future contributors can act on without
re-deriving it, without giving each narrow choice full individual ADR treatment.

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
