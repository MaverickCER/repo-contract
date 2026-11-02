# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **305 µs** per operation compared with a bare-minimum baseline (**143% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.97). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 305 µs | 44.8 ms |
| Added latency, relative to baseline | 143% | 202% |
| Added CPU time per operation | 696 µs | 47.2 ms |
| Added memory per operation (heap delta) | 345.9 KiB | 44.5 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,277 ops/s | 22 ops/s |

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
| 20 | 62.3 µs | 185 µs | 123 µs | 197% | 471 µs | $0.00026 – $0.0053 |
| 40 | 111 µs | 289 µs | 177 µs | 159% | 470 µs | $0.00037 – $0.0053 |
| 80 | 213 µs | 518 µs | 305 µs | 143% | 696 µs | $0.00064 – $0.0078 |
| 160 | 431 µs | 1.05 ms | 615 µs | 143% | 1.41 ms | $0.0013 – $0.016 |
| 320 | 869 µs | 1.86 ms | 990 µs | 114% | 927 µs | $0.0021 – $0.010 |
| 640 | 1.55 ms | 3.76 ms | 2.20 ms | 142% | 2.70 ms | $0.0046 – $0.030 |
| 1280 | 2.90 ms | 13.0 ms | 10.1 ms | 350% | 10.9 ms | $0.021 – $0.122 |
| 2560 | 5.66 ms | 20.0 ms | 14.3 ms | 253% | 15.5 ms | $0.030 – $0.174 |
| 5120 | 11.3 ms | 35.1 ms | 23.8 ms | 211% | 22.6 ms | $0.050 – $0.254 |
| 10240 | 22.2 ms | 66.9 ms | 44.8 ms | 202% | 47.2 ms | $0.093 – $0.531 |

**How the total grows:** O(n) (linear), exponent 0.97 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 309 µs | 38.8 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 3.00 ms | 410 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 154 µs | 25.9 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 195 µs | 34.8 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 154 µs | 25.8 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 200 µs | 36.4 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n log n) | ✅ matches | 84.0 µs | 9.39 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 294 µs | 431 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 865 µs | 97.7 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 8.24 ms | 1.53 s |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 291 µs | 30.7 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 341 µs | 64.4 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 371 µs | 28.4 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 362 µs | 28.7 ms |

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
| 20 | 97.2 µs | 103 µs | 330 µs | 52.9 KiB | 10,289 |
| 40 | 163 µs | 179 µs | 426 µs | 104.5 KiB | 6,151 |
| 80 | 309 µs | 335 µs | 723 µs | 211.4 KiB | 3,236 |
| 160 | 599 µs | 639 µs | 1.28 ms | 436.1 KiB | 1,671 |
| 320 | 1.20 ms | 1.28 ms | 2.73 ms | 938.9 KiB | 834 |
| 640 | 2.23 ms | 2.39 ms | 3.85 ms | 2.1 MiB | 449 |
| 1280 | 7.43 ms | 7.83 ms | 9.06 ms | 4.7 MiB | 135 |
| 2560 | 11.5 ms | 13.4 ms | 13.9 ms | 8.0 MiB | 87 |
| 5120 | 20.6 ms | 21.0 ms | 22.3 ms | 14.5 MiB | 49 |
| 10240 | 38.8 ms | 39.3 ms | 42.5 ms | 27.6 MiB | 26 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.05, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 804 µs | 815 µs | 1.58 ms | 294.9 KiB | 1,244 |
| 40 | 1.61 ms | 1.67 ms | 3.19 ms | 587.0 KiB | 621 |
| 80 | 3.00 ms | 3.63 ms | 4.73 ms | 1.1 MiB | 333 |
| 160 | 5.74 ms | 5.96 ms | 7.73 ms | 2.3 MiB | 174 |
| 320 | 11.2 ms | 11.4 ms | 13.7 ms | 4.7 MiB | 89 |
| 640 | 22.3 ms | 22.3 ms | 25.7 ms | 9.8 MiB | 45 |
| 1280 | 47.4 ms | 49.9 ms | 53.7 ms | 20.1 MiB | 21 |
| 2560 | 91.3 ms | 98.2 ms | 101 ms | 38.7 MiB | 11 |
| 5120 | 207 ms | 210 ms | 304 ms | 73.5 MiB | 5 |
| 10240 | 410 ms | 412 ms | 612 ms | 145.1 MiB | 2 |

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

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 56.1 µs | 80.2 µs | 58.0 µs | 47.4 KiB | 17,812 |
| 40 | 79.1 µs | 102 µs | 252 µs | 92.5 KiB | 12,646 |
| 80 | 154 µs | 218 µs | 458 µs | 188.5 KiB | 6,510 |
| 160 | 297 µs | 431 µs | 818 µs | 393.8 KiB | 3,371 |
| 320 | 593 µs | 807 µs | 1.57 ms | 855.1 KiB | 1,685 |
| 640 | 1.27 ms | 1.69 ms | 3.05 ms | 1.9 MiB | 785 |
| 1280 | 5.43 ms | 5.82 ms | 8.04 ms | 4.4 MiB | 184 |
| 2560 | 7.61 ms | 7.83 ms | 10.7 ms | 7.3 MiB | 131 |
| 5120 | 13.4 ms | 14.3 ms | 18.2 ms | 13.2 MiB | 75 |
| 10240 | 25.9 ms | 26.9 ms | 34.1 ms | 24.6 MiB | 39 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 58.4 µs | 66.4 µs | 240 µs | 54.1 KiB | 17,116 |
| 40 | 97.3 µs | 125 µs | 318 µs | 107.0 KiB | 10,279 |
| 80 | 195 µs | 255 µs | 633 µs | 217.5 KiB | 5,118 |
| 160 | 422 µs | 543 µs | 1.42 ms | 452.9 KiB | 2,372 |
| 320 | 802 µs | 1.01 ms | 2.17 ms | 970.6 KiB | 1,247 |
| 640 | 1.92 ms | 2.28 ms | 5.55 ms | 2.2 MiB | 520 |
| 1280 | 6.68 ms | 7.12 ms | 12.7 ms | 4.9 MiB | 150 |
| 2560 | 9.66 ms | 10.2 ms | 19.7 ms | 8.3 MiB | 103 |
| 5120 | 19.4 ms | 26.3 ms | 36.6 ms | 15.0 MiB | 51 |
| 10240 | 34.8 ms | 35.9 ms | 67.8 ms | 28.1 MiB | 29 |

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

**Measured: O(n)** (exponent 0.98, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 51.0 µs | 55.9 µs | 105 µs | 47.0 KiB | 19,607 |
| 40 | 86.0 µs | 109 µs | 296 µs | 92.7 KiB | 11,633 |
| 80 | 154 µs | 206 µs | 468 µs | 188.5 KiB | 6,496 |
| 160 | 306 µs | 428 µs | 920 µs | 393.9 KiB | 3,267 |
| 320 | 622 µs | 831 µs | 1.59 ms | 853.7 KiB | 1,608 |
| 640 | 1.30 ms | 1.64 ms | 3.15 ms | 1.9 MiB | 771 |
| 1280 | 5.60 ms | 6.12 ms | 8.07 ms | 4.4 MiB | 178 |
| 2560 | 7.47 ms | 8.02 ms | 10.6 ms | 7.3 MiB | 134 |
| 5120 | 12.8 ms | 14.7 ms | 17.7 ms | 13.2 MiB | 78 |
| 10240 | 25.8 ms | 26.7 ms | 33.2 ms | 24.6 MiB | 39 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 58.6 µs | 67.0 µs | 190 µs | 54.2 KiB | 17,064 |
| 40 | 99.3 µs | 125 µs | 330 µs | 107.0 KiB | 10,072 |
| 80 | 200 µs | 242 µs | 654 µs | 217.5 KiB | 4,994 |
| 160 | 442 µs | 569 µs | 1.43 ms | 452.9 KiB | 2,264 |
| 320 | 945 µs | 1.16 ms | 3.34 ms | 975.7 KiB | 1,059 |
| 640 | 1.92 ms | 2.40 ms | 5.48 ms | 2.2 MiB | 522 |
| 1280 | 6.76 ms | 7.12 ms | 12.8 ms | 4.9 MiB | 148 |
| 2560 | 9.92 ms | 10.3 ms | 19.9 ms | 8.3 MiB | 101 |
| 5120 | 18.7 ms | 20.2 ms | 36.6 ms | 15.1 MiB | 53 |
| 10240 | 36.4 ms | 37.8 ms | 70.1 ms | 28.2 MiB | 27 |

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

**Measured: O(n log n)** (exponent 1.15, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 35.6 µs | 49.8 µs | 45.3 µs | 30.5 KiB | 28,100 |
| 40 | 45.4 µs | 57.3 µs | 158 µs | 55.0 KiB | 22,035 |
| 80 | 84.0 µs | 112 µs | 273 µs | 104.6 KiB | 11,909 |
| 160 | 156 µs | 208 µs | 490 µs | 208.3 KiB | 6,410 |
| 320 | 269 µs | 365 µs | 714 µs | 402.0 KiB | 3,718 |
| 640 | 340 µs | 660 µs | 1.25 ms | 604.7 KiB | 2,942 |
| 1280 | 1.19 ms | 1.30 ms | 3.21 ms | 1.3 MiB | 839 |
| 2560 | 2.25 ms | 2.35 ms | 4.93 ms | 2.7 MiB | 444 |
| 5120 | 4.63 ms | 4.78 ms | 8.71 ms | 5.5 MiB | 216 |
| 10240 | 9.39 ms | 9.66 ms | 16.3 ms | 10.8 MiB | 107 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent 0.00, 10 sizes) -- ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 284 µs | 304 µs | 875 µs | 620.2 KiB | 3,516 |
| 40 | 285 µs | 326 µs | 866 µs | 620.3 KiB | 3,503 |
| 80 | 294 µs | 324 µs | 879 µs | 626.2 KiB | 3,407 |
| 160 | 307 µs | 351 µs | 895 µs | 667.5 KiB | 3,254 |
| 320 | 336 µs | 360 µs | 919 µs | 716.3 KiB | 2,978 |
| 640 | 432 µs | 474 µs | 1.31 ms | 834.3 KiB | 2,314 |
| 1280 | 431 µs | 472 µs | 1.33 ms | 834.3 KiB | 2,320 |
| 2560 | 434 µs | 472 µs | 1.32 ms | 834.3 KiB | 2,305 |
| 5120 | 433 µs | 513 µs | 1.32 ms | 834.3 KiB | 2,310 |
| 10240 | 431 µs | 462 µs | 1.31 ms | 834.3 KiB | 2,318 |

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

**Measured: O(n)** (exponent 1.04, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 224 µs | 251 µs | 724 µs | 45.8 KiB | 4,472 |
| 40 | 396 µs | 419 µs | 911 µs | 115.7 KiB | 2,527 |
| 80 | 865 µs | 894 µs | 1.66 ms | 178.6 KiB | 1,156 |
| 160 | 1.61 ms | 1.69 ms | 3.22 ms | 357.3 KiB | 621 |
| 320 | 2.91 ms | 3.06 ms | 4.91 ms | 712.3 KiB | 344 |
| 640 | 5.35 ms | 5.55 ms | 7.44 ms | 1.4 MiB | 187 |
| 1280 | 10.7 ms | 10.9 ms | 12.9 ms | 2.8 MiB | 94 |
| 2560 | 21.1 ms | 21.5 ms | 23.0 ms | 5.7 MiB | 47 |
| 5120 | 42.7 ms | 43.2 ms | 43.1 ms | 11.3 MiB | 23 |
| 10240 | 97.7 ms | 98.0 ms | 98.3 ms | 22.7 MiB | 10 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.11, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.48 ms | 2.70 ms | 4.40 ms | 599.8 KiB | 403 |
| 40 | 4.46 ms | 4.61 ms | 6.47 ms | 1.2 MiB | 224 |
| 80 | 8.24 ms | 8.43 ms | 10.3 ms | 2.3 MiB | 121 |
| 160 | 15.6 ms | 15.8 ms | 17.9 ms | 4.6 MiB | 64 |
| 320 | 30.4 ms | 30.5 ms | 30.9 ms | 9.3 MiB | 33 |
| 640 | 69.1 ms | 69.4 ms | 69.5 ms | 18.5 MiB | 14 |
| 1280 | 171 ms | 173 ms | 171 ms | 37.0 MiB | 6 |
| 2560 | 367 ms | 371 ms | 367 ms | 73.9 MiB | 3 |
| 5120 | 751 ms | 758 ms | 769 ms | 147.7 MiB | 1 |
| 10240 | 1.53 s | 1.54 s | 1.56 s | 295.3 MiB | 1 |

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
| 20 | 120 µs | 178 µs | 481 µs | 98.0 KiB | 8,347 |
| 40 | 173 µs | 234 µs | 535 µs | 179.0 KiB | 5,769 |
| 80 | 291 µs | 410 µs | 782 µs | 351.1 KiB | 3,436 |
| 160 | 512 µs | 546 µs | 1.26 ms | 637.9 KiB | 1,954 |
| 320 | 1.01 ms | 1.26 ms | 2.52 ms | 1.2 MiB | 988 |
| 640 | 1.83 ms | 2.03 ms | 3.41 ms | 2.5 MiB | 545 |
| 1280 | 3.47 ms | 3.71 ms | 5.09 ms | 4.9 MiB | 289 |
| 2560 | 7.15 ms | 7.45 ms | 9.26 ms | 9.9 MiB | 140 |
| 5120 | 14.7 ms | 15.1 ms | 18.1 ms | 19.8 MiB | 68 |
| 10240 | 30.7 ms | 31.4 ms | 35.7 ms | 39.6 MiB | 33 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.17, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 106 µs | 122 µs | 353 µs | 281.1 KiB | 9,391 |
| 40 | 192 µs | 236 µs | 565 µs | 540.1 KiB | 5,200 |
| 80 | 341 µs | 362 µs | 845 µs | 1.0 MiB | 2,929 |
| 160 | 668 µs | 716 µs | 1.43 ms | 2.1 MiB | 1,497 |
| 320 | 1.36 ms | 1.47 ms | 2.91 ms | 4.2 MiB | 735 |
| 640 | 2.56 ms | 2.79 ms | 4.31 ms | 8.3 MiB | 390 |
| 1280 | 5.02 ms | 5.27 ms | 7.13 ms | 16.7 MiB | 199 |
| 2560 | 10.0 ms | 10.8 ms | 12.8 ms | 33.3 MiB | 100 |
| 5120 | 27.0 ms | 27.6 ms | 30.9 ms | 52.0 MiB | 37 |
| 10240 | 64.4 ms | 66.5 ms | 74.8 ms | 103.7 MiB | 16 |

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

**Measured: O(n)** (exponent 0.98, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 116 µs | 145 µs | 119 µs | 57.4 KiB | 8,608 |
| 40 | 202 µs | 235 µs | 206 µs | 113.5 KiB | 4,957 |
| 80 | 371 µs | 405 µs | 1.21 ms | 225.7 KiB | 2,697 |
| 160 | 597 µs | 670 µs | 2.07 ms | 450.0 KiB | 1,674 |
| 320 | 1.02 ms | 1.11 ms | 2.50 ms | 898.9 KiB | 980 |
| 640 | 1.88 ms | 2.05 ms | 3.45 ms | 1.8 MiB | 532 |
| 1280 | 3.46 ms | 3.70 ms | 4.63 ms | 3.5 MiB | 289 |
| 2560 | 6.69 ms | 6.96 ms | 7.04 ms | 6.9 MiB | 149 |
| 5120 | 13.5 ms | 13.7 ms | 13.7 ms | 13.8 MiB | 74 |
| 10240 | 28.4 ms | 28.9 ms | 28.8 ms | 27.7 MiB | 35 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 104 µs | 135 µs | 108 µs | 56.5 KiB | 9,621 |
| 40 | 191 µs | 218 µs | 195 µs | 111.8 KiB | 5,241 |
| 80 | 362 µs | 397 µs | 1.26 ms | 222.5 KiB | 2,765 |
| 160 | 593 µs | 621 µs | 2.00 ms | 443.7 KiB | 1,687 |
| 320 | 1.02 ms | 1.03 ms | 2.53 ms | 886.2 KiB | 981 |
| 640 | 1.82 ms | 1.87 ms | 3.44 ms | 1.7 MiB | 549 |
| 1280 | 3.44 ms | 3.51 ms | 5.48 ms | 3.5 MiB | 290 |
| 2560 | 6.64 ms | 6.72 ms | 8.67 ms | 6.9 MiB | 151 |
| 5120 | 13.7 ms | 14.0 ms | 17.1 ms | 13.8 MiB | 73 |
| 10240 | 28.7 ms | 31.1 ms | 34.7 ms | 27.7 MiB | 35 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 518 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 309 µs | 309 µs | 60% |
| `run-policies` | 1 | 154 µs | 154 µs | 30% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 55.6 µs | 11% |

**At 10240 checks** (whole operation: 66.9 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 38.8 ms | 38.8 ms | 58% |
| `run-policies` | 1 | 25.9 ms | 25.9 ms | 39% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 2.19 ms | 3.3% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-02T16:21:47.343Z` → `2026-11-02T16:23:24.214Z` (97 s), ci: CI (run 41477789201)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15984 MB RAM, linux/x64, Node v24.22.1, GitHub Actions
- Git: `8e74e7c46270cc96a141dbe3b0c75b8f10d8c3d4` on `feat/affected-scope-engine`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

