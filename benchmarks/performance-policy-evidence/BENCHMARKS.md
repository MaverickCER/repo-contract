# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **118 µs** per operation compared with a bare-minimum baseline (**108% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.01). At list prices that is on the order of **~$0.0001 – $0.001 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 118 µs | 26.5 ms |
| Added latency, relative to baseline | 108% | 225% |
| Added CPU time per operation | 219 µs | 30.9 ms |
| Added memory per operation (heap delta) | 345.0 KiB | 44.4 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.0001 – $0.001 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 8,508 ops/s | 38 ops/s |

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
| 20 | 30.2 µs | 83.3 µs | 53.1 µs | 176% | 200 µs | $0.00011 – $0.0023 |
| 40 | 54.7 µs | 128 µs | 73.6 µs | 134% | 194 µs | $0.00015 – $0.0022 |
| 80 | 109 µs | 226 µs | 118 µs | 108% | 219 µs | $0.00024 – $0.0025 |
| 160 | 211 µs | 469 µs | 258 µs | 122% | 519 µs | $0.00054 – $0.0058 |
| 320 | 403 µs | 876 µs | 473 µs | 117% | 661 µs | $0.00099 – $0.0074 |
| 640 | 782 µs | 1.91 ms | 1.13 ms | 144% | 2.03 ms | $0.0024 – $0.023 |
| 1280 | 1.58 ms | 7.53 ms | 5.95 ms | 378% | 6.17 ms | $0.012 – $0.069 |
| 2560 | 2.98 ms | 11.1 ms | 8.14 ms | 273% | 8.54 ms | $0.017 – $0.096 |
| 5120 | 5.97 ms | 20.5 ms | 14.5 ms | 243% | 16.6 ms | $0.030 – $0.187 |
| 10240 | 11.7 ms | 38.2 ms | 26.5 ms | 225% | 30.9 ms | $0.055 – $0.348 |

**How the total grows:** O(n) (linear), exponent 1.01 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 157 µs | 20.8 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 1.67 ms | 242 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 64.3 µs | 14.8 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 84.5 µs | 25.4 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 71.6 µs | 16.8 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 80.5 µs | 25.3 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n log n) | ✅ matches | 36.1 µs | 5.85 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 136 µs | 183 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 416 µs | 42.6 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n) | ✅ matches | 3.83 ms | 468 ms |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 126 µs | 16.2 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 161 µs | 41.7 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 182 µs | 16.2 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 184 µs | 16.1 ms |

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
| 20 | 45.2 µs | 47.7 µs | 136 µs | 52.8 KiB | 22,129 |
| 40 | 84.1 µs | 89.6 µs | 213 µs | 104.3 KiB | 11,897 |
| 80 | 157 µs | 168 µs | 360 µs | 211.1 KiB | 6,368 |
| 160 | 305 µs | 318 µs | 646 µs | 436.0 KiB | 3,280 |
| 320 | 588 µs | 613 µs | 1.11 ms | 938.5 KiB | 1,702 |
| 640 | 1.20 ms | 1.39 ms | 2.29 ms | 2.1 MiB | 831 |
| 1280 | 4.12 ms | 7.58 ms | 5.31 ms | 4.7 MiB | 242 |
| 2560 | 6.37 ms | 6.68 ms | 8.03 ms | 8.0 MiB | 157 |
| 5120 | 11.0 ms | 11.8 ms | 12.6 ms | 14.5 MiB | 91 |
| 10240 | 20.8 ms | 21.3 ms | 24.4 ms | 27.6 MiB | 48 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.08, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 453 µs | 461 µs | 971 µs | 294.9 KiB | 2,209 |
| 40 | 830 µs | 850 µs | 1.35 ms | 585.9 KiB | 1,205 |
| 80 | 1.67 ms | 2.03 ms | 2.82 ms | 1.1 MiB | 600 |
| 160 | 3.20 ms | 6.00 ms | 4.51 ms | 2.3 MiB | 313 |
| 320 | 6.24 ms | 6.50 ms | 7.83 ms | 4.7 MiB | 160 |
| 640 | 12.4 ms | 15.5 ms | 14.7 ms | 9.8 MiB | 81 |
| 1280 | 27.0 ms | 30.4 ms | 31.6 ms | 20.1 MiB | 37 |
| 2560 | 53.2 ms | 57.8 ms | 62.1 ms | 38.7 MiB | 19 |
| 5120 | 124 ms | 127 ms | 190 ms | 73.5 MiB | 8 |
| 10240 | 242 ms | 246 ms | 379 ms | 145.2 MiB | 4 |

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

**Measured: O(n)** (exponent 1.08, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 28.2 µs | 37.5 µs | 28.8 µs | 48.2 KiB | 35,483 |
| 40 | 34.5 µs | 47.5 µs | 99.2 µs | 92.4 KiB | 29,027 |
| 80 | 64.3 µs | 93.2 µs | 184 µs | 187.4 KiB | 15,541 |
| 160 | 130 µs | 187 µs | 372 µs | 389.2 KiB | 7,681 |
| 320 | 261 µs | 376 µs | 654 µs | 853.1 KiB | 3,832 |
| 640 | 533 µs | 719 µs | 1.18 ms | 1.9 MiB | 1,876 |
| 1280 | 2.95 ms | 3.31 ms | 4.71 ms | 4.4 MiB | 339 |
| 2560 | 4.26 ms | 4.44 ms | 6.21 ms | 7.3 MiB | 235 |
| 5120 | 7.06 ms | 7.34 ms | 10.2 ms | 13.2 MiB | 142 |
| 10240 | 14.8 ms | 29.7 ms | 19.9 ms | 24.8 MiB | 68 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.12, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 27.9 µs | 29.6 µs | 56.9 µs | 54.1 KiB | 35,878 |
| 40 | 41.4 µs | 56.0 µs | 120 µs | 106.8 KiB | 24,148 |
| 80 | 84.5 µs | 114 µs | 251 µs | 217.1 KiB | 11,832 |
| 160 | 177 µs | 287 µs | 549 µs | 451.1 KiB | 5,646 |
| 320 | 384 µs | 502 µs | 1.18 ms | 970.6 KiB | 2,606 |
| 640 | 939 µs | 1.07 ms | 3.18 ms | 2.2 MiB | 1,065 |
| 1280 | 4.12 ms | 4.50 ms | 8.46 ms | 4.9 MiB | 243 |
| 2560 | 6.78 ms | 7.11 ms | 13.7 ms | 8.3 MiB | 148 |
| 5120 | 13.4 ms | 13.9 ms | 26.8 ms | 15.1 MiB | 74 |
| 10240 | 25.4 ms | 25.8 ms | 49.3 ms | 28.2 MiB | 39 |

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

**Measured: O(n log n)** (exponent 1.13, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 23.3 µs | 26.2 µs | 24.1 µs | 46.9 KiB | 42,958 |
| 40 | 36.8 µs | 49.0 µs | 102 µs | 92.5 KiB | 27,146 |
| 80 | 71.6 µs | 96.2 µs | 204 µs | 188.3 KiB | 13,967 |
| 160 | 135 µs | 225 µs | 384 µs | 393.2 KiB | 7,424 |
| 320 | 266 µs | 391 µs | 653 µs | 853.8 KiB | 3,765 |
| 640 | 539 µs | 731 µs | 1.19 ms | 1.9 MiB | 1,856 |
| 1280 | 2.96 ms | 3.45 ms | 4.70 ms | 4.4 MiB | 337 |
| 2560 | 4.37 ms | 8.24 ms | 7.04 ms | 7.3 MiB | 229 |
| 5120 | 7.62 ms | 8.23 ms | 10.9 ms | 13.2 MiB | 131 |
| 10240 | 16.8 ms | 17.7 ms | 23.0 ms | 24.6 MiB | 60 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.19, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 26.7 µs | 28.9 µs | 49.1 µs | 54.1 KiB | 37,504 |
| 40 | 40.7 µs | 55.5 µs | 124 µs | 106.9 KiB | 24,579 |
| 80 | 80.5 µs | 113 µs | 242 µs | 216.9 KiB | 12,429 |
| 160 | 154 µs | 185 µs | 412 µs | 444.3 KiB | 6,483 |
| 320 | 328 µs | 358 µs | 843 µs | 955.7 KiB | 3,044 |
| 640 | 718 µs | 799 µs | 1.82 ms | 2.1 MiB | 1,392 |
| 1280 | 3.96 ms | 4.51 ms | 7.97 ms | 4.8 MiB | 252 |
| 2560 | 6.51 ms | 10.1 ms | 13.6 ms | 8.2 MiB | 154 |
| 5120 | 12.4 ms | 13.6 ms | 25.0 ms | 14.9 MiB | 81 |
| 10240 | 25.3 ms | 25.7 ms | 48.9 ms | 28.3 MiB | 39 |

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
| 20 | 16.1 µs | 24.2 µs | 16.4 µs | 30.5 KiB | 62,080 |
| 40 | 20.4 µs | 27.6 µs | 61.4 µs | 55.1 KiB | 49,073 |
| 80 | 36.1 µs | 51.2 µs | 103 µs | 104.6 KiB | 27,691 |
| 160 | 65.9 µs | 97.8 µs | 191 µs | 206.5 KiB | 15,186 |
| 320 | 65.6 µs | 76.0 µs | 176 µs | 298.6 KiB | 15,239 |
| 640 | 128 µs | 137 µs | 333 µs | 610.7 KiB | 7,837 |
| 1280 | 570 µs | 616 µs | 1.25 ms | 1.3 MiB | 1,753 |
| 2560 | 1.28 ms | 1.35 ms | 2.96 ms | 2.7 MiB | 781 |
| 5120 | 2.62 ms | 2.71 ms | 5.07 ms | 5.5 MiB | 382 |
| 10240 | 5.85 ms | 6.06 ms | 10.5 ms | 10.8 MiB | 171 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent 0.00, 10 sizes) -- ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 127 µs | 139 µs | 325 µs | 612.9 KiB | 7,885 |
| 40 | 130 µs | 137 µs | 331 µs | 625.4 KiB | 7,674 |
| 80 | 136 µs | 150 µs | 335 µs | 627.8 KiB | 7,333 |
| 160 | 144 µs | 162 µs | 380 µs | 661.3 KiB | 6,949 |
| 320 | 156 µs | 172 µs | 397 µs | 731.7 KiB | 6,402 |
| 640 | 186 µs | 205 µs | 478 µs | 826.6 KiB | 5,368 |
| 1280 | 189 µs | 209 µs | 488 µs | 826.6 KiB | 5,300 |
| 2560 | 195 µs | 231 µs | 494 µs | 826.6 KiB | 5,115 |
| 5120 | 201 µs | 228 µs | 594 µs | 829.2 KiB | 4,975 |
| 10240 | 183 µs | 210 µs | 473 µs | 826.6 KiB | 5,455 |

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

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 100 µs | 110 µs | 311 µs | 45.5 KiB | 9,956 |
| 40 | 178 µs | 187 µs | 454 µs | 109.0 KiB | 5,623 |
| 80 | 416 µs | 438 µs | 979 µs | 178.6 KiB | 2,406 |
| 160 | 715 µs | 779 µs | 1.35 ms | 355.8 KiB | 1,398 |
| 320 | 1.50 ms | 1.53 ms | 2.86 ms | 712.3 KiB | 665 |
| 640 | 2.58 ms | 2.70 ms | 4.01 ms | 1.4 MiB | 388 |
| 1280 | 5.01 ms | 5.28 ms | 6.57 ms | 2.8 MiB | 200 |
| 2560 | 10.0 ms | 23.1 ms | 12.3 ms | 5.7 MiB | 100 |
| 5120 | 19.0 ms | 19.3 ms | 21.5 ms | 11.3 MiB | 53 |
| 10240 | 42.6 ms | 60.8 ms | 47.5 ms | 22.7 MiB | 24 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.02, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.27 ms | 1.34 ms | 2.54 ms | 599.8 KiB | 790 |
| 40 | 2.04 ms | 2.17 ms | 3.33 ms | 1.2 MiB | 490 |
| 80 | 3.83 ms | 4.00 ms | 5.25 ms | 2.3 MiB | 261 |
| 160 | 7.18 ms | 7.30 ms | 8.93 ms | 4.6 MiB | 139 |
| 320 | 13.4 ms | 14.5 ms | 15.7 ms | 9.3 MiB | 75 |
| 640 | 27.3 ms | 33.4 ms | 30.1 ms | 18.5 MiB | 37 |
| 1280 | 56.6 ms | 56.8 ms | 61.5 ms | 37.0 MiB | 18 |
| 2560 | 117 ms | 119 ms | 123 ms | 73.9 MiB | 9 |
| 5120 | 232 ms | 238 ms | 243 ms | 147.7 MiB | 4 |
| 10240 | 468 ms | 478 ms | 492 ms | 295.3 MiB | 2 |

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

**Measured: O(n)** (exponent 1.04, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 56.0 µs | 72.4 µs | 217 µs | 98.0 KiB | 17,847 |
| 40 | 72.9 µs | 104 µs | 180 µs | 178.8 KiB | 13,716 |
| 80 | 126 µs | 136 µs | 315 µs | 322.2 KiB | 7,929 |
| 160 | 251 µs | 278 µs | 583 µs | 637.6 KiB | 3,979 |
| 320 | 488 µs | 533 µs | 1.00 ms | 1.2 MiB | 2,049 |
| 640 | 916 µs | 964 µs | 1.44 ms | 2.5 MiB | 1,092 |
| 1280 | 1.85 ms | 1.96 ms | 2.89 ms | 4.9 MiB | 542 |
| 2560 | 3.54 ms | 3.62 ms | 4.78 ms | 9.9 MiB | 283 |
| 5120 | 7.79 ms | 8.10 ms | 9.57 ms | 19.8 MiB | 128 |
| 10240 | 16.2 ms | 17.1 ms | 19.1 ms | 39.6 MiB | 62 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.22, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 44.1 µs | 50.1 µs | 135 µs | 280.3 KiB | 22,684 |
| 40 | 82.9 µs | 87.9 µs | 210 µs | 538.7 KiB | 12,056 |
| 80 | 161 µs | 180 µs | 365 µs | 1.0 MiB | 6,199 |
| 160 | 331 µs | 357 µs | 665 µs | 2.1 MiB | 3,020 |
| 320 | 661 µs | 703 µs | 1.19 ms | 4.2 MiB | 1,514 |
| 640 | 1.45 ms | 1.56 ms | 2.56 ms | 8.3 MiB | 689 |
| 1280 | 3.12 ms | 3.30 ms | 4.41 ms | 16.7 MiB | 321 |
| 2560 | 6.45 ms | 16.5 ms | 8.23 ms | 33.3 MiB | 155 |
| 5120 | 17.8 ms | 18.4 ms | 20.7 ms | 52.0 MiB | 56 |
| 10240 | 41.7 ms | 42.7 ms | 49.4 ms | 103.7 MiB | 24 |

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
| 20 | 57.6 µs | 70.4 µs | 60.0 µs | 57.3 KiB | 17,371 |
| 40 | 99.5 µs | 123 µs | 102 µs | 113.3 KiB | 10,046 |
| 80 | 182 µs | 204 µs | 184 µs | 225.5 KiB | 5,490 |
| 160 | 327 µs | 349 µs | 1.31 ms | 450.0 KiB | 3,058 |
| 320 | 534 µs | 623 µs | 1.53 ms | 898.7 KiB | 1,871 |
| 640 | 967 µs | 1.01 ms | 1.98 ms | 1.8 MiB | 1,034 |
| 1280 | 1.83 ms | 1.96 ms | 2.84 ms | 3.5 MiB | 546 |
| 2560 | 3.76 ms | 4.08 ms | 4.13 ms | 6.9 MiB | 266 |
| 5120 | 8.10 ms | 13.5 ms | 8.50 ms | 13.8 MiB | 123 |
| 10240 | 16.2 ms | 17.3 ms | 16.6 ms | 27.7 MiB | 62 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 52.4 µs | 62.8 µs | 55.0 µs | 56.4 KiB | 19,088 |
| 40 | 95.9 µs | 108 µs | 99.0 µs | 111.7 KiB | 10,425 |
| 80 | 184 µs | 196 µs | 186 µs | 222.3 KiB | 5,443 |
| 160 | 320 µs | 340 µs | 1.22 ms | 443.6 KiB | 3,121 |
| 320 | 553 µs | 564 µs | 1.50 ms | 886.1 KiB | 1,809 |
| 640 | 997 µs | 1.02 ms | 2.08 ms | 1.7 MiB | 1,003 |
| 1280 | 1.91 ms | 3.34 ms | 3.38 ms | 3.5 MiB | 522 |
| 2560 | 3.64 ms | 3.66 ms | 4.61 ms | 6.9 MiB | 275 |
| 5120 | 7.47 ms | 7.73 ms | 9.77 ms | 13.8 MiB | 134 |
| 10240 | 16.1 ms | 16.6 ms | 19.9 ms | 27.7 MiB | 62 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 226 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 157 µs | 157 µs | 69% |
| `run-policies` | 1 | 64.3 µs | 64.3 µs | 28% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 4.80 µs | 2.1% |

**At 10240 checks** (whole operation: 38.2 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 20.8 ms | 20.8 ms | 55% |
| `run-policies` | 1 | 14.8 ms | 14.8 ms | 39% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 2.59 ms | 6.8% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-24T12:47:59.288Z` → `2026-10-24T12:48:58.741Z` (59 s), ci: CI (run 40094646708)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `08a56952368f6314fb95ed92557172cba05e5702` on `chore/zod-advisory`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

