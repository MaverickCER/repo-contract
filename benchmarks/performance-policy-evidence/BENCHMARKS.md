# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **275 µs** per operation compared with a bare-minimum baseline (**127% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.00). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 275 µs | 48.5 ms |
| Added latency, relative to baseline | 127% | 216% |
| Added CPU time per operation | 674 µs | 54.1 ms |
| Added memory per operation (heap delta) | 345.9 KiB | 44.6 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,638 ops/s | 21 ops/s |

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
| 20 | 59.0 µs | 176 µs | 117 µs | 199% | 491 µs | $0.00024 – $0.0055 |
| 40 | 112 µs | 274 µs | 162 µs | 145% | 481 µs | $0.00034 – $0.0054 |
| 80 | 216 µs | 491 µs | 275 µs | 127% | 674 µs | $0.00057 – $0.0076 |
| 160 | 432 µs | 987 µs | 555 µs | 129% | 1.42 ms | $0.0012 – $0.016 |
| 320 | 800 µs | 1.74 ms | 935 µs | 117% | 1.69 ms | $0.0019 – $0.019 |
| 640 | 1.60 ms | 3.55 ms | 1.95 ms | 122% | 2.31 ms | $0.0041 – $0.026 |
| 1280 | 2.98 ms | 13.9 ms | 10.9 ms | 367% | 11.9 ms | $0.023 – $0.134 |
| 2560 | 5.73 ms | 20.2 ms | 14.4 ms | 252% | 15.9 ms | $0.030 – $0.179 |
| 5120 | 11.3 ms | 35.2 ms | 23.9 ms | 211% | 25.8 ms | $0.050 – $0.290 |
| 10240 | 22.5 ms | 71.1 ms | 48.5 ms | 216% | 54.1 ms | $0.101 – $0.609 |

**How the total grows:** O(n) (linear), exponent 1.00 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 319 µs | 40.4 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 3.10 ms | 426 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 135 µs | 27.3 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 175 µs | 36.5 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 122 µs | 27.2 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 189 µs | 38.0 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n) | 🟡 close (neighbouring class) | 75.0 µs | 9.91 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 291 µs | 373 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 886 µs | 93.7 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n) | ✅ matches | 7.30 ms | 1.41 s |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 266 µs | 29.6 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 327 µs | 67.6 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 347 µs | 28.1 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 337 µs | 28.1 ms |

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

**Measured: O(n)** (exponent 0.97, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 96.2 µs | 100 µs | 326 µs | 52.9 KiB | 10,399 |
| 40 | 178 µs | 190 µs | 581 µs | 104.6 KiB | 5,609 |
| 80 | 319 µs | 340 µs | 854 µs | 211.4 KiB | 3,137 |
| 160 | 604 µs | 631 µs | 1.42 ms | 436.2 KiB | 1,656 |
| 320 | 1.22 ms | 1.28 ms | 2.90 ms | 938.9 KiB | 819 |
| 640 | 2.26 ms | 2.51 ms | 4.03 ms | 2.1 MiB | 443 |
| 1280 | 7.81 ms | 8.66 ms | 9.67 ms | 4.7 MiB | 128 |
| 2560 | 12.2 ms | 20.7 ms | 14.8 ms | 8.0 MiB | 82 |
| 5120 | 20.8 ms | 22.1 ms | 22.9 ms | 14.5 MiB | 48 |
| 10240 | 40.4 ms | 41.2 ms | 44.7 ms | 27.6 MiB | 25 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.06, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 830 µs | 903 µs | 1.66 ms | 294.9 KiB | 1,205 |
| 40 | 1.69 ms | 2.13 ms | 3.86 ms | 587.0 KiB | 592 |
| 80 | 3.10 ms | 3.83 ms | 4.94 ms | 1.1 MiB | 323 |
| 160 | 5.89 ms | 6.10 ms | 7.99 ms | 2.3 MiB | 170 |
| 320 | 11.5 ms | 11.8 ms | 14.1 ms | 4.7 MiB | 87 |
| 640 | 22.7 ms | 22.9 ms | 26.6 ms | 9.8 MiB | 44 |
| 1280 | 48.7 ms | 51.3 ms | 55.4 ms | 20.1 MiB | 21 |
| 2560 | 95.2 ms | 103 ms | 106 ms | 38.7 MiB | 11 |
| 5120 | 214 ms | 236 ms | 316 ms | 73.5 MiB | 5 |
| 10240 | 426 ms | 427 ms | 630 ms | 145.3 MiB | 2 |

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

**Measured: O(n)** (exponent 1.03, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 49.3 µs | 59.3 µs | 51.2 µs | 48.2 KiB | 20,282 |
| 40 | 77.4 µs | 96.7 µs | 247 µs | 92.5 KiB | 12,913 |
| 80 | 135 µs | 172 µs | 431 µs | 188.4 KiB | 7,422 |
| 160 | 268 µs | 350 µs | 838 µs | 393.8 KiB | 3,733 |
| 320 | 558 µs | 712 µs | 1.58 ms | 855.1 KiB | 1,791 |
| 640 | 1.15 ms | 1.55 ms | 3.01 ms | 1.9 MiB | 872 |
| 1280 | 6.01 ms | 6.42 ms | 8.85 ms | 4.4 MiB | 166 |
| 2560 | 7.61 ms | 8.05 ms | 10.6 ms | 7.3 MiB | 131 |
| 5120 | 13.2 ms | 14.4 ms | 17.9 ms | 13.2 MiB | 76 |
| 10240 | 27.3 ms | 27.5 ms | 35.7 ms | 24.4 MiB | 37 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 52.3 µs | 58.0 µs | 54.3 µs | 54.1 KiB | 19,116 |
| 40 | 90.1 µs | 107 µs | 310 µs | 107.0 KiB | 11,103 |
| 80 | 175 µs | 214 µs | 556 µs | 217.3 KiB | 5,699 |
| 160 | 385 µs | 442 µs | 1.16 ms | 451.7 KiB | 2,599 |
| 320 | 728 µs | 904 µs | 2.22 ms | 970.6 KiB | 1,373 |
| 640 | 1.90 ms | 2.35 ms | 5.66 ms | 2.2 MiB | 527 |
| 1280 | 7.35 ms | 8.48 ms | 13.9 ms | 4.9 MiB | 136 |
| 2560 | 10.1 ms | 10.7 ms | 20.7 ms | 8.3 MiB | 99 |
| 5120 | 19.9 ms | 20.8 ms | 38.2 ms | 15.1 MiB | 50 |
| 10240 | 36.5 ms | 38.1 ms | 71.8 ms | 28.1 MiB | 27 |

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

**Measured: O(n)** (exponent 1.04, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 44.5 µs | 47.9 µs | 46.3 µs | 47.0 KiB | 22,490 |
| 40 | 72.9 µs | 87.1 µs | 249 µs | 92.6 KiB | 13,724 |
| 80 | 122 µs | 172 µs | 363 µs | 188.3 KiB | 8,175 |
| 160 | 280 µs | 364 µs | 926 µs | 393.9 KiB | 3,569 |
| 320 | 530 µs | 694 µs | 1.53 ms | 856.0 KiB | 1,888 |
| 640 | 1.17 ms | 1.53 ms | 3.06 ms | 1.9 MiB | 857 |
| 1280 | 5.43 ms | 5.81 ms | 8.34 ms | 4.4 MiB | 184 |
| 2560 | 7.73 ms | 8.44 ms | 10.7 ms | 7.3 MiB | 129 |
| 5120 | 13.4 ms | 14.9 ms | 18.0 ms | 13.2 MiB | 75 |
| 10240 | 27.2 ms | 28.1 ms | 36.3 ms | 24.4 MiB | 37 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.04, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 53.4 µs | 58.9 µs | 55.4 µs | 54.2 KiB | 18,714 |
| 40 | 94.6 µs | 111 µs | 314 µs | 107.0 KiB | 10,569 |
| 80 | 189 µs | 217 µs | 646 µs | 217.5 KiB | 5,299 |
| 160 | 378 µs | 468 µs | 1.19 ms | 451.7 KiB | 2,647 |
| 320 | 931 µs | 1.10 ms | 3.53 ms | 975.7 KiB | 1,074 |
| 640 | 1.78 ms | 2.23 ms | 5.55 ms | 2.2 MiB | 562 |
| 1280 | 7.35 ms | 7.64 ms | 13.7 ms | 4.9 MiB | 136 |
| 2560 | 10.6 ms | 11.2 ms | 21.1 ms | 8.3 MiB | 94 |
| 5120 | 21.4 ms | 21.7 ms | 40.8 ms | 15.1 MiB | 47 |
| 10240 | 38.0 ms | 39.7 ms | 73.7 ms | 28.1 MiB | 26 |

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

**Measured: O(n)** (exponent 1.05, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 29.8 µs | 44.1 µs | 30.6 µs | 30.5 KiB | 33,571 |
| 40 | 41.8 µs | 49.7 µs | 144 µs | 55.2 KiB | 23,923 |
| 80 | 75.0 µs | 94.6 µs | 243 µs | 104.6 KiB | 13,341 |
| 160 | 139 µs | 182 µs | 426 µs | 207.7 KiB | 7,207 |
| 320 | 278 µs | 462 µs | 864 µs | 402.2 KiB | 3,598 |
| 640 | 512 µs | 697 µs | 1.48 ms | 821.1 KiB | 1,952 |
| 1280 | 1.21 ms | 1.27 ms | 3.41 ms | 1.3 MiB | 825 |
| 2560 | 2.28 ms | 2.38 ms | 5.07 ms | 2.7 MiB | 438 |
| 5120 | 4.81 ms | 4.97 ms | 9.01 ms | 5.5 MiB | 208 |
| 10240 | 9.91 ms | 10.0 ms | 17.3 ms | 10.8 MiB | 101 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent -0.04, 10 sizes) -- ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 259 µs | 267 µs | 728 µs | 616.5 KiB | 3,863 |
| 40 | 285 µs | 312 µs | 938 µs | 620.3 KiB | 3,507 |
| 80 | 291 µs | 314 µs | 939 µs | 626.2 KiB | 3,434 |
| 160 | 298 µs | 324 µs | 931 µs | 667.5 KiB | 3,357 |
| 320 | 326 µs | 354 µs | 965 µs | 716.3 KiB | 3,068 |
| 640 | 412 µs | 468 µs | 1.37 ms | 834.3 KiB | 2,427 |
| 1280 | 415 µs | 439 µs | 1.37 ms | 834.3 KiB | 2,411 |
| 2560 | 374 µs | 408 µs | 998 µs | 829.2 KiB | 2,676 |
| 5120 | 379 µs | 418 µs | 1.02 ms | 829.2 KiB | 2,639 |
| 10240 | 373 µs | 414 µs | 1.00 ms | 829.2 KiB | 2,684 |

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

**Measured: O(n)** (exponent 0.94, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 200 µs | 214 µs | 610 µs | 45.6 KiB | 5,008 |
| 40 | 390 µs | 422 µs | 1.21 ms | 90.2 KiB | 2,564 |
| 80 | 886 µs | 966 µs | 2.59 ms | 179.3 KiB | 1,129 |
| 160 | 1.92 ms | 1.99 ms | 3.70 ms | 357.3 KiB | 520 |
| 320 | 3.68 ms | 3.87 ms | 5.80 ms | 712.3 KiB | 272 |
| 640 | 7.20 ms | 7.43 ms | 9.53 ms | 1.4 MiB | 139 |
| 1280 | 13.9 ms | 14.1 ms | 16.4 ms | 2.8 MiB | 72 |
| 2560 | 27.4 ms | 27.9 ms | 29.5 ms | 5.7 MiB | 36 |
| 5120 | 55.9 ms | 56.1 ms | 56.5 ms | 11.3 MiB | 18 |
| 10240 | 93.7 ms | 94.2 ms | 94.1 ms | 22.7 MiB | 11 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.02, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.20 ms | 2.34 ms | 4.16 ms | 599.8 KiB | 454 |
| 40 | 3.93 ms | 4.13 ms | 5.96 ms | 1.2 MiB | 254 |
| 80 | 7.30 ms | 7.51 ms | 9.54 ms | 2.3 MiB | 137 |
| 160 | 14.0 ms | 14.1 ms | 16.4 ms | 4.6 MiB | 71 |
| 320 | 42.3 ms | 42.9 ms | 43.1 ms | 9.3 MiB | 24 |
| 640 | 83.7 ms | 84.1 ms | 84.2 ms | 18.5 MiB | 12 |
| 1280 | 177 ms | 177 ms | 177 ms | 37.0 MiB | 6 |
| 2560 | 360 ms | 383 ms | 361 ms | 73.9 MiB | 3 |
| 5120 | 715 ms | 719 ms | 736 ms | 147.7 MiB | 1 |
| 10240 | 1.41 s | 1.43 s | 1.45 s | 295.3 MiB | 1 |

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

**Measured: O(n)** (exponent 1.03, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 103 µs | 148 µs | 407 µs | 98.0 KiB | 9,700 |
| 40 | 152 µs | 178 µs | 459 µs | 179.0 KiB | 6,595 |
| 80 | 266 µs | 383 µs | 777 µs | 322.3 KiB | 3,765 |
| 160 | 490 µs | 539 µs | 1.27 ms | 637.9 KiB | 2,041 |
| 320 | 990 µs | 1.32 ms | 2.58 ms | 1.2 MiB | 1,011 |
| 640 | 1.75 ms | 1.89 ms | 3.36 ms | 2.5 MiB | 573 |
| 1280 | 3.34 ms | 3.51 ms | 4.77 ms | 4.9 MiB | 299 |
| 2560 | 6.75 ms | 7.19 ms | 8.77 ms | 9.9 MiB | 148 |
| 5120 | 14.4 ms | 14.7 ms | 17.7 ms | 19.8 MiB | 69 |
| 10240 | 29.6 ms | 31.0 ms | 34.8 ms | 39.6 MiB | 34 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.18, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 95.7 µs | 105 µs | 316 µs | 281.1 KiB | 10,450 |
| 40 | 169 µs | 181 µs | 478 µs | 539.5 KiB | 5,933 |
| 80 | 327 µs | 359 µs | 831 µs | 1.0 MiB | 3,054 |
| 160 | 662 µs | 703 µs | 1.46 ms | 2.1 MiB | 1,510 |
| 320 | 1.37 ms | 1.49 ms | 3.02 ms | 4.2 MiB | 728 |
| 640 | 2.62 ms | 2.74 ms | 4.38 ms | 8.3 MiB | 382 |
| 1280 | 5.36 ms | 6.48 ms | 7.58 ms | 16.7 MiB | 187 |
| 2560 | 10.8 ms | 11.5 ms | 13.7 ms | 33.3 MiB | 93 |
| 5120 | 28.7 ms | 30.7 ms | 32.3 ms | 52.0 MiB | 35 |
| 10240 | 67.6 ms | 71.2 ms | 78.7 ms | 103.7 MiB | 15 |

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

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 104 µs | 124 µs | 108 µs | 57.4 KiB | 9,595 |
| 40 | 183 µs | 208 µs | 188 µs | 113.5 KiB | 5,450 |
| 80 | 347 µs | 364 µs | 351 µs | 225.7 KiB | 2,884 |
| 160 | 573 µs | 606 µs | 1.96 ms | 450.0 KiB | 1,744 |
| 320 | 970 µs | 1.36 ms | 2.42 ms | 898.9 KiB | 1,031 |
| 640 | 1.75 ms | 1.79 ms | 3.32 ms | 1.8 MiB | 572 |
| 1280 | 3.34 ms | 3.62 ms | 4.38 ms | 3.5 MiB | 300 |
| 2560 | 6.47 ms | 6.85 ms | 6.69 ms | 6.9 MiB | 155 |
| 5120 | 13.3 ms | 13.5 ms | 13.5 ms | 13.8 MiB | 75 |
| 10240 | 28.1 ms | 28.4 ms | 28.6 ms | 27.7 MiB | 36 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 95.6 µs | 114 µs | 99.0 µs | 56.5 KiB | 10,460 |
| 40 | 176 µs | 193 µs | 180 µs | 111.8 KiB | 5,689 |
| 80 | 337 µs | 367 µs | 644 µs | 222.5 KiB | 2,969 |
| 160 | 571 µs | 596 µs | 2.02 ms | 443.7 KiB | 1,751 |
| 320 | 938 µs | 987 µs | 2.34 ms | 886.2 KiB | 1,066 |
| 640 | 1.74 ms | 1.80 ms | 3.37 ms | 1.7 MiB | 574 |
| 1280 | 3.36 ms | 3.39 ms | 5.38 ms | 3.5 MiB | 298 |
| 2560 | 6.61 ms | 6.78 ms | 8.13 ms | 6.9 MiB | 151 |
| 5120 | 13.3 ms | 13.7 ms | 16.4 ms | 13.8 MiB | 75 |
| 10240 | 28.1 ms | 28.9 ms | 34.5 ms | 27.7 MiB | 36 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 491 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 319 µs | 319 µs | 65% |
| `run-policies` | 1 | 135 µs | 135 µs | 27% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 37.1 µs | 7.6% |

**At 10240 checks** (whole operation: 71.1 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 40.4 ms | 40.4 ms | 57% |
| `run-policies` | 1 | 27.3 ms | 27.3 ms | 38% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 3.35 ms | 4.7% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-03T09:22:45.055Z` → `2026-11-03T09:24:19.765Z` (95 s), ci: CI (run 41608056902)
- Machine: AMD EPYC 9V74 80-Core Processor, 4 logical core(s) (2 physical), 15984 MB RAM, linux/x64, Node v24.22.1, GitHub Actions
- Git: `129f48e79bf2184a31658f47480f331c4796d9ac` on `chore/dependency-updates-v3`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

