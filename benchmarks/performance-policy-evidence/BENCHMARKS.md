# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend, and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **389 µs** per operation compared with a bare-minimum baseline (**131% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.84). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones. Both come from the same run, so they depend far less on the machine than a time does. Runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below). They show scale, not a budget.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 389 µs | 44.7 ms |
| Added latency, relative to baseline | 131% | 202% |
| Added CPU time per operation | 1.88 ms | 49.0 ms |
| Added memory per operation (heap delta) | 354.1 KiB | 45.0 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 2,568 ops/s | 22 ops/s |

## 1. End-to-end: the package's total impact

Shows what a contract run pays, after the checks have finished, for turning their raw results into structured evidence and a verdict, compared with the bare minimum of parsing each check's output and counting its findings. Neither side runs a process; this is pure CPU on data already in memory, paid once per contract run.

- **Baseline (no package):** Parse each check's JSON output and count its findings by hand -- the least anyone would do to know what the checks said.
- **With the package:** `buildEvidence` assembles the run's evidence record and `runPolicies` evaluates every check's policy against it, with dependency lookups.

Both sides use empty or minimal functions on purpose. The difference is then the package's own cost, not the cost of the work an application would plug into it. Real applications add their own work on top; this is the floor the package imposes.

**Variables that could change this result**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| checks evaluated | swept | The tier axis: how many check results are turned into evidence and judged. |
| output per check | fixed at "about 500 bytes" | Output volume is measured as a variant in each function below. |
| policy work | fixed at "reads its own parsed output and its dependencies' evidence" | A real, non-trivial policy; an application's own policy logic adds its own cost on top. |
| dependency lookups | fixed at "about 15% of checks depend on an earlier check" | Exercises the per-check dependency-evidence gathering loop. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

The baseline is an empty or minimal function, so it costs almost nothing. The _relative_ overhead can then look enormous (shown as a multiple of the baseline). Read the absolute columns (time, CPU and dollars added): they are what a bill and a latency budget are made of.

| checks | Baseline | With package | Added | Added vs baseline | Added CPU | Est. $ / 1M ops |
| --- | --- | --- | --- | --- | --- | --- |
| 20 | 93.4 µs | 263 µs | 167 µs | 178% | 185 µs | $0.00035 – $0.0021 |
| 40 | 157 µs | 445 µs | 285 µs | 181% | 1.67 ms | $0.00059 – $0.019 |
| 80 | 297 µs | 692 µs | 389 µs | 131% | 1.88 ms | $0.00081 – $0.021 |
| 160 | 538 µs | 1.22 ms | 700 µs | 130% | 694 µs | $0.0015 – $0.0078 |
| 320 | 864 µs | 2.49 ms | 1.59 ms | 184% | 1.61 ms | $0.0033 – $0.018 |
| 640 | 1.57 ms | 5.93 ms | 4.36 ms | 278% | 4.58 ms | $0.0091 – $0.052 |
| 1280 | 2.94 ms | 13.1 ms | 10.2 ms | 347% | 10.9 ms | $0.021 – $0.122 |
| 2560 | 5.70 ms | 19.9 ms | 14.1 ms | 248% | 14.4 ms | $0.029 – $0.162 |
| 5120 | 11.3 ms | 35.2 ms | 23.9 ms | 212% | 26.0 ms | $0.050 – $0.292 |
| 10240 | 22.1 ms | 66.9 ms | 44.7 ms | 202% | 49.0 ms | $0.093 – $0.550 |

**How the total grows:** O(n) (linear), exponent 0.84 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder. Its measured growth rate is then compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report. Either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 311 µs | 37.9 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 2.99 ms | 410 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 149 µs | 26.0 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 181 µs | 33.9 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 154 µs | 25.4 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 183 µs | 35.3 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n log n) | ✅ matches | 86.1 µs | 9.60 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 285 µs | 418 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 762 µs | 97.4 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 8.03 ms | 1.48 s |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 278 µs | 28.3 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 319 µs | 61.0 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 360 µs | 26.9 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 345 µs | 27.4 ms |

### `buildEvidence`

**Why we benchmark it.** Every contract run assembles one evidence record from all its checks' results; it is the structured, shareable artifact the run produces.

**What poor performance would mean.** Slower contract runs after the tools have already finished, growing with the number of checks and with how much each prints; a super-linear regression would show first in repositories with chatty linters.

**Expected growth: O(n).** It processes each check's result once -- parsing its configured output format and recording one evidence entry -- so cost is proportional to the number of checks and the bytes of output they carry.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| checks evaluated | swept | The tier axis: how many check results are turned into evidence and judged. |
| output per check | variant | How many bytes of parsed JSON output each check produced: a quiet tool (500 B) versus a chatty linter (10 KB). |
| output format | fixed at "json" | Text and YAML outputs take other parsers and are not covered. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Once per contract run, before policies are evaluated.

#### Variant `quiet-output`

Each check printed about 500 bytes of JSON.

**Measured: O(n)** (exponent 0.98, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 92.5 µs | 108 µs | 292 µs | 52.9 KiB | 10,814 |
| 40 | 174 µs | 188 µs | 520 µs | 104.6 KiB | 5,761 |
| 80 | 311 µs | 358 µs | 768 µs | 211.4 KiB | 3,217 |
| 160 | 599 µs | 633 µs | 1.36 ms | 436.3 KiB | 1,670 |
| 320 | 1.19 ms | 1.27 ms | 2.73 ms | 938.9 KiB | 837 |
| 640 | 2.19 ms | 2.38 ms | 3.77 ms | 2.1 MiB | 457 |
| 1280 | 7.17 ms | 7.53 ms | 8.86 ms | 4.7 MiB | 140 |
| 2560 | 11.2 ms | 13.1 ms | 12.6 ms | 8.0 MiB | 89 |
| 5120 | 20.8 ms | 22.2 ms | 23.8 ms | 14.5 MiB | 48 |
| 10240 | 37.9 ms | 38.3 ms | 41.3 ms | 27.6 MiB | 26 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.05, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 812 µs | 825 µs | 1.59 ms | 294.9 KiB | 1,232 |
| 40 | 1.59 ms | 1.64 ms | 3.16 ms | 587.1 KiB | 628 |
| 80 | 2.99 ms | 3.60 ms | 4.71 ms | 1.1 MiB | 335 |
| 160 | 5.71 ms | 5.77 ms | 7.64 ms | 2.3 MiB | 175 |
| 320 | 11.2 ms | 11.3 ms | 13.5 ms | 4.7 MiB | 90 |
| 640 | 22.3 ms | 22.6 ms | 25.6 ms | 9.8 MiB | 45 |
| 1280 | 47.2 ms | 47.7 ms | 52.7 ms | 20.1 MiB | 21 |
| 2560 | 91.2 ms | 98.5 ms | 101 ms | 38.7 MiB | 11 |
| 5120 | 207 ms | 208 ms | 302 ms | 73.4 MiB | 5 |
| 10240 | 410 ms | 413 ms | 605 ms | 145.2 MiB | 2 |

### `runPolicies`

**Why we benchmark it.** It turns evidence into the verdict a contract run reports and exits with; it evaluates every check's policy, which is where a repository's own rules run.

**What poor performance would mean.** Slower verdicts in proportion to the number of checks, and a super-linear dependency lookup would make the largest contracts the slowest to judge.

**Expected growth: O(n).** Each check's policy runs once with a context built from its own result and its dependencies' evidence (looked up in a map), so cost is proportional to the number of checks.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| checks evaluated | swept | The tier axis: how many check results are turned into evidence and judged. |
| output per check | variant | How many bytes of parsed JSON output each check produced: a quiet tool (500 B) versus a chatty linter (10 KB). |
| policy work | fixed at "reads its own parsed output and its dependencies' evidence" | A real, non-trivial policy; an application's own policy logic adds its own cost on top. |
| dependency lookups | fixed at "about 15% of checks depend on an earlier check" | Exercises the per-check dependency-evidence gathering loop. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Once per contract run, after evidence is built.

#### Variant `quiet-output`

Each check printed about 500 bytes of JSON.

**Measured: O(n)** (exponent 1.01, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 57.1 µs | 64.1 µs | 111 µs | 48.1 KiB | 17,524 |
| 40 | 81.4 µs | 117 µs | 276 µs | 92.6 KiB | 12,291 |
| 80 | 149 µs | 202 µs | 460 µs | 188.5 KiB | 6,715 |
| 160 | 289 µs | 410 µs | 867 µs | 393.8 KiB | 3,458 |
| 320 | 560 µs | 771 µs | 1.42 ms | 853.7 KiB | 1,785 |
| 640 | 1.25 ms | 1.62 ms | 3.00 ms | 1.9 MiB | 798 |
| 1280 | 5.10 ms | 5.43 ms | 7.51 ms | 4.4 MiB | 196 |
| 2560 | 7.38 ms | 8.04 ms | 10.3 ms | 7.3 MiB | 136 |
| 5120 | 13.1 ms | 14.1 ms | 17.5 ms | 13.2 MiB | 77 |
| 10240 | 26.0 ms | 39.8 ms | 34.0 ms | 24.4 MiB | 39 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.01, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 57.7 µs | 62.2 µs | 220 µs | 54.1 KiB | 17,335 |
| 40 | 97.2 µs | 120 µs | 306 µs | 107.0 KiB | 10,288 |
| 80 | 181 µs | 229 µs | 546 µs | 217.3 KiB | 5,536 |
| 160 | 368 µs | 491 µs | 1.09 ms | 449.4 KiB | 2,719 |
| 320 | 733 µs | 942 µs | 2.08 ms | 963.1 KiB | 1,363 |
| 640 | 1.69 ms | 2.18 ms | 5.14 ms | 2.2 MiB | 591 |
| 1280 | 6.27 ms | 6.62 ms | 12.0 ms | 4.9 MiB | 160 |
| 2560 | 9.38 ms | 10.5 ms | 19.3 ms | 8.3 MiB | 107 |
| 5120 | 17.5 ms | 18.0 ms | 34.9 ms | 15.1 MiB | 57 |
| 10240 | 33.9 ms | 36.3 ms | 67.9 ms | 28.4 MiB | 29 |

### `runPolicies with an onVerdict hook`

**Why we benchmark it.** Every contract run that reports verdicts as they arrive (the CLI and any editor integration) passes this hook; its cost must stay negligible next to the policies themselves.

**What poor performance would mean.** Progress reporting would slow the verdict it reports on, and a hook that costs more than the policy would make reporting something people switch off.

**Expected growth: O(n).** The hook is called once per check with its own result, so it adds a constant per check to the linear policy pass.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| checks evaluated | swept | The tier axis: how many check results are turned into evidence and judged. |
| output per check | variant | How many bytes of parsed JSON output each check produced: a quiet tool (500 B) versus a chatty linter (10 KB). |
| policy work | fixed at "reads its own parsed output and its dependencies' evidence" | A real, non-trivial policy; an application's own policy logic adds its own cost on top. |
| dependency lookups | fixed at "about 15% of checks depend on an earlier check" | Exercises the per-check dependency-evidence gathering loop. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Not part of the end-to-end operation, which passes no hook; measured to show what the hook adds.

#### Variant `quiet-output`

Each check printed about 500 bytes of JSON.

**Measured: O(n)** (exponent 1.01, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 46.8 µs | 52.8 µs | 176 µs | 46.9 KiB | 21,358 |
| 40 | 84.8 µs | 103 µs | 263 µs | 92.6 KiB | 11,793 |
| 80 | 154 µs | 207 µs | 470 µs | 188.5 KiB | 6,494 |
| 160 | 291 µs | 413 µs | 874 µs | 393.9 KiB | 3,441 |
| 320 | 564 µs | 765 µs | 1.43 ms | 852.6 KiB | 1,773 |
| 640 | 1.21 ms | 1.42 ms | 2.99 ms | 1.9 MiB | 824 |
| 1280 | 5.08 ms | 5.40 ms | 7.57 ms | 4.4 MiB | 197 |
| 2560 | 7.30 ms | 7.83 ms | 10.4 ms | 7.3 MiB | 137 |
| 5120 | 12.5 ms | 13.6 ms | 16.8 ms | 13.2 MiB | 80 |
| 10240 | 25.4 ms | 27.1 ms | 33.0 ms | 24.6 MiB | 39 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.03, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 56.1 µs | 60.0 µs | 221 µs | 54.2 KiB | 17,816 |
| 40 | 98.2 µs | 119 µs | 331 µs | 107.1 KiB | 10,186 |
| 80 | 183 µs | 239 µs | 586 µs | 217.3 KiB | 5,468 |
| 160 | 352 µs | 477 µs | 1.07 ms | 447.9 KiB | 2,838 |
| 320 | 725 µs | 966 µs | 2.04 ms | 970.6 KiB | 1,380 |
| 640 | 1.69 ms | 2.01 ms | 5.12 ms | 2.2 MiB | 592 |
| 1280 | 6.35 ms | 6.79 ms | 12.2 ms | 4.9 MiB | 158 |
| 2560 | 9.60 ms | 9.87 ms | 20.0 ms | 8.3 MiB | 104 |
| 5120 | 17.7 ms | 18.7 ms | 36.0 ms | 15.1 MiB | 56 |
| 10240 | 35.3 ms | 56.1 ms | 68.7 ms | 28.2 MiB | 28 |

### `renderMarkdownSummary`

**Why we benchmark it.** Every contract run that reports to a pull request or a job summary renders its verdict as Markdown once, from all of its checks.

**What poor performance would mean.** A slower report at the end of every run, growing with the number of checks and with the length of each failure's rationale.

**Expected growth: O(n log n).** Each check is counted and listed once, and the checks are sorted by duration to find the slowest, so cost grows a little faster than the number of checks.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| checks evaluated | swept | The tier axis: how many check results are turned into evidence and judged. |
| slowest | swept | How many of the slowest checks the summary lists. |
| outcomes | fixed at "every tenth check fails and every fifth warns" | Failures print their whole rationale in a fenced block, so more of them cost more. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Not part of the end-to-end operation, which ends at the verdict.

**Measured: O(n log n)** (exponent 1.19, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 32.4 µs | 46.4 µs | 32.9 µs | 30.4 KiB | 30,897 |
| 40 | 43.1 µs | 55.5 µs | 137 µs | 55.2 KiB | 23,211 |
| 80 | 86.1 µs | 111 µs | 304 µs | 104.5 KiB | 11,615 |
| 160 | 150 µs | 196 µs | 460 µs | 204.6 KiB | 6,678 |
| 320 | 288 µs | 454 µs | 851 µs | 401.8 KiB | 3,478 |
| 640 | 301 µs | 578 µs | 906 µs | 620.1 KiB | 3,317 |
| 1280 | 1.22 ms | 1.29 ms | 3.27 ms | 1.3 MiB | 823 |
| 2560 | 2.33 ms | 2.46 ms | 4.96 ms | 2.7 MiB | 429 |
| 5120 | 4.68 ms | 4.78 ms | 8.37 ms | 5.5 MiB | 214 |
| 10240 | 9.60 ms | 9.67 ms | 16.0 ms | 10.8 MiB | 104 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent 0.00, 10 sizes): ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 275 µs | 298 µs | 863 µs | 619.7 KiB | 3,631 |
| 40 | 278 µs | 309 µs | 863 µs | 619.9 KiB | 3,598 |
| 80 | 285 µs | 319 µs | 878 µs | 623.9 KiB | 3,513 |
| 160 | 296 µs | 314 µs | 876 µs | 666.7 KiB | 3,382 |
| 320 | 321 µs | 355 µs | 905 µs | 715.9 KiB | 3,113 |
| 640 | 418 µs | 479 µs | 1.31 ms | 833.1 KiB | 2,391 |
| 1280 | 417 µs | 478 µs | 1.30 ms | 833.1 KiB | 2,401 |
| 2560 | 417 µs | 477 µs | 1.31 ms | 833.1 KiB | 2,398 |
| 5120 | 418 µs | 519 µs | 1.29 ms | 833.1 KiB | 2,390 |
| 10240 | 418 µs | 438 µs | 1.31 ms | 833.1 KiB | 2,393 |

### `serializeRun`

**Why we benchmark it.** A contract run that keeps its result as files serializes its evidence and verdict once.

**What poor performance would mean.** A slower end to every run that persists its result, growing with the number of checks and with how much each printed.

**Expected growth: O(n).** Both documents are walked once by the JSON serializer, so cost is proportional to the number of checks and the text they hold.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| checks evaluated | swept | The tier axis: how many check results are turned into evidence and judged. |
| output per check | variant | How many bytes of parsed JSON output each check produced: a quiet tool (500 B) versus a chatty linter (10 KB). |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Not part of the end-to-end operation, which ends at the verdict.

#### Variant `quiet-output`

Each check printed about 500 bytes of JSON.

**Measured: O(n)** (exponent 1.05, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 225 µs | 245 µs | 734 µs | 45.8 KiB | 4,444 |
| 40 | 400 µs | 428 µs | 1.16 ms | 90.2 KiB | 2,500 |
| 80 | 762 µs | 857 µs | 1.57 ms | 178.6 KiB | 1,312 |
| 160 | 1.47 ms | 1.51 ms | 3.05 ms | 357.3 KiB | 680 |
| 320 | 2.71 ms | 2.83 ms | 4.64 ms | 712.3 KiB | 370 |
| 640 | 5.10 ms | 5.24 ms | 7.21 ms | 1.4 MiB | 196 |
| 1280 | 10.5 ms | 10.7 ms | 12.7 ms | 2.8 MiB | 95 |
| 2560 | 20.8 ms | 21.0 ms | 22.8 ms | 5.7 MiB | 48 |
| 5120 | 41.7 ms | 47.7 ms | 42.2 ms | 11.3 MiB | 24 |
| 10240 | 97.4 ms | 98.2 ms | 97.8 ms | 22.7 MiB | 10 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.11, 10 sizes): 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.32 ms | 3.09 ms | 4.30 ms | 599.8 KiB | 431 |
| 40 | 4.39 ms | 5.83 ms | 6.41 ms | 1.2 MiB | 228 |
| 80 | 8.03 ms | 8.25 ms | 10.2 ms | 2.3 MiB | 124 |
| 160 | 15.4 ms | 21.2 ms | 17.5 ms | 4.6 MiB | 65 |
| 320 | 29.9 ms | 30.3 ms | 30.3 ms | 9.3 MiB | 33 |
| 640 | 67.1 ms | 67.7 ms | 67.6 ms | 18.5 MiB | 15 |
| 1280 | 168 ms | 169 ms | 168 ms | 37.0 MiB | 6 |
| 2560 | 356 ms | 364 ms | 355 ms | 73.9 MiB | 3 |
| 5120 | 734 ms | 742 ms | 751 ms | 147.7 MiB | 1 |
| 10240 | 1.48 s | 1.50 s | 1.51 s | 295.3 MiB | 1 |

### `repoContractLogs saveEvidence`

**Why we benchmark it.** Runs once per check in every contract run that keeps logs (the default), so its cost is paid by every developer and every CI job.

**What poor performance would mean.** Keeping logs would slow every run in proportion to how much the tools print, and a pre-push hook that feels slower is a hook people skip.

**Expected growth: O(n).** Each check's evidence is rendered once and handed to one write, in order, so the cost is proportional to the number of checks and the text they printed.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| checks evaluated | swept | The tier axis: how many check results are turned into evidence and judged. |
| output per check | variant | How many bytes of parsed JSON output each check produced: a quiet tool (500 B) versus a chatty linter (10 KB). |
| filesystem | fixed at "an in-memory stand-in" | The real disk adds its own latency per file; the benchmark isolates the package's own rendering and queueing, as the standard asks (no real I/O). |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Not part of the end-to-end operation; logs are an opt-in hook.

#### Variant `quiet-output`

Each check printed about 500 bytes of JSON.

**Measured: O(n)** (exponent 1.00, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 109 µs | 171 µs | 394 µs | 98.0 KiB | 9,213 |
| 40 | 170 µs | 214 µs | 527 µs | 179.0 KiB | 5,899 |
| 80 | 278 µs | 320 µs | 750 µs | 328.4 KiB | 3,597 |
| 160 | 501 µs | 540 µs | 1.23 ms | 637.9 KiB | 1,998 |
| 320 | 890 µs | 976 µs | 1.61 ms | 1.2 MiB | 1,124 |
| 640 | 1.78 ms | 1.93 ms | 3.29 ms | 2.5 MiB | 562 |
| 1280 | 3.36 ms | 3.56 ms | 4.74 ms | 4.9 MiB | 298 |
| 2560 | 6.69 ms | 6.93 ms | 8.73 ms | 9.9 MiB | 150 |
| 5120 | 13.6 ms | 14.4 ms | 16.4 ms | 19.8 MiB | 73 |
| 10240 | 28.3 ms | 28.7 ms | 33.0 ms | 39.6 MiB | 35 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.17, 10 sizes): 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 93.1 µs | 102 µs | 298 µs | 281.1 KiB | 10,738 |
| 40 | 175 µs | 207 µs | 537 µs | 540.1 KiB | 5,721 |
| 80 | 319 µs | 354 µs | 801 µs | 1.0 MiB | 3,132 |
| 160 | 620 µs | 672 µs | 1.36 ms | 2.1 MiB | 1,613 |
| 320 | 1.26 ms | 1.38 ms | 2.78 ms | 4.2 MiB | 791 |
| 640 | 2.42 ms | 2.59 ms | 4.02 ms | 8.3 MiB | 414 |
| 1280 | 4.85 ms | 4.99 ms | 6.79 ms | 16.7 MiB | 206 |
| 2560 | 9.74 ms | 10.6 ms | 12.3 ms | 33.3 MiB | 103 |
| 5120 | 25.9 ms | 27.2 ms | 29.9 ms | 52.0 MiB | 39 |
| 10240 | 61.0 ms | 62.2 ms | 71.3 ms | 103.7 MiB | 16 |

### `repoContractLogs prependVerdict`

**Why we benchmark it.** Runs once per check at the end of every contract run that keeps logs, rewriting the file each one already has.

**What poor performance would mean.** The end of every run would wait on rewriting every log, in proportion to how much each tool printed.

**Expected growth: O(n).** Each log is read once and written once with the verdict on top, so the cost is proportional to the number of checks and the text each holds.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| checks evaluated | swept | The tier axis: how many check results are turned into evidence and judged. |
| output per check | variant | How many bytes of parsed JSON output each check produced: a quiet tool (500 B) versus a chatty linter (10 KB). |
| filesystem | fixed at "an in-memory stand-in" | The real disk adds its own latency per file; not covered. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Not part of the end-to-end operation; logs are an opt-in hook.

#### Variant `quiet-output`

Each check printed about 500 bytes of JSON.

**Measured: O(n)** (exponent 1.00, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 107 µs | 130 µs | 111 µs | 57.4 KiB | 9,366 |
| 40 | 191 µs | 218 µs | 194 µs | 113.5 KiB | 5,248 |
| 80 | 360 µs | 383 µs | 364 µs | 225.7 KiB | 2,775 |
| 160 | 541 µs | 727 µs | 1.70 ms | 450.0 KiB | 1,847 |
| 320 | 950 µs | 1.38 ms | 2.31 ms | 898.9 KiB | 1,053 |
| 640 | 1.70 ms | 1.81 ms | 3.03 ms | 1.8 MiB | 588 |
| 1280 | 3.22 ms | 3.92 ms | 4.44 ms | 3.5 MiB | 311 |
| 2560 | 6.28 ms | 6.35 ms | 6.44 ms | 6.9 MiB | 159 |
| 5120 | 13.0 ms | 13.1 ms | 13.1 ms | 13.8 MiB | 77 |
| 10240 | 26.9 ms | 27.0 ms | 27.4 ms | 27.7 MiB | 37 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.00, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 97.3 µs | 116 µs | 101 µs | 56.5 KiB | 10,275 |
| 40 | 180 µs | 200 µs | 183 µs | 111.8 KiB | 5,550 |
| 80 | 345 µs | 371 µs | 1.14 ms | 222.5 KiB | 2,900 |
| 160 | 550 µs | 584 µs | 1.89 ms | 443.7 KiB | 1,818 |
| 320 | 930 µs | 1.10 ms | 2.27 ms | 886.2 KiB | 1,076 |
| 640 | 1.72 ms | 1.75 ms | 3.14 ms | 1.7 MiB | 582 |
| 1280 | 3.28 ms | 3.74 ms | 5.07 ms | 3.5 MiB | 305 |
| 2560 | 6.31 ms | 6.46 ms | 7.65 ms | 6.9 MiB | 159 |
| 5120 | 13.3 ms | 13.6 ms | 16.4 ms | 13.8 MiB | 75 |
| 10240 | 27.4 ms | 28.1 ms | 32.9 ms | 27.7 MiB | 37 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls. So where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time). Every moment of the operation then belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly. They are not measured against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 692 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 311 µs | 311 µs | 45% |
| `run-policies` | 1 | 149 µs | 149 µs | 22% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 232 µs | 34% |

**At 10240 checks** (whole operation: 66.9 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 37.9 ms | 37.9 ms | 57% |
| `run-policies` | 1 | 26.0 ms | 26.0 ms | 39% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 3.02 ms | 4.5% |

## Cost model

Estimates use two bracketing price shapes. **Low** is CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time). **High** is duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-14T16:28:20.430Z` → `2026-11-14T16:29:53.122Z` (93 s), ci: CI (run 43614141719)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `e51d919788d6962ecef60859eb6b4ce6f35220a0` on `fix/review-gaps-2026-11-13`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks: One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They show how _this_ package's cost changes between runs on comparable hardware, and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

