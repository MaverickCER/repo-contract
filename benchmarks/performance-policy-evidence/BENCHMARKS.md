# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend, and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **298 µs** per operation compared with a bare-minimum baseline (**140% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.88). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones. Both come from the same run, so they depend far less on the machine than a time does. Runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below). They show scale, not a budget.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 298 µs | 40.4 ms |
| Added latency, relative to baseline | 140% | 233% |
| Added CPU time per operation | 1.53 ms | 48.5 ms |
| Added memory per operation (heap delta) | 353.9 KiB | 44.7 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,351 ops/s | 25 ops/s |

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
| 20 | 66.4 µs | 191 µs | 126 µs | 190% | 131 µs | $0.00026 – $0.0015 |
| 40 | 113 µs | 321 µs | 209 µs | 185% | 588 µs | $0.00044 – $0.0066 |
| 80 | 213 µs | 511 µs | 298 µs | 140% | 1.53 ms | $0.00062 – $0.017 |
| 160 | 403 µs | 820 µs | 413 µs | 102% | 489 µs | $0.00086 – $0.0055 |
| 320 | 660 µs | 1.89 ms | 1.23 ms | 186% | 1.21 ms | $0.0026 – $0.014 |
| 640 | 1.20 ms | 4.67 ms | 3.49 ms | 291% | 3.48 ms | $0.0073 – $0.039 |
| 1280 | 2.26 ms | 10.5 ms | 8.19 ms | 363% | 8.70 ms | $0.017 – $0.098 |
| 2560 | 4.48 ms | 16.5 ms | 12.0 ms | 267% | 12.6 ms | $0.025 – $0.142 |
| 5120 | 8.85 ms | 30.0 ms | 21.3 ms | 240% | 22.4 ms | $0.044 – $0.252 |
| 10240 | 17.3 ms | 57.7 ms | 40.4 ms | 233% | 48.5 ms | $0.084 – $0.546 |

**How the total grows:** O(n) (linear), exponent 0.88 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder. Its measured growth rate is then compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report. Either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 223 µs | 30.1 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 2.20 ms | 312 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 96.7 µs | 22.7 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 130 µs | 32.1 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 90.1 µs | 21.4 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 131 µs | 30.3 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n log n) | ✅ matches | 53.9 µs | 7.68 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 207 µs | 279 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 557 µs | 73.0 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 5.44 ms | 1.10 s |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 188 µs | 24.6 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 334 µs | 62.3 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 257 µs | 21.0 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 252 µs | 22.0 ms |

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

**Measured: O(n)** (exponent 0.97, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 66.5 µs | 72.6 µs | 204 µs | 52.8 KiB | 15,044 |
| 40 | 120 µs | 136 µs | 327 µs | 104.4 KiB | 8,321 |
| 80 | 223 µs | 230 µs | 534 µs | 211.2 KiB | 4,476 |
| 160 | 451 µs | 464 µs | 1.07 ms | 436.3 KiB | 2,215 |
| 320 | 812 µs | 835 µs | 1.46 ms | 938.5 KiB | 1,232 |
| 640 | 1.66 ms | 1.79 ms | 3.01 ms | 2.1 MiB | 603 |
| 1280 | 6.17 ms | 6.97 ms | 7.46 ms | 4.7 MiB | 162 |
| 2560 | 9.08 ms | 9.57 ms | 11.2 ms | 8.0 MiB | 110 |
| 5120 | 16.1 ms | 18.1 ms | 18.4 ms | 14.5 MiB | 62 |
| 10240 | 30.1 ms | 30.5 ms | 33.6 ms | 27.5 MiB | 33 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.07, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 597 µs | 616 µs | 1.23 ms | 294.9 KiB | 1,675 |
| 40 | 1.18 ms | 1.20 ms | 2.51 ms | 587.1 KiB | 845 |
| 80 | 2.20 ms | 2.83 ms | 3.62 ms | 1.1 MiB | 456 |
| 160 | 4.19 ms | 4.25 ms | 5.82 ms | 2.3 MiB | 239 |
| 320 | 8.17 ms | 8.25 ms | 10.1 ms | 4.7 MiB | 122 |
| 640 | 16.2 ms | 17.3 ms | 18.9 ms | 9.8 MiB | 62 |
| 1280 | 35.1 ms | 35.7 ms | 40.2 ms | 20.1 MiB | 29 |
| 2560 | 69.2 ms | 75.1 ms | 78.4 ms | 38.7 MiB | 14 |
| 5120 | 157 ms | 157 ms | 238 ms | 73.4 MiB | 6 |
| 10240 | 312 ms | 312 ms | 478 ms | 145.2 MiB | 3 |

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

**Measured: O(n log n)** (exponent 1.11, 10 sizes): 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 38.0 µs | 42.3 µs | 42.4 µs | 48.1 KiB | 26,288 |
| 40 | 45.1 µs | 72.2 µs | 126 µs | 92.4 KiB | 22,174 |
| 80 | 96.7 µs | 121 µs | 280 µs | 188.3 KiB | 10,346 |
| 160 | 191 µs | 248 µs | 558 µs | 392.8 KiB | 5,234 |
| 320 | 378 µs | 521 µs | 1.00 ms | 840.1 KiB | 2,646 |
| 640 | 771 µs | 986 µs | 1.74 ms | 1.9 MiB | 1,297 |
| 1280 | 4.16 ms | 4.74 ms | 6.17 ms | 4.4 MiB | 240 |
| 2560 | 5.97 ms | 6.33 ms | 8.36 ms | 7.3 MiB | 168 |
| 5120 | 10.3 ms | 11.2 ms | 14.1 ms | 13.2 MiB | 97 |
| 10240 | 22.7 ms | 23.2 ms | 29.9 ms | 24.4 MiB | 44 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.08, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 38.0 µs | 41.3 µs | 151 µs | 54.1 KiB | 26,285 |
| 40 | 61.2 µs | 75.3 µs | 181 µs | 106.9 KiB | 16,329 |
| 80 | 130 µs | 163 µs | 399 µs | 217.2 KiB | 7,686 |
| 160 | 266 µs | 332 µs | 868 µs | 451.7 KiB | 3,759 |
| 320 | 529 µs | 677 µs | 1.57 ms | 970.6 KiB | 1,889 |
| 640 | 1.29 ms | 1.48 ms | 4.07 ms | 2.2 MiB | 774 |
| 1280 | 5.52 ms | 5.69 ms | 10.6 ms | 4.9 MiB | 181 |
| 2560 | 8.24 ms | 9.89 ms | 16.8 ms | 8.3 MiB | 121 |
| 5120 | 16.0 ms | 18.0 ms | 31.0 ms | 14.5 MiB | 63 |
| 10240 | 32.1 ms | 33.0 ms | 60.0 ms | 28.1 MiB | 31 |

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

**Measured: O(n)** (exponent 1.09, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 32.0 µs | 34.2 µs | 112 µs | 46.9 KiB | 31,222 |
| 40 | 51.9 µs | 65.6 µs | 166 µs | 92.5 KiB | 19,255 |
| 80 | 90.1 µs | 125 µs | 262 µs | 187.4 KiB | 11,102 |
| 160 | 192 µs | 270 µs | 522 µs | 391.8 KiB | 5,205 |
| 320 | 420 µs | 543 µs | 1.20 ms | 856.1 KiB | 2,382 |
| 640 | 771 µs | 1.02 ms | 1.63 ms | 1.9 MiB | 1,297 |
| 1280 | 4.27 ms | 5.13 ms | 6.46 ms | 4.4 MiB | 234 |
| 2560 | 5.97 ms | 6.37 ms | 8.57 ms | 7.3 MiB | 168 |
| 5120 | 10.2 ms | 12.1 ms | 14.0 ms | 13.2 MiB | 98 |
| 10240 | 21.4 ms | 22.2 ms | 28.2 ms | 24.5 MiB | 47 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.07, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 37.7 µs | 41.1 µs | 151 µs | 54.1 KiB | 26,500 |
| 40 | 65.1 µs | 80.5 µs | 201 µs | 106.9 KiB | 15,364 |
| 80 | 131 µs | 167 µs | 405 µs | 217.2 KiB | 7,624 |
| 160 | 284 µs | 340 µs | 893 µs | 451.7 KiB | 3,523 |
| 320 | 557 µs | 702 µs | 1.68 ms | 970.6 KiB | 1,797 |
| 640 | 1.30 ms | 1.71 ms | 4.29 ms | 2.2 MiB | 770 |
| 1280 | 5.44 ms | 6.07 ms | 10.4 ms | 4.9 MiB | 184 |
| 2560 | 8.21 ms | 9.31 ms | 16.8 ms | 8.3 MiB | 122 |
| 5120 | 16.0 ms | 17.0 ms | 31.4 ms | 14.5 MiB | 62 |
| 10240 | 30.3 ms | 30.6 ms | 59.2 ms | 28.2 MiB | 33 |

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

**Measured: O(n log n)** (exponent 1.28, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 23.8 µs | 32.9 µs | 24.1 µs | 30.4 KiB | 41,992 |
| 40 | 29.5 µs | 48.0 µs | 89.8 µs | 55.1 KiB | 33,909 |
| 80 | 53.9 µs | 69.7 µs | 154 µs | 104.5 KiB | 18,559 |
| 160 | 114 µs | 192 µs | 376 µs | 204.6 KiB | 8,789 |
| 320 | 197 µs | 280 µs | 541 µs | 401.5 KiB | 5,088 |
| 640 | 197 µs | 207 µs | 560 µs | 614.5 KiB | 5,085 |
| 1280 | 806 µs | 831 µs | 1.66 ms | 1.3 MiB | 1,241 |
| 2560 | 1.77 ms | 1.87 ms | 3.88 ms | 2.7 MiB | 565 |
| 5120 | 3.67 ms | 3.74 ms | 6.83 ms | 5.5 MiB | 272 |
| 10240 | 7.68 ms | 7.76 ms | 13.7 ms | 10.8 MiB | 130 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent -0.01, 10 sizes): ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 191 µs | 211 µs | 483 µs | 613.5 KiB | 5,245 |
| 40 | 202 µs | 218 µs | 570 µs | 617.6 KiB | 4,949 |
| 80 | 207 µs | 225 µs | 569 µs | 623.8 KiB | 4,829 |
| 160 | 211 µs | 223 µs | 576 µs | 662.5 KiB | 4,745 |
| 320 | 230 µs | 302 µs | 594 µs | 722.4 KiB | 4,342 |
| 640 | 284 µs | 302 µs | 769 µs | 828.1 KiB | 3,517 |
| 1280 | 289 µs | 309 µs | 775 µs | 828.1 KiB | 3,462 |
| 2560 | 285 µs | 298 µs | 766 µs | 828.1 KiB | 3,510 |
| 5120 | 282 µs | 306 µs | 765 µs | 828.1 KiB | 3,546 |
| 10240 | 279 µs | 320 µs | 764 µs | 828.1 KiB | 3,588 |

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

**Measured: O(n)** (exponent 1.07, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 139 µs | 148 µs | 393 µs | 45.5 KiB | 7,175 |
| 40 | 259 µs | 276 µs | 689 µs | 115.7 KiB | 3,858 |
| 80 | 557 µs | 573 µs | 1.23 ms | 178.6 KiB | 1,794 |
| 160 | 1.08 ms | 1.12 ms | 2.46 ms | 357.3 KiB | 930 |
| 320 | 1.92 ms | 2.04 ms | 3.51 ms | 712.3 KiB | 521 |
| 640 | 3.63 ms | 3.76 ms | 5.29 ms | 1.4 MiB | 275 |
| 1280 | 7.22 ms | 7.51 ms | 9.15 ms | 2.8 MiB | 138 |
| 2560 | 14.4 ms | 14.8 ms | 16.6 ms | 5.7 MiB | 69 |
| 5120 | 29.6 ms | 30.0 ms | 30.1 ms | 11.3 MiB | 34 |
| 10240 | 73.0 ms | 74.2 ms | 74.4 ms | 22.7 MiB | 14 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.11, 10 sizes): 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.61 ms | 1.74 ms | 3.17 ms | 599.8 KiB | 621 |
| 40 | 2.93 ms | 3.03 ms | 4.56 ms | 1.2 MiB | 341 |
| 80 | 5.44 ms | 5.58 ms | 7.16 ms | 2.3 MiB | 184 |
| 160 | 10.6 ms | 10.7 ms | 12.5 ms | 4.6 MiB | 94 |
| 320 | 21.1 ms | 27.3 ms | 21.5 ms | 9.3 MiB | 47 |
| 640 | 50.2 ms | 50.9 ms | 50.6 ms | 18.5 MiB | 20 |
| 1280 | 120 ms | 120 ms | 120 ms | 37.0 MiB | 8 |
| 2560 | 263 ms | 264 ms | 263 ms | 73.9 MiB | 4 |
| 5120 | 541 ms | 571 ms | 556 ms | 147.7 MiB | 2 |
| 10240 | 1.10 s | 1.10 s | 1.12 s | 295.3 MiB | 1 |

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

**Measured: O(n)** (exponent 1.05, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 74.7 µs | 96.3 µs | 272 µs | 98.0 KiB | 13,383 |
| 40 | 106 µs | 143 µs | 272 µs | 178.9 KiB | 9,464 |
| 80 | 188 µs | 203 µs | 483 µs | 322.2 KiB | 5,333 |
| 160 | 347 µs | 392 µs | 744 µs | 637.7 KiB | 2,882 |
| 320 | 679 µs | 743 µs | 1.30 ms | 1.2 MiB | 1,472 |
| 640 | 1.33 ms | 1.45 ms | 2.57 ms | 2.5 MiB | 751 |
| 1280 | 2.57 ms | 2.66 ms | 3.70 ms | 4.9 MiB | 389 |
| 2560 | 5.21 ms | 5.36 ms | 6.81 ms | 9.9 MiB | 192 |
| 5120 | 11.0 ms | 11.5 ms | 13.5 ms | 19.8 MiB | 91 |
| 10240 | 24.6 ms | 25.9 ms | 28.6 ms | 39.6 MiB | 41 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.20, 10 sizes): 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 79.0 µs | 94.0 µs | 249 µs | 281.2 KiB | 12,656 |
| 40 | 159 µs | 179 µs | 481 µs | 539.5 KiB | 6,291 |
| 80 | 334 µs | 365 µs | 997 µs | 1.0 MiB | 2,990 |
| 160 | 613 µs | 711 µs | 1.62 ms | 2.1 MiB | 1,632 |
| 320 | 1.24 ms | 1.31 ms | 3.24 ms | 4.2 MiB | 808 |
| 640 | 2.27 ms | 2.39 ms | 4.33 ms | 8.3 MiB | 441 |
| 1280 | 4.62 ms | 4.75 ms | 6.93 ms | 16.7 MiB | 216 |
| 2560 | 9.32 ms | 10.8 ms | 12.2 ms | 33.3 MiB | 107 |
| 5120 | 25.3 ms | 26.7 ms | 29.1 ms | 52.0 MiB | 40 |
| 10240 | 62.3 ms | 64.3 ms | 73.0 ms | 103.7 MiB | 16 |

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

**Measured: O(n)** (exponent 1.01, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 77.3 µs | 96.7 µs | 80.0 µs | 57.3 KiB | 12,944 |
| 40 | 138 µs | 157 µs | 141 µs | 113.3 KiB | 7,259 |
| 80 | 257 µs | 275 µs | 261 µs | 225.5 KiB | 3,893 |
| 160 | 437 µs | 469 µs | 1.62 ms | 450.0 KiB | 2,286 |
| 320 | 713 µs | 890 µs | 1.82 ms | 898.7 KiB | 1,402 |
| 640 | 1.30 ms | 1.52 ms | 2.49 ms | 1.8 MiB | 769 |
| 1280 | 2.40 ms | 2.45 ms | 3.00 ms | 3.5 MiB | 417 |
| 2560 | 4.74 ms | 4.93 ms | 4.95 ms | 6.9 MiB | 211 |
| 5120 | 9.99 ms | 10.2 ms | 10.0 ms | 13.8 MiB | 100 |
| 10240 | 21.0 ms | 21.7 ms | 21.5 ms | 27.7 MiB | 48 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.02, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 72.1 µs | 86.0 µs | 75.0 µs | 56.4 KiB | 13,874 |
| 40 | 132 µs | 146 µs | 135 µs | 111.7 KiB | 7,600 |
| 80 | 252 µs | 269 µs | 256 µs | 222.3 KiB | 3,968 |
| 160 | 425 µs | 443 µs | 1.51 ms | 443.6 KiB | 2,354 |
| 320 | 702 µs | 786 µs | 1.79 ms | 886.1 KiB | 1,425 |
| 640 | 1.29 ms | 1.30 ms | 2.51 ms | 1.7 MiB | 776 |
| 1280 | 2.49 ms | 2.51 ms | 4.02 ms | 3.5 MiB | 402 |
| 2560 | 4.83 ms | 5.06 ms | 6.24 ms | 6.9 MiB | 207 |
| 5120 | 9.97 ms | 10.7 ms | 12.1 ms | 13.8 MiB | 100 |
| 10240 | 22.0 ms | 22.6 ms | 26.1 ms | 27.7 MiB | 46 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls. So where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time). Every moment of the operation then belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly. They are not measured against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 511 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 223 µs | 223 µs | 44% |
| `run-policies` | 1 | 96.7 µs | 96.7 µs | 19% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 191 µs | 37% |

**At 10240 checks** (whole operation: 57.7 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 30.1 ms | 30.1 ms | 52% |
| `run-policies` | 1 | 22.7 ms | 22.7 ms | 39% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 4.91 ms | 8.5% |

## Cost model

Estimates use two bracketing price shapes. **Low** is CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time). **High** is duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-23T09:42:06.225Z` → `2026-11-23T09:43:21.812Z` (76 s), ci: CI (run 45147196675)
- Machine: AMD EPYC 9V74 80-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.3, GitHub Actions
- Git: `e1abd4d6e25ccb5bd3516953284206c146355f3d` on `dependabot/npm_and_yarn/dev-dependencies-6826db4a85`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks: One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They show how _this_ package's cost changes between runs on comparable hardware, and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

