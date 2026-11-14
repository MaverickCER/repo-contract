<!-- GENERATED FILE -- do not edit by hand. Regenerate it by re-running the script that calls `generateDocumentation()` / `generateUsageReport()` from `@maverickcer/env-cap/build`. -->

> Machine-generated engineering artifact assembled from statically-provable code facts and author-declared documentation. It can support a security, privacy, or compliance review. It does not itself establish compliance with any standard.
>
> Projected from env-cap's Evidence Model (<https://github.com/MaverickCER/env-cap/blob/main/GUIDE.md>), the same source every other generated artifact draws from.

# Environment Variables

_Produced by `generateDocumentation()` from `@maverickcer/env-cap/build`._

_Generated 2026-11-13T22:22:34.172Z_

## Changes since last report

No changes.

## Table of contents

- [Catalog](#catalog)
  - [ci-secrets](#contract-ci-secrets)
  - [run-settings](#contract-run-settings)
  - [tool-settings](#contract-tool-settings)
- [Lifecycle report](#lifecycle-report)
- [Security review](#security-review)

## Catalog

<a id="catalog"></a>

<a id="contract-ci-secrets"></a>

## ci-secrets

Source: `node_modules/internal-package-contract/ci/env.schema.ts`

- Active: yes
- Category: CI secrets

<a id="ci-secrets-pin_sync_token"></a>

### `PIN_SYNC_TOKEN`

Optional. Lets the pin-sync workflow change workflow files and start CI on its pull request; without it the workflow cannot push workflow-file changes, and `internal-package-contract upgrade <tag>` does the same by hand.

- Default: yes
- Processor: no
- Validator: yes
- Sensitivity: secret
- Refresh instructions: Create a fine-grained personal access token for this repository with Contents, Pull requests, Workflows and Actions write access, then replace the repository secret PIN_SYNC_TOKEN (Settings > Secrets and variables > Actions). Then set its `expiresAt` in `ci/env.schema.ts` to the token's expiry, so a weekly check can warn before it lapses.

<a id="ci-secrets-socket_security_api_key"></a>

### `SOCKET_SECURITY_API_KEY`

Optional. Read by the `socket` CLI while the contract runs, for the SecuritySocket check. Without it that check warns; under CI the warning fails unless `.repo-contract/exceptions/environment.json` records `environment:SecuritySocket:no-key`.

- Default: yes
- Processor: no
- Validator: yes
- Sensitivity: secret
- Refresh instructions: Create an API token at socket.dev (Settings > API Tokens) with the `packages:list` permission, then replace the repository secret SOCKET_SECURITY_API_KEY.

<a id="contract-run-settings"></a>

## run-settings

Source: `ci/env.schema.ts`

- Active: yes
- Category: Run settings

<a id="run-settings-ci_full"></a>

### `CI_FULL`

Set to 1, true or yes to force a full run. `resolveScope` then returns full over any request, and `resolveFailFast` returns false.

- Default: yes
- Processor: no
- Validator: yes

<a id="run-settings-repo_contract_cache"></a>

### `REPO_CONTRACT_CACHE`

off, ro or rw. `resolveCacheMode` reads it from the environment its caller passes, after the command line. The default is read-write, and a full run is always cold. Any other value throws.

- Default: yes
- Processor: no
- Validator: yes

<a id="run-settings-repo_contract_fail_fast"></a>

### `REPO_CONTRACT_FAIL_FAST`

Set to 1, true, yes or on to make `npm run contract` skip the expensive checks once a cheap one has failed (`resolveFailFast`, called by scripts/run-contract.mjs). `--fail-fast` and `--no-fail-fast` win. A release or CI_FULL turns it off.

- Default: yes
- Processor: no
- Validator: yes

<a id="run-settings-repo_contract_scope"></a>

### `REPO_CONTRACT_SCOPE`

auto, affected or full. `resolveScope` reads it from the environment its caller passes, after an explicit request and before the CI event. Any other value throws.

- Default: yes
- Processor: no
- Validator: yes

<a id="contract-tool-settings"></a>

## tool-settings

Source: `node_modules/internal-package-contract/ci/env.schema.ts`

- Active: yes
- Category: Tool settings

<a id="tool-settings-chrome_path"></a>

### `CHROME_PATH`

A Chrome or Chromium to use for the accessibility scan, read when PUPPETEER_EXECUTABLE_PATH is not set.

- Default: yes
- Processor: no
- Validator: yes

<a id="tool-settings-code_scanning_max_pages"></a>

### `CODE_SCANNING_MAX_PAGES`

How many pages of code-scanning alerts to read before stopping.

- Default: yes
- Processor: no
- Validator: yes

<a id="tool-settings-ipc_logs"></a>

### `IPC_LOGS`

Which per-check logs the contract keeps: all, failing (the default) or off. The --logs flag wins.

- Default: yes
- Processor: no
- Validator: yes

<a id="tool-settings-ipc_release"></a>

### `IPC_RELEASE`

Set to 1 while a release is verified, so a prompt a maintainer left unanswered fails the run (PromptBlocks).

- Default: yes
- Processor: no
- Validator: yes

<a id="tool-settings-puppeteer_executable_path"></a>

### `PUPPETEER_EXECUTABLE_PATH`

A Chrome or Chromium to use for the accessibility scan, under the name Puppeteer uses. It wins over CHROME_PATH.

- Default: yes
- Processor: no
- Validator: yes

<a id="tool-settings-socket_score_retry_wait_ms"></a>

### `SOCKET_SCORE_RETRY_WAIT_MS`

How long to wait, in milliseconds, before asking Socket for a package score again.

- Default: yes
- Processor: no
- Validator: yes

## Dependency graph

<a id="dependency-graph"></a>

One row per unique variable name; more than one location means more than one feature declares it (see the package README's "Duplicate variables" section for how that's handled at runtime).

| Variable                     | Declared in                                                                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `CHROME_PATH`                | [tool-settings (`node_modules/internal-package-contract/ci/env.schema.ts`)](#tool-settings-chrome_path)                |
| `CI_FULL`                    | [run-settings (`ci/env.schema.ts`)](#run-settings-ci_full)                                                             |
| `CODE_SCANNING_MAX_PAGES`    | [tool-settings (`node_modules/internal-package-contract/ci/env.schema.ts`)](#tool-settings-code_scanning_max_pages)    |
| `IPC_LOGS`                   | [tool-settings (`node_modules/internal-package-contract/ci/env.schema.ts`)](#tool-settings-ipc_logs)                   |
| `IPC_RELEASE`                | [tool-settings (`node_modules/internal-package-contract/ci/env.schema.ts`)](#tool-settings-ipc_release)                |
| `PIN_SYNC_TOKEN`             | [ci-secrets (`node_modules/internal-package-contract/ci/env.schema.ts`)](#ci-secrets-pin_sync_token)                   |
| `PUPPETEER_EXECUTABLE_PATH`  | [tool-settings (`node_modules/internal-package-contract/ci/env.schema.ts`)](#tool-settings-puppeteer_executable_path)  |
| `REPO_CONTRACT_CACHE`        | [run-settings (`ci/env.schema.ts`)](#run-settings-repo_contract_cache)                                                 |
| `REPO_CONTRACT_FAIL_FAST`    | [run-settings (`ci/env.schema.ts`)](#run-settings-repo_contract_fail_fast)                                             |
| `REPO_CONTRACT_SCOPE`        | [run-settings (`ci/env.schema.ts`)](#run-settings-repo_contract_scope)                                                 |
| `SOCKET_SCORE_RETRY_WAIT_MS` | [tool-settings (`node_modules/internal-package-contract/ci/env.schema.ts`)](#tool-settings-socket_score_retry_wait_ms) |
| `SOCKET_SECURITY_API_KEY`    | [ci-secrets (`node_modules/internal-package-contract/ci/env.schema.ts`)](#ci-secrets-socket_security_api_key)          |

## Lifecycle report

<a id="lifecycle-report"></a>

| Variable                                                         | Owner | Expires | Refresh instructions                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------- | ----- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`PIN_SYNC_TOKEN`](#ci-secrets-pin_sync_token)                   | --    | --      | Create a fine-grained personal access token for this repository with Contents, Pull requests, Workflows and Actions write access, then replace the repository secret PIN_SYNC_TOKEN (Settings > Secrets and variables > Actions). Then set its `expiresAt` in `ci/env.schema.ts` to the token's expiry, so a weekly check can warn before it lapses. |
| [`SOCKET_SECURITY_API_KEY`](#ci-secrets-socket_security_api_key) | --    | --      | Create an API token at socket.dev (Settings > API Tokens) with the `packages:list` permission, then replace the repository secret SOCKET_SECURITY_API_KEY.                                                                                                                                                                                           |

## Security review

<a id="security-review"></a>

- Total contracts: 3
- Total variable declarations: 12 (12 from active contracts)
- Unique variable names: 12
- Variables with `expiresAt` set: 0
  - Already expired: 0
  - Expiring within 30 days: 0
- Variables marked `required: true`: 0
- Variables with refresh instructions: 2
- Variables with no assigned owner: 12
- Variable names declared by more than one contract: 0
- Undocumented contracts: 0
- Undocumented variables: 0
