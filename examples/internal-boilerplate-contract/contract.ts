/**
 * The organization's engineering standard for this project type, expressed once
 * as a repo-contract contract.
 *
 * Consumers run it through this package's bin (`npm run contract` ->
 * `internal-boilerplate-contract`), which loads this file and evaluates every
 * check against the consuming repository's working directory.
 *
 * Intentionally minimal: three read-only checks. repo-contract owns *how* each
 * check is executed and turned into a verdict; this file owns *what* a project of
 * this type must satisfy. See ../README.md and
 * ../../specs/decisions/0010-review-driven-contracts-and-shared-internal-system-contracts.md.
 */
import { defineRepoContract } from "repo-contract"
import { format, lint, typecheck } from "repo-contract/presets"

export default defineRepoContract({
  checks: {
    // The `format` preset ships `prettier --write .`, which fixes files in place
    // and therefore can never fail on unformatted input. An organizational
    // contract must *verify* an invariant, not mutate the consumer's tree while
    // deciding whether it holds, so the read-only `--check` form is substituted.
    // The preset's own policy (exit 0 = pass) already fits it exactly.
    Format: { ...format, run: ["prettier", "--check", "."] },
    // `tsc --noEmit -p tsconfig.json` -- already read-only.
    Types: typecheck,
    // `eslint . --format json` with no `--fix` -- already read-only.
    Lint: lint(),
  },
})
