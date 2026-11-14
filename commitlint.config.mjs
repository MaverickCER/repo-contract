// Conventional Commits drive this repository's releases: the shared Changesets workflow writes a
// changeset for each releasable commit type, and the `api-contract` check fails a PR whose
// public-API change has no changeset at the matching level. commitlint enforces the format: locally via the
// `.githooks/commit-msg` hook and in `npm run contract` / CI via the `commitlint` check. See
// specs/decisions/0009-conventional-commits-versioning-and-local-gates.md.
export default { extends: ["@commitlint/config-conventional"] }
