---
"repo-contract": patch
---

- `repo-contract/helpers`: ADR 0019 made the exception-registry and exception-policy primitives Stable (`loadExceptionRegistry`, `reconcileExceptions`, `writeExceptionRegistry`, `evaluateExceptionRecord` and the rest, with their record types), and they are now tagged `@public` instead of `@beta`. `repoContractLogs` and its two hooks stay beta. ADR 0013 now says it was amended.
- `SECURITY.md` says how a report is acknowledged, coordinated and published.
- The README links an agent skill written from the package's own exports, and describes `dependsOn` as exposing the dependency's evidence to the policy.
- ADR 0011 says where the ambient-capabilities tarball check runs; it is back in `precommit`.
- ADR 0014 is amended: CodeRabbit's findings are advisory suggestions, reported as a warning, never a reason to stop a commit.
- No behaviour of the published package changes.
