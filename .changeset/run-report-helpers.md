---
"repo-contract": minor
---

Add `renderMarkdownSummary` and `serializeRun`, pure helpers that turn a run's evidence and verdict into a Markdown summary (for a CI step summary or a pull-request comment) and into the two stored JSON documents, so a runner can keep a durable, machine-readable record instead of printing the verdict and discarding it. The SBOM is now published as a runtime inventory (what installing the package brings in: nothing) and a separate build-environment inventory, and the documentation corrects how a 0.x release is chosen and how the package relates to the rest of the toolkit.
