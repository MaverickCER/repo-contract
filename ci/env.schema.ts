// What this package's own scripts and code read from the environment, written down once. None of it is required:
// each variable has a default. `internal-package-contract env` reads this file (it never runs it) and writes
// docs/ENVIRONMENT.md. What the standard itself needs is described by the standard and included there already.
import { createEnv, documentEnv } from "internal-package-contract/env-cap"

// Anything is accepted here. The code that reads each value validates it and names the allowed values.
const accept = (): true => true

const runSettings = {
  REPO_CONTRACT_FAIL_FAST: { default: "", validator: accept },
  CI_FULL: { default: "", validator: accept },
  REPO_CONTRACT_SCOPE: { default: "", validator: accept },
  REPO_CONTRACT_CACHE: { default: "", validator: accept },
}

export const runSettingsEnv = createEnv(runSettings, { name: "run-settings" })

documentEnv(runSettings, {
  category: "Run settings",
  variables: {
    REPO_CONTRACT_FAIL_FAST: {
      description:
        "Set to 1, true, yes or on to make `npm run contract` skip the expensive checks once a cheap one has failed (`resolveFailFast`, called by scripts/run-contract.mjs). `--fail-fast` and `--no-fail-fast` win. A release or CI_FULL turns it off.",
    },
    CI_FULL: {
      description:
        "Set to 1, true or yes to force a full run. `resolveScope` then returns full over any request, and `resolveFailFast` returns false.",
    },
    REPO_CONTRACT_SCOPE: {
      description:
        "auto, affected or full. `resolveScope` reads it from the environment its caller passes, after an explicit request and before the CI event. Any other value throws.",
    },
    REPO_CONTRACT_CACHE: {
      description:
        "off, ro or rw. `resolveCacheMode` reads it from the environment its caller passes, after the command line. The default is read-write, and a full run is always cold. Any other value throws.",
    },
  },
})
