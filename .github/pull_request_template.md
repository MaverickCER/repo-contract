## What changed and why

<!-- One or two sentences. If you can't explain it here, the review below can't be meaningful. -->

## Anything you're deliberately not addressing

<!-- Known follow-up, accepted risk, or out-of-scope concern. Leave blank if none. -->

## Checks

- [ ] `npm run contract` passes locally — the pre-push hook runs it, and CI re-runs it
      across Linux, macOS, Windows, and the Node version matrix.
- [ ] Every commit is a Conventional Commit, and any public-API change is declared with the
      right type (`feat!:` / `BREAKING CHANGE:` for a breaking change).

<!--
The Code Owner reviews the residual risk automation can't judge — see CODE_REVIEW.md §4 for
that checklist. An AI review gate (CODE_REVIEW.md §36) may post a PASS/FAIL comment with
cited evidence; a FAIL blocks merge until resolved.
-->

@coderabbitai summary
