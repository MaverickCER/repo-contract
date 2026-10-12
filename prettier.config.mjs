// Extends internal-package-contract's org-wide baseline. The values are identical to what this
// package's former .prettierrc.json declared (compared as resolved configs before the change), so
// this only makes the baseline the single source of truth instead of a coincidence two files agree on.
import baseline from "internal-package-contract/prettier"

export default { ...baseline }
