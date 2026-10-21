# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **241 µs** per operation compared with a bare-minimum baseline (**155% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.96). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 241 µs | 31.7 ms |
| Added latency, relative to baseline | 155% | 219% |
| Added CPU time per operation | 736 µs | 34.1 ms |
| Added memory per operation (heap delta) | 345.9 KiB | 44.8 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 4,144 ops/s | 32 ops/s |

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
| 20 | 48.3 µs | 142 µs | 93.2 µs | 193% | 366 µs | $0.00019 – $0.0041 |
| 40 | 80.5 µs | 205 µs | 125 µs | 155% | 357 µs | $0.00026 – $0.004 |
| 80 | 156 µs | 397 µs | 241 µs | 155% | 736 µs | $0.0005 – $0.0083 |
| 160 | 293 µs | 673 µs | 380 µs | 130% | 678 µs | $0.00079 – $0.0076 |
| 320 | 562 µs | 1.35 ms | 793 µs | 141% | 1.61 ms | $0.0017 – $0.018 |
| 640 | 1.13 ms | 2.56 ms | 1.43 ms | 127% | 1.74 ms | $0.003 – $0.020 |
| 1280 | 2.01 ms | 9.85 ms | 7.84 ms | 390% | 8.22 ms | $0.016 – $0.092 |
| 2560 | 3.77 ms | 14.1 ms | 10.3 ms | 273% | 11.1 ms | $0.022 – $0.125 |
| 5120 | 7.34 ms | 23.8 ms | 16.4 ms | 224% | 18.6 ms | $0.034 – $0.210 |
| 10240 | 14.5 ms | 46.2 ms | 31.7 ms | 219% | 34.1 ms | $0.066 – $0.384 |

**How the total grows:** O(n) (linear), exponent 0.96 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 231 µs | 26.4 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 2.18 ms | 300 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 114 µs | 16.7 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 151 µs | 27.5 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 108 µs | 16.3 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 158 µs | 27.4 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n log n) | ✅ matches | 63.9 µs | 7.52 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 224 µs | 315 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 573 µs | 69.7 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n) | ✅ matches | 5.63 ms | 1.05 s |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 196 µs | 20.1 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 266 µs | 54.0 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 250 µs | 20.6 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 242 µs | 22.0 ms |

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
| 20 | 74.9 µs | 82.0 µs | 280 µs | 52.8 KiB | 13,342 |
| 40 | 135 µs | 141 µs | 468 µs | 104.5 KiB | 7,403 |
| 80 | 231 µs | 259 µs | 650 µs | 211.2 KiB | 4,326 |
| 160 | 461 µs | 486 µs | 1.30 ms | 436.3 KiB | 2,167 |
| 320 | 805 µs | 857 µs | 1.68 ms | 938.5 KiB | 1,242 |
| 640 | 1.59 ms | 1.70 ms | 3.17 ms | 2.1 MiB | 629 |
| 1280 | 5.82 ms | 6.11 ms | 7.59 ms | 4.7 MiB | 172 |
| 2560 | 8.64 ms | 8.93 ms | 10.7 ms | 8.0 MiB | 116 |
| 5120 | 14.2 ms | 14.4 ms | 16.1 ms | 14.5 MiB | 71 |
| 10240 | 26.4 ms | 27.5 ms | 29.6 ms | 27.6 MiB | 38 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.07, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 608 µs | 636 µs | 1.46 ms | 294.9 KiB | 1,645 |
| 40 | 1.21 ms | 1.24 ms | 2.98 ms | 587.1 KiB | 826 |
| 80 | 2.18 ms | 2.62 ms | 4.09 ms | 1.1 MiB | 458 |
| 160 | 4.10 ms | 4.26 ms | 6.29 ms | 2.3 MiB | 244 |
| 320 | 7.86 ms | 8.19 ms | 10.6 ms | 4.7 MiB | 127 |
| 640 | 15.5 ms | 16.0 ms | 19.3 ms | 9.8 MiB | 64 |
| 1280 | 33.7 ms | 36.6 ms | 39.7 ms | 20.1 MiB | 30 |
| 2560 | 64.1 ms | 68.7 ms | 74.5 ms | 38.7 MiB | 16 |
| 5120 | 150 ms | 150 ms | 241 ms | 73.5 MiB | 7 |
| 10240 | 300 ms | 304 ms | 490 ms | 145.3 MiB | 3 |

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

**Measured: O(n)** (exponent 0.98, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 40.3 µs | 49.2 µs | 41.3 µs | 47.2 KiB | 24,830 |
| 40 | 58.8 µs | 65.4 µs | 196 µs | 92.4 KiB | 16,995 |
| 80 | 114 µs | 131 µs | 379 µs | 188.4 KiB | 8,793 |
| 160 | 206 µs | 250 µs | 635 µs | 393.3 KiB | 4,859 |
| 320 | 438 µs | 561 µs | 1.34 ms | 855.2 KiB | 2,282 |
| 640 | 802 µs | 991 µs | 1.75 ms | 1.9 MiB | 1,246 |
| 1280 | 4.27 ms | 4.54 ms | 6.68 ms | 4.4 MiB | 234 |
| 2560 | 5.83 ms | 6.10 ms | 8.65 ms | 7.3 MiB | 172 |
| 5120 | 8.84 ms | 10.6 ms | 12.9 ms | 13.2 MiB | 113 |
| 10240 | 16.7 ms | 17.6 ms | 23.3 ms | 24.7 MiB | 60 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.98, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 41.8 µs | 50.1 µs | 44.2 µs | 54.1 KiB | 23,898 |
| 40 | 75.8 µs | 82.5 µs | 295 µs | 107.0 KiB | 13,193 |
| 80 | 151 µs | 175 µs | 536 µs | 217.3 KiB | 6,609 |
| 160 | 318 µs | 361 µs | 1.06 ms | 451.7 KiB | 3,146 |
| 320 | 637 µs | 740 µs | 2.11 ms | 968.8 KiB | 1,569 |
| 640 | 1.44 ms | 1.51 ms | 5.33 ms | 2.2 MiB | 696 |
| 1280 | 5.15 ms | 5.85 ms | 11.1 ms | 4.9 MiB | 194 |
| 2560 | 7.15 ms | 9.51 ms | 16.2 ms | 8.3 MiB | 140 |
| 5120 | 12.8 ms | 13.7 ms | 29.6 ms | 15.1 MiB | 78 |
| 10240 | 27.5 ms | 28.6 ms | 62.6 ms | 28.2 MiB | 36 |

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

**Measured: O(n)** (exponent 0.97, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 34.0 µs | 41.5 µs | 36.7 µs | 47.0 KiB | 29,426 |
| 40 | 57.0 µs | 62.0 µs | 195 µs | 92.5 KiB | 17,554 |
| 80 | 108 µs | 138 µs | 353 µs | 188.3 KiB | 9,253 |
| 160 | 212 µs | 263 µs | 650 µs | 393.6 KiB | 4,708 |
| 320 | 452 µs | 582 µs | 1.47 ms | 856.1 KiB | 2,212 |
| 640 | 819 µs | 1.00 ms | 2.06 ms | 1.9 MiB | 1,220 |
| 1280 | 4.31 ms | 4.55 ms | 6.99 ms | 4.4 MiB | 232 |
| 2560 | 5.80 ms | 6.06 ms | 8.74 ms | 7.3 MiB | 172 |
| 5120 | 8.96 ms | 11.1 ms | 13.2 ms | 13.2 MiB | 112 |
| 10240 | 16.3 ms | 17.7 ms | 23.3 ms | 24.7 MiB | 61 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 41.5 µs | 45.2 µs | 44.8 µs | 54.2 KiB | 24,116 |
| 40 | 77.1 µs | 86.8 µs | 293 µs | 107.0 KiB | 12,968 |
| 80 | 158 µs | 177 µs | 552 µs | 217.3 KiB | 6,319 |
| 160 | 322 µs | 371 µs | 1.05 ms | 451.7 KiB | 3,103 |
| 320 | 612 µs | 718 µs | 2.06 ms | 970.6 KiB | 1,635 |
| 640 | 1.38 ms | 1.47 ms | 5.14 ms | 2.2 MiB | 723 |
| 1280 | 5.28 ms | 5.59 ms | 11.4 ms | 4.9 MiB | 189 |
| 2560 | 7.31 ms | 7.94 ms | 16.5 ms | 8.3 MiB | 137 |
| 5120 | 13.0 ms | 14.2 ms | 29.0 ms | 15.1 MiB | 77 |
| 10240 | 27.4 ms | 27.9 ms | 62.0 ms | 28.2 MiB | 37 |

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

**Measured: O(n log n)** (exponent 1.21, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 24.6 µs | 37.4 µs | 25.0 µs | 30.5 KiB | 40,643 |
| 40 | 35.9 µs | 54.3 µs | 135 µs | 55.2 KiB | 27,883 |
| 80 | 63.9 µs | 72.0 µs | 221 µs | 104.6 KiB | 15,655 |
| 160 | 129 µs | 176 µs | 485 µs | 208.3 KiB | 7,724 |
| 320 | 204 µs | 268 µs | 559 µs | 401.8 KiB | 4,900 |
| 640 | 216 µs | 235 µs | 715 µs | 615.2 KiB | 4,624 |
| 1280 | 995 µs | 1.06 ms | 3.25 ms | 1.3 MiB | 1,005 |
| 2560 | 1.83 ms | 1.91 ms | 4.60 ms | 2.7 MiB | 546 |
| 5120 | 3.68 ms | 3.81 ms | 7.63 ms | 5.5 MiB | 272 |
| 10240 | 7.52 ms | 7.68 ms | 13.4 ms | 10.8 MiB | 133 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent 0.01, 10 sizes) -- ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 214 µs | 233 µs | 702 µs | 616.4 KiB | 4,663 |
| 40 | 219 µs | 234 µs | 711 µs | 618.2 KiB | 4,571 |
| 80 | 224 µs | 236 µs | 709 µs | 625.9 KiB | 4,474 |
| 160 | 234 µs | 243 µs | 725 µs | 663.4 KiB | 4,271 |
| 320 | 254 µs | 277 µs | 743 µs | 722.7 KiB | 3,929 |
| 640 | 309 µs | 332 µs | 964 µs | 829.2 KiB | 3,231 |
| 1280 | 312 µs | 329 µs | 963 µs | 829.2 KiB | 3,207 |
| 2560 | 310 µs | 341 µs | 959 µs | 829.2 KiB | 3,222 |
| 5120 | 313 µs | 337 µs | 973 µs | 829.2 KiB | 3,198 |
| 10240 | 315 µs | 331 µs | 961 µs | 829.2 KiB | 3,174 |

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
| 20 | 151 µs | 159 µs | 492 µs | 45.5 KiB | 6,615 |
| 40 | 280 µs | 295 µs | 858 µs | 115.7 KiB | 3,572 |
| 80 | 573 µs | 613 µs | 1.42 ms | 178.6 KiB | 1,745 |
| 160 | 1.38 ms | 1.46 ms | 3.23 ms | 357.3 KiB | 724 |
| 320 | 2.47 ms | 2.58 ms | 4.59 ms | 712.3 KiB | 405 |
| 640 | 4.74 ms | 4.85 ms | 7.02 ms | 1.4 MiB | 211 |
| 1280 | 9.47 ms | 9.88 ms | 12.0 ms | 2.8 MiB | 106 |
| 2560 | 19.0 ms | 20.3 ms | 21.9 ms | 5.7 MiB | 53 |
| 5120 | 42.2 ms | 51.4 ms | 45.2 ms | 11.3 MiB | 24 |
| 10240 | 69.7 ms | 70.4 ms | 73.6 ms | 22.7 MiB | 14 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.02, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.74 ms | 1.85 ms | 3.80 ms | 599.8 KiB | 574 |
| 40 | 3.03 ms | 3.23 ms | 5.13 ms | 1.2 MiB | 330 |
| 80 | 5.63 ms | 5.81 ms | 7.87 ms | 2.3 MiB | 178 |
| 160 | 10.9 ms | 11.3 ms | 13.3 ms | 4.6 MiB | 91 |
| 320 | 29.3 ms | 29.9 ms | 32.1 ms | 9.3 MiB | 34 |
| 640 | 61.3 ms | 63.7 ms | 65.6 ms | 18.5 MiB | 16 |
| 1280 | 127 ms | 128 ms | 130 ms | 37.0 MiB | 8 |
| 2560 | 258 ms | 264 ms | 259 ms | 73.9 MiB | 4 |
| 5120 | 527 ms | 547 ms | 543 ms | 147.7 MiB | 2 |
| 10240 | 1.05 s | 1.06 s | 1.08 s | 295.3 MiB | 1 |

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

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 82.0 µs | 116 µs | 324 µs | 98.0 KiB | 12,202 |
| 40 | 116 µs | 148 µs | 382 µs | 178.9 KiB | 8,650 |
| 80 | 196 µs | 265 µs | 596 µs | 322.2 KiB | 5,111 |
| 160 | 385 µs | 413 µs | 1.20 ms | 637.8 KiB | 2,601 |
| 320 | 660 µs | 720 µs | 1.50 ms | 1.2 MiB | 1,515 |
| 640 | 1.33 ms | 1.46 ms | 3.05 ms | 2.5 MiB | 753 |
| 1280 | 2.43 ms | 2.53 ms | 4.15 ms | 4.9 MiB | 412 |
| 2560 | 4.72 ms | 4.94 ms | 6.71 ms | 9.9 MiB | 212 |
| 5120 | 9.95 ms | 10.4 ms | 12.7 ms | 19.8 MiB | 101 |
| 10240 | 20.1 ms | 20.4 ms | 24.1 ms | 39.6 MiB | 50 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.16, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 70.1 µs | 76.7 µs | 252 µs | 281.2 KiB | 14,272 |
| 40 | 127 µs | 137 µs | 401 µs | 539.2 KiB | 7,861 |
| 80 | 266 µs | 295 µs | 807 µs | 1.0 MiB | 3,759 |
| 160 | 538 µs | 571 µs | 1.40 ms | 2.1 MiB | 1,860 |
| 320 | 1.19 ms | 1.27 ms | 2.98 ms | 4.2 MiB | 842 |
| 640 | 2.20 ms | 2.34 ms | 4.11 ms | 8.3 MiB | 455 |
| 1280 | 4.21 ms | 4.34 ms | 6.38 ms | 16.7 MiB | 238 |
| 2560 | 8.41 ms | 8.78 ms | 11.2 ms | 33.3 MiB | 119 |
| 5120 | 22.0 ms | 25.5 ms | 25.8 ms | 52.0 MiB | 45 |
| 10240 | 54.0 ms | 60.3 ms | 63.7 ms | 103.7 MiB | 19 |

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
| 20 | 82.5 µs | 116 µs | 86.0 µs | 57.3 KiB | 12,126 |
| 40 | 140 µs | 156 µs | 143 µs | 113.3 KiB | 7,166 |
| 80 | 250 µs | 273 µs | 254 µs | 225.5 KiB | 4,000 |
| 160 | 467 µs | 494 µs | 1.52 ms | 450.0 KiB | 2,141 |
| 320 | 748 µs | 929 µs | 2.37 ms | 898.7 KiB | 1,337 |
| 640 | 1.33 ms | 1.38 ms | 2.97 ms | 1.8 MiB | 754 |
| 1280 | 2.39 ms | 2.51 ms | 3.91 ms | 3.5 MiB | 419 |
| 2560 | 4.63 ms | 4.95 ms | 4.96 ms | 7.0 MiB | 216 |
| 5120 | 10.1 ms | 10.4 ms | 10.4 ms | 14.0 MiB | 99 |
| 10240 | 20.6 ms | 20.9 ms | 21.1 ms | 28.1 MiB | 49 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 78.2 µs | 91.2 µs | 82.0 µs | 57.3 KiB | 12,794 |
| 40 | 137 µs | 155 µs | 141 µs | 113.3 KiB | 7,276 |
| 80 | 242 µs | 264 µs | 246 µs | 225.5 KiB | 4,141 |
| 160 | 473 µs | 500 µs | 1.92 ms | 450.0 KiB | 2,116 |
| 320 | 764 µs | 846 µs | 2.27 ms | 898.7 KiB | 1,309 |
| 640 | 1.37 ms | 1.39 ms | 3.00 ms | 1.8 MiB | 729 |
| 1280 | 2.68 ms | 2.73 ms | 4.84 ms | 3.5 MiB | 374 |
| 2560 | 4.95 ms | 5.01 ms | 7.24 ms | 7.0 MiB | 202 |
| 5120 | 10.2 ms | 10.3 ms | 13.6 ms | 14.0 MiB | 98 |
| 10240 | 22.0 ms | 22.6 ms | 27.9 ms | 28.1 MiB | 46 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 397 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 231 µs | 231 µs | 58% |
| `run-policies` | 1 | 114 µs | 114 µs | 29% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 52.5 µs | 13% |

**At 10240 checks** (whole operation: 46.2 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 26.4 ms | 26.4 ms | 57% |
| `run-policies` | 1 | 16.7 ms | 16.7 ms | 36% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 3.11 ms | 6.7% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-21T16:02:47.702Z` → `2026-10-21T16:04:09.388Z` (82 s), ci: CI (run 39629298189)
- Machine: INTEL(R) XEON(R) PLATINUM 8573C, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.0, GitHub Actions
- Git: `f7d1a4bf74a791c9676a1904e49eec1b38243cf1` on `fix/license-config-and-e2e-zero-tests`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

