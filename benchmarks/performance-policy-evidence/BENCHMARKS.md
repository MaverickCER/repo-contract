# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **185 µs** per operation compared with a bare-minimum baseline (**123% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.01). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 185 µs | 36.6 ms |
| Added latency, relative to baseline | 123% | 227% |
| Added CPU time per operation | 363 µs | 40.2 ms |
| Added memory per operation (heap delta) | 345.2 KiB | 44.2 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 5,408 ops/s | 27 ops/s |

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
| 20 | 41.9 µs | 120 µs | 77.6 µs | 185% | 299 µs | $0.00016 – $0.0034 |
| 40 | 75.7 µs | 188 µs | 112 µs | 148% | 305 µs | $0.00023 – $0.0034 |
| 80 | 151 µs | 336 µs | 185 µs | 123% | 363 µs | $0.00039 – $0.0041 |
| 160 | 294 µs | 648 µs | 354 µs | 121% | 600 µs | $0.00074 – $0.0067 |
| 320 | 577 µs | 1.29 ms | 714 µs | 124% | 1.30 ms | $0.0015 – $0.015 |
| 640 | 1.16 ms | 2.51 ms | 1.35 ms | 117% | 1.58 ms | $0.0028 – $0.018 |
| 1280 | 2.16 ms | 10.8 ms | 8.64 ms | 401% | 8.98 ms | $0.018 – $0.101 |
| 2560 | 4.15 ms | 15.2 ms | 11.0 ms | 265% | 11.8 ms | $0.023 – $0.132 |
| 5120 | 8.17 ms | 27.1 ms | 19.0 ms | 232% | 20.5 ms | $0.040 – $0.231 |
| 10240 | 16.1 ms | 52.8 ms | 36.6 ms | 227% | 40.2 ms | $0.076 – $0.452 |

**How the total grows:** O(n) (linear), exponent 1.01 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 220 µs | 29.2 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 2.23 ms | 318 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 92.4 µs | 21.4 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 137 µs | 31.3 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 100 µs | 21.9 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 129 µs | 32.2 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n log n) | ✅ matches | 59.2 µs | 7.67 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 208 µs | 291 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 598 µs | 76.2 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 5.86 ms | 1.13 s |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 195 µs | 24.3 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 250 µs | 58.1 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 264 µs | 20.2 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 260 µs | 23.3 ms |

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
| 20 | 62.8 µs | 67.8 µs | 187 µs | 52.8 KiB | 15,929 |
| 40 | 118 µs | 125 µs | 324 µs | 104.4 KiB | 8,447 |
| 80 | 220 µs | 228 µs | 529 µs | 211.2 KiB | 4,545 |
| 160 | 444 µs | 457 µs | 1.08 ms | 436.2 KiB | 2,251 |
| 320 | 802 µs | 874 µs | 1.45 ms | 938.5 KiB | 1,247 |
| 640 | 1.63 ms | 1.83 ms | 2.94 ms | 2.1 MiB | 613 |
| 1280 | 5.85 ms | 6.42 ms | 7.41 ms | 4.7 MiB | 171 |
| 2560 | 9.00 ms | 9.57 ms | 10.8 ms | 8.0 MiB | 111 |
| 5120 | 16.4 ms | 17.1 ms | 18.5 ms | 14.5 MiB | 61 |
| 10240 | 29.2 ms | 30.0 ms | 33.1 ms | 27.5 MiB | 34 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.07, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 601 µs | 608 µs | 1.23 ms | 294.9 KiB | 1,664 |
| 40 | 1.21 ms | 1.31 ms | 2.53 ms | 587.0 KiB | 828 |
| 80 | 2.23 ms | 2.76 ms | 3.65 ms | 1.1 MiB | 448 |
| 160 | 4.26 ms | 4.28 ms | 5.87 ms | 2.3 MiB | 235 |
| 320 | 8.31 ms | 8.54 ms | 10.3 ms | 4.7 MiB | 120 |
| 640 | 16.5 ms | 16.6 ms | 19.2 ms | 9.8 MiB | 61 |
| 1280 | 35.8 ms | 40.1 ms | 40.4 ms | 20.1 MiB | 28 |
| 2560 | 68.9 ms | 89.5 ms | 77.9 ms | 38.7 MiB | 15 |
| 5120 | 159 ms | 161 ms | 240 ms | 73.5 MiB | 6 |
| 10240 | 318 ms | 320 ms | 485 ms | 145.2 MiB | 3 |

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
| 20 | 35.2 µs | 41.7 µs | 35.7 µs | 47.0 KiB | 28,434 |
| 40 | 53.6 µs | 67.1 µs | 174 µs | 92.5 KiB | 18,657 |
| 80 | 92.4 µs | 133 µs | 254 µs | 187.7 KiB | 10,824 |
| 160 | 199 µs | 280 µs | 552 µs | 393.3 KiB | 5,036 |
| 320 | 416 µs | 550 µs | 1.19 ms | 855.1 KiB | 2,405 |
| 640 | 918 µs | 1.21 ms | 2.37 ms | 1.9 MiB | 1,089 |
| 1280 | 4.24 ms | 5.45 ms | 6.09 ms | 4.4 MiB | 236 |
| 2560 | 5.82 ms | 6.16 ms | 8.34 ms | 7.3 MiB | 172 |
| 5120 | 9.80 ms | 11.1 ms | 13.3 ms | 13.2 MiB | 102 |
| 10240 | 21.4 ms | 23.0 ms | 28.1 ms | 24.6 MiB | 47 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.02, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 37.6 µs | 41.3 µs | 142 µs | 54.1 KiB | 26,574 |
| 40 | 62.7 µs | 81.8 µs | 197 µs | 106.9 KiB | 15,947 |
| 80 | 137 µs | 169 µs | 428 µs | 217.3 KiB | 7,326 |
| 160 | 274 µs | 338 µs | 840 µs | 451.7 KiB | 3,653 |
| 320 | 558 µs | 719 µs | 1.66 ms | 968.0 KiB | 1,793 |
| 640 | 1.50 ms | 1.80 ms | 4.51 ms | 2.2 MiB | 668 |
| 1280 | 6.11 ms | 6.66 ms | 11.5 ms | 4.9 MiB | 164 |
| 2560 | 8.96 ms | 9.52 ms | 17.4 ms | 8.3 MiB | 112 |
| 5120 | 16.6 ms | 17.3 ms | 31.9 ms | 15.1 MiB | 60 |
| 10240 | 31.3 ms | 31.5 ms | 59.0 ms | 28.1 MiB | 32 |

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
| 20 | 32.8 µs | 36.5 µs | 69.8 µs | 46.9 KiB | 30,468 |
| 40 | 51.6 µs | 67.8 µs | 156 µs | 92.5 KiB | 19,374 |
| 80 | 100 µs | 136 µs | 295 µs | 188.3 KiB | 9,969 |
| 160 | 196 µs | 282 µs | 560 µs | 390.4 KiB | 5,108 |
| 320 | 409 µs | 542 µs | 1.20 ms | 855.9 KiB | 2,446 |
| 640 | 766 µs | 946 µs | 1.74 ms | 1.9 MiB | 1,306 |
| 1280 | 4.35 ms | 4.74 ms | 6.39 ms | 4.4 MiB | 230 |
| 2560 | 6.14 ms | 6.57 ms | 8.85 ms | 7.3 MiB | 163 |
| 5120 | 10.3 ms | 11.3 ms | 13.8 ms | 13.2 MiB | 97 |
| 10240 | 21.9 ms | 22.7 ms | 28.8 ms | 24.6 MiB | 46 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.06, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 38.9 µs | 41.8 µs | 83.4 µs | 54.2 KiB | 25,684 |
| 40 | 65.9 µs | 85.4 µs | 208 µs | 106.9 KiB | 15,166 |
| 80 | 129 µs | 168 µs | 405 µs | 216.0 KiB | 7,776 |
| 160 | 269 µs | 338 µs | 859 µs | 451.7 KiB | 3,717 |
| 320 | 542 µs | 683 µs | 1.61 ms | 968.7 KiB | 1,844 |
| 640 | 1.33 ms | 1.56 ms | 4.18 ms | 2.2 MiB | 753 |
| 1280 | 5.68 ms | 6.07 ms | 11.0 ms | 4.9 MiB | 176 |
| 2560 | 8.60 ms | 9.62 ms | 16.9 ms | 8.3 MiB | 116 |
| 5120 | 15.6 ms | 18.2 ms | 31.2 ms | 15.0 MiB | 64 |
| 10240 | 32.2 ms | 33.0 ms | 60.0 ms | 28.0 MiB | 31 |

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

**Measured: O(n log n)** (exponent 1.29, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 28.4 µs | 32.9 µs | 30.4 µs | 30.5 KiB | 35,240 |
| 40 | 30.0 µs | 41.3 µs | 92.4 µs | 55.1 KiB | 33,350 |
| 80 | 59.2 µs | 79.6 µs | 202 µs | 104.6 KiB | 16,885 |
| 160 | 105 µs | 139 µs | 300 µs | 207.3 KiB | 9,545 |
| 320 | 210 µs | 274 µs | 581 µs | 402.0 KiB | 4,758 |
| 640 | 188 µs | 194 µs | 485 µs | 612.2 KiB | 5,327 |
| 1280 | 800 µs | 832 µs | 1.64 ms | 1.3 MiB | 1,250 |
| 2560 | 1.75 ms | 1.85 ms | 3.87 ms | 2.7 MiB | 570 |
| 5120 | 3.75 ms | 3.84 ms | 7.09 ms | 5.5 MiB | 267 |
| 10240 | 7.67 ms | 7.81 ms | 14.0 ms | 10.8 MiB | 130 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent -0.00, 10 sizes) -- ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 203 µs | 213 µs | 572 µs | 616.4 KiB | 4,917 |
| 40 | 204 µs | 220 µs | 570 µs | 618.2 KiB | 4,906 |
| 80 | 208 µs | 229 µs | 575 µs | 625.9 KiB | 4,801 |
| 160 | 216 µs | 234 µs | 576 µs | 663.4 KiB | 4,629 |
| 320 | 241 µs | 256 µs | 617 µs | 722.7 KiB | 4,143 |
| 640 | 293 µs | 324 µs | 789 µs | 829.2 KiB | 3,411 |
| 1280 | 292 µs | 314 µs | 783 µs | 829.2 KiB | 3,424 |
| 2560 | 292 µs | 317 µs | 782 µs | 829.2 KiB | 3,422 |
| 5120 | 292 µs | 313 µs | 784 µs | 829.2 KiB | 3,423 |
| 10240 | 291 µs | 320 µs | 780 µs | 829.2 KiB | 3,436 |

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

**Measured: O(n)** (exponent 1.07, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 148 µs | 159 µs | 404 µs | 45.5 KiB | 6,772 |
| 40 | 280 µs | 363 µs | 726 µs | 115.7 KiB | 3,572 |
| 80 | 598 µs | 621 µs | 1.28 ms | 178.6 KiB | 1,673 |
| 160 | 1.16 ms | 1.19 ms | 2.51 ms | 357.3 KiB | 865 |
| 320 | 2.12 ms | 2.27 ms | 3.77 ms | 712.3 KiB | 473 |
| 640 | 3.83 ms | 3.96 ms | 5.59 ms | 1.4 MiB | 261 |
| 1280 | 7.67 ms | 7.85 ms | 9.56 ms | 2.8 MiB | 130 |
| 2560 | 15.3 ms | 15.5 ms | 17.6 ms | 5.7 MiB | 65 |
| 5120 | 31.5 ms | 32.0 ms | 33.6 ms | 11.3 MiB | 32 |
| 10240 | 76.2 ms | 76.5 ms | 76.7 ms | 22.7 MiB | 13 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.11, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.89 ms | 1.96 ms | 3.61 ms | 599.8 KiB | 530 |
| 40 | 3.16 ms | 3.30 ms | 5.02 ms | 1.2 MiB | 316 |
| 80 | 5.86 ms | 6.05 ms | 7.92 ms | 2.3 MiB | 171 |
| 160 | 11.1 ms | 11.6 ms | 13.3 ms | 4.6 MiB | 90 |
| 320 | 21.8 ms | 22.2 ms | 22.3 ms | 9.3 MiB | 46 |
| 640 | 51.3 ms | 51.9 ms | 51.8 ms | 18.5 MiB | 20 |
| 1280 | 124 ms | 125 ms | 125 ms | 37.0 MiB | 8 |
| 2560 | 270 ms | 271 ms | 270 ms | 73.9 MiB | 4 |
| 5120 | 558 ms | 561 ms | 573 ms | 147.7 MiB | 2 |
| 10240 | 1.13 s | 1.14 s | 1.17 s | 295.3 MiB | 1 |

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
| 20 | 75.2 µs | 95.0 µs | 275 µs | 98.0 KiB | 13,300 |
| 40 | 111 µs | 133 µs | 310 µs | 178.9 KiB | 9,046 |
| 80 | 195 µs | 296 µs | 502 µs | 322.2 KiB | 5,121 |
| 160 | 354 µs | 379 µs | 762 µs | 637.7 KiB | 2,825 |
| 320 | 688 µs | 721 µs | 1.32 ms | 1.2 MiB | 1,454 |
| 640 | 1.39 ms | 1.49 ms | 2.70 ms | 2.5 MiB | 717 |
| 1280 | 2.60 ms | 2.71 ms | 3.90 ms | 4.9 MiB | 385 |
| 2560 | 5.23 ms | 5.46 ms | 6.71 ms | 9.9 MiB | 191 |
| 5120 | 10.8 ms | 11.9 ms | 13.0 ms | 19.8 MiB | 93 |
| 10240 | 24.3 ms | 47.0 ms | 28.4 ms | 39.6 MiB | 41 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.20, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 73.2 µs | 82.8 µs | 208 µs | 281.2 KiB | 13,667 |
| 40 | 123 µs | 137 µs | 324 µs | 539.2 KiB | 8,153 |
| 80 | 250 µs | 273 µs | 644 µs | 1.0 MiB | 4,003 |
| 160 | 512 µs | 540 µs | 1.13 ms | 2.1 MiB | 1,953 |
| 320 | 1.09 ms | 1.17 ms | 2.37 ms | 4.2 MiB | 921 |
| 640 | 2.11 ms | 2.19 ms | 3.45 ms | 8.3 MiB | 475 |
| 1280 | 4.40 ms | 4.63 ms | 6.03 ms | 16.7 MiB | 227 |
| 2560 | 8.96 ms | 9.09 ms | 11.1 ms | 33.3 MiB | 112 |
| 5120 | 24.4 ms | 25.7 ms | 27.9 ms | 52.0 MiB | 41 |
| 10240 | 58.1 ms | 61.8 ms | 66.4 ms | 103.7 MiB | 17 |

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
| 20 | 79.5 µs | 95.2 µs | 82.0 µs | 57.4 KiB | 12,574 |
| 40 | 142 µs | 162 µs | 145 µs | 113.5 KiB | 7,039 |
| 80 | 264 µs | 281 µs | 267 µs | 225.7 KiB | 3,793 |
| 160 | 448 µs | 479 µs | 1.64 ms | 450.0 KiB | 2,232 |
| 320 | 733 µs | 1.05 ms | 1.89 ms | 898.9 KiB | 1,364 |
| 640 | 1.33 ms | 1.64 ms | 2.56 ms | 1.8 MiB | 749 |
| 1280 | 2.46 ms | 2.57 ms | 3.33 ms | 3.5 MiB | 406 |
| 2560 | 4.84 ms | 5.05 ms | 5.06 ms | 6.9 MiB | 207 |
| 5120 | 10.2 ms | 10.5 ms | 10.2 ms | 13.8 MiB | 98 |
| 10240 | 20.2 ms | 21.3 ms | 20.8 ms | 27.7 MiB | 49 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.04, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 73.0 µs | 87.7 µs | 76.0 µs | 56.5 KiB | 13,692 |
| 40 | 135 µs | 151 µs | 138 µs | 111.8 KiB | 7,400 |
| 80 | 260 µs | 279 µs | 265 µs | 222.5 KiB | 3,840 |
| 160 | 423 µs | 444 µs | 1.51 ms | 443.7 KiB | 2,364 |
| 320 | 733 µs | 773 µs | 1.84 ms | 886.2 KiB | 1,365 |
| 640 | 1.31 ms | 1.54 ms | 2.50 ms | 1.7 MiB | 761 |
| 1280 | 2.53 ms | 2.56 ms | 4.04 ms | 3.5 MiB | 394 |
| 2560 | 5.01 ms | 5.10 ms | 6.36 ms | 6.9 MiB | 200 |
| 5120 | 10.7 ms | 10.8 ms | 13.2 ms | 13.8 MiB | 93 |
| 10240 | 23.3 ms | 25.0 ms | 28.9 ms | 27.7 MiB | 43 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 336 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 220 µs | 220 µs | 66% |
| `run-policies` | 1 | 92.4 µs | 92.4 µs | 28% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 23.2 µs | 6.9% |

**At 10240 checks** (whole operation: 52.8 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 29.2 ms | 29.2 ms | 55% |
| `run-policies` | 1 | 21.4 ms | 21.4 ms | 41% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 2.09 ms | 4.0% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-02T14:39:06.789Z` → `2026-11-02T14:40:25.355Z` (79 s), ci: CI (run 41461721691)
- Machine: AMD EPYC 9V74 80-Core Processor, 4 logical core(s) (2 physical), 15984 MB RAM, linux/x64, Node v24.22.1, GitHub Actions
- Git: `d4c4c875bc5bb72485dcd1e00346784dbf00a4f3` on `feat/affected-scope`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

