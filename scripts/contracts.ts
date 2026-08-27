/**
 * SCREAMING_SNAKE_CASE constants (and, should any arise, shared types/interfaces) that cross
 * script-family boundaries -- consumed by more than one of `scripts/api-contract/**`,
 * `scripts/changeset-docs/**`, `scripts/adr-governance/**`, etc. A constant used only within one
 * script family belongs in that family's own module instead (e.g.
 * `scripts/suppression-governance/evidence-types.ts`'s `SUPPRESSION_CATEGORIES`).
 *
 * Two independent mechanisms each maintain their own machine-owned, marker-delimited section
 * inside a shared `.changeset/*.md` file (see `scripts/changeset-file-locator.ts`'s own doc
 * comment for why they must agree on which file): `scripts/changeset-docs/table-manager.ts` owns
 * a `"### Changed Files"` section, `scripts/api-contract/changeset-manager.ts` owns a
 * `"### API Contract Impact"` section. Their marker sets are independently delimited (different
 * heading, different marker prefix) so each mechanism can find, strip, and rewrite only its own
 * section without disturbing the other's -- see `scripts/helpers.ts`'s `stripGeneratedSection`,
 * which both call with their own set below.
 */

export const CHANGESET_DIR = ".changeset"

/** Shared by both marker sets below -- the closing token is identical either way. */
export const MARKER_TOKEN_END = "-->"

export const CHANGESET_DOCS_SECTION_HEADING = "### Changed Files"
export const CHANGESET_DOCS_MARKER_START_PREFIX = "<!-- repo-contract:changeset-docs:start:hash="
export const CHANGESET_DOCS_MARKER_END = "<!-- repo-contract:changeset-docs:end -->"
/** The marker also embeds `created-frontmatter=<true|false>` -- see table-manager.ts's own doc comment. */
export const CHANGESET_DOCS_MARKER_CREATED_REGEX = new RegExp(
  `${CHANGESET_DOCS_MARKER_START_PREFIX}\\S+ created-frontmatter=(true|false) ${MARKER_TOKEN_END}`,
)
export const PLACEHOLDER = "_(needs description)_"
// The parenthetical always ends `, +<added>/-<removed>): ` immediately
// before the description -- anchoring on that, rather than `[^)]*`, is what
// keeps a row parseable when a `renamed from \`...\`` path itself contains a
// `)` (e.g. `src/foo(old).ts`), which `[^)]*` would otherwise stop dead at,
// silently dropping that row's preserved description on the next run.
export const ROW_REGEX = /^- \*\*(.+?)\*\* \(.+, \+\d+\/-\d+\): (.*)$/

export const API_CONTRACT_SECTION_HEADING = "### API Contract Impact"
export const API_CONTRACT_MARKER_START_PREFIX = "<!-- repo-contract:api-contract:start:hash="
export const API_CONTRACT_MARKER_END = "<!-- repo-contract:api-contract:end -->"
/**
 * Built here, alongside the string parts it's assembled from, rather than in
 * changeset-manager.ts (the only consumer) -- `new RegExp` from a template string built out of
 * imported bindings reads as a dynamic pattern to static analysis (security/detect-non-literal-regexp,
 * secure-coding/detect-non-literal-regexp -- both forbidden-to-suppress under this repo's own
 * suppression-governance policy, see policy-config.ts's `eslint.rules["security/*"]`), even though
 * every part is a fixed literal; built from this file's own local constants instead, both rules
 * already recognize the whole expression as effectively literal (see
 * CHANGESET_DOCS_MARKER_CREATED_REGEX above, built the identical way for the same reason).
 */
export const API_CONTRACT_MARKER_LEVEL_REGEX = new RegExp(
  `${API_CONTRACT_MARKER_START_PREFIX}\\S+ level=(none|patch|minor|major) ${MARKER_TOKEN_END}`,
)
