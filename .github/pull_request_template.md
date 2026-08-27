## What changed and why

<!-- One or two sentences. If you can't explain it here, the review below can't be meaningful. -->

## Anything you're deliberately not addressing

<!-- Known follow-up, accepted risk, or out-of-scope concern. Leave blank if none. -->

## Code Owner review

`npm run contract` passing is necessary but not sufficient — it verifies what can be verified
mechanically. The items below are the residual risks it cannot judge for you. See
[`CODE_REVIEW.md`](../CODE_REVIEW.md) for what each one means and how to evaluate it; do not check
a box you haven't actually verified. An AI review gate
([`CODE_REVIEW.md` §16](../CODE_REVIEW.md#16-ai-review-gate)) may already have posted a
PASS/FAIL comment with cited evidence — a **FAIL** blocks merge until resolved; a **PASS** means
that evidence-driven pass found nothing, not that the checklist below is done. Complete it either
way.

- [ ] I understand the intended behavior/contract this change establishes, well enough to explain
      it to someone else.
- [ ] I reviewed the complete diff, including files I didn't expect to change (config, scripts,
      fixtures, generated artifacts, deleted files) — not only the ones named above.
- [ ] **Security boundary** ([§5](../CODE_REVIEW.md#5-security-boundary-review)): if this adds,
      expands, or removes a capability/restriction, I've reviewed why — not just that
      `security-network`/`security-deps`/`suppression-governance` pass.
- [ ] **Enforcement system** ([§6](../CODE_REVIEW.md#6-enforcement-system-review)): if this touches
      a check, its config, thresholds, exclusions, or a fixture that proves a check works, I've
      confirmed it doesn't quietly make the repository less able to detect a class of defect — or
      it does, with a stated reason.
- [ ] **Concurrency/orchestration** ([§7](../CODE_REVIEW.md#7-concurrency-and-orchestration-review)):
      if this adds/changes a check or touches state more than one check reads or writes, I've asked
      whether execution order matters and whether `dependsOn` is needed (see ADR 0012) — and I have
      not proposed a retry as a fix for a flaky result.
- [ ] **Test effectiveness** ([§8](../CODE_REVIEW.md#8-test-effectiveness-review)): for new/changed
      tests under `checks/`/`scripts/` (no mutation-testing safety net), or any test whose
      assertion strength I'm unsure of, I've checked it would actually fail if the bug it targets
      were reintroduced.
- [ ] **Architecture intent** ([§9](../CODE_REVIEW.md#9-architecture-review)): any new/changed
      dependency direction or file placement is deliberate, not just something the current rules
      happen not to reject.
- [ ] **API/publication** ([§10](../CODE_REVIEW.md#10-api-and-publication-review)): if this touches
      exported symbols, presets, or package contents, I've considered whether the _semantic_
      contract changed even if `api-contract` reports no structural change.
- [ ] **Documentation accuracy** ([§12](../CODE_REVIEW.md#12-documentation-and-contract-review)):
      any documentation this change makes inaccurate (guarantees, limitations, accepted risks) has
      been updated — not merely "a doc file was touched."
- [ ] No unresolved correctness, security, or robustness concern remains that I'm setting aside
      without saying so here.

@coderabbitai summary
