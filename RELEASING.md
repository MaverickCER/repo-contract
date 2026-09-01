# Releasing (maintainers)

[release-please](https://github.com/googleapis/release-please) + npm OIDC trusted publishing
([`.github/workflows/release.yml`](.github/workflows/release.yml)) — no `NPM_TOKEN` secret
exists.

## Normal flow

Each push to `main` updates a "Release PR" that bumps `package.json` and
[`CHANGELOG.md`](CHANGELOG.md) from the Conventional Commits since the last release. Merging
that PR tags the release and triggers a credential-free `verify` job, then an OIDC
`publish` job.

The API compatibility baseline is kept current automatically:
[`.github/workflows/api-baseline.yml`](.github/workflows/api-baseline.yml) regenerates
`.repo-contract/api-contract/baseline.*` on the Release PR branch, so it lands in the same
merge as the version bump. If that job is ever disabled, run `npm run contract:baseline`
after the release and commit the result — that is the only other way the baseline is
updated.

`runUpdateBaseline` writes only when `package.json`'s version is **strictly greater** than the
baseline's. When they already match it reports `current` and exits 0 (a no-op), so the job
stays green across every re-run of the same Release PR — its own baseline commit, or
release-please refreshing the PR after a later merge. It exits non-zero only when
`package.json` is _older_ than the baseline (a would-be regression). All three paths are
covered by `test/unit/api-contract/update-baseline.test.ts` (`reports 'current' …`,
`refuses when … older`, `succeeds once … strictly greater`); that suite is the standing
verification for this job's guardrail, so no manual dry run is needed before a release.

## One-time setup

- **Baseline tag.** Before the first release-please run:
  `git tag repo-contract-v<current version> <main HEAD> && git push origin --tags`, so
  release-please's first Release PR only covers commits after it, not all history. The tag
  is component-prefixed (`repo-contract-v0.1.0`, not `v0.1.0`) — that is the format
  release-please itself creates and the `compare/…` links in `CHANGELOG.md` expect.
- **Merge style.** GitHub → Settings → Pull Requests: **disable "Allow squash merging"**
  (keep merge commits and/or rebase).
- **Let Actions open the Release PR.** GitHub → Settings → Actions → General → Workflow
  permissions: tick **"Allow GitHub Actions to create and approve pull requests"**. Without
  it the `release-please` job fails with
  _"GitHub Actions is not permitted to create or approve pull requests"_ — it still pushes
  the `release-please--branches--main--components--repo-contract` branch, but no PR opens.
  If you cannot enable it, see [First-release bootstrap](#first-release-bootstrap) — a
  human opens that one PR by hand and every later run updates it in place (updating an
  existing PR is not gated by that setting).
- **npm trusted publishing.** npm will not let you register a trusted publisher for a
  package that does not exist yet, so this cannot be done "before the first release".
  Bootstrap it once, then the workflow's `id-token: write` permission plus the registration
  is the entire trust relationship from the next version on — no `NPM_TOKEN` ever exists:
  1. Publish the first version manually, once, from a maintainer machine:
     `npm login` (as `maverickcer`), then `npm publish --ignore-scripts --provenance=false`
     on the release commit. `--provenance=false` is required — the `.npmrc` sets
     `provenance=true`, which only works inside the OIDC workflow.
  2. On [npmjs.com](https://www.npmjs.com) → the `repo-contract` package → **Settings →
     Trusted Publisher → GitHub Actions**: organization/user `MaverickCER`, repository
     `repo-contract`, workflow `release.yml`.

### Branch protection on `main`

The "an outside contributor can land code but never trigger a release" property depends
entirely on these settings, which live in the repo config, not the tree — set and keep them:

- **Require a pull request before merging**, with **at least 1 approving review** and
  **Require review from Code Owners** (CODEOWNERS is `* @maverickcer`).
- **Require status checks to pass before merging**, and mark these required:
  `verify` (each OS), `contract`, `pr-title`. (`published-floor` / `runtime-compat` /
  `verify-current` are informational — do not mark them required; `verify-current` is
  `continue-on-error` by design.)
- **Require branches to be up to date before merging.**
- **Do not allow bypassing the above** (applies to admins too).
- Release authority is the `release.yml` workflow plus the npm trusted-publisher
  registration above — no human holds a publish token. A merged PR cannot publish; only
  merging release-please's own Release PR can.

## First-release bootstrap

This section applies only until the automated flow has produced one release, or whenever
_"Allow GitHub Actions to create and approve pull requests"_ (One-time setup, above) is off.

1. Merge the feature PRs to `main` as normal. The `release-please` job runs, pushes the
   `release-please--branches--main--components--repo-contract` branch, and fails at the
   "create pull request" step.
2. Open that PR by hand: base `main`, head
   `release-please--branches--main--components--repo-contract`, title
   `chore(main): release repo-contract <version>`, body = the `CHANGELOG.md` section from
   the branch. Add the label **`autorelease: pending`** (create it if missing) — the
   post-merge `release-please` run keys off that label to tag the release.
3. Review and merge it like any Release PR. From here on, later `release-please` runs
   update this same PR in place; only the initial creation needed a human.

## Versioning

[`VERSIONING.md`](VERSIONING.md) defines what's Stable, Experimental, or Private, and how
pre-1.0 breaking changes map to version bumps.
