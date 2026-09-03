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

`runUpdateBaseline` has four outcomes — only the first two exit 0:

| outcome   | when                                                                                                                                                            | writes? |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `updated` | no baseline yet; **or** `package.json`'s version is strictly greater than the baseline's; **or** the version is unchanged but the public API contents differ    | yes     |
| `current` | the baseline already carries `package.json`'s version **and** its contents match                                                                                | no      |
| `refused` | `package.json`'s version is unparseable; **or** older than the baseline's (a would-be regression); **or** the committed baseline records an unparseable version | no      |
| `failed`  | API Extractor reported errors                                                                                                                                   | no      |

`current` is what every re-run of the same Release PR sees (the job's own baseline commit,
release-please refreshing the PR after a later merge), so the job stays green. Every branch is
covered by `test/unit/api-contract/update-baseline.test.ts`; that suite is the standing
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
  1. Publish the first version manually, once, from a maintainer machine, on the release
     commit: `npm login` (as `maverickcer`), then `npm run build` (explicitly — this step
     is not optional; see the warning below), then
     `npm publish --ignore-scripts --provenance=false`. `--provenance=false` is required —
     the `.npmrc` sets `provenance=true`, which only works inside the OIDC workflow.
  2. On [npmjs.com](https://www.npmjs.com) → the `repo-contract` package → **Settings →
     Trusted Publisher → GitHub Actions**: organization/user `MaverickCER`, repository
     `repo-contract`, workflow `release.yml`.

  > **Never run `npm publish --ignore-scripts` without an immediately preceding
  > `npm run build`.** `--ignore-scripts` skips every lifecycle script, including
  > `prepublishOnly` (which normally builds and runs the full contract for you) — so with
  > a stale or absent `dist/`, npm happily packs and publishes whatever `dist/*.js` happens
  > to exist while silently omitting `dist/*.d.ts` / `dist/*.d.cts` / `dist/.dts/**`.
  > Declarations live under a dot-directory tsup doesn't produce; only the `tsc` and
  > shim-emitting steps inside `npm run build` do. That is exactly what happened to the
  > versions published this way before this note existed — the tarball shipped JS with no
  > types at all. `--ignore-scripts` is safe **only** immediately after a fresh
  > `npm run build`, which is why it's spelled out explicitly in step 1 above rather than
  > left implicit.

### Branch protection on `main`

The "an outside contributor can land code but never trigger a release" property depends
entirely on these settings, which live in the repo config, not the tree — set and keep them:

- **Require a pull request before merging**, with **at least 1 approving review** and
  **Require review from Code Owners** (CODEOWNERS is `* @maverickcer`).
- **Require status checks to pass before merging**, and mark these required:
  `verify` (each OS), `lint`, `contract`, `pr-title`. (`published-floor` /
  `runtime-compat` / `verify-current` are informational — do not mark them required;
  `verify-current` is `continue-on-error` by design.)
- **Require branches to be up to date before merging.**
- **Do not allow bypassing the above** (applies to admins too).
- Release authority is the `release.yml` workflow plus the npm trusted-publisher
  registration above — no human holds a publish token. A merged PR cannot publish; only
  merging release-please's own Release PR can.

## Recovering when the automated `publish` job fails

If `release.yml`'s `publish` job fails with `npm error code ENEEDAUTH` /
`need auth You need to authorize this machine using npm login`, npm rejected the OIDC
token — almost always because the **npm trusted publishing** registration (One-time
setup, above) was never completed for this exact repo/workflow, so npm falls back to
expecting a classic auth token that doesn't exist in this workflow. The `verify` job
having already passed means the tag and build are sound; nothing about the code needs
fixing. To recover:

1. Complete (or re-check) the trusted-publisher registration in **One-time setup** above.
2. Re-run just the failed job — `gh run rerun <run-id> --failed` — rather than cutting a
   new release; the same tagged commit publishes once the registration takes effect.

If you need the release out before registration is sorted, publish that one version
manually instead, on the tagged release commit: `npm login`, then plain `npm publish`
(**no** `--ignore-scripts`) so `prepublishOnly` runs the full build and contract for you
automatically — this is the safe path for a laptop publish (see the warning under
**One-time setup** above for why `--ignore-scripts` on its own is not).

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
