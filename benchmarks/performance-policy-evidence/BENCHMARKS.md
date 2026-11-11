# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **332 µs** per operation compared with a bare-minimum baseline (**148% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.94). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 332 µs | 43.6 ms |
| Added latency, relative to baseline | 148% | 213% |
| Added CPU time per operation | 855 µs | 49.7 ms |
| Added memory per operation (heap delta) | 345.9 KiB | 44.1 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,009 ops/s | 23 ops/s |

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
| 20 | 69.5 µs | 208 µs | 139 µs | 200% | 566 µs | $0.00029 – $0.0064 |
| 40 | 121 µs | 306 µs | 185 µs | 153% | 527 µs | $0.00039 – $0.0059 |
| 80 | 225 µs | 557 µs | 332 µs | 148% | 855 µs | $0.00069 – $0.0096 |
| 160 | 447 µs | 1.15 ms | 706 µs | 158% | 1.87 ms | $0.0015 – $0.021 |
| 320 | 916 µs | 1.95 ms | 1.04 ms | 113% | 1.13 ms | $0.0022 – $0.013 |
| 640 | 1.52 ms | 3.85 ms | 2.33 ms | 153% | 3.01 ms | $0.0049 – $0.034 |
| 1280 | 2.80 ms | 14.3 ms | 11.5 ms | 410% | 12.3 ms | $0.024 – $0.138 |
| 2560 | 5.29 ms | 21.0 ms | 15.7 ms | 297% | 16.6 ms | $0.033 – $0.186 |
| 5120 | 10.4 ms | 35.3 ms | 24.9 ms | 238% | 29.2 ms | $0.052 – $0.328 |
| 10240 | 20.5 ms | 64.0 ms | 43.6 ms | 213% | 49.7 ms | $0.091 – $0.559 |

**How the total grows:** O(n) (linear), exponent 0.94 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 402 µs | 38.2 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 2.94 ms | 396 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 181 µs | 25.0 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 278 µs | 36.6 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 181 µs | 25.3 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 294 µs | 36.1 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n) | 🟡 close (neighbouring class) | 82.1 µs | 10.2 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 343 µs | 485 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 782 µs | 86.0 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n) | ✅ matches | 7.58 ms | 1.21 s |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 300 µs | 29.7 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 428 µs | 78.6 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 351 µs | 24.8 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 352 µs | 30.7 ms |

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

**Measured: O(n)** (exponent 0.94, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 125 µs | 132 µs | 512 µs | 53.0 KiB | 7,985 |
| 40 | 177 µs | 189 µs | 513 µs | 104.4 KiB | 5,660 |
| 80 | 402 µs | 434 µs | 1.39 ms | 211.7 KiB | 2,487 |
| 160 | 654 µs | 690 µs | 1.66 ms | 436.2 KiB | 1,529 |
| 320 | 1.30 ms | 1.35 ms | 3.25 ms | 938.9 KiB | 771 |
| 640 | 2.34 ms | 2.44 ms | 4.50 ms | 2.1 MiB | 428 |
| 1280 | 8.47 ms | 8.65 ms | 10.8 ms | 4.7 MiB | 118 |
| 2560 | 12.9 ms | 15.4 ms | 15.9 ms | 8.0 MiB | 77 |
| 5120 | 21.1 ms | 21.4 ms | 23.2 ms | 14.5 MiB | 47 |
| 10240 | 38.2 ms | 41.4 ms | 42.9 ms | 27.6 MiB | 26 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.07, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 828 µs | 888 µs | 1.89 ms | 294.9 KiB | 1,207 |
| 40 | 1.67 ms | 1.75 ms | 3.96 ms | 587.0 KiB | 598 |
| 80 | 2.94 ms | 3.31 ms | 5.41 ms | 1.1 MiB | 340 |
| 160 | 5.46 ms | 5.86 ms | 8.23 ms | 2.3 MiB | 183 |
| 320 | 10.5 ms | 10.6 ms | 13.9 ms | 4.7 MiB | 95 |
| 640 | 20.7 ms | 20.8 ms | 25.6 ms | 9.8 MiB | 48 |
| 1280 | 45.4 ms | 46.4 ms | 53.1 ms | 20.1 MiB | 22 |
| 2560 | 86.3 ms | 90.7 ms | 100 ms | 38.7 MiB | 12 |
| 5120 | 203 ms | 236 ms | 325 ms | 73.5 MiB | 5 |
| 10240 | 396 ms | 403 ms | 642 ms | 145.1 MiB | 3 |

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

**Measured: O(n)** (exponent 0.94, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 55.1 µs | 68.9 µs | 56.3 µs | 47.1 KiB | 18,145 |
| 40 | 82.9 µs | 97.0 µs | 301 µs | 92.5 KiB | 12,065 |
| 80 | 181 µs | 349 µs | 676 µs | 188.7 KiB | 5,516 |
| 160 | 316 µs | 392 µs | 1.04 ms | 393.8 KiB | 3,165 |
| 320 | 681 µs | 787 µs | 1.92 ms | 855.1 KiB | 1,469 |
| 640 | 1.45 ms | 1.75 ms | 3.92 ms | 1.9 MiB | 691 |
| 1280 | 6.52 ms | 6.87 ms | 9.80 ms | 4.4 MiB | 153 |
| 2560 | 8.80 ms | 11.3 ms | 12.6 ms | 7.3 MiB | 114 |
| 5120 | 14.3 ms | 14.6 ms | 20.6 ms | 13.2 MiB | 70 |
| 10240 | 25.0 ms | 25.3 ms | 34.1 ms | 24.3 MiB | 40 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.91, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 67.5 µs | 77.2 µs | 160 µs | 54.2 KiB | 14,822 |
| 40 | 135 µs | 147 µs | 552 µs | 107.2 KiB | 7,396 |
| 80 | 278 µs | 301 µs | 1.05 ms | 217.8 KiB | 3,595 |
| 160 | 537 µs | 622 µs | 1.87 ms | 452.9 KiB | 1,861 |
| 320 | 1.29 ms | 1.41 ms | 4.82 ms | 975.5 KiB | 777 |
| 640 | 2.41 ms | 2.72 ms | 7.41 ms | 2.2 MiB | 414 |
| 1280 | 8.33 ms | 8.96 ms | 16.2 ms | 4.9 MiB | 120 |
| 2560 | 11.9 ms | 12.2 ms | 24.6 ms | 8.3 MiB | 84 |
| 5120 | 19.6 ms | 20.6 ms | 43.0 ms | 15.0 MiB | 51 |
| 10240 | 36.6 ms | 37.0 ms | 81.5 ms | 28.0 MiB | 27 |

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

**Measured: O(n)** (exponent 0.94, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 53.7 µs | 60.0 µs | 54.9 µs | 47.0 KiB | 18,612 |
| 40 | 93.9 µs | 102 µs | 365 µs | 92.7 KiB | 10,648 |
| 80 | 181 µs | 211 µs | 678 µs | 188.7 KiB | 5,539 |
| 160 | 381 µs | 427 µs | 1.41 ms | 395.0 KiB | 2,628 |
| 320 | 817 µs | 915 µs | 2.97 ms | 862.5 KiB | 1,224 |
| 640 | 1.46 ms | 1.55 ms | 3.94 ms | 1.9 MiB | 687 |
| 1280 | 6.53 ms | 6.76 ms | 9.70 ms | 4.4 MiB | 153 |
| 2560 | 9.29 ms | 9.56 ms | 13.2 ms | 7.3 MiB | 108 |
| 5120 | 14.5 ms | 14.8 ms | 20.7 ms | 13.1 MiB | 69 |
| 10240 | 25.3 ms | 25.6 ms | 34.4 ms | 24.3 MiB | 40 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.91, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 67.7 µs | 78.4 µs | 71.5 µs | 54.3 KiB | 14,763 |
| 40 | 131 µs | 141 µs | 538 µs | 107.2 KiB | 7,615 |
| 80 | 294 µs | 316 µs | 1.07 ms | 217.8 KiB | 3,402 |
| 160 | 574 µs | 677 µs | 1.98 ms | 452.9 KiB | 1,744 |
| 320 | 1.29 ms | 1.42 ms | 4.83 ms | 975.7 KiB | 775 |
| 640 | 2.37 ms | 2.70 ms | 7.44 ms | 2.2 MiB | 422 |
| 1280 | 8.51 ms | 8.93 ms | 16.4 ms | 4.9 MiB | 117 |
| 2560 | 11.6 ms | 21.1 ms | 24.0 ms | 8.3 MiB | 86 |
| 5120 | 20.5 ms | 21.1 ms | 43.9 ms | 15.0 MiB | 49 |
| 10240 | 36.1 ms | 37.2 ms | 80.5 ms | 28.0 MiB | 28 |

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

**Measured: O(n)** (exponent 1.01, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 38.0 µs | 57.8 µs | 39.0 µs | 30.5 KiB | 26,298 |
| 40 | 54.3 µs | 58.3 µs | 232 µs | 55.0 KiB | 18,426 |
| 80 | 82.1 µs | 102 µs | 283 µs | 104.6 KiB | 12,181 |
| 160 | 152 µs | 196 µs | 482 µs | 207.3 KiB | 6,562 |
| 320 | 326 µs | 405 µs | 1.09 ms | 402.2 KiB | 3,066 |
| 640 | 594 µs | 830 µs | 1.86 ms | 821.1 KiB | 1,685 |
| 1280 | 1.35 ms | 1.42 ms | 4.16 ms | 1.3 MiB | 739 |
| 2560 | 2.60 ms | 5.26 ms | 6.19 ms | 2.7 MiB | 384 |
| 5120 | 5.11 ms | 5.28 ms | 10.2 ms | 5.5 MiB | 196 |
| 10240 | 10.2 ms | 12.3 ms | 18.4 ms | 10.8 MiB | 98 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent -0.02, 10 sizes) -- ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 328 µs | 345 µs | 1.15 ms | 620.2 KiB | 3,045 |
| 40 | 332 µs | 354 µs | 1.15 ms | 620.3 KiB | 3,015 |
| 80 | 343 µs | 404 µs | 1.18 ms | 626.2 KiB | 2,918 |
| 160 | 348 µs | 369 µs | 1.16 ms | 667.5 KiB | 2,874 |
| 320 | 431 µs | 473 µs | 1.68 ms | 714.8 KiB | 2,320 |
| 640 | 490 µs | 538 µs | 1.75 ms | 834.3 KiB | 2,043 |
| 1280 | 475 µs | 546 µs | 1.67 ms | 834.3 KiB | 2,105 |
| 2560 | 486 µs | 550 µs | 1.75 ms | 834.3 KiB | 2,057 |
| 5120 | 429 µs | 464 µs | 1.27 ms | 829.2 KiB | 2,331 |
| 10240 | 485 µs | 554 µs | 1.74 ms | 834.3 KiB | 2,062 |

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

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 246 µs | 271 µs | 937 µs | 45.8 KiB | 4,065 |
| 40 | 436 µs | 463 µs | 1.52 ms | 90.2 KiB | 2,293 |
| 80 | 782 µs | 833 µs | 1.91 ms | 178.6 KiB | 1,279 |
| 160 | 1.54 ms | 1.60 ms | 3.79 ms | 357.3 KiB | 650 |
| 320 | 2.70 ms | 3.80 ms | 5.35 ms | 712.3 KiB | 370 |
| 640 | 5.40 ms | 7.44 ms | 8.30 ms | 1.4 MiB | 185 |
| 1280 | 10.0 ms | 10.5 ms | 13.1 ms | 2.8 MiB | 100 |
| 2560 | 19.6 ms | 20.8 ms | 23.0 ms | 5.7 MiB | 51 |
| 5120 | 39.1 ms | 39.4 ms | 43.3 ms | 11.3 MiB | 26 |
| 10240 | 86.0 ms | 86.2 ms | 89.3 ms | 22.7 MiB | 12 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.07, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.28 ms | 2.45 ms | 4.87 ms | 599.8 KiB | 438 |
| 40 | 4.05 ms | 4.26 ms | 6.78 ms | 1.2 MiB | 247 |
| 80 | 7.58 ms | 7.76 ms | 10.4 ms | 2.3 MiB | 132 |
| 160 | 14.6 ms | 14.8 ms | 17.7 ms | 4.6 MiB | 69 |
| 320 | 28.4 ms | 33.4 ms | 31.7 ms | 9.3 MiB | 35 |
| 640 | 62.4 ms | 62.9 ms | 65.3 ms | 18.5 MiB | 16 |
| 1280 | 139 ms | 143 ms | 140 ms | 37.0 MiB | 7 |
| 2560 | 292 ms | 296 ms | 293 ms | 73.9 MiB | 3 |
| 5120 | 603 ms | 606 ms | 626 ms | 147.7 MiB | 2 |
| 10240 | 1.21 s | 1.22 s | 1.25 s | 295.3 MiB | 1 |

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

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 130 µs | 188 µs | 449 µs | 98.0 KiB | 7,719 |
| 40 | 179 µs | 225 µs | 658 µs | 178.9 KiB | 5,600 |
| 80 | 300 µs | 398 µs | 958 µs | 351.0 KiB | 3,329 |
| 160 | 531 µs | 604 µs | 1.53 ms | 637.8 KiB | 1,883 |
| 320 | 1.07 ms | 1.16 ms | 3.18 ms | 1.2 MiB | 931 |
| 640 | 1.92 ms | 2.08 ms | 4.27 ms | 2.5 MiB | 520 |
| 1280 | 3.36 ms | 3.64 ms | 5.12 ms | 4.9 MiB | 297 |
| 2560 | 6.93 ms | 7.25 ms | 9.42 ms | 9.9 MiB | 144 |
| 5120 | 14.3 ms | 14.7 ms | 18.1 ms | 19.8 MiB | 70 |
| 10240 | 29.7 ms | 30.4 ms | 35.4 ms | 39.6 MiB | 34 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.20, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 123 µs | 135 µs | 522 µs | 281.0 KiB | 8,104 |
| 40 | 208 µs | 223 µs | 693 µs | 540.1 KiB | 4,812 |
| 80 | 428 µs | 488 µs | 1.42 ms | 1.0 MiB | 2,337 |
| 160 | 760 µs | 827 µs | 1.84 ms | 2.1 MiB | 1,315 |
| 320 | 1.55 ms | 1.65 ms | 3.72 ms | 4.2 MiB | 647 |
| 640 | 2.92 ms | 3.09 ms | 5.34 ms | 8.3 MiB | 342 |
| 1280 | 5.64 ms | 5.85 ms | 8.70 ms | 16.7 MiB | 177 |
| 2560 | 11.2 ms | 11.8 ms | 15.5 ms | 33.3 MiB | 89 |
| 5120 | 32.1 ms | 33.5 ms | 38.4 ms | 52.0 MiB | 31 |
| 10240 | 78.6 ms | 81.1 ms | 93.3 ms | 103.7 MiB | 13 |

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

**Measured: O(n)** (exponent 0.96, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 119 µs | 148 µs | 123 µs | 57.4 KiB | 8,430 |
| 40 | 195 µs | 223 µs | 199 µs | 113.5 KiB | 5,133 |
| 80 | 351 µs | 374 µs | 357 µs | 225.7 KiB | 2,848 |
| 160 | 622 µs | 677 µs | 2.59 ms | 450.0 KiB | 1,607 |
| 320 | 1.00 ms | 1.09 ms | 2.95 ms | 898.9 KiB | 998 |
| 640 | 1.77 ms | 1.89 ms | 3.82 ms | 1.8 MiB | 565 |
| 1280 | 3.23 ms | 3.34 ms | 4.80 ms | 3.5 MiB | 310 |
| 2560 | 6.48 ms | 7.56 ms | 6.85 ms | 7.0 MiB | 154 |
| 5120 | 12.5 ms | 12.8 ms | 12.9 ms | 13.8 MiB | 80 |
| 10240 | 24.8 ms | 27.0 ms | 25.5 ms | 27.7 MiB | 40 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.02, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 110 µs | 122 µs | 116 µs | 56.4 KiB | 9,087 |
| 40 | 189 µs | 212 µs | 195 µs | 111.7 KiB | 5,296 |
| 80 | 352 µs | 371 µs | 361 µs | 222.3 KiB | 2,838 |
| 160 | 622 µs | 695 µs | 2.53 ms | 443.6 KiB | 1,607 |
| 320 | 991 µs | 1.23 ms | 2.88 ms | 886.1 KiB | 1,009 |
| 640 | 1.83 ms | 1.89 ms | 4.01 ms | 1.7 MiB | 546 |
| 1280 | 3.46 ms | 4.58 ms | 6.12 ms | 3.5 MiB | 289 |
| 2560 | 6.64 ms | 6.96 ms | 9.46 ms | 6.9 MiB | 151 |
| 5120 | 14.2 ms | 15.0 ms | 18.7 ms | 13.8 MiB | 71 |
| 10240 | 30.7 ms | 32.0 ms | 37.9 ms | 27.7 MiB | 33 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 557 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 402 µs | 402 µs | 72% |
| `run-policies` | 1 | 181 µs | 181 µs | 33% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 0 | 0.0% |

**At 10240 checks** (whole operation: 64.0 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 38.2 ms | 38.2 ms | 60% |
| `run-policies` | 1 | 25.0 ms | 25.0 ms | 39% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 756 µs | 1.2% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-11T11:54:48.852Z` → `2026-11-11T11:56:23.804Z` (95 s), ci: CI (run 43013441445)
- Machine: Intel(R) Xeon(R) Platinum 8370C CPU @ 2.80GHz, 4 logical core(s) (2 physical), 15982 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `edac848e771159164c3871993f65a7b5ccb346c8` on `docs/v1-claims-evidence`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

