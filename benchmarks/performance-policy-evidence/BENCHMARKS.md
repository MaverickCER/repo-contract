# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **148 µs** per operation compared with a bare-minimum baseline (**134% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.98). At list prices that is on the order of **~$0.0001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 148 µs | 27.0 ms |
| Added latency, relative to baseline | 134% | 212% |
| Added CPU time per operation | 345 µs | 31.1 ms |
| Added memory per operation (heap delta) | 345.3 KiB | 44.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.0001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 6,743 ops/s | 37 ops/s |

## 1. End-to-end: the package's total impact

Shows what a contract run pays, after the checks have finished, for turning their raw results into structured evidence and a verdict, compared with the bare minimum of parsing each check's output and counting its findings. Neither side runs a process; this is pure CPU on data already in memory, paid once per contract run.

- **Baseline (no package):** Parse each check's JSON output and count its findings by hand -- the least anyone would do to know what the checks said.
- **With the package:** `buildEvidence` assembles the run's evidence record and `runPolicies` evaluates every check's policy against it, with dependency lookups.

Both sides use empty or minimal functions on purpose, so the difference is the package's own cost -- not the cost of the work an application would plug into it. Real applications add their own work on top; this is the floor the package imposes.

**Variables that could change this result**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| checks evaluated | swept | The tier axis: how many check results are turned into evidence and judged. |
| output per check | fixed at "about 500 bytes" | Output volume is measured as a variant in each function below. |
| policy work | fixed at "reads its own parsed output and its dependencies' evidence" | A real, non-trivial policy; an application's own policy logic adds its own cost on top. |
| dependency lookups | fixed at "about 15% of checks depend on an earlier check" | Exercises the per-check dependency-evidence gathering loop. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

The baseline is an empty or minimal function, so it costs almost nothing and the _relative_ overhead can look enormous (shown as a multiple of the baseline). Read the absolute columns -- time, CPU and dollars added -- they are what a bill and a latency budget are made of.

| checks | Baseline | With package | Added | Added vs baseline | Added CPU | Est. $ / 1M ops |
| --- | --- | --- | --- | --- | --- | --- |
| 20 | 32.5 µs | 93.0 µs | 60.6 µs | 186% | 249 µs | $0.00013 – $0.0028 |
| 40 | 57.3 µs | 135 µs | 77.6 µs | 136% | 200 µs | $0.00016 – $0.0023 |
| 80 | 111 µs | 259 µs | 148 µs | 134% | 345 µs | $0.00031 – $0.0039 |
| 160 | 216 µs | 497 µs | 281 µs | 130% | 556 µs | $0.00059 – $0.0063 |
| 320 | 414 µs | 1.01 ms | 598 µs | 145% | 1.29 ms | $0.0012 – $0.014 |
| 640 | 813 µs | 2.14 ms | 1.33 ms | 164% | 2.19 ms | $0.0028 – $0.025 |
| 1280 | 1.64 ms | 8.01 ms | 6.37 ms | 388% | 7.04 ms | $0.013 – $0.079 |
| 2560 | 3.17 ms | 11.9 ms | 8.75 ms | 276% | 9.25 ms | $0.018 – $0.104 |
| 5120 | 6.23 ms | 20.9 ms | 14.6 ms | 235% | 16.5 ms | $0.031 – $0.186 |
| 10240 | 12.8 ms | 39.8 ms | 27.0 ms | 212% | 31.1 ms | $0.056 – $0.350 |

**How the total grows:** O(n) (linear), exponent 0.98 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 156 µs | 20.4 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 1.73 ms | 246 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 66.8 µs | 16.4 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 86.9 µs | 24.7 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 62.7 µs | 16.7 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 96.1 µs | 25.3 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n log n) | ✅ matches | 36.5 µs | 6.08 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 146 µs | 198 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 411 µs | 52.1 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 3.91 ms | 832 ms |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 143 µs | 19.0 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 185 µs | 39.5 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 183 µs | 15.8 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 178 µs | 16.5 ms |

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

**Measured: O(n)** (exponent 0.96, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 47.7 µs | 55.8 µs | 151 µs | 52.8 KiB | 20,984 |
| 40 | 82.0 µs | 85.8 µs | 199 µs | 104.3 KiB | 12,192 |
| 80 | 156 µs | 166 µs | 339 µs | 211.1 KiB | 6,415 |
| 160 | 306 µs | 356 µs | 649 µs | 436.0 KiB | 3,264 |
| 320 | 597 µs | 698 µs | 1.12 ms | 938.5 KiB | 1,675 |
| 640 | 1.22 ms | 1.30 ms | 2.30 ms | 2.1 MiB | 823 |
| 1280 | 4.11 ms | 4.29 ms | 5.29 ms | 4.7 MiB | 243 |
| 2560 | 6.22 ms | 6.54 ms | 7.87 ms | 8.0 MiB | 161 |
| 5120 | 10.9 ms | 11.5 ms | 12.4 ms | 14.5 MiB | 91 |
| 10240 | 20.4 ms | 21.3 ms | 23.2 ms | 27.6 MiB | 49 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.08, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 460 µs | 470 µs | 987 µs | 294.9 KiB | 2,174 |
| 40 | 851 µs | 886 µs | 1.39 ms | 585.9 KiB | 1,174 |
| 80 | 1.73 ms | 2.17 ms | 2.92 ms | 1.1 MiB | 579 |
| 160 | 3.29 ms | 3.46 ms | 4.66 ms | 2.3 MiB | 304 |
| 320 | 6.45 ms | 6.54 ms | 8.25 ms | 4.7 MiB | 155 |
| 640 | 12.4 ms | 12.9 ms | 15.3 ms | 9.8 MiB | 80 |
| 1280 | 27.5 ms | 30.3 ms | 32.1 ms | 20.1 MiB | 36 |
| 2560 | 51.6 ms | 57.2 ms | 59.1 ms | 38.7 MiB | 19 |
| 5120 | 125 ms | 128 ms | 191 ms | 73.5 MiB | 8 |
| 10240 | 246 ms | 250 ms | 381 ms | 145.2 MiB | 4 |

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

**Measured: O(n)** (exponent 1.10, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 28.0 µs | 35.2 µs | 29.0 µs | 47.1 KiB | 35,722 |
| 40 | 40.5 µs | 48.4 µs | 142 µs | 92.5 KiB | 24,668 |
| 80 | 66.8 µs | 90.3 µs | 192 µs | 188.2 KiB | 14,976 |
| 160 | 134 µs | 189 µs | 358 µs | 393.0 KiB | 7,436 |
| 320 | 273 µs | 408 µs | 667 µs | 852.4 KiB | 3,663 |
| 640 | 585 µs | 789 µs | 1.26 ms | 1.9 MiB | 1,708 |
| 1280 | 2.97 ms | 3.21 ms | 4.68 ms | 4.4 MiB | 336 |
| 2560 | 4.50 ms | 4.94 ms | 6.59 ms | 7.3 MiB | 222 |
| 5120 | 7.58 ms | 8.08 ms | 10.8 ms | 13.2 MiB | 132 |
| 10240 | 16.4 ms | 17.2 ms | 22.7 ms | 24.6 MiB | 61 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.06, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 28.9 µs | 34.2 µs | 29.8 µs | 54.1 KiB | 34,659 |
| 40 | 47.0 µs | 57.0 µs | 153 µs | 106.9 KiB | 21,277 |
| 80 | 86.9 µs | 115 µs | 240 µs | 217.0 KiB | 11,503 |
| 160 | 186 µs | 235 µs | 528 µs | 451.1 KiB | 5,381 |
| 320 | 422 µs | 531 µs | 1.28 ms | 970.6 KiB | 2,368 |
| 640 | 1.07 ms | 1.35 ms | 3.47 ms | 2.2 MiB | 931 |
| 1280 | 4.24 ms | 4.57 ms | 8.53 ms | 4.9 MiB | 236 |
| 2560 | 6.87 ms | 7.35 ms | 14.0 ms | 8.3 MiB | 146 |
| 5120 | 12.2 ms | 13.0 ms | 24.3 ms | 15.1 MiB | 82 |
| 10240 | 24.7 ms | 24.9 ms | 48.8 ms | 28.2 MiB | 40 |

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

**Measured: O(n)** (exponent 1.09, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 23.7 µs | 27.2 µs | 24.7 µs | 47.0 KiB | 42,156 |
| 40 | 36.4 µs | 46.5 µs | 111 µs | 92.5 KiB | 27,494 |
| 80 | 62.7 µs | 86.8 µs | 166 µs | 186.5 KiB | 15,961 |
| 160 | 138 µs | 191 µs | 364 µs | 393.2 KiB | 7,239 |
| 320 | 285 µs | 393 µs | 720 µs | 849.7 KiB | 3,505 |
| 640 | 606 µs | 834 µs | 1.26 ms | 1.9 MiB | 1,649 |
| 1280 | 3.16 ms | 3.67 ms | 4.74 ms | 4.4 MiB | 316 |
| 2560 | 4.51 ms | 4.79 ms | 6.82 ms | 7.3 MiB | 222 |
| 5120 | 7.86 ms | 8.63 ms | 11.0 ms | 13.2 MiB | 127 |
| 10240 | 16.7 ms | 17.3 ms | 23.3 ms | 24.4 MiB | 60 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.04, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 28.0 µs | 33.9 µs | 30.6 µs | 54.2 KiB | 35,663 |
| 40 | 43.3 µs | 56.9 µs | 122 µs | 106.9 KiB | 23,120 |
| 80 | 96.1 µs | 119 µs | 273 µs | 217.1 KiB | 10,407 |
| 160 | 203 µs | 264 µs | 585 µs | 451.1 KiB | 4,937 |
| 320 | 441 µs | 537 µs | 1.31 ms | 970.6 KiB | 2,267 |
| 640 | 1.14 ms | 1.39 ms | 3.64 ms | 2.2 MiB | 878 |
| 1280 | 4.76 ms | 5.10 ms | 9.66 ms | 4.9 MiB | 210 |
| 2560 | 6.94 ms | 7.62 ms | 14.1 ms | 8.3 MiB | 144 |
| 5120 | 12.6 ms | 13.4 ms | 25.4 ms | 15.1 MiB | 79 |
| 10240 | 25.3 ms | 25.7 ms | 48.7 ms | 28.1 MiB | 39 |

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

**Measured: O(n log n)** (exponent 1.32, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 18.5 µs | 27.6 µs | 23.3 µs | 30.5 KiB | 53,923 |
| 40 | 20.4 µs | 33.8 µs | 60.7 µs | 55.1 KiB | 49,136 |
| 80 | 36.5 µs | 49.4 µs | 108 µs | 104.6 KiB | 27,397 |
| 160 | 67.4 µs | 90.0 µs | 184 µs | 206.7 KiB | 14,827 |
| 320 | 79.3 µs | 184 µs | 272 µs | 298.5 KiB | 12,614 |
| 640 | 137 µs | 151 µs | 341 µs | 610.7 KiB | 7,301 |
| 1280 | 594 µs | 619 µs | 1.27 ms | 1.3 MiB | 1,684 |
| 2560 | 1.35 ms | 1.47 ms | 3.07 ms | 2.7 MiB | 743 |
| 5120 | 2.86 ms | 3.02 ms | 5.46 ms | 5.5 MiB | 350 |
| 10240 | 6.08 ms | 6.38 ms | 10.7 ms | 10.8 MiB | 164 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent 0.01, 10 sizes) -- ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 135 µs | 146 µs | 335 µs | 612.9 KiB | 7,427 |
| 40 | 138 µs | 146 µs | 336 µs | 625.4 KiB | 7,232 |
| 80 | 146 µs | 160 µs | 387 µs | 628.3 KiB | 6,861 |
| 160 | 152 µs | 169 µs | 387 µs | 661.3 KiB | 6,599 |
| 320 | 174 µs | 202 µs | 473 µs | 722.7 KiB | 5,746 |
| 640 | 194 µs | 219 µs | 486 µs | 826.6 KiB | 5,142 |
| 1280 | 193 µs | 221 µs | 481 µs | 826.6 KiB | 5,183 |
| 2560 | 193 µs | 212 µs | 482 µs | 826.6 KiB | 5,172 |
| 5120 | 195 µs | 215 µs | 483 µs | 826.6 KiB | 5,125 |
| 10240 | 198 µs | 231 µs | 499 µs | 826.6 KiB | 5,041 |

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

**Measured: O(n)** (exponent 1.08, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 101 µs | 107 µs | 305 µs | 45.5 KiB | 9,942 |
| 40 | 174 µs | 181 µs | 440 µs | 109.0 KiB | 5,755 |
| 80 | 411 µs | 428 µs | 961 µs | 178.6 KiB | 2,432 |
| 160 | 719 µs | 784 µs | 1.36 ms | 355.8 KiB | 1,391 |
| 320 | 1.44 ms | 1.56 ms | 2.77 ms | 712.3 KiB | 697 |
| 640 | 2.53 ms | 2.66 ms | 3.89 ms | 1.4 MiB | 396 |
| 1280 | 5.07 ms | 5.35 ms | 6.75 ms | 2.8 MiB | 197 |
| 2560 | 10.2 ms | 10.5 ms | 11.7 ms | 5.7 MiB | 98 |
| 5120 | 20.6 ms | 21.0 ms | 21.1 ms | 11.3 MiB | 49 |
| 10240 | 52.1 ms | 52.5 ms | 52.6 ms | 22.7 MiB | 19 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.12, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.20 ms | 1.34 ms | 2.48 ms | 599.8 KiB | 833 |
| 40 | 2.04 ms | 2.31 ms | 3.35 ms | 1.2 MiB | 490 |
| 80 | 3.91 ms | 4.09 ms | 5.39 ms | 2.3 MiB | 256 |
| 160 | 7.34 ms | 7.47 ms | 8.62 ms | 4.6 MiB | 136 |
| 320 | 14.7 ms | 18.1 ms | 15.2 ms | 9.3 MiB | 68 |
| 640 | 36.3 ms | 37.0 ms | 36.8 ms | 18.5 MiB | 28 |
| 1280 | 89.8 ms | 93.9 ms | 90.2 ms | 37.0 MiB | 11 |
| 2560 | 191 ms | 191 ms | 191 ms | 73.9 MiB | 5 |
| 5120 | 408 ms | 413 ms | 420 ms | 147.7 MiB | 2 |
| 10240 | 832 ms | 864 ms | 856 ms | 295.3 MiB | 1 |

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

**Measured: O(n)** (exponent 1.05, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 60.2 µs | 109 µs | 190 µs | 97.9 KiB | 16,599 |
| 40 | 112 µs | 284 µs | 433 µs | 178.9 KiB | 8,966 |
| 80 | 143 µs | 182 µs | 343 µs | 322.8 KiB | 6,987 |
| 160 | 269 µs | 323 µs | 611 µs | 637.6 KiB | 3,720 |
| 320 | 508 µs | 579 µs | 1.02 ms | 1.2 MiB | 1,969 |
| 640 | 1.03 ms | 1.13 ms | 2.08 ms | 2.5 MiB | 975 |
| 1280 | 1.91 ms | 2.01 ms | 3.00 ms | 4.9 MiB | 523 |
| 2560 | 3.73 ms | 3.92 ms | 4.99 ms | 9.9 MiB | 268 |
| 5120 | 8.08 ms | 8.49 ms | 10.1 ms | 19.8 MiB | 124 |
| 10240 | 19.0 ms | 26.6 ms | 23.1 ms | 39.6 MiB | 53 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.17, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 51.2 µs | 56.2 µs | 163 µs | 281.2 KiB | 19,523 |
| 40 | 90.3 µs | 106 µs | 216 µs | 538.7 KiB | 11,075 |
| 80 | 185 µs | 199 µs | 443 µs | 1.0 MiB | 5,411 |
| 160 | 373 µs | 417 µs | 889 µs | 2.1 MiB | 2,684 |
| 320 | 725 µs | 798 µs | 1.26 ms | 4.2 MiB | 1,380 |
| 640 | 1.56 ms | 1.70 ms | 2.71 ms | 8.3 MiB | 640 |
| 1280 | 3.25 ms | 3.38 ms | 4.63 ms | 16.7 MiB | 307 |
| 2560 | 6.35 ms | 6.61 ms | 8.19 ms | 33.3 MiB | 157 |
| 5120 | 16.7 ms | 17.6 ms | 19.7 ms | 52.0 MiB | 60 |
| 10240 | 39.5 ms | 40.1 ms | 46.8 ms | 103.7 MiB | 25 |

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

**Measured: O(n)** (exponent 1.02, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 57.3 µs | 73.8 µs | 60.0 µs | 57.3 KiB | 17,441 |
| 40 | 97.7 µs | 114 µs | 100 µs | 113.3 KiB | 10,236 |
| 80 | 183 µs | 201 µs | 185 µs | 225.5 KiB | 5,479 |
| 160 | 321 µs | 377 µs | 1.17 ms | 450.0 KiB | 3,118 |
| 320 | 545 µs | 615 µs | 1.47 ms | 898.7 KiB | 1,836 |
| 640 | 979 µs | 1.04 ms | 1.98 ms | 1.8 MiB | 1,021 |
| 1280 | 1.75 ms | 1.86 ms | 2.20 ms | 3.5 MiB | 573 |
| 2560 | 3.74 ms | 3.95 ms | 3.88 ms | 6.9 MiB | 267 |
| 5120 | 7.66 ms | 7.93 ms | 7.90 ms | 13.8 MiB | 131 |
| 10240 | 15.8 ms | 16.1 ms | 16.3 ms | 27.7 MiB | 63 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 50.7 µs | 62.4 µs | 53.0 µs | 56.4 KiB | 19,718 |
| 40 | 92.5 µs | 104 µs | 95.0 µs | 111.7 KiB | 10,805 |
| 80 | 178 µs | 192 µs | 181 µs | 222.3 KiB | 5,624 |
| 160 | 302 µs | 332 µs | 1.10 ms | 443.6 KiB | 3,315 |
| 320 | 534 µs | 581 µs | 1.45 ms | 886.1 KiB | 1,873 |
| 640 | 1.00 ms | 1.11 ms | 2.19 ms | 1.7 MiB | 1,000 |
| 1280 | 1.84 ms | 2.06 ms | 3.12 ms | 3.5 MiB | 543 |
| 2560 | 3.50 ms | 3.58 ms | 4.40 ms | 6.9 MiB | 286 |
| 5120 | 7.34 ms | 7.40 ms | 9.44 ms | 13.8 MiB | 136 |
| 10240 | 16.5 ms | 17.5 ms | 20.8 ms | 27.7 MiB | 61 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 259 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 156 µs | 156 µs | 60% |
| `run-policies` | 1 | 66.8 µs | 66.8 µs | 26% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 36.4 µs | 14% |

**At 10240 checks** (whole operation: 39.8 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 20.4 ms | 20.4 ms | 51% |
| `run-policies` | 1 | 16.4 ms | 16.4 ms | 41% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 3.01 ms | 7.6% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-02T18:42:09.277Z` → `2026-11-02T18:43:13.813Z` (65 s), ci: CI (run 41501094531)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15984 MB RAM, linux/x64, Node v24.22.1, GitHub Actions
- Git: `2067bcb6637d6c1cde36be8ecd0f548588aacc6c` on `changeset-release/main`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

