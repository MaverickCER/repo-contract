---
"repo-contract": minor
---

feat: `RunRepoContractOptions.onVerdict` reports each check's `PolicyResult` as soon as its policy returns, beside `onEvidence`. `repo-contract/helpers` gains `onEvidenceSaveToRepoContractLogs` and `onVerdictPrependRepoContractLogs`, ready-made hooks that write one log per check as the run goes (the raw output when its evidence exists, the verdict prepended when its policy returns), plus `repoContractLogs` for the store behind them
