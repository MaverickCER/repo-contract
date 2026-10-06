---
"repo-contract": minor
---

Audit fixes ahead of 1.0.

- Breaking (pre-1.0 minor): Node.js `>=22` (Node 20 is end-of-life); `@types/node` is `^22`.
- `repo-contract/helpers` is Stable (ADR 0019); `presets` and `init` stay Experimental.
- Added `renderMarkdownSummary` and `serializeRun` so a runner can write durable, machine-readable reports and a job summary.
- Documentation: how a 0.x bump is chosen (nothing automated can publish 1.0.0), the bootstrap cycle with `internal-package-contract`, a shared glossary and the toolkit overview.
