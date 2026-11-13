# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend, and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **286 µs** per operation compared with a bare-minimum baseline (**171% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.87). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones. Both come from the same run, so they depend far less on the machine than a time does. Runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below). They show scale, not a budget.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 286 µs | 35.0 ms |
| Added latency, relative to baseline | 171% | 230% |
| Added CPU time per operation | 1.70 ms | 39.0 ms |
| Added memory per operation (heap delta) | 353.7 KiB | 45.1 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,499 ops/s | 29 ops/s |

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
| 20 | 56.7 µs | 173 µs | 115 µs | 203% | 116 µs | $0.00024 – $0.0013 |
| 40 | 91.6 µs | 272 µs | 184 µs | 201% | 189 µs | $0.00038 – $0.0021 |
| 80 | 168 µs | 453 µs | 286 µs | 171% | 1.70 ms | $0.0006 – $0.019 |
| 160 | 321 µs | 830 µs | 501 µs | 156% | 2.06 ms | $0.001 – $0.023 |
| 320 | 583 µs | 1.36 ms | 780 µs | 134% | 1.05 ms | $0.0016 – $0.012 |
| 640 | 972 µs | 3.87 ms | 2.88 ms | 296% | 3.23 ms | $0.006 – $0.036 |
| 1280 | 1.76 ms | 8.68 ms | 6.91 ms | 394% | 7.46 ms | $0.014 – $0.084 |
| 2560 | 3.33 ms | 13.2 ms | 9.87 ms | 296% | 10.5 ms | $0.021 – $0.118 |
| 5120 | 6.45 ms | 24.1 ms | 17.5 ms | 272% | 18.9 ms | $0.037 – $0.212 |
| 10240 | 15.3 ms | 48.2 ms | 35.0 ms | 230% | 39.0 ms | $0.073 – $0.439 |

**How the total grows:** O(n) (linear), exponent 0.87 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder. Its measured growth rate is then compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report. Either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 196 µs | 25.8 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 1.89 ms | 319 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 87.2 µs | 18.9 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 132 µs | 28.9 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 96.1 µs | 16.7 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 146 µs | 30.6 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n log n) | ✅ matches | 54.4 µs | 7.51 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 197 µs | 246 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 511 µs | 67.4 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n) | ✅ matches | 5.26 ms | 1.05 s |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 164 µs | 20.2 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 244 µs | 69.3 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 188 µs | 21.2 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 202 µs | 21.9 ms |

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
| 20 | 58.4 µs | 63.1 µs | 209 µs | 52.8 KiB | 17,111 |
| 40 | 102 µs | 107 µs | 316 µs | 104.3 KiB | 9,840 |
| 80 | 196 µs | 206 µs | 576 µs | 211.2 KiB | 5,110 |
| 160 | 352 µs | 372 µs | 868 µs | 436.0 KiB | 2,842 |
| 320 | 682 µs | 702 µs | 1.46 ms | 938.5 KiB | 1,466 |
| 640 | 1.38 ms | 1.46 ms | 3.01 ms | 2.1 MiB | 725 |
| 1280 | 5.05 ms | 5.31 ms | 6.64 ms | 4.7 MiB | 198 |
| 2560 | 8.23 ms | 9.81 ms | 10.6 ms | 8.0 MiB | 122 |
| 5120 | 12.5 ms | 13.9 ms | 14.2 ms | 14.5 MiB | 80 |
| 10240 | 25.8 ms | 27.3 ms | 29.7 ms | 27.6 MiB | 39 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.12, 10 sizes): 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 522 µs | 539 µs | 1.32 ms | 294.9 KiB | 1,914 |
| 40 | 1.06 ms | 1.08 ms | 2.73 ms | 587.1 KiB | 947 |
| 80 | 1.89 ms | 2.30 ms | 3.72 ms | 1.1 MiB | 529 |
| 160 | 3.53 ms | 4.08 ms | 5.75 ms | 2.3 MiB | 283 |
| 320 | 8.02 ms | 9.16 ms | 10.8 ms | 4.7 MiB | 125 |
| 640 | 13.9 ms | 16.0 ms | 17.9 ms | 9.8 MiB | 72 |
| 1280 | 34.1 ms | 34.7 ms | 41.2 ms | 20.1 MiB | 29 |
| 2560 | 63.8 ms | 65.1 ms | 78.1 ms | 38.7 MiB | 16 |
| 5120 | 149 ms | 151 ms | 243 ms | 73.5 MiB | 7 |
| 10240 | 319 ms | 333 ms | 516 ms | 145.1 MiB | 3 |

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

**Measured: O(n)** (exponent 1.02, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 33.5 µs | 39.2 µs | 35.0 µs | 48.2 KiB | 29,837 |
| 40 | 48.0 µs | 62.7 µs | 178 µs | 92.5 KiB | 20,822 |
| 80 | 87.2 µs | 101 µs | 285 µs | 188.3 KiB | 11,469 |
| 160 | 181 µs | 205 µs | 578 µs | 393.3 KiB | 5,531 |
| 320 | 372 µs | 442 µs | 970 µs | 841.9 KiB | 2,688 |
| 640 | 850 µs | 949 µs | 2.65 ms | 1.9 MiB | 1,177 |
| 1280 | 3.89 ms | 5.23 ms | 6.28 ms | 4.4 MiB | 257 |
| 2560 | 5.33 ms | 7.55 ms | 8.47 ms | 7.3 MiB | 187 |
| 5120 | 9.45 ms | 12.8 ms | 13.9 ms | 13.2 MiB | 106 |
| 10240 | 18.9 ms | 19.2 ms | 27.6 ms | 24.5 MiB | 53 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.07, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 33.3 µs | 43.3 µs | 34.6 µs | 54.1 KiB | 29,990 |
| 40 | 63.3 µs | 70.2 µs | 236 µs | 106.9 KiB | 15,808 |
| 80 | 132 µs | 140 µs | 443 µs | 217.2 KiB | 7,599 |
| 160 | 278 µs | 306 µs | 966 µs | 451.7 KiB | 3,593 |
| 320 | 548 µs | 607 µs | 1.80 ms | 970.6 KiB | 1,826 |
| 640 | 1.24 ms | 1.37 ms | 4.72 ms | 2.2 MiB | 804 |
| 1280 | 4.75 ms | 5.25 ms | 10.8 ms | 4.9 MiB | 210 |
| 2560 | 7.22 ms | 7.75 ms | 16.7 ms | 8.3 MiB | 139 |
| 5120 | 14.8 ms | 15.8 ms | 35.1 ms | 15.1 MiB | 68 |
| 10240 | 28.9 ms | 29.0 ms | 70.7 ms | 28.1 MiB | 35 |

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

**Measured: O(n)** (exponent 1.03, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 29.0 µs | 32.7 µs | 30.1 µs | 47.0 KiB | 34,470 |
| 40 | 53.7 µs | 77.0 µs | 183 µs | 92.5 KiB | 18,628 |
| 80 | 96.1 µs | 115 µs | 338 µs | 188.3 KiB | 10,405 |
| 160 | 170 µs | 185 µs | 523 µs | 393.2 KiB | 5,896 |
| 320 | 334 µs | 435 µs | 887 µs | 853.3 KiB | 2,994 |
| 640 | 737 µs | 872 µs | 1.89 ms | 1.9 MiB | 1,356 |
| 1280 | 3.77 ms | 4.07 ms | 6.04 ms | 4.4 MiB | 266 |
| 2560 | 5.63 ms | 8.02 ms | 8.67 ms | 7.3 MiB | 178 |
| 5120 | 9.20 ms | 9.81 ms | 13.5 ms | 13.2 MiB | 109 |
| 10240 | 16.7 ms | 19.5 ms | 24.3 ms | 24.5 MiB | 60 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.09, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 37.5 µs | 50.6 µs | 39.1 µs | 54.2 KiB | 26,656 |
| 40 | 68.0 µs | 72.5 µs | 265 µs | 107.0 KiB | 14,707 |
| 80 | 146 µs | 160 µs | 536 µs | 217.3 KiB | 6,830 |
| 160 | 295 µs | 333 µs | 1.00 ms | 451.7 KiB | 3,388 |
| 320 | 550 µs | 633 µs | 1.85 ms | 970.6 KiB | 1,817 |
| 640 | 1.27 ms | 1.39 ms | 4.75 ms | 2.2 MiB | 789 |
| 1280 | 4.98 ms | 5.55 ms | 11.6 ms | 4.9 MiB | 201 |
| 2560 | 7.74 ms | 8.77 ms | 18.5 ms | 8.3 MiB | 129 |
| 5120 | 16.6 ms | 23.2 ms | 40.4 ms | 15.1 MiB | 60 |
| 10240 | 30.6 ms | 39.4 ms | 74.0 ms | 28.1 MiB | 33 |

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

**Measured: O(n log n)** (exponent 1.30, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 21.6 µs | 33.3 µs | 22.1 µs | 30.5 KiB | 46,260 |
| 40 | 29.1 µs | 35.9 µs | 102 µs | 55.1 KiB | 34,341 |
| 80 | 54.4 µs | 58.7 µs | 195 µs | 104.6 KiB | 18,373 |
| 160 | 96.4 µs | 126 µs | 323 µs | 207.3 KiB | 10,374 |
| 320 | 164 µs | 243 µs | 405 µs | 391.3 KiB | 6,112 |
| 640 | 181 µs | 195 µs | 548 µs | 612.2 KiB | 5,525 |
| 1280 | 767 µs | 821 µs | 1.80 ms | 1.3 MiB | 1,304 |
| 2560 | 1.70 ms | 1.89 ms | 4.24 ms | 2.7 MiB | 588 |
| 5120 | 3.54 ms | 3.71 ms | 7.15 ms | 5.5 MiB | 283 |
| 10240 | 7.51 ms | 15.6 ms | 13.4 ms | 10.8 MiB | 133 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent 0.00, 10 sizes): ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 196 µs | 222 µs | 645 µs | 616.5 KiB | 5,111 |
| 40 | 182 µs | 195 µs | 542 µs | 628.2 KiB | 5,500 |
| 80 | 197 µs | 230 µs | 650 µs | 625.9 KiB | 5,073 |
| 160 | 197 µs | 228 µs | 560 µs | 661.3 KiB | 5,066 |
| 320 | 224 µs | 246 µs | 678 µs | 722.7 KiB | 4,471 |
| 640 | 249 µs | 273 µs | 701 µs | 826.6 KiB | 4,015 |
| 1280 | 249 µs | 274 µs | 697 µs | 826.6 KiB | 4,010 |
| 2560 | 250 µs | 270 µs | 704 µs | 826.6 KiB | 4,005 |
| 5120 | 264 µs | 286 µs | 866 µs | 829.2 KiB | 3,788 |
| 10240 | 246 µs | 261 µs | 699 µs | 826.6 KiB | 4,061 |

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

**Measured: O(n)** (exponent 1.08, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 133 µs | 141 µs | 445 µs | 45.5 KiB | 7,523 |
| 40 | 230 µs | 261 µs | 636 µs | 109.0 KiB | 4,341 |
| 80 | 511 µs | 533 µs | 1.33 ms | 178.6 KiB | 1,955 |
| 160 | 1.00 ms | 1.03 ms | 2.65 ms | 357.3 KiB | 998 |
| 320 | 1.80 ms | 2.12 ms | 3.70 ms | 712.3 KiB | 555 |
| 640 | 3.34 ms | 3.44 ms | 5.36 ms | 1.4 MiB | 299 |
| 1280 | 6.82 ms | 7.04 ms | 9.06 ms | 2.8 MiB | 147 |
| 2560 | 14.0 ms | 15.3 ms | 16.7 ms | 5.7 MiB | 72 |
| 5120 | 29.7 ms | 30.5 ms | 33.6 ms | 11.3 MiB | 34 |
| 10240 | 67.4 ms | 68.0 ms | 71.6 ms | 22.7 MiB | 15 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.07, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.54 ms | 1.65 ms | 3.45 ms | 599.8 KiB | 651 |
| 40 | 2.73 ms | 2.90 ms | 4.68 ms | 1.2 MiB | 367 |
| 80 | 5.26 ms | 5.39 ms | 7.37 ms | 2.3 MiB | 190 |
| 160 | 10.3 ms | 10.6 ms | 12.7 ms | 4.6 MiB | 97 |
| 320 | 21.7 ms | 22.7 ms | 24.7 ms | 9.3 MiB | 46 |
| 640 | 51.0 ms | 55.6 ms | 54.9 ms | 18.5 MiB | 20 |
| 1280 | 124 ms | 127 ms | 127 ms | 37.0 MiB | 8 |
| 2560 | 258 ms | 268 ms | 259 ms | 73.9 MiB | 4 |
| 5120 | 490 ms | 512 ms | 514 ms | 147.7 MiB | 2 |
| 10240 | 1.05 s | 1.13 s | 1.09 s | 295.3 MiB | 1 |

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

**Measured: O(n)** (exponent 1.03, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 63.8 µs | 98.6 µs | 66.2 µs | 97.9 KiB | 15,668 |
| 40 | 92.6 µs | 112 µs | 303 µs | 178.9 KiB | 10,805 |
| 80 | 164 µs | 183 µs | 533 µs | 322.2 KiB | 6,101 |
| 160 | 294 µs | 321 µs | 797 µs | 637.7 KiB | 3,397 |
| 320 | 557 µs | 596 µs | 1.32 ms | 1.2 MiB | 1,794 |
| 640 | 1.13 ms | 1.33 ms | 2.74 ms | 2.5 MiB | 885 |
| 1280 | 2.37 ms | 3.06 ms | 3.91 ms | 4.9 MiB | 421 |
| 2560 | 4.52 ms | 4.71 ms | 6.39 ms | 9.9 MiB | 221 |
| 5120 | 9.60 ms | 9.84 ms | 12.1 ms | 19.8 MiB | 104 |
| 10240 | 20.2 ms | 21.4 ms | 24.3 ms | 39.6 MiB | 49 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.26, 10 sizes): 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 61.5 µs | 72.9 µs | 229 µs | 281.2 KiB | 16,270 |
| 40 | 120 µs | 186 µs | 353 µs | 538.9 KiB | 8,332 |
| 80 | 244 µs | 269 µs | 657 µs | 1.0 MiB | 4,096 |
| 160 | 525 µs | 602 µs | 1.38 ms | 2.1 MiB | 1,905 |
| 320 | 1.19 ms | 1.41 ms | 2.99 ms | 4.2 MiB | 840 |
| 640 | 2.26 ms | 2.43 ms | 4.21 ms | 8.3 MiB | 443 |
| 1280 | 4.20 ms | 4.62 ms | 6.36 ms | 16.7 MiB | 238 |
| 2560 | 9.08 ms | 9.46 ms | 12.0 ms | 33.3 MiB | 110 |
| 5120 | 27.1 ms | 29.2 ms | 32.2 ms | 52.0 MiB | 37 |
| 10240 | 69.3 ms | 71.0 ms | 83.4 ms | 103.7 MiB | 14 |

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

**Measured: O(n)** (exponent 1.05, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 67.3 µs | 86.7 µs | 71.0 µs | 57.3 KiB | 14,848 |
| 40 | 107 µs | 129 µs | 110 µs | 113.3 KiB | 9,368 |
| 80 | 188 µs | 205 µs | 192 µs | 225.5 KiB | 5,316 |
| 160 | 360 µs | 390 µs | 365 µs | 450.0 KiB | 2,777 |
| 320 | 645 µs | 727 µs | 2.12 ms | 898.7 KiB | 1,549 |
| 640 | 1.16 ms | 1.33 ms | 2.64 ms | 1.8 MiB | 862 |
| 1280 | 2.22 ms | 2.40 ms | 3.40 ms | 3.5 MiB | 450 |
| 2560 | 4.74 ms | 4.85 ms | 5.05 ms | 6.9 MiB | 211 |
| 5120 | 9.93 ms | 10.4 ms | 10.2 ms | 13.8 MiB | 101 |
| 10240 | 21.2 ms | 21.5 ms | 21.5 ms | 27.7 MiB | 47 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.01, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 62.9 µs | 76.7 µs | 66.0 µs | 56.4 KiB | 15,896 |
| 40 | 110 µs | 121 µs | 114 µs | 111.7 KiB | 9,094 |
| 80 | 202 µs | 219 µs | 206 µs | 222.3 KiB | 4,939 |
| 160 | 402 µs | 433 µs | 1.35 ms | 443.6 KiB | 2,486 |
| 320 | 715 µs | 890 µs | 2.08 ms | 886.1 KiB | 1,398 |
| 640 | 1.33 ms | 1.45 ms | 3.10 ms | 1.7 MiB | 755 |
| 1280 | 2.62 ms | 2.88 ms | 5.14 ms | 3.5 MiB | 381 |
| 2560 | 4.91 ms | 5.05 ms | 7.40 ms | 6.9 MiB | 203 |
| 5120 | 10.3 ms | 10.6 ms | 14.4 ms | 13.8 MiB | 97 |
| 10240 | 21.9 ms | 23.6 ms | 28.2 ms | 27.7 MiB | 46 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls. So where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time). Every moment of the operation then belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly. They are not measured against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 453 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 196 µs | 196 µs | 43% |
| `run-policies` | 1 | 87.2 µs | 87.2 µs | 19% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 170 µs | 38% |

**At 10240 checks** (whole operation: 48.2 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 25.8 ms | 25.8 ms | 54% |
| `run-policies` | 1 | 18.9 ms | 18.9 ms | 39% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 3.42 ms | 7.1% |

## Cost model

Estimates use two bracketing price shapes. **Low** is CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time). **High** is duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-13T08:54:08.610Z` → `2026-11-13T08:55:25.946Z` (77 s), ci: CI (run 43395219911)
- Machine: Intel(R) Xeon(R) 6973P-C, 4 logical core(s) (2 physical), 15982 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `7df3cfb8deed41483220ea7dc82f40281ae3c479` on `docs/v1-claims-evidence`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks: One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They show how _this_ package's cost changes between runs on comparable hardware, and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

