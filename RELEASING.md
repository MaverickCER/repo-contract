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

`runUpdateBaseline` only writes when `package.json`'s version is **strictly greater** than
the baseline's — which is true on the Release PR branch (it bumped `package.json`) and false
on `main` (no bump), so the job is a safe no-op outside a real release. Both paths are
covered by `test/unit/api-contract/update-baseline.test.ts` (`refuses when … equal`,
`succeeds once … strictly greater`); that suite is the standing verification for this job's
guardrail, so no manual dry run is needed before a release.

## One-time setup

- Before the first release: `git tag v0.1.0 <main HEAD> && git push origin v0.1.0`, so
  release-please's first Release PR only covers commits after it, not all history.
- GitHub → Settings → Pull Requests: **disable "Allow squash merging"** (keep merge commits
  and/or rebase).
- On [npmjs.com](https://www.npmjs.com): add a trusted publisher for `repo-contract` — user
  `maverickcer`, repository `repo-contract`, workflow `release.yml`. The workflow's
  `id-token: write` permission plus that registration is the entire trust relationship.

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

## Versioning

[`VERSIONING.md`](VERSIONING.md) defines what's Stable, Experimental, or Private, and how
pre-1.0 breaking changes map to version bumps.
