# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **196 µs** per operation compared with a bare-minimum baseline (**125% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.01). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 196 µs | 41.0 ms |
| Added latency, relative to baseline | 125% | 236% |
| Added CPU time per operation | 385 µs | 43.2 ms |
| Added memory per operation (heap delta) | 345.2 KiB | 44.6 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 5,102 ops/s | 24 ops/s |

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
| 20 | 43.0 µs | 124 µs | 80.8 µs | 188% | 303 µs | $0.00017 – $0.0034 |
| 40 | 79.3 µs | 194 µs | 114 µs | 144% | 275 µs | $0.00024 – $0.0031 |
| 80 | 157 µs | 353 µs | 196 µs | 125% | 385 µs | $0.00041 – $0.0043 |
| 160 | 306 µs | 682 µs | 376 µs | 123% | 588 µs | $0.00078 – $0.0066 |
| 320 | 592 µs | 1.37 ms | 781 µs | 132% | 1.39 ms | $0.0016 – $0.016 |
| 640 | 1.18 ms | 2.98 ms | 1.80 ms | 152% | 2.16 ms | $0.0037 – $0.024 |
| 1280 | 2.24 ms | 10.7 ms | 8.51 ms | 380% | 9.18 ms | $0.018 – $0.103 |
| 2560 | 4.33 ms | 16.1 ms | 11.8 ms | 272% | 12.2 ms | $0.025 – $0.137 |
| 5120 | 8.76 ms | 30.5 ms | 21.8 ms | 248% | 23.3 ms | $0.045 – $0.262 |
| 10240 | 17.4 ms | 58.3 ms | 41.0 ms | 236% | 43.2 ms | $0.085 – $0.486 |

**How the total grows:** O(n) (linear), exponent 1.01 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 239 µs | 31.9 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 2.29 ms | 319 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 92.4 µs | 25.7 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 130 µs | 33.2 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 99.9 µs | 23.3 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 145 µs | 32.9 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n log n) | ✅ matches | 54.1 µs | 7.98 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 211 µs | 291 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 557 µs | 74.8 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 5.83 ms | 1.12 s |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 210 µs | 27.5 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 278 µs | 66.1 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 263 µs | 21.5 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 262 µs | 26.1 ms |

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
| 20 | 68.6 µs | 77.5 µs | 217 µs | 52.8 KiB | 14,576 |
| 40 | 122 µs | 132 µs | 320 µs | 104.4 KiB | 8,165 |
| 80 | 239 µs | 246 µs | 622 µs | 211.4 KiB | 4,184 |
| 160 | 463 µs | 478 µs | 1.11 ms | 436.2 KiB | 2,161 |
| 320 | 851 µs | 892 µs | 1.51 ms | 938.5 KiB | 1,175 |
| 640 | 1.76 ms | 1.91 ms | 3.19 ms | 2.1 MiB | 567 |
| 1280 | 6.18 ms | 6.88 ms | 7.74 ms | 4.7 MiB | 162 |
| 2560 | 9.52 ms | 11.5 ms | 11.2 ms | 8.0 MiB | 105 |
| 5120 | 16.7 ms | 17.7 ms | 18.6 ms | 14.5 MiB | 60 |
| 10240 | 31.9 ms | 32.3 ms | 35.0 ms | 27.5 MiB | 31 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.06, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 607 µs | 619 µs | 1.25 ms | 294.9 KiB | 1,647 |
| 40 | 1.23 ms | 1.25 ms | 2.61 ms | 587.0 KiB | 815 |
| 80 | 2.29 ms | 2.83 ms | 3.81 ms | 1.1 MiB | 436 |
| 160 | 4.40 ms | 4.48 ms | 6.19 ms | 2.3 MiB | 227 |
| 320 | 8.56 ms | 8.62 ms | 10.8 ms | 4.7 MiB | 117 |
| 640 | 17.0 ms | 17.2 ms | 20.2 ms | 9.8 MiB | 59 |
| 1280 | 37.4 ms | 42.3 ms | 43.2 ms | 20.1 MiB | 27 |
| 2560 | 71.1 ms | 77.3 ms | 80.2 ms | 38.7 MiB | 14 |
| 5120 | 163 ms | 163 ms | 244 ms | 73.5 MiB | 6 |
| 10240 | 319 ms | 321 ms | 488 ms | 145.2 MiB | 3 |

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

**Measured: O(n)** (exponent 1.07, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 35.4 µs | 40.3 µs | 36.1 µs | 47.0 KiB | 28,243 |
| 40 | 52.5 µs | 67.5 µs | 159 µs | 92.4 KiB | 19,050 |
| 80 | 92.4 µs | 134 µs | 232 µs | 187.5 KiB | 10,817 |
| 160 | 207 µs | 280 µs | 593 µs | 393.3 KiB | 4,831 |
| 320 | 467 µs | 581 µs | 1.29 ms | 855.1 KiB | 2,140 |
| 640 | 1.03 ms | 1.34 ms | 2.51 ms | 1.9 MiB | 970 |
| 1280 | 4.90 ms | 5.15 ms | 7.02 ms | 4.4 MiB | 204 |
| 2560 | 7.47 ms | 8.02 ms | 10.3 ms | 7.3 MiB | 134 |
| 5120 | 13.3 ms | 13.9 ms | 18.1 ms | 13.2 MiB | 75 |
| 10240 | 25.7 ms | 27.0 ms | 32.7 ms | 24.3 MiB | 39 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 41.2 µs | 45.8 µs | 135 µs | 54.1 KiB | 24,276 |
| 40 | 74.7 µs | 85.3 µs | 228 µs | 106.9 KiB | 13,392 |
| 80 | 130 µs | 168 µs | 396 µs | 217.2 KiB | 7,694 |
| 160 | 287 µs | 360 µs | 886 µs | 451.7 KiB | 3,480 |
| 320 | 605 µs | 1.17 ms | 1.72 ms | 965.6 KiB | 1,654 |
| 640 | 1.77 ms | 2.13 ms | 5.23 ms | 2.2 MiB | 565 |
| 1280 | 6.25 ms | 6.62 ms | 11.5 ms | 4.9 MiB | 160 |
| 2560 | 8.98 ms | 9.40 ms | 17.2 ms | 8.3 MiB | 111 |
| 5120 | 17.6 ms | 17.9 ms | 33.5 ms | 15.1 MiB | 57 |
| 10240 | 33.2 ms | 36.9 ms | 61.2 ms | 28.0 MiB | 30 |

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

**Measured: O(n)** (exponent 1.07, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 33.3 µs | 36.6 µs | 121 µs | 46.9 KiB | 30,001 |
| 40 | 54.2 µs | 69.0 µs | 170 µs | 92.5 KiB | 18,457 |
| 80 | 99.9 µs | 136 µs | 285 µs | 188.3 KiB | 10,007 |
| 160 | 199 µs | 281 µs | 560 µs | 393.6 KiB | 5,036 |
| 320 | 430 µs | 565 µs | 1.20 ms | 849.7 KiB | 2,324 |
| 640 | 897 µs | 1.08 ms | 1.93 ms | 1.9 MiB | 1,115 |
| 1280 | 4.54 ms | 5.10 ms | 6.60 ms | 4.4 MiB | 220 |
| 2560 | 6.52 ms | 7.16 ms | 9.09 ms | 7.3 MiB | 153 |
| 5120 | 11.3 ms | 13.9 ms | 15.0 ms | 13.2 MiB | 88 |
| 10240 | 23.3 ms | 25.5 ms | 30.4 ms | 24.3 MiB | 43 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.05, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 39.1 µs | 42.7 µs | 153 µs | 54.1 KiB | 25,572 |
| 40 | 71.4 µs | 85.3 µs | 206 µs | 106.9 KiB | 14,002 |
| 80 | 145 µs | 168 µs | 413 µs | 217.2 KiB | 6,880 |
| 160 | 273 µs | 347 µs | 817 µs | 451.7 KiB | 3,663 |
| 320 | 580 µs | 717 µs | 1.70 ms | 956.4 KiB | 1,724 |
| 640 | 1.45 ms | 1.78 ms | 4.38 ms | 2.2 MiB | 689 |
| 1280 | 6.39 ms | 6.94 ms | 11.7 ms | 4.9 MiB | 156 |
| 2560 | 9.30 ms | 9.94 ms | 17.7 ms | 8.3 MiB | 108 |
| 5120 | 18.0 ms | 18.3 ms | 33.5 ms | 15.0 MiB | 55 |
| 10240 | 32.9 ms | 34.1 ms | 61.7 ms | 27.9 MiB | 30 |

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

**Measured: O(n log n)** (exponent 1.20, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 23.5 µs | 32.6 µs | 30.4 µs | 30.4 KiB | 42,517 |
| 40 | 32.6 µs | 38.6 µs | 111 µs | 55.2 KiB | 30,668 |
| 80 | 54.1 µs | 70.7 µs | 154 µs | 104.6 KiB | 18,487 |
| 160 | 106 µs | 130 µs | 295 µs | 207.3 KiB | 9,441 |
| 320 | 220 µs | 341 µs | 678 µs | 402.2 KiB | 4,550 |
| 640 | 249 µs | 307 µs | 998 µs | 604.1 KiB | 4,013 |
| 1280 | 988 µs | 1.03 ms | 2.73 ms | 1.3 MiB | 1,012 |
| 2560 | 1.86 ms | 2.07 ms | 4.01 ms | 2.7 MiB | 538 |
| 5120 | 3.93 ms | 4.15 ms | 7.34 ms | 5.5 MiB | 255 |
| 10240 | 7.98 ms | 8.31 ms | 13.9 ms | 10.8 MiB | 125 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent -0.00, 10 sizes) -- ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 200 µs | 224 µs | 569 µs | 616.4 KiB | 5,006 |
| 40 | 204 µs | 219 µs | 569 µs | 618.2 KiB | 4,908 |
| 80 | 211 µs | 226 µs | 585 µs | 625.9 KiB | 4,736 |
| 160 | 217 µs | 237 µs | 582 µs | 663.4 KiB | 4,615 |
| 320 | 239 µs | 268 µs | 607 µs | 722.7 KiB | 4,183 |
| 640 | 293 µs | 319 µs | 781 µs | 829.2 KiB | 3,416 |
| 1280 | 295 µs | 315 µs | 793 µs | 829.2 KiB | 3,390 |
| 2560 | 292 µs | 318 µs | 785 µs | 829.2 KiB | 3,425 |
| 5120 | 291 µs | 329 µs | 787 µs | 829.2 KiB | 3,442 |
| 10240 | 291 µs | 306 µs | 785 µs | 829.2 KiB | 3,436 |

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
| 20 | 143 µs | 153 µs | 397 µs | 45.5 KiB | 6,993 |
| 40 | 266 µs | 279 µs | 700 µs | 115.7 KiB | 3,755 |
| 80 | 557 µs | 586 µs | 1.23 ms | 178.6 KiB | 1,796 |
| 160 | 1.08 ms | 1.12 ms | 2.41 ms | 357.3 KiB | 928 |
| 320 | 1.96 ms | 2.08 ms | 3.55 ms | 712.3 KiB | 510 |
| 640 | 3.73 ms | 3.85 ms | 5.48 ms | 1.4 MiB | 268 |
| 1280 | 7.61 ms | 7.78 ms | 9.79 ms | 2.8 MiB | 131 |
| 2560 | 14.8 ms | 15.4 ms | 17.1 ms | 5.7 MiB | 68 |
| 5120 | 30.9 ms | 33.6 ms | 33.9 ms | 11.3 MiB | 32 |
| 10240 | 74.8 ms | 76.8 ms | 75.7 ms | 22.7 MiB | 13 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.11, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.78 ms | 2.46 ms | 3.51 ms | 599.8 KiB | 563 |
| 40 | 3.13 ms | 3.26 ms | 5.00 ms | 1.2 MiB | 319 |
| 80 | 5.83 ms | 5.97 ms | 7.92 ms | 2.3 MiB | 171 |
| 160 | 11.0 ms | 21.2 ms | 13.2 ms | 4.6 MiB | 91 |
| 320 | 21.5 ms | 21.9 ms | 22.0 ms | 9.3 MiB | 47 |
| 640 | 50.7 ms | 51.9 ms | 51.1 ms | 18.5 MiB | 20 |
| 1280 | 125 ms | 128 ms | 125 ms | 37.0 MiB | 8 |
| 2560 | 271 ms | 273 ms | 272 ms | 73.9 MiB | 4 |
| 5120 | 550 ms | 551 ms | 566 ms | 147.7 MiB | 2 |
| 10240 | 1.12 s | 1.15 s | 1.15 s | 295.3 MiB | 1 |

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

**Measured: O(n)** (exponent 1.07, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 75.1 µs | 95.8 µs | 271 µs | 98.0 KiB | 13,322 |
| 40 | 117 µs | 161 µs | 316 µs | 178.9 KiB | 8,577 |
| 80 | 210 µs | 248 µs | 609 µs | 322.3 KiB | 4,755 |
| 160 | 367 µs | 410 µs | 778 µs | 637.7 KiB | 2,724 |
| 320 | 715 µs | 777 µs | 1.35 ms | 1.2 MiB | 1,399 |
| 640 | 1.41 ms | 1.51 ms | 2.70 ms | 2.5 MiB | 710 |
| 1280 | 2.68 ms | 2.85 ms | 3.83 ms | 4.9 MiB | 373 |
| 2560 | 5.49 ms | 5.69 ms | 7.23 ms | 9.9 MiB | 182 |
| 5120 | 12.0 ms | 13.2 ms | 14.5 ms | 19.8 MiB | 83 |
| 10240 | 27.5 ms | 28.3 ms | 32.1 ms | 39.6 MiB | 36 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.21, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 78.0 µs | 83.6 µs | 230 µs | 281.1 KiB | 12,818 |
| 40 | 140 µs | 152 µs | 343 µs | 539.2 KiB | 7,133 |
| 80 | 278 µs | 336 µs | 673 µs | 1.0 MiB | 3,593 |
| 160 | 518 µs | 553 µs | 1.14 ms | 2.1 MiB | 1,931 |
| 320 | 1.17 ms | 1.22 ms | 2.42 ms | 4.2 MiB | 858 |
| 640 | 2.38 ms | 2.47 ms | 3.75 ms | 8.3 MiB | 420 |
| 1280 | 4.78 ms | 5.03 ms | 6.57 ms | 16.7 MiB | 209 |
| 2560 | 9.46 ms | 9.72 ms | 11.9 ms | 33.3 MiB | 106 |
| 5120 | 26.6 ms | 34.3 ms | 30.1 ms | 52.0 MiB | 38 |
| 10240 | 66.1 ms | 67.8 ms | 75.7 ms | 103.7 MiB | 15 |

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
| 20 | 79.1 µs | 101 µs | 82.0 µs | 57.4 KiB | 12,649 |
| 40 | 138 µs | 170 µs | 141 µs | 113.5 KiB | 7,224 |
| 80 | 263 µs | 284 µs | 267 µs | 225.7 KiB | 3,796 |
| 160 | 449 µs | 521 µs | 1.65 ms | 450.0 KiB | 2,229 |
| 320 | 766 µs | 1.05 ms | 2.00 ms | 898.9 KiB | 1,305 |
| 640 | 1.41 ms | 1.51 ms | 2.72 ms | 1.8 MiB | 711 |
| 1280 | 2.58 ms | 2.64 ms | 3.38 ms | 3.5 MiB | 388 |
| 2560 | 5.11 ms | 5.35 ms | 5.29 ms | 6.9 MiB | 196 |
| 5120 | 10.5 ms | 10.7 ms | 10.7 ms | 13.8 MiB | 95 |
| 10240 | 21.5 ms | 22.0 ms | 21.9 ms | 27.6 MiB | 46 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.05, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 72.7 µs | 85.5 µs | 75.0 µs | 56.5 KiB | 13,752 |
| 40 | 135 µs | 148 µs | 137 µs | 111.8 KiB | 7,407 |
| 80 | 262 µs | 276 µs | 265 µs | 222.5 KiB | 3,819 |
| 160 | 433 µs | 450 µs | 1.50 ms | 443.7 KiB | 2,307 |
| 320 | 740 µs | 1.47 ms | 1.96 ms | 886.2 KiB | 1,352 |
| 640 | 1.36 ms | 1.40 ms | 2.67 ms | 1.7 MiB | 737 |
| 1280 | 2.56 ms | 2.65 ms | 4.11 ms | 3.5 MiB | 391 |
| 2560 | 5.02 ms | 5.41 ms | 6.63 ms | 6.9 MiB | 199 |
| 5120 | 10.2 ms | 11.0 ms | 12.9 ms | 13.8 MiB | 98 |
| 10240 | 26.1 ms | 30.6 ms | 32.6 ms | 27.6 MiB | 38 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 353 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 239 µs | 239 µs | 68% |
| `run-policies` | 1 | 92.4 µs | 92.4 µs | 26% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 21.5 µs | 6.1% |

**At 10240 checks** (whole operation: 58.3 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 31.9 ms | 31.9 ms | 55% |
| `run-policies` | 1 | 25.7 ms | 25.7 ms | 44% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 717 µs | 1.2% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-11T07:16:09.091Z` → `2026-11-11T07:17:28.297Z` (79 s), ci: CI (run 42975026328)
- Machine: AMD EPYC 9V74 80-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `f971baef5bef1f677014cd827bc0fadcb6498399` on `chore/bump-internal-package-contract-v0.17.0`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

