// Inherit the organization's baseline; append only project-specific blocks here.
import baseline from "internal-boilerplate-contract/eslint"

export default [
  ...baseline,
  {
    // A project-specific override: this project is a console application, so it
    // opts out of a `no-console` rule the organization might enable elsewhere.
    // Real projects add their own blocks here without touching the baseline.
    rules: {
      "no-console": "off",
    },
  },
]
