# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **155 µs** per operation compared with a bare-minimum baseline (**144% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.01). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 155 µs | 32.5 ms |
| Added latency, relative to baseline | 144% | 251% |
| Added CPU time per operation | 363 µs | 36.8 ms |
| Added memory per operation (heap delta) | 345.3 KiB | 44.2 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 6,448 ops/s | 31 ops/s |

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
| 20 | 33.3 µs | 87.0 µs | 53.7 µs | 161% | 180 µs | $0.00011 – $0.002 |
| 40 | 56.8 µs | 141 µs | 83.9 µs | 148% | 205 µs | $0.00017 – $0.0023 |
| 80 | 108 µs | 263 µs | 155 µs | 144% | 363 µs | $0.00032 – $0.0041 |
| 160 | 211 µs | 501 µs | 290 µs | 137% | 555 µs | $0.0006 – $0.0062 |
| 320 | 428 µs | 1.01 ms | 587 µs | 137% | 1.02 ms | $0.0012 – $0.011 |
| 640 | 793 µs | 2.23 ms | 1.44 ms | 181% | 2.28 ms | $0.003 – $0.026 |
| 1280 | 1.61 ms | 8.51 ms | 6.90 ms | 429% | 7.55 ms | $0.014 – $0.085 |
| 2560 | 3.17 ms | 11.9 ms | 8.73 ms | 276% | 9.51 ms | $0.018 – $0.107 |
| 5120 | 6.42 ms | 22.4 ms | 16.0 ms | 250% | 18.8 ms | $0.033 – $0.211 |
| 10240 | 13.0 ms | 45.4 ms | 32.5 ms | 251% | 36.8 ms | $0.068 – $0.414 |

**How the total grows:** O(n) (linear), exponent 1.01 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 159 µs | 22.9 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 1.75 ms | 253 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 72.8 µs | 18.3 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 104 µs | 28.5 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 75.0 µs | 19.0 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 102 µs | 29.0 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n log n) | ✅ matches | 41.0 µs | 6.56 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 155 µs | 204 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 427 µs | 55.3 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 4.21 ms | 874 ms |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 139 µs | 21.7 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 185 µs | 50.9 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 197 µs | 17.8 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 198 µs | 18.9 ms |

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

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 46.6 µs | 81.2 µs | 136 µs | 52.8 KiB | 21,449 |
| 40 | 85.9 µs | 95.2 µs | 224 µs | 104.3 KiB | 11,640 |
| 80 | 159 µs | 172 µs | 366 µs | 211.1 KiB | 6,287 |
| 160 | 312 µs | 385 µs | 667 µs | 436.0 KiB | 3,207 |
| 320 | 604 µs | 653 µs | 1.15 ms | 938.5 KiB | 1,655 |
| 640 | 1.19 ms | 1.36 ms | 2.07 ms | 2.1 MiB | 843 |
| 1280 | 4.31 ms | 4.53 ms | 5.53 ms | 4.7 MiB | 232 |
| 2560 | 7.10 ms | 8.00 ms | 9.24 ms | 8.0 MiB | 141 |
| 5120 | 12.2 ms | 12.6 ms | 14.0 ms | 14.5 MiB | 82 |
| 10240 | 22.9 ms | 23.6 ms | 26.0 ms | 27.6 MiB | 44 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.08, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 471 µs | 484 µs | 1.03 ms | 294.9 KiB | 2,125 |
| 40 | 862 µs | 908 µs | 1.44 ms | 585.9 KiB | 1,161 |
| 80 | 1.75 ms | 2.20 ms | 3.03 ms | 1.1 MiB | 571 |
| 160 | 3.30 ms | 3.39 ms | 4.75 ms | 2.3 MiB | 303 |
| 320 | 6.40 ms | 6.61 ms | 8.35 ms | 4.7 MiB | 156 |
| 640 | 12.8 ms | 13.1 ms | 15.8 ms | 9.8 MiB | 78 |
| 1280 | 27.7 ms | 30.7 ms | 32.7 ms | 20.1 MiB | 36 |
| 2560 | 53.4 ms | 58.7 ms | 62.4 ms | 38.7 MiB | 19 |
| 5120 | 128 ms | 132 ms | 198 ms | 73.5 MiB | 8 |
| 10240 | 253 ms | 258 ms | 399 ms | 145.3 MiB | 4 |

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
| 20 | 29.2 µs | 39.1 µs | 30.2 µs | 47.1 KiB | 34,242 |
| 40 | 42.6 µs | 52.0 µs | 139 µs | 92.5 KiB | 23,495 |
| 80 | 72.8 µs | 96.7 µs | 194 µs | 188.2 KiB | 13,736 |
| 160 | 149 µs | 210 µs | 410 µs | 393.0 KiB | 6,731 |
| 320 | 317 µs | 476 µs | 839 µs | 853.1 KiB | 3,153 |
| 640 | 800 µs | 1.13 ms | 2.08 ms | 1.9 MiB | 1,251 |
| 1280 | 3.61 ms | 4.04 ms | 5.73 ms | 4.4 MiB | 277 |
| 2560 | 4.91 ms | 5.69 ms | 7.29 ms | 7.3 MiB | 204 |
| 5120 | 8.60 ms | 10.1 ms | 12.1 ms | 13.2 MiB | 116 |
| 10240 | 18.3 ms | 19.5 ms | 25.6 ms | 24.5 MiB | 55 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 30.2 µs | 35.0 µs | 98.3 µs | 54.1 KiB | 33,167 |
| 40 | 50.1 µs | 60.8 µs | 158 µs | 106.9 KiB | 19,977 |
| 80 | 104 µs | 128 µs | 322 µs | 217.2 KiB | 9,603 |
| 160 | 234 µs | 336 µs | 739 µs | 451.7 KiB | 4,271 |
| 320 | 494 µs | 728 µs | 1.43 ms | 970.6 KiB | 2,023 |
| 640 | 1.31 ms | 1.56 ms | 4.01 ms | 2.2 MiB | 763 |
| 1280 | 5.58 ms | 6.20 ms | 11.3 ms | 4.9 MiB | 179 |
| 2560 | 7.65 ms | 7.88 ms | 15.2 ms | 8.3 MiB | 131 |
| 5120 | 13.1 ms | 13.9 ms | 25.9 ms | 15.1 MiB | 76 |
| 10240 | 28.5 ms | 28.8 ms | 53.2 ms | 28.1 MiB | 35 |

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

**Measured: O(n)** (exponent 1.10, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 26.2 µs | 33.1 µs | 27.0 µs | 47.0 KiB | 38,112 |
| 40 | 36.2 µs | 49.8 µs | 101 µs | 92.5 KiB | 27,626 |
| 80 | 75.0 µs | 103 µs | 207 µs | 188.2 KiB | 13,331 |
| 160 | 160 µs | 222 µs | 440 µs | 393.6 KiB | 6,252 |
| 320 | 326 µs | 449 µs | 789 µs | 853.8 KiB | 3,066 |
| 640 | 704 µs | 998 µs | 1.46 ms | 1.9 MiB | 1,421 |
| 1280 | 3.67 ms | 4.13 ms | 5.80 ms | 4.4 MiB | 272 |
| 2560 | 4.98 ms | 5.59 ms | 7.85 ms | 7.3 MiB | 201 |
| 5120 | 10.1 ms | 10.9 ms | 14.6 ms | 13.2 MiB | 99 |
| 10240 | 19.0 ms | 25.4 ms | 26.8 ms | 24.4 MiB | 53 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 32.0 µs | 37.6 µs | 67.9 µs | 54.2 KiB | 31,218 |
| 40 | 51.1 µs | 62.2 µs | 160 µs | 106.9 KiB | 19,561 |
| 80 | 102 µs | 136 µs | 314 µs | 217.2 KiB | 9,760 |
| 160 | 226 µs | 286 µs | 698 µs | 451.7 KiB | 4,416 |
| 320 | 511 µs | 635 µs | 1.50 ms | 970.6 KiB | 1,958 |
| 640 | 1.48 ms | 2.01 ms | 4.41 ms | 2.2 MiB | 676 |
| 1280 | 5.26 ms | 5.71 ms | 10.7 ms | 4.9 MiB | 190 |
| 2560 | 7.87 ms | 11.1 ms | 16.2 ms | 8.3 MiB | 127 |
| 5120 | 14.5 ms | 16.2 ms | 27.1 ms | 15.1 MiB | 69 |
| 10240 | 29.0 ms | 34.6 ms | 54.8 ms | 28.1 MiB | 35 |

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

**Measured: O(n log n)** (exponent 1.31, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 23.0 µs | 27.9 µs | 23.7 µs | 30.5 KiB | 43,507 |
| 40 | 21.5 µs | 38.8 µs | 64.9 µs | 55.1 KiB | 46,504 |
| 80 | 41.0 µs | 56.1 µs | 120 µs | 104.6 KiB | 24,416 |
| 160 | 74.0 µs | 107 µs | 219 µs | 206.7 KiB | 13,508 |
| 320 | 140 µs | 202 µs | 394 µs | 401.9 KiB | 7,142 |
| 640 | 158 µs | 176 µs | 416 µs | 612.2 KiB | 6,340 |
| 1280 | 672 µs | 722 µs | 1.41 ms | 1.3 MiB | 1,487 |
| 2560 | 1.53 ms | 1.65 ms | 3.49 ms | 2.7 MiB | 655 |
| 5120 | 3.42 ms | 3.78 ms | 6.81 ms | 5.5 MiB | 292 |
| 10240 | 6.56 ms | 6.80 ms | 12.1 ms | 10.8 MiB | 152 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent -0.01, 10 sizes) -- ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 162 µs | 199 µs | 479 µs | 616.4 KiB | 6,160 |
| 40 | 157 µs | 188 µs | 408 µs | 628.1 KiB | 6,359 |
| 80 | 155 µs | 183 µs | 408 µs | 628.3 KiB | 6,434 |
| 160 | 161 µs | 186 µs | 410 µs | 661.3 KiB | 6,209 |
| 320 | 184 µs | 214 µs | 495 µs | 722.7 KiB | 5,428 |
| 640 | 211 µs | 248 µs | 519 µs | 826.6 KiB | 4,744 |
| 1280 | 201 µs | 222 µs | 502 µs | 826.6 KiB | 4,970 |
| 2560 | 203 µs | 221 µs | 505 µs | 826.6 KiB | 4,932 |
| 5120 | 205 µs | 231 µs | 511 µs | 826.6 KiB | 4,881 |
| 10240 | 204 µs | 220 µs | 509 µs | 826.6 KiB | 4,892 |

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
| 20 | 104 µs | 116 µs | 316 µs | 45.5 KiB | 9,571 |
| 40 | 180 µs | 193 µs | 449 µs | 109.0 KiB | 5,569 |
| 80 | 427 µs | 466 µs | 986 µs | 178.6 KiB | 2,341 |
| 160 | 747 µs | 798 µs | 1.39 ms | 355.8 KiB | 1,339 |
| 320 | 1.46 ms | 1.58 ms | 2.81 ms | 712.3 KiB | 684 |
| 640 | 2.75 ms | 2.94 ms | 4.33 ms | 1.4 MiB | 363 |
| 1280 | 5.52 ms | 5.74 ms | 7.45 ms | 2.8 MiB | 181 |
| 2560 | 11.4 ms | 12.0 ms | 13.7 ms | 5.7 MiB | 88 |
| 5120 | 22.6 ms | 28.8 ms | 23.2 ms | 11.3 MiB | 44 |
| 10240 | 55.3 ms | 55.6 ms | 55.8 ms | 22.7 MiB | 18 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.12, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.38 ms | 1.44 ms | 2.72 ms | 599.8 KiB | 726 |
| 40 | 2.26 ms | 2.47 ms | 3.96 ms | 1.2 MiB | 443 |
| 80 | 4.21 ms | 4.51 ms | 6.08 ms | 2.3 MiB | 238 |
| 160 | 8.13 ms | 8.36 ms | 10.1 ms | 4.6 MiB | 123 |
| 320 | 15.6 ms | 15.8 ms | 16.1 ms | 9.3 MiB | 64 |
| 640 | 38.2 ms | 42.2 ms | 38.8 ms | 18.5 MiB | 26 |
| 1280 | 94.1 ms | 94.4 ms | 94.6 ms | 37.0 MiB | 11 |
| 2560 | 208 ms | 209 ms | 208 ms | 73.9 MiB | 5 |
| 5120 | 432 ms | 435 ms | 445 ms | 147.7 MiB | 2 |
| 10240 | 874 ms | 912 ms | 900 ms | 295.3 MiB | 1 |

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

**Measured: O(n log n)** (exponent 1.11, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 62.1 µs | 87.7 µs | 239 µs | 97.9 KiB | 16,102 |
| 40 | 81.8 µs | 105 µs | 223 µs | 178.9 KiB | 12,222 |
| 80 | 139 µs | 163 µs | 340 µs | 322.2 KiB | 7,192 |
| 160 | 269 µs | 310 µs | 611 µs | 637.6 KiB | 3,711 |
| 320 | 522 µs | 578 µs | 1.05 ms | 1.2 MiB | 1,915 |
| 640 | 1.02 ms | 1.09 ms | 2.07 ms | 2.5 MiB | 984 |
| 1280 | 1.97 ms | 2.09 ms | 2.93 ms | 4.9 MiB | 507 |
| 2560 | 4.07 ms | 4.36 ms | 5.47 ms | 9.9 MiB | 246 |
| 5120 | 9.28 ms | 10.2 ms | 11.5 ms | 19.8 MiB | 108 |
| 10240 | 21.7 ms | 22.8 ms | 26.0 ms | 39.6 MiB | 46 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.23, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 51.6 µs | 57.0 µs | 145 µs | 280.3 KiB | 19,387 |
| 40 | 95.3 µs | 105 µs | 243 µs | 538.9 KiB | 10,497 |
| 80 | 185 µs | 202 µs | 445 µs | 1.0 MiB | 5,416 |
| 160 | 368 µs | 400 µs | 706 µs | 2.1 MiB | 2,718 |
| 320 | 776 µs | 837 µs | 1.31 ms | 4.2 MiB | 1,289 |
| 640 | 1.67 ms | 1.76 ms | 2.83 ms | 8.3 MiB | 600 |
| 1280 | 3.54 ms | 3.85 ms | 5.06 ms | 16.7 MiB | 282 |
| 2560 | 6.96 ms | 7.25 ms | 9.04 ms | 33.3 MiB | 144 |
| 5120 | 19.6 ms | 20.5 ms | 23.6 ms | 52.0 MiB | 51 |
| 10240 | 50.9 ms | 54.3 ms | 60.9 ms | 103.7 MiB | 20 |

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

**Measured: O(n)** (exponent 1.03, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 59.7 µs | 75.2 µs | 62.0 µs | 57.3 KiB | 16,753 |
| 40 | 105 µs | 123 µs | 108 µs | 113.3 KiB | 9,560 |
| 80 | 197 µs | 218 µs | 200 µs | 225.5 KiB | 5,086 |
| 160 | 353 µs | 379 µs | 1.39 ms | 450.0 KiB | 2,830 |
| 320 | 583 µs | 677 µs | 1.61 ms | 898.7 KiB | 1,716 |
| 640 | 1.06 ms | 1.17 ms | 2.14 ms | 1.8 MiB | 941 |
| 1280 | 1.99 ms | 2.15 ms | 2.58 ms | 3.5 MiB | 503 |
| 2560 | 4.16 ms | 4.46 ms | 4.63 ms | 7.0 MiB | 241 |
| 5120 | 8.78 ms | 9.18 ms | 9.12 ms | 14.0 MiB | 114 |
| 10240 | 17.8 ms | 18.2 ms | 18.2 ms | 28.0 MiB | 56 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.02, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 57.7 µs | 72.0 µs | 61.0 µs | 57.3 KiB | 17,317 |
| 40 | 102 µs | 118 µs | 105 µs | 113.3 KiB | 9,786 |
| 80 | 198 µs | 216 µs | 202 µs | 225.5 KiB | 5,057 |
| 160 | 348 µs | 390 µs | 1.36 ms | 450.0 KiB | 2,872 |
| 320 | 623 µs | 705 µs | 1.84 ms | 898.7 KiB | 1,605 |
| 640 | 1.10 ms | 1.35 ms | 2.49 ms | 1.8 MiB | 905 |
| 1280 | 2.06 ms | 2.28 ms | 3.71 ms | 3.5 MiB | 485 |
| 2560 | 3.91 ms | 5.24 ms | 5.13 ms | 7.0 MiB | 255 |
| 5120 | 8.05 ms | 8.27 ms | 10.4 ms | 14.0 MiB | 124 |
| 10240 | 18.9 ms | 24.7 ms | 23.6 ms | 28.0 MiB | 53 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 263 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 159 µs | 159 µs | 60% |
| `run-policies` | 1 | 72.8 µs | 72.8 µs | 28% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 31.2 µs | 12% |

**At 10240 checks** (whole operation: 45.4 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 22.9 ms | 22.9 ms | 50% |
| `run-policies` | 1 | 18.3 ms | 18.3 ms | 40% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 4.25 ms | 9.3% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-02T17:17:40.747Z` → `2026-11-02T17:18:48.342Z` (68 s), ci: CI (run 41487631689)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15984 MB RAM, linux/x64, Node v24.22.1, GitHub Actions
- Git: `4cc9530bc1f97601543546cfd3595de55b74ee12` on `feat/affected-scope-engine`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

