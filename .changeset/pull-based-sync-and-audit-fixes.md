---
"repo-contract": patch
---

Resolve the repository's open Dependabot alerts (`js-yaml` updated; `adm-zip`, reached only through `github-actionlint`, overridden to 0.6.1), drop the cross-repository release notification and its expired token in favor of internal-package-contract pulling the latest release on its own schedule, and re-pin internal-package-contract to its 0.8 release.
