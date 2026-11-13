## What changed and why

<!-- One or two sentences. If you can't explain it here, the review below can't be meaningful. -->

## Anything you're deliberately not addressing

<!-- Known follow-up, accepted risk, or out-of-scope concern. Leave blank if none. -->

## Checks

- [ ] `npm run contract` passes locally. The pre-push hook runs it, and CI re-runs it on
      Ubuntu. On Linux, macOS and Windows, CI runs the unit and e2e suites. It also installs and
      imports the packed tarball as a consumer and checks the tree is clean afterwards. Finally, it
      installs the packed tarball on the Node 22 floor.
- [ ] Every commit is a Conventional Commit, and any public-API change has a changeset at the
      matching level (`feat!:` / `BREAKING CHANGE:` commits mark a breaking change).

<!--
The Code Owner reviews the residual risk automation can't judge: see CODE_REVIEW.md §4 for
that checklist. An AI review gate (CODE_REVIEW.md §36) may post a PASS/FAIL comment with
cited evidence; a FAIL blocks merge until resolved.
-->

@coderabbitai summary
