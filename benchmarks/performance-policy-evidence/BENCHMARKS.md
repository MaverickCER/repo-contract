# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **314 µs** per operation compared with a bare-minimum baseline (**145% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.98). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 314 µs | 53.7 ms |
| Added latency, relative to baseline | 145% | 228% |
| Added CPU time per operation | 818 µs | 59.0 ms |
| Added memory per operation (heap delta) | 345.9 KiB | 44.0 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,182 ops/s | 19 ops/s |

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
| 20 | 61.1 µs | 190 µs | 129 µs | 212% | 547 µs | $0.00027 – $0.0061 |
| 40 | 115 µs | 291 µs | 176 µs | 153% | 508 µs | $0.00037 – $0.0057 |
| 80 | 216 µs | 530 µs | 314 µs | 145% | 818 µs | $0.00065 – $0.0092 |
| 160 | 438 µs | 1.08 ms | 646 µs | 148% | 1.59 ms | $0.0013 – $0.018 |
| 320 | 800 µs | 1.95 ms | 1.15 ms | 144% | 2.02 ms | $0.0024 – $0.023 |
| 640 | 1.60 ms | 4.17 ms | 2.57 ms | 160% | 3.23 ms | $0.0053 – $0.036 |
| 1280 | 3.03 ms | 15.7 ms | 12.7 ms | 419% | 13.6 ms | $0.026 – $0.153 |
| 2560 | 5.96 ms | 23.9 ms | 18.0 ms | 301% | 19.1 ms | $0.037 – $0.215 |
| 5120 | 12.1 ms | 41.9 ms | 29.8 ms | 247% | 34.3 ms | $0.062 – $0.385 |
| 10240 | 23.5 ms | 77.2 ms | 53.7 ms | 228% | 59.0 ms | $0.112 – $0.663 |

**How the total grows:** O(n) (linear), exponent 0.98 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 326 µs | 42.3 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 3.20 ms | 440 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 145 µs | 29.6 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 221 µs | 40.2 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 155 µs | 29.5 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 232 µs | 40.5 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n log n) | ✅ matches | 85.1 µs | 11.0 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 300 µs | 422 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 876 µs | 95.7 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 7.50 ms | 1.39 s |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 298 µs | 34.1 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 402 µs | 75.8 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 356 µs | 30.1 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 342 µs | 31.1 ms |

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
| 20 | 107 µs | 115 µs | 439 µs | 53.0 KiB | 9,349 |
| 40 | 170 µs | 175 µs | 498 µs | 104.5 KiB | 5,899 |
| 80 | 326 µs | 350 µs | 889 µs | 211.4 KiB | 3,066 |
| 160 | 629 µs | 654 µs | 1.50 ms | 436.2 KiB | 1,591 |
| 320 | 1.27 ms | 1.36 ms | 3.06 ms | 938.9 KiB | 786 |
| 640 | 2.42 ms | 2.54 ms | 4.26 ms | 2.1 MiB | 414 |
| 1280 | 8.29 ms | 8.91 ms | 10.6 ms | 4.7 MiB | 121 |
| 2560 | 13.1 ms | 14.2 ms | 15.3 ms | 8.0 MiB | 76 |
| 5120 | 22.9 ms | 23.3 ms | 24.8 ms | 14.5 MiB | 44 |
| 10240 | 42.3 ms | 42.9 ms | 46.3 ms | 27.6 MiB | 24 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.06, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 850 µs | 946 µs | 1.72 ms | 294.9 KiB | 1,176 |
| 40 | 1.72 ms | 1.77 ms | 3.54 ms | 587.0 KiB | 580 |
| 80 | 3.20 ms | 3.89 ms | 5.20 ms | 1.1 MiB | 312 |
| 160 | 6.16 ms | 7.73 ms | 8.52 ms | 2.3 MiB | 162 |
| 320 | 12.0 ms | 12.1 ms | 14.9 ms | 4.7 MiB | 83 |
| 640 | 23.7 ms | 24.0 ms | 27.9 ms | 9.8 MiB | 42 |
| 1280 | 49.8 ms | 51.0 ms | 57.1 ms | 20.1 MiB | 20 |
| 2560 | 96.8 ms | 106 ms | 108 ms | 38.7 MiB | 10 |
| 5120 | 223 ms | 224 ms | 327 ms | 73.5 MiB | 4 |
| 10240 | 440 ms | 444 ms | 650 ms | 145.3 MiB | 2 |

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

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 45.8 µs | 54.3 µs | 46.6 µs | 47.0 KiB | 21,815 |
| 40 | 76.1 µs | 88.9 µs | 264 µs | 92.5 KiB | 13,140 |
| 80 | 145 µs | 177 µs | 476 µs | 188.5 KiB | 6,895 |
| 160 | 286 µs | 366 µs | 877 µs | 393.8 KiB | 3,500 |
| 320 | 621 µs | 784 µs | 1.81 ms | 855.1 KiB | 1,610 |
| 640 | 1.50 ms | 1.94 ms | 3.73 ms | 1.9 MiB | 666 |
| 1280 | 6.50 ms | 6.78 ms | 9.62 ms | 4.4 MiB | 154 |
| 2560 | 9.47 ms | 10.5 ms | 12.7 ms | 7.3 MiB | 106 |
| 5120 | 16.0 ms | 25.9 ms | 21.7 ms | 13.1 MiB | 62 |
| 10240 | 29.6 ms | 31.1 ms | 39.2 ms | 24.3 MiB | 34 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.97, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 56.1 µs | 64.4 µs | 58.6 µs | 54.2 KiB | 17,826 |
| 40 | 109 µs | 125 µs | 420 µs | 107.1 KiB | 9,216 |
| 80 | 221 µs | 254 µs | 733 µs | 217.5 KiB | 4,527 |
| 160 | 475 µs | 562 µs | 1.66 ms | 452.9 KiB | 2,104 |
| 320 | 1.10 ms | 1.30 ms | 3.85 ms | 975.5 KiB | 910 |
| 640 | 2.31 ms | 2.48 ms | 7.21 ms | 2.2 MiB | 433 |
| 1280 | 8.05 ms | 8.43 ms | 14.6 ms | 4.9 MiB | 124 |
| 2560 | 11.8 ms | 12.2 ms | 22.5 ms | 8.3 MiB | 85 |
| 5120 | 21.7 ms | 25.0 ms | 41.1 ms | 15.0 MiB | 46 |
| 10240 | 40.2 ms | 53.5 ms | 75.9 ms | 28.0 MiB | 25 |

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
| 20 | 45.4 µs | 51.6 µs | 49.7 µs | 47.0 KiB | 22,028 |
| 40 | 78.2 µs | 90.2 µs | 278 µs | 92.6 KiB | 12,790 |
| 80 | 155 µs | 183 µs | 516 µs | 188.5 KiB | 6,453 |
| 160 | 292 µs | 395 µs | 942 µs | 393.9 KiB | 3,419 |
| 320 | 611 µs | 737 µs | 1.72 ms | 856.0 KiB | 1,637 |
| 640 | 1.49 ms | 1.97 ms | 3.60 ms | 1.9 MiB | 671 |
| 1280 | 6.35 ms | 6.90 ms | 9.34 ms | 4.4 MiB | 158 |
| 2560 | 8.98 ms | 9.66 ms | 12.5 ms | 7.3 MiB | 111 |
| 5120 | 16.2 ms | 17.8 ms | 22.0 ms | 13.1 MiB | 62 |
| 10240 | 29.5 ms | 30.8 ms | 38.5 ms | 24.3 MiB | 34 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 59.1 µs | 67.5 µs | 60.5 µs | 54.3 KiB | 16,930 |
| 40 | 118 µs | 130 µs | 464 µs | 107.2 KiB | 8,508 |
| 80 | 232 µs | 265 µs | 878 µs | 217.8 KiB | 4,318 |
| 160 | 490 µs | 609 µs | 1.70 ms | 452.9 KiB | 2,041 |
| 320 | 1.15 ms | 1.40 ms | 4.03 ms | 975.7 KiB | 873 |
| 640 | 2.09 ms | 2.49 ms | 6.08 ms | 2.2 MiB | 479 |
| 1280 | 8.13 ms | 8.59 ms | 14.8 ms | 4.9 MiB | 123 |
| 2560 | 11.3 ms | 12.1 ms | 22.2 ms | 8.3 MiB | 88 |
| 5120 | 22.0 ms | 22.7 ms | 41.9 ms | 14.9 MiB | 45 |
| 10240 | 40.5 ms | 51.9 ms | 74.3 ms | 28.0 MiB | 25 |

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

**Measured: O(n log n)** (exponent 1.10, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 34.7 µs | 45.9 µs | 40.4 µs | 30.5 KiB | 28,847 |
| 40 | 43.2 µs | 50.4 µs | 161 µs | 55.2 KiB | 23,134 |
| 80 | 85.1 µs | 125 µs | 330 µs | 104.6 KiB | 11,745 |
| 160 | 143 µs | 191 µs | 444 µs | 207.7 KiB | 7,002 |
| 320 | 283 µs | 386 µs | 941 µs | 402.2 KiB | 3,529 |
| 640 | 488 µs | 578 µs | 1.24 ms | 816.0 KiB | 2,048 |
| 1280 | 1.32 ms | 1.46 ms | 3.75 ms | 1.3 MiB | 759 |
| 2560 | 2.59 ms | 2.75 ms | 5.79 ms | 2.7 MiB | 386 |
| 5120 | 5.37 ms | 5.56 ms | 10.1 ms | 5.5 MiB | 186 |
| 10240 | 11.0 ms | 12.0 ms | 19.1 ms | 10.8 MiB | 91 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent -0.02, 10 sizes) -- ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 289 µs | 317 µs | 952 µs | 620.2 KiB | 3,460 |
| 40 | 292 µs | 311 µs | 973 µs | 620.3 KiB | 3,424 |
| 80 | 300 µs | 351 µs | 999 µs | 626.2 KiB | 3,337 |
| 160 | 319 µs | 348 µs | 1.03 ms | 667.5 KiB | 3,139 |
| 320 | 344 µs | 371 µs | 1.06 ms | 716.3 KiB | 2,905 |
| 640 | 434 µs | 483 µs | 1.51 ms | 834.3 KiB | 2,303 |
| 1280 | 423 µs | 457 µs | 1.44 ms | 834.3 KiB | 2,367 |
| 2560 | 423 µs | 468 µs | 1.43 ms | 834.3 KiB | 2,363 |
| 5120 | 384 µs | 438 µs | 1.05 ms | 829.2 KiB | 2,603 |
| 10240 | 422 µs | 442 µs | 1.40 ms | 834.3 KiB | 2,371 |

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
| 20 | 219 µs | 246 µs | 800 µs | 45.8 KiB | 4,565 |
| 40 | 354 µs | 380 µs | 961 µs | 115.4 KiB | 2,826 |
| 80 | 876 µs | 954 µs | 2.69 ms | 179.3 KiB | 1,142 |
| 160 | 1.45 ms | 1.51 ms | 3.27 ms | 357.3 KiB | 692 |
| 320 | 2.67 ms | 2.84 ms | 4.99 ms | 712.3 KiB | 375 |
| 640 | 5.01 ms | 5.26 ms | 7.53 ms | 1.4 MiB | 199 |
| 1280 | 9.98 ms | 10.3 ms | 12.7 ms | 2.8 MiB | 100 |
| 2560 | 19.9 ms | 30.4 ms | 22.1 ms | 5.7 MiB | 50 |
| 5120 | 39.8 ms | 40.7 ms | 41.5 ms | 11.3 MiB | 25 |
| 10240 | 95.7 ms | 97.8 ms | 96.2 ms | 22.7 MiB | 10 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.10, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.27 ms | 2.49 ms | 4.71 ms | 599.8 KiB | 441 |
| 40 | 4.05 ms | 4.28 ms | 6.56 ms | 1.2 MiB | 247 |
| 80 | 7.50 ms | 7.67 ms | 10.0 ms | 2.3 MiB | 133 |
| 160 | 14.1 ms | 14.5 ms | 16.7 ms | 4.6 MiB | 71 |
| 320 | 27.6 ms | 28.4 ms | 28.1 ms | 9.3 MiB | 36 |
| 640 | 64.3 ms | 67.8 ms | 65.1 ms | 18.5 MiB | 16 |
| 1280 | 154 ms | 156 ms | 154 ms | 37.0 MiB | 6 |
| 2560 | 329 ms | 331 ms | 330 ms | 73.9 MiB | 3 |
| 5120 | 687 ms | 701 ms | 707 ms | 147.7 MiB | 1 |
| 10240 | 1.39 s | 1.39 s | 1.43 s | 295.3 MiB | 1 |

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
| 20 | 120 µs | 170 µs | 468 µs | 98.0 KiB | 8,356 |
| 40 | 180 µs | 208 µs | 611 µs | 179.0 KiB | 5,542 |
| 80 | 298 µs | 380 µs | 885 µs | 351.1 KiB | 3,358 |
| 160 | 516 µs | 567 µs | 1.39 ms | 637.9 KiB | 1,938 |
| 320 | 1.06 ms | 1.40 ms | 2.89 ms | 1.2 MiB | 940 |
| 640 | 1.94 ms | 2.73 ms | 3.93 ms | 2.5 MiB | 517 |
| 1280 | 4.21 ms | 5.82 ms | 6.62 ms | 4.9 MiB | 237 |
| 2560 | 7.73 ms | 8.04 ms | 10.4 ms | 9.9 MiB | 129 |
| 5120 | 16.9 ms | 18.1 ms | 20.6 ms | 19.8 MiB | 59 |
| 10240 | 34.1 ms | 36.1 ms | 40.2 ms | 39.6 MiB | 29 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.18, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 113 µs | 127 µs | 407 µs | 281.1 KiB | 8,867 |
| 40 | 199 µs | 221 µs | 625 µs | 540.1 KiB | 5,027 |
| 80 | 402 µs | 447 µs | 1.28 ms | 1.0 MiB | 2,488 |
| 160 | 740 µs | 867 µs | 1.70 ms | 2.1 MiB | 1,352 |
| 320 | 1.53 ms | 1.79 ms | 3.49 ms | 4.2 MiB | 656 |
| 640 | 2.95 ms | 3.17 ms | 5.18 ms | 8.3 MiB | 339 |
| 1280 | 5.81 ms | 7.21 ms | 8.57 ms | 16.7 MiB | 172 |
| 2560 | 11.9 ms | 12.5 ms | 15.8 ms | 33.3 MiB | 84 |
| 5120 | 31.8 ms | 37.7 ms | 37.1 ms | 52.0 MiB | 31 |
| 10240 | 75.8 ms | 78.2 ms | 89.6 ms | 103.7 MiB | 13 |

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
| 20 | 115 µs | 142 µs | 119 µs | 57.4 KiB | 8,687 |
| 40 | 194 µs | 243 µs | 199 µs | 113.5 KiB | 5,156 |
| 80 | 356 µs | 384 µs | 366 µs | 225.7 KiB | 2,808 |
| 160 | 604 µs | 641 µs | 2.33 ms | 450.0 KiB | 1,656 |
| 320 | 1.03 ms | 1.18 ms | 2.81 ms | 898.9 KiB | 967 |
| 640 | 1.93 ms | 2.13 ms | 3.82 ms | 1.8 MiB | 518 |
| 1280 | 3.46 ms | 3.90 ms | 4.88 ms | 3.5 MiB | 289 |
| 2560 | 6.67 ms | 6.87 ms | 7.07 ms | 6.9 MiB | 150 |
| 5120 | 13.5 ms | 13.7 ms | 13.8 ms | 13.8 MiB | 74 |
| 10240 | 30.1 ms | 32.0 ms | 30.7 ms | 27.7 MiB | 33 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.03, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 102 µs | 123 µs | 106 µs | 56.5 KiB | 9,804 |
| 40 | 183 µs | 200 µs | 188 µs | 111.8 KiB | 5,465 |
| 80 | 342 µs | 363 µs | 348 µs | 222.5 KiB | 2,928 |
| 160 | 592 µs | 634 µs | 2.35 ms | 443.7 KiB | 1,689 |
| 320 | 977 µs | 1.04 ms | 2.67 ms | 886.2 KiB | 1,023 |
| 640 | 1.76 ms | 1.79 ms | 3.51 ms | 1.7 MiB | 569 |
| 1280 | 3.47 ms | 3.49 ms | 5.81 ms | 3.5 MiB | 288 |
| 2560 | 6.85 ms | 6.98 ms | 8.45 ms | 6.9 MiB | 146 |
| 5120 | 14.3 ms | 15.1 ms | 17.8 ms | 13.8 MiB | 70 |
| 10240 | 31.1 ms | 32.3 ms | 37.7 ms | 27.7 MiB | 32 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 530 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 326 µs | 326 µs | 61% |
| `run-policies` | 1 | 145 µs | 145 µs | 27% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 59.2 µs | 11% |

**At 10240 checks** (whole operation: 77.2 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 42.3 ms | 42.3 ms | 55% |
| `run-policies` | 1 | 29.6 ms | 29.6 ms | 38% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 5.27 ms | 6.8% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-11T13:09:38.282Z` → `2026-11-11T13:11:14.246Z` (96 s), ci: CI (run 43021773948)
- Machine: AMD EPYC 9V74 80-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `14e1a573ee8492e838957ec10edf1dd89619e34e` on `docs/v1-claims-evidence`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

