// Fixture only -- deliberately shaped like the real src/execution -> src/policy
// import ADR 0001 forbids (see specs/decisions/0001-execution-and-policy-are-a-strict-sequential-contract.md), so test/unit/architecture/rules.test.ts can prove
// .dependency-cruiser.cjs's layering rules actually flag it (a true
// positive), not just that the rule exists. Never analyzed by the real
// architecture check (.dependency-cruiser.cjs scopes to `^src` only).
import { evaluate } from "../policy/evaluate.js"

export function spawn(): string {
  return evaluate()
}
