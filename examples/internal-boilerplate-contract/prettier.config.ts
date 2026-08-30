/**
 * The organization's baseline Prettier configuration.
 *
 * Consumers EXTEND it, they do not copy it:
 *
 *   import baseline from "internal-boilerplate-contract/prettier"
 *   export default { ...baseline }
 *
 * A small, deliberate delta from Prettier's defaults so that "extend the baseline"
 * is a meaningful statement rather than a no-op.
 */
import type { Config } from "prettier"

const config: Config = {
  semi: false,
  singleQuote: false,
  trailingComma: "all",
  printWidth: 100,
}

export default config
