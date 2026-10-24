# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **279 µs** per operation compared with a bare-minimum baseline (**153% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.98). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 279 µs | 36.6 ms |
| Added latency, relative to baseline | 153% | 212% |
| Added CPU time per operation | 848 µs | 40.8 ms |
| Added memory per operation (heap delta) | 345.9 KiB | 44.2 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,588 ops/s | 27 ops/s |

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
| 20 | 57.3 µs | 159 µs | 101 µs | 177% | 406 µs | $0.00021 – $0.0046 |
| 40 | 102 µs | 263 µs | 161 µs | 157% | 522 µs | $0.00033 – $0.0059 |
| 80 | 182 µs | 461 µs | 279 µs | 153% | 848 µs | $0.00058 – $0.0095 |
| 160 | 395 µs | 946 µs | 551 µs | 140% | 1.55 ms | $0.0011 – $0.017 |
| 320 | 659 µs | 1.58 ms | 917 µs | 139% | 1.79 ms | $0.0019 – $0.020 |
| 640 | 1.32 ms | 2.98 ms | 1.66 ms | 126% | 2.02 ms | $0.0035 – $0.023 |
| 1280 | 2.37 ms | 11.4 ms | 9.06 ms | 382% | 9.63 ms | $0.019 – $0.108 |
| 2560 | 4.47 ms | 17.7 ms | 13.2 ms | 295% | 13.6 ms | $0.027 – $0.153 |
| 5120 | 8.73 ms | 30.1 ms | 21.4 ms | 245% | 24.8 ms | $0.045 – $0.279 |
| 10240 | 17.3 ms | 53.9 ms | 36.6 ms | 212% | 40.8 ms | $0.076 – $0.459 |

**How the total grows:** O(n) (linear), exponent 0.98 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 300 µs | 32.2 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 2.57 ms | 349 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 144 µs | 21.4 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 183 µs | 31.7 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 151 µs | 21.1 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 199 µs | 32.1 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n log n) | ✅ matches | 81.7 µs | 9.66 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 264 µs | 371 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 667 µs | 67.5 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n) | ✅ matches | 6.55 ms | 813 ms |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 252 µs | 25.0 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 346 µs | 69.9 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 290 µs | 25.3 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 303 µs | 27.6 ms |

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

**Measured: O(n)** (exponent 0.95, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 92.4 µs | 95.2 µs | 365 µs | 52.9 KiB | 10,817 |
| 40 | 159 µs | 176 µs | 542 µs | 104.5 KiB | 6,288 |
| 80 | 300 µs | 315 µs | 940 µs | 211.4 KiB | 3,338 |
| 160 | 548 µs | 617 µs | 1.51 ms | 436.3 KiB | 1,825 |
| 320 | 1.09 ms | 1.15 ms | 3.05 ms | 938.9 KiB | 919 |
| 640 | 1.93 ms | 2.06 ms | 3.97 ms | 2.1 MiB | 518 |
| 1280 | 6.79 ms | 7.10 ms | 8.73 ms | 4.7 MiB | 147 |
| 2560 | 10.3 ms | 10.8 ms | 12.8 ms | 8.0 MiB | 97 |
| 5120 | 17.6 ms | 18.0 ms | 19.5 ms | 14.5 MiB | 57 |
| 10240 | 32.2 ms | 32.6 ms | 36.0 ms | 27.6 MiB | 31 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.06, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 707 µs | 752 µs | 1.69 ms | 294.9 KiB | 1,415 |
| 40 | 1.42 ms | 1.49 ms | 3.44 ms | 587.1 KiB | 706 |
| 80 | 2.57 ms | 2.99 ms | 4.74 ms | 1.1 MiB | 389 |
| 160 | 4.86 ms | 5.00 ms | 7.39 ms | 2.3 MiB | 206 |
| 320 | 9.34 ms | 9.49 ms | 12.5 ms | 4.7 MiB | 107 |
| 640 | 18.2 ms | 18.8 ms | 22.6 ms | 9.8 MiB | 55 |
| 1280 | 41.2 ms | 44.9 ms | 48.3 ms | 20.1 MiB | 24 |
| 2560 | 76.4 ms | 80.8 ms | 89.8 ms | 38.7 MiB | 13 |
| 5120 | 176 ms | 178 ms | 278 ms | 73.5 MiB | 6 |
| 10240 | 349 ms | 351 ms | 564 ms | 145.3 MiB | 3 |

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

**Measured: O(n)** (exponent 0.96, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 49.6 µs | 63.5 µs | 51.2 µs | 48.1 KiB | 20,165 |
| 40 | 73.4 µs | 88.2 µs | 265 µs | 92.5 KiB | 13,622 |
| 80 | 144 µs | 156 µs | 489 µs | 188.4 KiB | 6,960 |
| 160 | 248 µs | 308 µs | 771 µs | 393.3 KiB | 4,039 |
| 320 | 502 µs | 624 µs | 1.53 ms | 855.2 KiB | 1,991 |
| 640 | 1.13 ms | 1.32 ms | 3.37 ms | 1.9 MiB | 888 |
| 1280 | 5.11 ms | 5.52 ms | 7.83 ms | 4.4 MiB | 196 |
| 2560 | 6.82 ms | 7.21 ms | 10.1 ms | 7.3 MiB | 147 |
| 5120 | 10.9 ms | 11.6 ms | 15.4 ms | 13.2 MiB | 92 |
| 10240 | 21.4 ms | 23.0 ms | 30.4 ms | 24.6 MiB | 47 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 48.1 µs | 53.8 µs | 83.8 µs | 54.1 KiB | 20,783 |
| 40 | 89.0 µs | 95.6 µs | 334 µs | 107.0 KiB | 11,232 |
| 80 | 183 µs | 198 µs | 629 µs | 217.3 KiB | 5,460 |
| 160 | 352 µs | 410 µs | 1.22 ms | 451.7 KiB | 2,839 |
| 320 | 715 µs | 829 µs | 2.44 ms | 970.6 KiB | 1,398 |
| 640 | 1.59 ms | 1.69 ms | 5.98 ms | 2.2 MiB | 628 |
| 1280 | 5.96 ms | 6.28 ms | 13.1 ms | 4.9 MiB | 168 |
| 2560 | 8.80 ms | 9.20 ms | 19.6 ms | 8.3 MiB | 114 |
| 5120 | 16.0 ms | 17.0 ms | 36.5 ms | 15.1 MiB | 62 |
| 10240 | 31.7 ms | 32.6 ms | 73.3 ms | 28.2 MiB | 32 |

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

**Measured: O(n)** (exponent 0.95, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 43.3 µs | 49.5 µs | 45.0 µs | 47.0 KiB | 23,077 |
| 40 | 74.5 µs | 81.7 µs | 263 µs | 92.6 KiB | 13,416 |
| 80 | 151 µs | 167 µs | 520 µs | 188.5 KiB | 6,603 |
| 160 | 279 µs | 328 µs | 972 µs | 393.9 KiB | 3,589 |
| 320 | 525 µs | 657 µs | 1.62 ms | 856.1 KiB | 1,904 |
| 640 | 1.16 ms | 1.41 ms | 3.41 ms | 1.9 MiB | 860 |
| 1280 | 5.13 ms | 5.63 ms | 8.07 ms | 4.4 MiB | 195 |
| 2560 | 7.00 ms | 7.73 ms | 10.5 ms | 7.3 MiB | 143 |
| 5120 | 10.9 ms | 11.8 ms | 15.7 ms | 13.2 MiB | 91 |
| 10240 | 21.1 ms | 21.6 ms | 29.3 ms | 24.5 MiB | 47 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.97, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 50.9 µs | 56.5 µs | 54.6 µs | 54.2 KiB | 19,651 |
| 40 | 93.4 µs | 102 µs | 373 µs | 107.1 KiB | 10,704 |
| 80 | 199 µs | 213 µs | 710 µs | 217.5 KiB | 5,028 |
| 160 | 377 µs | 437 µs | 1.25 ms | 451.7 KiB | 2,651 |
| 320 | 755 µs | 869 µs | 2.45 ms | 968.0 KiB | 1,325 |
| 640 | 1.81 ms | 1.91 ms | 6.48 ms | 2.2 MiB | 553 |
| 1280 | 6.35 ms | 6.68 ms | 13.7 ms | 4.9 MiB | 157 |
| 2560 | 9.55 ms | 9.85 ms | 21.7 ms | 8.3 MiB | 105 |
| 5120 | 16.8 ms | 17.0 ms | 38.5 ms | 15.1 MiB | 59 |
| 10240 | 32.1 ms | 33.9 ms | 74.5 ms | 28.1 MiB | 31 |

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

**Measured: O(n log n)** (exponent 1.17, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 28.6 µs | 43.5 µs | 29.1 µs | 30.5 KiB | 35,003 |
| 40 | 43.1 µs | 47.1 µs | 167 µs | 55.2 KiB | 23,186 |
| 80 | 81.7 µs | 105 µs | 328 µs | 104.6 KiB | 12,232 |
| 160 | 150 µs | 206 µs | 546 µs | 208.3 KiB | 6,655 |
| 320 | 275 µs | 324 µs | 829 µs | 402.0 KiB | 3,638 |
| 640 | 326 µs | 643 µs | 970 µs | 604.1 KiB | 3,072 |
| 1280 | 1.21 ms | 1.31 ms | 3.79 ms | 1.3 MiB | 828 |
| 2560 | 2.32 ms | 2.41 ms | 5.64 ms | 2.7 MiB | 431 |
| 5120 | 4.70 ms | 4.90 ms | 9.49 ms | 5.5 MiB | 213 |
| 10240 | 9.66 ms | 9.93 ms | 17.5 ms | 10.8 MiB | 103 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent 0.00, 10 sizes) -- ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 287 µs | 311 µs | 1.03 ms | 620.2 KiB | 3,483 |
| 40 | 266 µs | 296 µs | 840 µs | 618.2 KiB | 3,763 |
| 80 | 264 µs | 303 µs | 823 µs | 625.9 KiB | 3,781 |
| 160 | 298 µs | 326 µs | 1.03 ms | 667.5 KiB | 3,358 |
| 320 | 322 µs | 356 µs | 1.07 ms | 716.3 KiB | 3,103 |
| 640 | 368 µs | 399 µs | 1.12 ms | 829.2 KiB | 2,715 |
| 1280 | 370 µs | 400 µs | 1.12 ms | 829.2 KiB | 2,700 |
| 2560 | 367 µs | 396 µs | 1.11 ms | 829.2 KiB | 2,726 |
| 5120 | 367 µs | 389 µs | 1.12 ms | 829.2 KiB | 2,722 |
| 10240 | 371 µs | 400 µs | 1.12 ms | 829.2 KiB | 2,695 |

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

**Measured: O(n)** (exponent 0.98, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 192 µs | 201 µs | 680 µs | 45.6 KiB | 5,219 |
| 40 | 328 µs | 347 µs | 1.00 ms | 115.7 KiB | 3,046 |
| 80 | 667 µs | 705 µs | 1.70 ms | 178.6 KiB | 1,498 |
| 160 | 1.32 ms | 1.37 ms | 3.37 ms | 357.3 KiB | 758 |
| 320 | 2.32 ms | 2.46 ms | 4.73 ms | 712.3 KiB | 431 |
| 640 | 4.42 ms | 4.60 ms | 6.99 ms | 1.4 MiB | 226 |
| 1280 | 8.68 ms | 9.12 ms | 11.5 ms | 2.8 MiB | 115 |
| 2560 | 16.4 ms | 16.8 ms | 19.8 ms | 5.7 MiB | 61 |
| 5120 | 33.1 ms | 33.7 ms | 38.0 ms | 11.3 MiB | 30 |
| 10240 | 67.5 ms | 67.9 ms | 74.4 ms | 22.7 MiB | 15 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.02, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.02 ms | 2.13 ms | 4.40 ms | 599.8 KiB | 495 |
| 40 | 3.50 ms | 3.67 ms | 5.96 ms | 1.2 MiB | 286 |
| 80 | 6.55 ms | 6.76 ms | 9.12 ms | 2.3 MiB | 153 |
| 160 | 12.2 ms | 12.6 ms | 15.0 ms | 4.6 MiB | 82 |
| 320 | 23.6 ms | 24.2 ms | 27.6 ms | 9.3 MiB | 42 |
| 640 | 48.5 ms | 49.3 ms | 53.9 ms | 18.5 MiB | 21 |
| 1280 | 98.3 ms | 99.0 ms | 107 ms | 37.0 MiB | 10 |
| 2560 | 198 ms | 199 ms | 209 ms | 73.9 MiB | 5 |
| 5120 | 407 ms | 410 ms | 428 ms | 147.7 MiB | 2 |
| 10240 | 813 ms | 817 ms | 854 ms | 295.3 MiB | 1 |

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
| 20 | 98.0 µs | 132 µs | 332 µs | 97.9 KiB | 10,208 |
| 40 | 142 µs | 184 µs | 511 µs | 178.9 KiB | 7,058 |
| 80 | 252 µs | 333 µs | 876 µs | 322.3 KiB | 3,976 |
| 160 | 447 µs | 511 µs | 1.39 ms | 637.8 KiB | 2,236 |
| 320 | 772 µs | 818 µs | 1.73 ms | 1.2 MiB | 1,296 |
| 640 | 1.52 ms | 1.66 ms | 3.50 ms | 2.5 MiB | 657 |
| 1280 | 2.81 ms | 2.97 ms | 4.50 ms | 4.9 MiB | 355 |
| 2560 | 5.86 ms | 6.05 ms | 8.28 ms | 9.9 MiB | 171 |
| 5120 | 12.4 ms | 14.2 ms | 15.6 ms | 19.8 MiB | 81 |
| 10240 | 25.0 ms | 25.2 ms | 31.0 ms | 39.6 MiB | 40 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.19, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 99.9 µs | 117 µs | 193 µs | 281.0 KiB | 10,014 |
| 40 | 179 µs | 196 µs | 597 µs | 539.2 KiB | 5,583 |
| 80 | 346 µs | 366 µs | 1.07 ms | 1.0 MiB | 2,891 |
| 160 | 723 µs | 780 µs | 2.23 ms | 2.1 MiB | 1,383 |
| 320 | 1.51 ms | 1.59 ms | 4.55 ms | 4.2 MiB | 663 |
| 640 | 2.65 ms | 2.75 ms | 5.90 ms | 8.3 MiB | 378 |
| 1280 | 4.93 ms | 5.20 ms | 8.55 ms | 16.7 MiB | 203 |
| 2560 | 9.81 ms | 10.3 ms | 14.3 ms | 33.3 MiB | 102 |
| 5120 | 27.9 ms | 29.2 ms | 34.4 ms | 52.0 MiB | 36 |
| 10240 | 69.9 ms | 71.2 ms | 85.9 ms | 103.7 MiB | 14 |

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

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 95.1 µs | 106 µs | 99.0 µs | 57.3 KiB | 10,510 |
| 40 | 157 µs | 184 µs | 161 µs | 113.3 KiB | 6,380 |
| 80 | 290 µs | 313 µs | 295 µs | 225.5 KiB | 3,446 |
| 160 | 548 µs | 578 µs | 2.07 ms | 450.0 KiB | 1,824 |
| 320 | 895 µs | 946 µs | 2.76 ms | 898.7 KiB | 1,117 |
| 640 | 1.58 ms | 1.67 ms | 3.46 ms | 1.8 MiB | 632 |
| 1280 | 3.00 ms | 3.17 ms | 4.05 ms | 3.5 MiB | 333 |
| 2560 | 6.14 ms | 6.32 ms | 6.53 ms | 6.9 MiB | 163 |
| 5120 | 12.5 ms | 12.6 ms | 12.7 ms | 13.8 MiB | 80 |
| 10240 | 25.3 ms | 28.9 ms | 25.7 ms | 27.7 MiB | 40 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 88.8 µs | 102 µs | 93.0 µs | 56.4 KiB | 11,257 |
| 40 | 159 µs | 171 µs | 163 µs | 111.7 KiB | 6,308 |
| 80 | 303 µs | 339 µs | 308 µs | 222.3 KiB | 3,295 |
| 160 | 558 µs | 593 µs | 2.30 ms | 443.6 KiB | 1,791 |
| 320 | 936 µs | 995 µs | 2.72 ms | 886.1 KiB | 1,068 |
| 640 | 1.71 ms | 1.75 ms | 3.67 ms | 1.7 MiB | 585 |
| 1280 | 3.27 ms | 3.29 ms | 5.92 ms | 3.5 MiB | 306 |
| 2560 | 6.23 ms | 6.28 ms | 8.96 ms | 6.9 MiB | 161 |
| 5120 | 12.8 ms | 13.1 ms | 17.1 ms | 13.8 MiB | 78 |
| 10240 | 27.6 ms | 28.9 ms | 34.8 ms | 27.7 MiB | 36 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 461 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 300 µs | 300 µs | 65% |
| `run-policies` | 1 | 144 µs | 144 µs | 31% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 17.9 µs | 3.9% |

**At 10240 checks** (whole operation: 53.9 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 32.2 ms | 32.2 ms | 60% |
| `run-policies` | 1 | 21.4 ms | 21.4 ms | 40% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 341 µs | 0.6% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-24T13:22:34.651Z` → `2026-10-24T13:23:59.680Z` (85 s), ci: CI (run 40096835946)
- Machine: INTEL(R) XEON(R) PLATINUM 8573C, 4 logical core(s) (2 physical), 15989 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `72d58e9411c9b1d4c7f13c886abb5de93dbb6068` on `chore/zod-4-6-7`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

