# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **287 µs** per operation compared with a bare-minimum baseline (**133% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.99). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 287 µs | 45.1 ms |
| Added latency, relative to baseline | 133% | 205% |
| Added CPU time per operation | 649 µs | 51.0 ms |
| Added memory per operation (heap delta) | 345.9 KiB | 44.1 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,482 ops/s | 22 ops/s |

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
| 20 | 61.7 µs | 164 µs | 103 µs | 166% | 325 µs | $0.00021 – $0.0037 |
| 40 | 102 µs | 276 µs | 175 µs | 172% | 523 µs | $0.00036 – $0.0059 |
| 80 | 216 µs | 503 µs | 287 µs | 133% | 649 µs | $0.0006 – $0.0073 |
| 160 | 432 µs | 1.02 ms | 584 µs | 135% | 1.35 ms | $0.0012 – $0.015 |
| 320 | 856 µs | 1.81 ms | 954 µs | 111% | 929 µs | $0.002 – $0.010 |
| 640 | 1.54 ms | 3.55 ms | 2.01 ms | 130% | 2.50 ms | $0.0042 – $0.028 |
| 1280 | 2.89 ms | 13.1 ms | 10.2 ms | 353% | 10.9 ms | $0.021 – $0.123 |
| 2560 | 5.57 ms | 19.8 ms | 14.3 ms | 256% | 14.8 ms | $0.030 – $0.167 |
| 5120 | 11.1 ms | 35.9 ms | 24.8 ms | 223% | 27.6 ms | $0.052 – $0.310 |
| 10240 | 22.0 ms | 67.2 ms | 45.1 ms | 205% | 51.0 ms | $0.094 – $0.573 |

**How the total grows:** O(n) (linear), exponent 0.99 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 314 µs | 38.2 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 2.97 ms | 408 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 150 µs | 25.1 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 175 µs | 35.1 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 156 µs | 24.7 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 198 µs | 34.8 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n log n) | ✅ matches | 77.5 µs | 9.28 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 286 µs | 415 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 823 µs | 97.9 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 8.11 ms | 1.51 s |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 271 µs | 26.2 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 322 µs | 59.1 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 352 µs | 27.3 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 348 µs | 27.3 ms |

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

**Measured: O(n)** (exponent 0.98, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 94.3 µs | 97.8 µs | 301 µs | 52.9 KiB | 10,602 |
| 40 | 164 µs | 171 µs | 459 µs | 104.5 KiB | 6,104 |
| 80 | 314 µs | 325 µs | 798 µs | 211.4 KiB | 3,184 |
| 160 | 592 µs | 609 µs | 1.32 ms | 436.2 KiB | 1,689 |
| 320 | 1.18 ms | 1.22 ms | 2.71 ms | 938.9 KiB | 844 |
| 640 | 2.19 ms | 2.34 ms | 3.75 ms | 2.1 MiB | 458 |
| 1280 | 7.23 ms | 7.61 ms | 8.84 ms | 4.7 MiB | 138 |
| 2560 | 11.2 ms | 11.8 ms | 13.2 ms | 8.0 MiB | 89 |
| 5120 | 20.5 ms | 21.8 ms | 23.1 ms | 14.5 MiB | 49 |
| 10240 | 38.2 ms | 40.6 ms | 41.9 ms | 27.6 MiB | 26 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.05, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 802 µs | 826 µs | 1.56 ms | 294.9 KiB | 1,247 |
| 40 | 1.61 ms | 1.63 ms | 3.18 ms | 587.0 KiB | 623 |
| 80 | 2.97 ms | 3.53 ms | 4.66 ms | 1.1 MiB | 337 |
| 160 | 5.72 ms | 5.94 ms | 7.69 ms | 2.3 MiB | 175 |
| 320 | 11.2 ms | 11.5 ms | 13.7 ms | 4.7 MiB | 89 |
| 640 | 22.1 ms | 22.2 ms | 25.5 ms | 9.8 MiB | 45 |
| 1280 | 47.2 ms | 48.8 ms | 52.8 ms | 20.1 MiB | 21 |
| 2560 | 90.8 ms | 98.6 ms | 101 ms | 38.7 MiB | 11 |
| 5120 | 206 ms | 207 ms | 303 ms | 73.5 MiB | 5 |
| 10240 | 408 ms | 411 ms | 607 ms | 145.3 MiB | 2 |

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

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 54.4 µs | 70.0 µs | 57.3 µs | 47.2 KiB | 18,387 |
| 40 | 75.7 µs | 99.2 µs | 238 µs | 92.5 KiB | 13,215 |
| 80 | 150 µs | 197 µs | 459 µs | 188.5 KiB | 6,683 |
| 160 | 287 µs | 400 µs | 898 µs | 393.8 KiB | 3,488 |
| 320 | 573 µs | 780 µs | 1.51 ms | 855.1 KiB | 1,745 |
| 640 | 1.20 ms | 1.55 ms | 2.92 ms | 1.9 MiB | 832 |
| 1280 | 4.95 ms | 5.39 ms | 7.12 ms | 4.4 MiB | 202 |
| 2560 | 7.07 ms | 7.44 ms | 10.2 ms | 7.3 MiB | 141 |
| 5120 | 12.1 ms | 13.0 ms | 16.6 ms | 13.2 MiB | 82 |
| 10240 | 25.1 ms | 26.3 ms | 33.3 ms | 24.8 MiB | 40 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.03, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 54.0 µs | 58.7 µs | 215 µs | 54.1 KiB | 18,529 |
| 40 | 81.3 µs | 116 µs | 234 µs | 106.8 KiB | 12,293 |
| 80 | 175 µs | 224 µs | 562 µs | 217.3 KiB | 5,728 |
| 160 | 348 µs | 474 µs | 1.08 ms | 451.7 KiB | 2,876 |
| 320 | 895 µs | 1.04 ms | 3.21 ms | 975.5 KiB | 1,117 |
| 640 | 1.64 ms | 2.01 ms | 4.97 ms | 2.2 MiB | 610 |
| 1280 | 6.59 ms | 6.79 ms | 12.3 ms | 4.9 MiB | 152 |
| 2560 | 10.0 ms | 10.6 ms | 19.8 ms | 8.3 MiB | 100 |
| 5120 | 17.8 ms | 18.3 ms | 35.2 ms | 15.1 MiB | 56 |
| 10240 | 35.1 ms | 36.5 ms | 69.0 ms | 28.1 MiB | 28 |

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

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 47.1 µs | 53.8 µs | 101 µs | 47.0 KiB | 21,216 |
| 40 | 77.1 µs | 101 µs | 249 µs | 92.6 KiB | 12,963 |
| 80 | 156 µs | 200 µs | 489 µs | 188.5 KiB | 6,401 |
| 160 | 286 µs | 426 µs | 862 µs | 393.9 KiB | 3,493 |
| 320 | 544 µs | 741 µs | 1.38 ms | 854.1 KiB | 1,839 |
| 640 | 1.17 ms | 1.51 ms | 2.86 ms | 1.9 MiB | 854 |
| 1280 | 5.01 ms | 5.39 ms | 7.43 ms | 4.4 MiB | 200 |
| 2560 | 7.05 ms | 7.39 ms | 9.99 ms | 7.3 MiB | 142 |
| 5120 | 12.3 ms | 12.8 ms | 16.7 ms | 13.2 MiB | 82 |
| 10240 | 24.7 ms | 25.6 ms | 32.4 ms | 24.6 MiB | 40 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.02, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 57.5 µs | 61.9 µs | 170 µs | 54.2 KiB | 17,403 |
| 40 | 91.0 µs | 118 µs | 291 µs | 107.0 KiB | 10,994 |
| 80 | 198 µs | 234 µs | 650 µs | 217.5 KiB | 5,055 |
| 160 | 346 µs | 463 µs | 1.06 ms | 445.4 KiB | 2,893 |
| 320 | 686 µs | 902 µs | 1.96 ms | 955.7 KiB | 1,457 |
| 640 | 1.66 ms | 2.09 ms | 4.95 ms | 2.2 MiB | 604 |
| 1280 | 6.34 ms | 6.71 ms | 12.2 ms | 4.9 MiB | 158 |
| 2560 | 9.97 ms | 10.6 ms | 19.5 ms | 8.3 MiB | 100 |
| 5120 | 17.2 ms | 18.9 ms | 34.8 ms | 15.1 MiB | 58 |
| 10240 | 34.8 ms | 36.7 ms | 68.7 ms | 28.3 MiB | 29 |

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

**Measured: O(n log n)** (exponent 1.16, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 34.0 µs | 49.1 µs | 43.3 µs | 30.5 KiB | 29,411 |
| 40 | 43.1 µs | 56.6 µs | 134 µs | 55.2 KiB | 23,225 |
| 80 | 77.5 µs | 99.0 µs | 233 µs | 104.6 KiB | 12,899 |
| 160 | 142 µs | 201 µs | 403 µs | 207.7 KiB | 7,024 |
| 320 | 321 µs | 448 µs | 1.13 ms | 402.6 KiB | 3,117 |
| 640 | 335 µs | 780 µs | 1.23 ms | 604.7 KiB | 2,986 |
| 1280 | 1.15 ms | 1.26 ms | 3.15 ms | 1.3 MiB | 867 |
| 2560 | 2.24 ms | 2.47 ms | 4.90 ms | 2.7 MiB | 447 |
| 5120 | 4.55 ms | 4.65 ms | 8.50 ms | 5.5 MiB | 220 |
| 10240 | 9.28 ms | 9.38 ms | 15.9 ms | 10.8 MiB | 108 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent -0.01, 10 sizes) -- ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 280 µs | 294 µs | 860 µs | 620.2 KiB | 3,572 |
| 40 | 279 µs | 299 µs | 855 µs | 620.3 KiB | 3,583 |
| 80 | 286 µs | 305 µs | 852 µs | 626.2 KiB | 3,500 |
| 160 | 299 µs | 324 µs | 879 µs | 667.5 KiB | 3,345 |
| 320 | 326 µs | 340 µs | 900 µs | 716.3 KiB | 3,066 |
| 640 | 423 µs | 440 µs | 1.29 ms | 834.3 KiB | 2,364 |
| 1280 | 419 µs | 478 µs | 1.28 ms | 834.3 KiB | 2,387 |
| 2560 | 420 µs | 443 µs | 1.29 ms | 834.3 KiB | 2,378 |
| 5120 | 420 µs | 471 µs | 1.28 ms | 834.3 KiB | 2,383 |
| 10240 | 415 µs | 473 µs | 1.26 ms | 834.3 KiB | 2,409 |

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

**Measured: O(n)** (exponent 1.05, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 205 µs | 217 µs | 574 µs | 45.6 KiB | 4,871 |
| 40 | 403 µs | 437 µs | 1.16 ms | 90.2 KiB | 2,480 |
| 80 | 823 µs | 865 µs | 1.60 ms | 178.6 KiB | 1,215 |
| 160 | 1.58 ms | 1.63 ms | 3.20 ms | 357.3 KiB | 634 |
| 320 | 2.81 ms | 2.95 ms | 4.72 ms | 712.3 KiB | 356 |
| 640 | 5.17 ms | 5.31 ms | 7.14 ms | 1.4 MiB | 194 |
| 1280 | 10.5 ms | 10.8 ms | 12.8 ms | 2.8 MiB | 95 |
| 2560 | 21.0 ms | 21.5 ms | 23.8 ms | 5.7 MiB | 48 |
| 5120 | 42.1 ms | 42.5 ms | 42.5 ms | 11.3 MiB | 24 |
| 10240 | 97.9 ms | 98.2 ms | 98.3 ms | 22.7 MiB | 10 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.11, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.44 ms | 2.56 ms | 4.28 ms | 599.8 KiB | 410 |
| 40 | 4.34 ms | 4.52 ms | 6.30 ms | 1.2 MiB | 231 |
| 80 | 8.11 ms | 8.21 ms | 10.0 ms | 2.3 MiB | 123 |
| 160 | 15.4 ms | 15.8 ms | 17.7 ms | 4.6 MiB | 65 |
| 320 | 30.1 ms | 30.2 ms | 30.5 ms | 9.3 MiB | 33 |
| 640 | 68.6 ms | 77.2 ms | 69.0 ms | 18.5 MiB | 15 |
| 1280 | 172 ms | 192 ms | 172 ms | 37.0 MiB | 6 |
| 2560 | 364 ms | 366 ms | 365 ms | 73.9 MiB | 3 |
| 5120 | 750 ms | 758 ms | 767 ms | 147.7 MiB | 1 |
| 10240 | 1.51 s | 1.53 s | 1.55 s | 295.3 MiB | 1 |

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

**Measured: O(n)** (exponent 0.98, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 98.5 µs | 138 µs | 333 µs | 98.0 KiB | 10,155 |
| 40 | 163 µs | 188 µs | 514 µs | 179.0 KiB | 6,117 |
| 80 | 271 µs | 321 µs | 738 µs | 323.4 KiB | 3,693 |
| 160 | 481 µs | 527 µs | 1.20 ms | 637.9 KiB | 2,078 |
| 320 | 867 µs | 913 µs | 1.61 ms | 1.2 MiB | 1,153 |
| 640 | 1.75 ms | 1.87 ms | 3.27 ms | 2.5 MiB | 571 |
| 1280 | 3.27 ms | 3.43 ms | 4.56 ms | 4.9 MiB | 306 |
| 2560 | 6.56 ms | 6.71 ms | 8.63 ms | 9.9 MiB | 152 |
| 5120 | 13.4 ms | 13.7 ms | 15.7 ms | 19.8 MiB | 75 |
| 10240 | 26.2 ms | 28.4 ms | 30.4 ms | 39.6 MiB | 38 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.17, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 88.2 µs | 97.0 µs | 267 µs | 281.1 KiB | 11,340 |
| 40 | 176 µs | 205 µs | 535 µs | 540.1 KiB | 5,668 |
| 80 | 322 µs | 343 µs | 792 µs | 1.0 MiB | 3,102 |
| 160 | 597 µs | 660 µs | 1.33 ms | 2.1 MiB | 1,675 |
| 320 | 1.26 ms | 1.32 ms | 2.74 ms | 4.2 MiB | 795 |
| 640 | 2.39 ms | 2.60 ms | 3.99 ms | 8.3 MiB | 418 |
| 1280 | 4.74 ms | 4.91 ms | 6.58 ms | 16.7 MiB | 211 |
| 2560 | 9.47 ms | 9.69 ms | 11.9 ms | 33.3 MiB | 106 |
| 5120 | 25.4 ms | 26.4 ms | 29.3 ms | 52.0 MiB | 39 |
| 10240 | 59.1 ms | 60.9 ms | 68.2 ms | 103.7 MiB | 17 |

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

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 105 µs | 132 µs | 108 µs | 57.4 KiB | 9,538 |
| 40 | 189 µs | 223 µs | 192 µs | 113.5 KiB | 5,305 |
| 80 | 352 µs | 406 µs | 456 µs | 225.7 KiB | 2,844 |
| 160 | 581 µs | 706 µs | 1.98 ms | 450.0 KiB | 1,721 |
| 320 | 977 µs | 1.46 ms | 2.38 ms | 898.9 KiB | 1,024 |
| 640 | 1.78 ms | 1.89 ms | 3.22 ms | 1.8 MiB | 561 |
| 1280 | 3.34 ms | 3.60 ms | 4.77 ms | 3.5 MiB | 299 |
| 2560 | 6.47 ms | 6.63 ms | 6.68 ms | 7.0 MiB | 155 |
| 5120 | 13.1 ms | 13.7 ms | 13.2 ms | 14.0 MiB | 76 |
| 10240 | 27.3 ms | 28.2 ms | 27.8 ms | 28.1 MiB | 37 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 101 µs | 123 µs | 104 µs | 57.4 KiB | 9,948 |
| 40 | 182 µs | 207 µs | 186 µs | 113.5 KiB | 5,484 |
| 80 | 348 µs | 377 µs | 1.16 ms | 225.7 KiB | 2,870 |
| 160 | 567 µs | 604 µs | 1.94 ms | 450.0 KiB | 1,764 |
| 320 | 943 µs | 994 µs | 2.22 ms | 898.9 KiB | 1,061 |
| 640 | 1.76 ms | 1.84 ms | 3.15 ms | 1.8 MiB | 569 |
| 1280 | 3.38 ms | 3.43 ms | 5.16 ms | 3.5 MiB | 296 |
| 2560 | 6.56 ms | 6.66 ms | 8.44 ms | 7.0 MiB | 152 |
| 5120 | 13.5 ms | 13.8 ms | 16.5 ms | 14.0 MiB | 74 |
| 10240 | 27.3 ms | 30.0 ms | 32.2 ms | 28.1 MiB | 37 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 503 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 314 µs | 314 µs | 62% |
| `run-policies` | 1 | 150 µs | 150 µs | 30% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 39.1 µs | 7.8% |

**At 10240 checks** (whole operation: 67.2 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 38.2 ms | 38.2 ms | 57% |
| `run-policies` | 1 | 25.1 ms | 25.1 ms | 37% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 3.89 ms | 5.8% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-02T14:04:23.841Z` → `2026-11-02T14:06:00.137Z` (96 s), ci: CI (run 41455884342)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15988 MB RAM, linux/x64, Node v24.22.1, GitHub Actions
- Git: `0bdf617c68d04211032ef0bffedb007ee01756af` on `feat/affected-scope`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

