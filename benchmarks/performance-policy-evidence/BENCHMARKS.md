# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **128 µs** per operation compared with a bare-minimum baseline (**121% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.06). At list prices that is on the order of **~$0.0001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 128 µs | 29.0 ms |
| Added latency, relative to baseline | 121% | 249% |
| Added CPU time per operation | 318 µs | 34.6 ms |
| Added memory per operation (heap delta) | 345.3 KiB | 44.4 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.0001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 7,817 ops/s | 34 ops/s |

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
| 20 | 29.8 µs | 76.1 µs | 46.3 µs | 155% | 150 µs | $0.000096 – $0.0017 |
| 40 | 53.9 µs | 126 µs | 72.2 µs | 134% | 191 µs | $0.00015 – $0.0021 |
| 80 | 106 µs | 234 µs | 128 µs | 121% | 318 µs | $0.00027 – $0.0036 |
| 160 | 201 µs | 459 µs | 258 µs | 129% | 538 µs | $0.00054 – $0.006 |
| 320 | 389 µs | 836 µs | 447 µs | 115% | 641 µs | $0.00093 – $0.0072 |
| 640 | 760 µs | 1.76 ms | 998 µs | 131% | 1.80 ms | $0.0021 – $0.020 |
| 1280 | 1.55 ms | 7.16 ms | 5.60 ms | 361% | 5.86 ms | $0.012 – $0.066 |
| 2560 | 2.89 ms | 10.6 ms | 7.74 ms | 268% | 8.21 ms | $0.016 – $0.092 |
| 5120 | 5.80 ms | 20.4 ms | 14.6 ms | 251% | 16.7 ms | $0.030 – $0.187 |
| 10240 | 11.7 ms | 40.7 ms | 29.0 ms | 249% | 34.6 ms | $0.060 – $0.389 |

**How the total grows:** O(n) (linear), exponent 1.06 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 155 µs | 19.6 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 1.65 ms | 236 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 68.5 µs | 15.4 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 85.8 µs | 25.6 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 65.5 µs | 14.6 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 77.5 µs | 24.9 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n log n) | ✅ matches | 33.0 µs | 5.69 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 127 µs | 187 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 392 µs | 39.6 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n) | ✅ matches | 3.72 ms | 462 ms |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 134 µs | 15.5 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 156 µs | 40.4 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 177 µs | 14.9 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 172 µs | 14.2 ms |

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
| 20 | 50.6 µs | 53.1 µs | 178 µs | 52.8 KiB | 19,781 |
| 40 | 80.9 µs | 86.6 µs | 208 µs | 104.3 KiB | 12,367 |
| 80 | 155 µs | 191 µs | 359 µs | 211.1 KiB | 6,466 |
| 160 | 290 µs | 309 µs | 624 µs | 436.0 KiB | 3,448 |
| 320 | 577 µs | 624 µs | 1.10 ms | 938.5 KiB | 1,733 |
| 640 | 1.15 ms | 1.20 ms | 2.15 ms | 2.1 MiB | 869 |
| 1280 | 3.93 ms | 4.15 ms | 4.99 ms | 4.7 MiB | 255 |
| 2560 | 6.20 ms | 6.53 ms | 7.84 ms | 8.0 MiB | 161 |
| 5120 | 10.8 ms | 11.3 ms | 12.3 ms | 14.5 MiB | 93 |
| 10240 | 19.6 ms | 19.8 ms | 22.5 ms | 27.6 MiB | 51 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.06, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 417 µs | 434 µs | 748 µs | 294.5 KiB | 2,401 |
| 40 | 823 µs | 835 µs | 1.35 ms | 585.9 KiB | 1,215 |
| 80 | 1.65 ms | 2.05 ms | 2.79 ms | 1.1 MiB | 605 |
| 160 | 3.11 ms | 3.22 ms | 4.38 ms | 2.3 MiB | 322 |
| 320 | 6.15 ms | 6.31 ms | 7.70 ms | 4.7 MiB | 163 |
| 640 | 12.4 ms | 12.5 ms | 14.7 ms | 9.8 MiB | 81 |
| 1280 | 26.9 ms | 38.5 ms | 30.9 ms | 20.1 MiB | 37 |
| 2560 | 52.8 ms | 56.6 ms | 60.8 ms | 38.7 MiB | 19 |
| 5120 | 119 ms | 122 ms | 185 ms | 73.5 MiB | 8 |
| 10240 | 236 ms | 245 ms | 373 ms | 145.1 MiB | 4 |

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

**Measured: O(n)** (exponent 1.10, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 23.7 µs | 27.3 µs | 24.7 µs | 47.0 KiB | 42,177 |
| 40 | 37.0 µs | 47.3 µs | 102 µs | 92.4 KiB | 27,012 |
| 80 | 68.5 µs | 93.3 µs | 208 µs | 188.1 KiB | 14,603 |
| 160 | 126 µs | 185 µs | 308 µs | 389.7 KiB | 7,955 |
| 320 | 261 µs | 376 µs | 639 µs | 853.1 KiB | 3,833 |
| 640 | 537 µs | 733 µs | 1.09 ms | 1.9 MiB | 1,863 |
| 1280 | 2.83 ms | 3.18 ms | 4.34 ms | 4.4 MiB | 354 |
| 2560 | 4.12 ms | 4.44 ms | 6.03 ms | 7.3 MiB | 243 |
| 5120 | 7.00 ms | 7.48 ms | 10.2 ms | 13.2 MiB | 143 |
| 10240 | 15.4 ms | 17.1 ms | 22.0 ms | 24.9 MiB | 65 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.19, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 27.8 µs | 29.8 µs | 29.1 µs | 54.1 KiB | 36,033 |
| 40 | 47.8 µs | 57.1 µs | 135 µs | 106.8 KiB | 20,919 |
| 80 | 85.8 µs | 114 µs | 240 µs | 217.1 KiB | 11,655 |
| 160 | 172 µs | 226 µs | 507 µs | 451.1 KiB | 5,826 |
| 320 | 410 µs | 471 µs | 1.26 ms | 970.6 KiB | 2,438 |
| 640 | 752 µs | 953 µs | 1.85 ms | 2.1 MiB | 1,330 |
| 1280 | 3.77 ms | 4.07 ms | 8.16 ms | 4.9 MiB | 265 |
| 2560 | 6.52 ms | 14.6 ms | 13.9 ms | 8.3 MiB | 153 |
| 5120 | 12.4 ms | 13.1 ms | 24.5 ms | 15.1 MiB | 81 |
| 10240 | 25.6 ms | 26.3 ms | 50.3 ms | 28.2 MiB | 39 |

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

**Measured: O(n)** (exponent 1.08, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 23.1 µs | 25.2 µs | 23.7 µs | 46.9 KiB | 43,291 |
| 40 | 34.3 µs | 46.5 µs | 98.7 µs | 92.4 KiB | 29,180 |
| 80 | 65.5 µs | 95.0 µs | 183 µs | 185.8 KiB | 15,266 |
| 160 | 130 µs | 187 µs | 360 µs | 392.7 KiB | 7,715 |
| 320 | 257 µs | 370 µs | 637 µs | 853.8 KiB | 3,896 |
| 640 | 537 µs | 713 µs | 1.23 ms | 1.9 MiB | 1,863 |
| 1280 | 2.91 ms | 3.26 ms | 4.59 ms | 4.4 MiB | 344 |
| 2560 | 4.00 ms | 4.22 ms | 5.94 ms | 7.3 MiB | 250 |
| 5120 | 7.07 ms | 7.58 ms | 10.3 ms | 13.2 MiB | 141 |
| 10240 | 14.6 ms | 15.1 ms | 20.7 ms | 24.9 MiB | 69 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.18, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 27.8 µs | 30.3 µs | 28.4 µs | 54.2 KiB | 35,996 |
| 40 | 40.5 µs | 54.3 µs | 125 µs | 106.9 KiB | 24,705 |
| 80 | 77.5 µs | 110 µs | 224 µs | 213.9 KiB | 12,901 |
| 160 | 160 µs | 191 µs | 454 µs | 444.5 KiB | 6,248 |
| 320 | 352 µs | 370 µs | 949 µs | 955.9 KiB | 2,842 |
| 640 | 757 µs | 828 µs | 2.01 ms | 2.1 MiB | 1,321 |
| 1280 | 3.89 ms | 4.25 ms | 8.01 ms | 4.8 MiB | 257 |
| 2560 | 6.39 ms | 6.63 ms | 13.6 ms | 8.2 MiB | 157 |
| 5120 | 12.8 ms | 13.3 ms | 26.2 ms | 14.9 MiB | 78 |
| 10240 | 24.9 ms | 25.2 ms | 48.9 ms | 28.3 MiB | 40 |

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

**Measured: O(n log n)** (exponent 1.33, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 14.9 µs | 21.7 µs | 15.2 µs | 30.4 KiB | 66,997 |
| 40 | 18.7 µs | 28.8 µs | 53.7 µs | 55.1 KiB | 53,490 |
| 80 | 33.0 µs | 49.8 µs | 94.7 µs | 104.6 KiB | 30,341 |
| 160 | 64.8 µs | 116 µs | 186 µs | 192.8 KiB | 15,431 |
| 320 | 61.1 µs | 64.6 µs | 159 µs | 298.5 KiB | 16,368 |
| 640 | 122 µs | 129 µs | 315 µs | 610.7 KiB | 8,164 |
| 1280 | 551 µs | 581 µs | 1.20 ms | 1.3 MiB | 1,814 |
| 2560 | 1.28 ms | 1.38 ms | 2.95 ms | 2.7 MiB | 780 |
| 5120 | 2.66 ms | 2.72 ms | 4.92 ms | 5.5 MiB | 377 |
| 10240 | 5.69 ms | 5.76 ms | 9.97 ms | 10.8 MiB | 176 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Sorting every check by duration dominates; listing the first few lines of the sorted result adds almost nothing.

**Measured: O(1)** (exponent 0.01, 10 sizes) -- ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 126 µs | 139 µs | 352 µs | 614.2 KiB | 7,921 |
| 40 | 125 µs | 131 µs | 317 µs | 625.4 KiB | 8,024 |
| 80 | 127 µs | 133 µs | 317 µs | 627.8 KiB | 7,895 |
| 160 | 133 µs | 138 µs | 325 µs | 659.6 KiB | 7,521 |
| 320 | 152 µs | 165 µs | 387 µs | 731.7 KiB | 6,564 |
| 640 | 182 µs | 195 µs | 472 µs | 826.6 KiB | 5,502 |
| 1280 | 185 µs | 191 µs | 486 µs | 826.6 KiB | 5,402 |
| 2560 | 183 µs | 201 µs | 471 µs | 826.6 KiB | 5,457 |
| 5120 | 190 µs | 197 µs | 493 µs | 826.6 KiB | 5,255 |
| 10240 | 187 µs | 201 µs | 485 µs | 826.6 KiB | 5,342 |

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
| 20 | 94.6 µs | 102 µs | 267 µs | 50.5 KiB | 10,565 |
| 40 | 161 µs | 178 µs | 369 µs | 120.6 KiB | 6,209 |
| 80 | 392 µs | 414 µs | 915 µs | 178.6 KiB | 2,548 |
| 160 | 693 µs | 751 µs | 1.31 ms | 355.8 KiB | 1,443 |
| 320 | 1.33 ms | 1.45 ms | 2.57 ms | 712.3 KiB | 754 |
| 640 | 2.47 ms | 2.62 ms | 3.76 ms | 1.4 MiB | 405 |
| 1280 | 4.79 ms | 4.98 ms | 6.08 ms | 2.8 MiB | 209 |
| 2560 | 9.26 ms | 9.67 ms | 11.2 ms | 5.7 MiB | 108 |
| 5120 | 19.0 ms | 19.2 ms | 21.8 ms | 11.3 MiB | 53 |
| 10240 | 39.6 ms | 40.2 ms | 43.9 ms | 22.7 MiB | 25 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.04, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.17 ms | 1.29 ms | 2.44 ms | 599.8 KiB | 854 |
| 40 | 2.03 ms | 2.16 ms | 3.33 ms | 1.2 MiB | 492 |
| 80 | 3.72 ms | 3.93 ms | 5.04 ms | 2.3 MiB | 269 |
| 160 | 6.68 ms | 6.90 ms | 8.27 ms | 4.6 MiB | 150 |
| 320 | 13.0 ms | 13.3 ms | 15.2 ms | 9.3 MiB | 77 |
| 640 | 26.0 ms | 26.7 ms | 28.7 ms | 18.5 MiB | 38 |
| 1280 | 55.0 ms | 85.5 ms | 59.3 ms | 37.0 MiB | 18 |
| 2560 | 114 ms | 117 ms | 120 ms | 73.9 MiB | 9 |
| 5120 | 227 ms | 233 ms | 238 ms | 147.7 MiB | 4 |
| 10240 | 462 ms | 471 ms | 484 ms | 295.3 MiB | 2 |

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
| 20 | 48.8 µs | 63.1 µs | 164 µs | 98.0 KiB | 20,508 |
| 40 | 73.1 µs | 94.8 µs | 191 µs | 178.9 KiB | 13,681 |
| 80 | 134 µs | 149 µs | 329 µs | 322.2 KiB | 7,485 |
| 160 | 253 µs | 269 µs | 579 µs | 637.6 KiB | 3,946 |
| 320 | 497 µs | 535 µs | 1.00 ms | 1.2 MiB | 2,014 |
| 640 | 931 µs | 977 µs | 1.45 ms | 2.5 MiB | 1,074 |
| 1280 | 1.75 ms | 1.84 ms | 2.58 ms | 4.9 MiB | 573 |
| 2560 | 3.50 ms | 3.60 ms | 4.71 ms | 9.9 MiB | 286 |
| 5120 | 7.50 ms | 7.71 ms | 9.18 ms | 19.8 MiB | 133 |
| 10240 | 15.5 ms | 16.7 ms | 18.2 ms | 39.6 MiB | 64 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.22, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 54.4 µs | 147 µs | 55.0 µs | 280.9 KiB | 18,388 |
| 40 | 76.3 µs | 83.5 µs | 183 µs | 538.6 KiB | 13,111 |
| 80 | 156 µs | 180 µs | 356 µs | 1.0 MiB | 6,405 |
| 160 | 316 µs | 343 µs | 648 µs | 2.1 MiB | 3,166 |
| 320 | 645 µs | 683 µs | 1.16 ms | 4.2 MiB | 1,549 |
| 640 | 1.43 ms | 1.51 ms | 2.49 ms | 8.3 MiB | 701 |
| 1280 | 2.99 ms | 3.16 ms | 4.17 ms | 16.7 MiB | 335 |
| 2560 | 6.27 ms | 6.45 ms | 7.83 ms | 33.3 MiB | 159 |
| 5120 | 17.1 ms | 17.8 ms | 19.5 ms | 52.0 MiB | 58 |
| 10240 | 40.4 ms | 41.9 ms | 47.1 ms | 103.7 MiB | 25 |

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

**Measured: O(n)** (exponent 1.02, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 58.2 µs | 72.6 µs | 61.0 µs | 57.3 KiB | 17,169 |
| 40 | 95.8 µs | 108 µs | 98.0 µs | 113.3 KiB | 10,436 |
| 80 | 177 µs | 190 µs | 180 µs | 225.5 KiB | 5,652 |
| 160 | 316 µs | 334 µs | 1.24 ms | 450.0 KiB | 3,165 |
| 320 | 524 µs | 559 µs | 1.43 ms | 898.7 KiB | 1,908 |
| 640 | 907 µs | 940 µs | 1.83 ms | 1.8 MiB | 1,102 |
| 1280 | 1.70 ms | 1.80 ms | 2.27 ms | 3.5 MiB | 588 |
| 2560 | 3.27 ms | 3.50 ms | 3.36 ms | 6.9 MiB | 306 |
| 5120 | 7.52 ms | 22.8 ms | 7.55 ms | 13.8 MiB | 133 |
| 10240 | 14.9 ms | 15.0 ms | 15.3 ms | 27.7 MiB | 67 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.98, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 49.6 µs | 61.1 µs | 52.0 µs | 56.4 KiB | 20,148 |
| 40 | 91.6 µs | 101 µs | 94.0 µs | 111.7 KiB | 10,914 |
| 80 | 172 µs | 187 µs | 175 µs | 222.3 KiB | 5,812 |
| 160 | 315 µs | 355 µs | 1.15 ms | 443.6 KiB | 3,180 |
| 320 | 504 µs | 522 µs | 1.36 ms | 886.1 KiB | 1,983 |
| 640 | 932 µs | 959 µs | 1.89 ms | 1.7 MiB | 1,073 |
| 1280 | 1.74 ms | 1.76 ms | 2.82 ms | 3.5 MiB | 574 |
| 2560 | 3.37 ms | 3.49 ms | 4.33 ms | 6.9 MiB | 296 |
| 5120 | 6.86 ms | 7.12 ms | 8.86 ms | 13.8 MiB | 146 |
| 10240 | 14.2 ms | 14.5 ms | 18.0 ms | 27.7 MiB | 70 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 234 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 155 µs | 155 µs | 66% |
| `run-policies` | 1 | 68.5 µs | 68.5 µs | 29% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 10.5 µs | 4.5% |

**At 10240 checks** (whole operation: 40.7 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 19.6 ms | 19.6 ms | 48% |
| `run-policies` | 1 | 15.4 ms | 15.4 ms | 38% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 5.72 ms | 14% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-19T12:59:40.785Z` → `2026-10-19T13:00:39.215Z` (58 s), ci: CI (run 39254970455)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `9a7f16bb0d0e2237799eb2925b1b4d3de7798c99` on `changeset-release/main`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

