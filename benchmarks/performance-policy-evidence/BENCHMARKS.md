# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **302 µs** per operation compared with a bare-minimum baseline (**139% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.00). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 302 µs | 45.2 ms |
| Added latency, relative to baseline | 139% | 202% |
| Added CPU time per operation | 691 µs | 48.7 ms |
| Added memory per operation (heap delta) | 345.9 KiB | 44.6 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,313 ops/s | 22 ops/s |

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
| 20 | 63.3 µs | 189 µs | 125 µs | 198% | 480 µs | $0.00026 – $0.0054 |
| 40 | 117 µs | 292 µs | 174 µs | 149% | 441 µs | $0.00036 – $0.005 |
| 80 | 217 µs | 518 µs | 302 µs | 139% | 691 µs | $0.00063 – $0.0078 |
| 160 | 436 µs | 1.04 ms | 607 µs | 139% | 1.41 ms | $0.0013 – $0.016 |
| 320 | 773 µs | 1.80 ms | 1.03 ms | 133% | 1.76 ms | $0.0021 – $0.020 |
| 640 | 1.55 ms | 3.55 ms | 2.00 ms | 129% | 2.39 ms | $0.0042 – $0.027 |
| 1280 | 2.88 ms | 13.2 ms | 10.3 ms | 359% | 11.0 ms | $0.021 – $0.123 |
| 2560 | 5.59 ms | 20.6 ms | 15.0 ms | 269% | 15.9 ms | $0.031 – $0.179 |
| 5120 | 11.4 ms | 36.9 ms | 25.6 ms | 225% | 26.6 ms | $0.053 – $0.300 |
| 10240 | 22.3 ms | 67.5 ms | 45.2 ms | 202% | 48.7 ms | $0.094 – $0.548 |

**How the total grows:** O(n) (linear), exponent 1.00 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 316 µs | 38.1 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 2.94 ms | 408 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 152 µs | 27.7 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 234 µs | 37.9 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 162 µs | 26.9 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 226 µs | 38.0 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n) | 🟡 close (neighbouring class) | 82.1 µs | 9.43 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 295 µs | 431 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 984 µs | 83.0 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n) | ✅ matches | 8.09 ms | 943 ms |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 288 µs | 29.9 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 341 µs | 65.9 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 363 µs | 27.1 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 354 µs | 27.6 ms |

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
| 20 | 101 µs | 106 µs | 357 µs | 52.9 KiB | 9,923 |
| 40 | 180 µs | 187 µs | 561 µs | 104.6 KiB | 5,547 |
| 80 | 316 µs | 341 µs | 826 µs | 211.4 KiB | 3,165 |
| 160 | 594 µs | 729 µs | 1.38 ms | 436.3 KiB | 1,683 |
| 320 | 1.20 ms | 1.25 ms | 2.81 ms | 938.9 KiB | 833 |
| 640 | 2.14 ms | 2.29 ms | 3.46 ms | 2.1 MiB | 467 |
| 1280 | 7.23 ms | 7.61 ms | 8.94 ms | 4.7 MiB | 138 |
| 2560 | 11.9 ms | 13.8 ms | 14.0 ms | 8.0 MiB | 84 |
| 5120 | 20.1 ms | 22.2 ms | 22.0 ms | 14.5 MiB | 50 |
| 10240 | 38.1 ms | 38.7 ms | 41.7 ms | 27.6 MiB | 26 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.06, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 797 µs | 810 µs | 1.58 ms | 294.9 KiB | 1,255 |
| 40 | 1.58 ms | 1.62 ms | 3.21 ms | 587.1 KiB | 631 |
| 80 | 2.94 ms | 3.48 ms | 4.69 ms | 1.1 MiB | 340 |
| 160 | 5.64 ms | 5.84 ms | 7.67 ms | 2.3 MiB | 177 |
| 320 | 11.0 ms | 11.1 ms | 13.5 ms | 4.7 MiB | 91 |
| 640 | 21.9 ms | 22.1 ms | 25.5 ms | 9.8 MiB | 46 |
| 1280 | 46.8 ms | 49.6 ms | 53.3 ms | 20.1 MiB | 21 |
| 2560 | 90.2 ms | 95.8 ms | 101 ms | 38.7 MiB | 11 |
| 5120 | 206 ms | 207 ms | 307 ms | 73.5 MiB | 5 |
| 10240 | 408 ms | 411 ms | 613 ms | 145.3 MiB | 2 |

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
| 20 | 62.1 µs | 76.6 µs | 67.8 µs | 48.3 KiB | 16,099 |
| 40 | 90.4 µs | 117 µs | 302 µs | 92.6 KiB | 11,056 |
| 80 | 152 µs | 207 µs | 494 µs | 188.5 KiB | 6,570 |
| 160 | 294 µs | 445 µs | 834 µs | 393.8 KiB | 3,396 |
| 320 | 605 µs | 837 µs | 1.59 ms | 855.0 KiB | 1,652 |
| 640 | 1.32 ms | 1.75 ms | 3.21 ms | 1.9 MiB | 755 |
| 1280 | 5.34 ms | 5.86 ms | 8.03 ms | 4.4 MiB | 187 |
| 2560 | 7.45 ms | 7.83 ms | 10.7 ms | 7.3 MiB | 134 |
| 5120 | 13.8 ms | 14.6 ms | 18.5 ms | 13.2 MiB | 73 |
| 10240 | 27.7 ms | 28.2 ms | 35.6 ms | 24.4 MiB | 36 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.98, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 64.7 µs | 80.6 µs | 139 µs | 54.2 KiB | 15,454 |
| 40 | 117 µs | 134 µs | 394 µs | 107.1 KiB | 8,554 |
| 80 | 234 µs | 278 µs | 710 µs | 217.5 KiB | 4,277 |
| 160 | 471 µs | 591 µs | 1.56 ms | 452.9 KiB | 2,125 |
| 320 | 1.12 ms | 1.22 ms | 3.81 ms | 975.6 KiB | 892 |
| 640 | 2.10 ms | 2.55 ms | 6.26 ms | 2.2 MiB | 477 |
| 1280 | 6.81 ms | 7.40 ms | 13.0 ms | 4.9 MiB | 147 |
| 2560 | 10.2 ms | 10.7 ms | 20.9 ms | 8.3 MiB | 98 |
| 5120 | 19.2 ms | 19.8 ms | 37.7 ms | 15.1 MiB | 52 |
| 10240 | 37.9 ms | 39.4 ms | 73.7 ms | 28.0 MiB | 26 |

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

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 53.0 µs | 61.7 µs | 58.4 µs | 47.0 KiB | 18,869 |
| 40 | 95.6 µs | 111 µs | 320 µs | 92.7 KiB | 10,455 |
| 80 | 162 µs | 218 µs | 520 µs | 188.5 KiB | 6,155 |
| 160 | 372 µs | 478 µs | 1.19 ms | 395.0 KiB | 2,691 |
| 320 | 607 µs | 782 µs | 1.61 ms | 854.5 KiB | 1,649 |
| 640 | 1.35 ms | 1.53 ms | 3.24 ms | 1.9 MiB | 741 |
| 1280 | 5.50 ms | 6.05 ms | 8.00 ms | 4.4 MiB | 182 |
| 2560 | 7.94 ms | 8.41 ms | 11.1 ms | 7.3 MiB | 126 |
| 5120 | 13.8 ms | 14.7 ms | 18.1 ms | 12.6 MiB | 73 |
| 10240 | 26.9 ms | 27.9 ms | 34.7 ms | 24.6 MiB | 37 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.97, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 67.8 µs | 79.1 µs | 72.0 µs | 54.4 KiB | 14,743 |
| 40 | 126 µs | 141 µs | 424 µs | 107.1 KiB | 7,917 |
| 80 | 226 µs | 279 µs | 716 µs | 217.5 KiB | 4,423 |
| 160 | 494 µs | 637 µs | 1.60 ms | 452.9 KiB | 2,023 |
| 320 | 1.21 ms | 1.36 ms | 4.33 ms | 975.8 KiB | 824 |
| 640 | 2.19 ms | 2.69 ms | 6.49 ms | 2.2 MiB | 456 |
| 1280 | 7.12 ms | 7.60 ms | 13.5 ms | 4.9 MiB | 140 |
| 2560 | 10.9 ms | 11.4 ms | 21.6 ms | 8.3 MiB | 91 |
| 5120 | 19.4 ms | 20.6 ms | 37.7 ms | 14.9 MiB | 51 |
| 10240 | 38.0 ms | 38.5 ms | 73.9 ms | 28.0 MiB | 26 |

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

**Measured: O(n)** (exponent 1.03, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 37.2 µs | 52.4 µs | 46.8 µs | 30.5 KiB | 26,912 |
| 40 | 46.4 µs | 57.4 µs | 159 µs | 55.2 KiB | 21,541 |
| 80 | 82.1 µs | 113 µs | 258 µs | 104.6 KiB | 12,187 |
| 160 | 155 µs | 215 µs | 488 µs | 208.3 KiB | 6,446 |
| 320 | 299 µs | 410 µs | 941 µs | 402.2 KiB | 3,349 |
| 640 | 524 µs | 796 µs | 1.48 ms | 742.1 KiB | 1,907 |
| 1280 | 1.19 ms | 1.27 ms | 3.34 ms | 1.3 MiB | 838 |
| 2560 | 2.27 ms | 2.38 ms | 5.09 ms | 2.7 MiB | 441 |
| 5120 | 4.54 ms | 4.88 ms | 8.82 ms | 5.5 MiB | 220 |
| 10240 | 9.43 ms | 10.2 ms | 16.8 ms | 10.8 MiB | 106 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Sorting every check by duration dominates; listing the first few lines of the sorted result adds almost nothing.

**Measured: O(1)** (exponent -0.00, 10 sizes) -- ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 284 µs | 323 µs | 901 µs | 620.2 KiB | 3,527 |
| 40 | 289 µs | 340 µs | 904 µs | 620.3 KiB | 3,462 |
| 80 | 295 µs | 344 µs | 914 µs | 626.2 KiB | 3,386 |
| 160 | 308 µs | 333 µs | 928 µs | 667.5 KiB | 3,246 |
| 320 | 334 µs | 384 µs | 963 µs | 716.3 KiB | 2,993 |
| 640 | 431 µs | 501 µs | 1.37 ms | 834.3 KiB | 2,319 |
| 1280 | 431 µs | 468 µs | 1.35 ms | 834.3 KiB | 2,322 |
| 2560 | 429 µs | 460 µs | 1.35 ms | 834.3 KiB | 2,334 |
| 5120 | 430 µs | 485 µs | 1.36 ms | 834.3 KiB | 2,326 |
| 10240 | 431 µs | 476 µs | 1.35 ms | 834.3 KiB | 2,322 |

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

**Measured: O(n)** (exponent 0.97, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 230 µs | 260 µs | 755 µs | 45.8 KiB | 4,355 |
| 40 | 438 µs | 485 µs | 1.24 ms | 90.2 KiB | 2,281 |
| 80 | 984 µs | 1.10 ms | 2.66 ms | 179.3 KiB | 1,016 |
| 160 | 1.62 ms | 1.75 ms | 3.28 ms | 357.3 KiB | 616 |
| 320 | 2.89 ms | 3.07 ms | 5.01 ms | 712.3 KiB | 346 |
| 640 | 5.52 ms | 5.60 ms | 7.71 ms | 1.4 MiB | 181 |
| 1280 | 10.7 ms | 11.0 ms | 13.2 ms | 2.8 MiB | 93 |
| 2560 | 20.6 ms | 21.0 ms | 23.4 ms | 5.7 MiB | 48 |
| 5120 | 39.6 ms | 40.2 ms | 43.4 ms | 11.3 MiB | 25 |
| 10240 | 83.0 ms | 84.1 ms | 89.1 ms | 22.7 MiB | 12 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.58 ms | 2.68 ms | 4.67 ms | 599.8 KiB | 388 |
| 40 | 4.42 ms | 4.62 ms | 6.63 ms | 1.2 MiB | 226 |
| 80 | 8.09 ms | 8.32 ms | 10.4 ms | 2.3 MiB | 124 |
| 160 | 14.8 ms | 15.0 ms | 17.3 ms | 4.6 MiB | 67 |
| 320 | 27.6 ms | 28.1 ms | 30.5 ms | 9.3 MiB | 36 |
| 640 | 55.2 ms | 56.4 ms | 59.3 ms | 18.5 MiB | 18 |
| 1280 | 124 ms | 124 ms | 129 ms | 37.0 MiB | 8 |
| 2560 | 248 ms | 253 ms | 258 ms | 73.9 MiB | 4 |
| 5120 | 470 ms | 471 ms | 489 ms | 147.7 MiB | 2 |
| 10240 | 943 ms | 944 ms | 980 ms | 295.3 MiB | 1 |

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

**Measured: O(n)** (exponent 1.02, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 114 µs | 148 µs | 409 µs | 97.9 KiB | 8,804 |
| 40 | 171 µs | 227 µs | 545 µs | 178.9 KiB | 5,844 |
| 80 | 288 µs | 343 µs | 779 µs | 328.4 KiB | 3,470 |
| 160 | 504 µs | 574 µs | 1.27 ms | 637.8 KiB | 1,984 |
| 320 | 1.01 ms | 1.06 ms | 2.56 ms | 1.2 MiB | 990 |
| 640 | 1.80 ms | 1.88 ms | 3.40 ms | 2.5 MiB | 555 |
| 1280 | 3.42 ms | 3.66 ms | 4.83 ms | 4.9 MiB | 293 |
| 2560 | 6.87 ms | 7.17 ms | 9.11 ms | 9.9 MiB | 145 |
| 5120 | 14.2 ms | 14.8 ms | 17.2 ms | 19.8 MiB | 70 |
| 10240 | 29.9 ms | 30.5 ms | 34.8 ms | 39.6 MiB | 33 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.18, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 101 µs | 108 µs | 317 µs | 281.1 KiB | 9,885 |
| 40 | 189 µs | 207 µs | 567 µs | 540.1 KiB | 5,295 |
| 80 | 341 µs | 365 µs | 841 µs | 1.0 MiB | 2,933 |
| 160 | 659 µs | 715 µs | 1.42 ms | 2.1 MiB | 1,517 |
| 320 | 1.36 ms | 1.53 ms | 2.96 ms | 4.2 MiB | 736 |
| 640 | 2.54 ms | 2.78 ms | 4.29 ms | 8.3 MiB | 394 |
| 1280 | 5.00 ms | 5.14 ms | 7.05 ms | 16.7 MiB | 200 |
| 2560 | 10.1 ms | 10.9 ms | 12.9 ms | 33.3 MiB | 99 |
| 5120 | 26.8 ms | 27.7 ms | 30.9 ms | 52.0 MiB | 37 |
| 10240 | 65.9 ms | 67.2 ms | 76.4 ms | 103.7 MiB | 15 |

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

**Measured: O(n)** (exponent 0.97, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 112 µs | 139 µs | 117 µs | 57.3 KiB | 8,895 |
| 40 | 196 µs | 230 µs | 200 µs | 113.3 KiB | 5,114 |
| 80 | 363 µs | 396 µs | 659 µs | 225.5 KiB | 2,753 |
| 160 | 598 µs | 641 µs | 2.10 ms | 450.0 KiB | 1,672 |
| 320 | 1.01 ms | 1.13 ms | 2.54 ms | 898.7 KiB | 987 |
| 640 | 1.86 ms | 1.91 ms | 3.44 ms | 1.8 MiB | 539 |
| 1280 | 3.41 ms | 3.55 ms | 4.81 ms | 3.5 MiB | 293 |
| 2560 | 6.56 ms | 9.03 ms | 6.85 ms | 6.9 MiB | 152 |
| 5120 | 13.4 ms | 13.8 ms | 13.6 ms | 13.8 MiB | 74 |
| 10240 | 27.1 ms | 27.9 ms | 27.5 ms | 27.7 MiB | 37 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 102 µs | 127 µs | 108 µs | 56.4 KiB | 9,794 |
| 40 | 185 µs | 213 µs | 189 µs | 111.7 KiB | 5,415 |
| 80 | 354 µs | 389 µs | 844 µs | 222.3 KiB | 2,821 |
| 160 | 580 µs | 607 µs | 1.87 ms | 443.6 KiB | 1,723 |
| 320 | 994 µs | 1.01 ms | 2.41 ms | 886.1 KiB | 1,007 |
| 640 | 1.78 ms | 1.84 ms | 3.36 ms | 1.7 MiB | 563 |
| 1280 | 3.34 ms | 3.38 ms | 5.24 ms | 3.5 MiB | 299 |
| 2560 | 6.41 ms | 6.52 ms | 7.67 ms | 6.9 MiB | 156 |
| 5120 | 13.5 ms | 14.2 ms | 16.9 ms | 13.8 MiB | 74 |
| 10240 | 27.6 ms | 28.6 ms | 32.9 ms | 27.7 MiB | 36 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 518 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 316 µs | 316 µs | 61% |
| `run-policies` | 1 | 152 µs | 152 µs | 29% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 50.3 µs | 9.7% |

**At 10240 checks** (whole operation: 67.5 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 38.1 ms | 38.1 ms | 56% |
| `run-policies` | 1 | 27.7 ms | 27.7 ms | 41% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 1.68 ms | 2.5% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-19T10:03:36.945Z` → `2026-10-19T10:05:06.694Z` (90 s), ci: CI (run 39232587082)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `078b9ebbd4f7c0f0ce7d1476a46b524580f0f5e8` on `feat/adopt-ipc-v0.12.0`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

