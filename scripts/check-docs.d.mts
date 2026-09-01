// Hand-written companion types for check-docs.mjs (same convention as
// npm-pack.d.mts / aggregate-coverage.d.mts). Only the surface imported by
// tests is declared: running the check itself goes through the `node
// scripts/check-docs.mjs` CLI path, not this module's exports.

/**
 * URL-shape regexes handed to linkinator as `--skip` values. linkinator
 * compiles each as a bare `new RegExp(value)` (no flags) and tests it against
 * the full href.
 */
export declare const LINKINATOR_SKIP_PATTERNS: readonly string[]
