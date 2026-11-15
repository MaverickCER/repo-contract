---
"repo-contract": minor
---

`repo-contract/presets` gains `quickStart(options?)`, and the CLI gains `repo-contract quick-start`. Together they run a README's quick start against the tarball npm would publish, so a broken first step fails before release.

- **Marking the block.** Put `<!-- quick-start:begin -->` on the line before a fenced `sh` block and `<!-- quick-start:end -->` on the line after it. Each line is one command; comments and blank lines are skipped.
- **What runs.** The command packs the package with install scripts off and makes an empty project (a directory holding only a package.json). A command that installs the package with npm, pnpm, yarn or bun installs the tarball instead. Each command then runs in a shell, in order.
- **What fails.** A command that exits non-zero; the reason shows its last output. A run past the time budget. A README without a marked block, or a quick start that never installs the package.
- **Options.** `readme` (default `README.md`) and `timeoutMs` (default five minutes, for all the commands together). The CLI takes `--readme`, `--timeout`, `--json` and `-C`.
- **Opt-in.** `repo-contract init` never adds it. The commands reach whatever network they reach, so an install reaches the registry.
