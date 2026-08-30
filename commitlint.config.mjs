// Conventional Commits are this repository's sole versioning input: release-please derives the
// version bump and CHANGELOG.md from commit types, and the `api-contract` check fails a PR whose
// commits under-declare a public-API change. commitlint enforces the format -- locally via the
// `.githooks/commit-msg` hook and in `npm run contract` / CI via the `commitlint` check. See
// specs/decisions/0009-conventional-commits-versioning-and-local-gates.md.
export default { extends: ["@commitlint/config-conventional"] }
