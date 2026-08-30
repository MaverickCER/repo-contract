import type { GitHubActionsEvidence } from "./evidence-types.js"

/**
 * Runs actionlint over `root`'s `.github/workflows/` files and normalizes its output.
 * @param root - repository root containing `.github/workflows/`. Defaults to this repository's root.
 */
export declare function lintWorkflows(root?: string): GitHubActionsEvidence
