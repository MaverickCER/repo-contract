import { notImplemented } from "../not-implemented.js"
import type { CheckDefinitionConfig } from "../types.js"

/**
 * Wraps a library-only check so it passes as not applicable on a `private: true` package. A
 * private app can then run `strict`, which sits on `library`. The policy reads `package.json` in
 * the working directory; the check's own policy runs when the package is not private.
 * @param id - the check id, for the rationale.
 * @param check - the library-only check.
 * @returns the wrapped check.
 */
export function passWhenPrivate<Check extends CheckDefinitionConfig>(
  id: string,
  check: Check,
): Check {
  return notImplemented("R1", id, check)
}
