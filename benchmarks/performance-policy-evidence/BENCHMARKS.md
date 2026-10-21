# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **275 µs** per operation compared with a bare-minimum baseline (**128% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.00). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 275 µs | 44.4 ms |
| Added latency, relative to baseline | 128% | 203% |
| Added CPU time per operation | 683 µs | 49.5 ms |
| Added memory per operation (heap delta) | 345.9 KiB | 44.4 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,640 ops/s | 23 ops/s |

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
| 20 | 58.6 µs | 179 µs | 120 µs | 205% | 504 µs | $0.00025 – $0.0057 |
| 40 | 115 µs | 275 µs | 160 µs | 140% | 427 µs | $0.00033 – $0.0048 |
| 80 | 214 µs | 489 µs | 275 µs | 128% | 683 µs | $0.00057 – $0.0077 |
| 160 | 399 µs | 852 µs | 453 µs | 114% | 732 µs | $0.00094 – $0.0082 |
| 320 | 768 µs | 1.70 ms | 933 µs | 121% | 1.69 ms | $0.0019 – $0.019 |
| 640 | 1.54 ms | 3.27 ms | 1.72 ms | 112% | 2.11 ms | $0.0036 – $0.024 |
| 1280 | 2.91 ms | 13.4 ms | 10.5 ms | 359% | 10.9 ms | $0.022 – $0.123 |
| 2560 | 5.64 ms | 19.5 ms | 13.8 ms | 245% | 14.3 ms | $0.029 – $0.161 |
| 5120 | 11.1 ms | 33.5 ms | 22.4 ms | 201% | 24.7 ms | $0.047 – $0.277 |
| 10240 | 21.8 ms | 66.2 ms | 44.4 ms | 203% | 49.5 ms | $0.092 – $0.556 |

**How the total grows:** O(n) (linear), exponent 1.00 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 310 µs | 38.0 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 2.94 ms | 410 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 132 µs | 26.8 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 174 µs | 39.1 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 137 µs | 26.8 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 172 µs | 38.3 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n log n) | ✅ matches | 79.0 µs | 9.52 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 279 µs | 403 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 733 µs | 91.8 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 7.04 ms | 1.40 s |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 264 µs | 29.0 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 311 µs | 66.1 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 333 µs | 25.1 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 323 µs | 26.9 ms |

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
| 20 | 92.4 µs | 96.2 µs | 317 µs | 52.9 KiB | 10,828 |
| 40 | 164 µs | 184 µs | 478 µs | 104.5 KiB | 6,113 |
| 80 | 310 µs | 322 µs | 831 µs | 211.4 KiB | 3,221 |
| 160 | 587 µs | 644 µs | 1.38 ms | 436.3 KiB | 1,705 |
| 320 | 1.18 ms | 1.24 ms | 2.82 ms | 938.9 KiB | 847 |
| 640 | 2.17 ms | 2.39 ms | 3.80 ms | 2.1 MiB | 461 |
| 1280 | 7.73 ms | 8.43 ms | 9.48 ms | 4.7 MiB | 129 |
| 2560 | 11.6 ms | 12.1 ms | 13.9 ms | 8.0 MiB | 86 |
| 5120 | 20.0 ms | 21.3 ms | 22.2 ms | 14.5 MiB | 50 |
| 10240 | 38.0 ms | 38.5 ms | 42.1 ms | 27.6 MiB | 26 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.06, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 804 µs | 815 µs | 1.62 ms | 294.9 KiB | 1,244 |
| 40 | 1.59 ms | 1.62 ms | 3.28 ms | 587.1 KiB | 630 |
| 80 | 2.94 ms | 3.64 ms | 4.75 ms | 1.1 MiB | 340 |
| 160 | 5.64 ms | 5.81 ms | 7.72 ms | 2.3 MiB | 177 |
| 320 | 11.0 ms | 11.3 ms | 13.5 ms | 4.7 MiB | 91 |
| 640 | 21.6 ms | 21.7 ms | 25.1 ms | 9.8 MiB | 46 |
| 1280 | 46.5 ms | 49.0 ms | 52.1 ms | 20.1 MiB | 22 |
| 2560 | 91.7 ms | 99.0 ms | 102 ms | 38.7 MiB | 11 |
| 5120 | 207 ms | 208 ms | 306 ms | 73.5 MiB | 5 |
| 10240 | 410 ms | 413 ms | 617 ms | 145.1 MiB | 2 |

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

**Measured: O(n)** (exponent 1.04, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 55.4 µs | 73.1 µs | 58.0 µs | 47.8 KiB | 18,053 |
| 40 | 69.3 µs | 85.9 µs | 225 µs | 92.5 KiB | 14,436 |
| 80 | 132 µs | 173 µs | 400 µs | 188.4 KiB | 7,569 |
| 160 | 266 µs | 353 µs | 821 µs | 393.8 KiB | 3,755 |
| 320 | 518 µs | 681 µs | 1.52 ms | 854.7 KiB | 1,932 |
| 640 | 1.14 ms | 1.49 ms | 3.01 ms | 1.9 MiB | 880 |
| 1280 | 5.53 ms | 5.79 ms | 8.13 ms | 4.4 MiB | 181 |
| 2560 | 7.34 ms | 7.80 ms | 10.4 ms | 7.3 MiB | 136 |
| 5120 | 13.4 ms | 14.4 ms | 17.6 ms | 13.2 MiB | 75 |
| 10240 | 26.8 ms | 28.0 ms | 35.7 ms | 24.5 MiB | 37 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.06, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 49.9 µs | 54.0 µs | 105 µs | 54.1 KiB | 20,045 |
| 40 | 89.5 µs | 106 µs | 302 µs | 107.0 KiB | 11,179 |
| 80 | 174 µs | 217 µs | 557 µs | 217.3 KiB | 5,745 |
| 160 | 345 µs | 436 µs | 1.09 ms | 451.7 KiB | 2,900 |
| 320 | 683 µs | 874 µs | 2.07 ms | 955.6 KiB | 1,464 |
| 640 | 1.59 ms | 1.88 ms | 5.11 ms | 2.2 MiB | 628 |
| 1280 | 7.09 ms | 8.26 ms | 13.2 ms | 4.9 MiB | 141 |
| 2560 | 10.9 ms | 11.2 ms | 21.2 ms | 8.3 MiB | 92 |
| 5120 | 18.7 ms | 20.1 ms | 37.0 ms | 15.1 MiB | 54 |
| 10240 | 39.1 ms | 39.2 ms | 75.1 ms | 28.4 MiB | 26 |

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

**Measured: O(n)** (exponent 1.03, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 42.5 µs | 46.4 µs | 44.0 µs | 47.0 KiB | 23,507 |
| 40 | 73.7 µs | 88.3 µs | 250 µs | 92.6 KiB | 13,573 |
| 80 | 137 µs | 175 µs | 419 µs | 188.4 KiB | 7,306 |
| 160 | 275 µs | 360 µs | 826 µs | 393.9 KiB | 3,639 |
| 320 | 531 µs | 703 µs | 1.49 ms | 856.1 KiB | 1,884 |
| 640 | 1.14 ms | 1.50 ms | 3.03 ms | 1.9 MiB | 875 |
| 1280 | 5.45 ms | 5.71 ms | 8.08 ms | 4.4 MiB | 184 |
| 2560 | 7.45 ms | 7.92 ms | 10.3 ms | 7.3 MiB | 134 |
| 5120 | 12.8 ms | 14.5 ms | 16.7 ms | 13.2 MiB | 78 |
| 10240 | 26.8 ms | 27.5 ms | 35.6 ms | 24.7 MiB | 37 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.06, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 51.8 µs | 54.7 µs | 137 µs | 54.2 KiB | 19,309 |
| 40 | 95.2 µs | 108 µs | 334 µs | 107.1 KiB | 10,500 |
| 80 | 172 µs | 213 µs | 538 µs | 217.3 KiB | 5,805 |
| 160 | 345 µs | 440 µs | 1.14 ms | 451.7 KiB | 2,895 |
| 320 | 697 µs | 882 µs | 2.09 ms | 970.6 KiB | 1,435 |
| 640 | 1.61 ms | 1.90 ms | 5.19 ms | 2.2 MiB | 622 |
| 1280 | 6.94 ms | 8.00 ms | 13.6 ms | 4.9 MiB | 144 |
| 2560 | 10.9 ms | 11.5 ms | 21.6 ms | 8.3 MiB | 92 |
| 5120 | 18.9 ms | 19.4 ms | 37.2 ms | 15.1 MiB | 53 |
| 10240 | 38.3 ms | 42.0 ms | 73.9 ms | 28.4 MiB | 26 |

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

**Measured: O(n log n)** (exponent 1.16, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 28.8 µs | 42.5 µs | 29.5 µs | 30.5 KiB | 34,711 |
| 40 | 40.8 µs | 50.4 µs | 139 µs | 55.2 KiB | 24,515 |
| 80 | 79.0 µs | 94.7 µs | 284 µs | 104.6 KiB | 12,652 |
| 160 | 139 µs | 239 µs | 421 µs | 207.7 KiB | 7,209 |
| 320 | 276 µs | 345 µs | 865 µs | 402.2 KiB | 3,623 |
| 640 | 333 µs | 690 µs | 1.28 ms | 604.7 KiB | 3,001 |
| 1280 | 1.17 ms | 1.23 ms | 3.30 ms | 1.3 MiB | 853 |
| 2560 | 2.20 ms | 2.29 ms | 4.88 ms | 2.7 MiB | 454 |
| 5120 | 4.55 ms | 4.65 ms | 8.44 ms | 5.5 MiB | 220 |
| 10240 | 9.52 ms | 9.60 ms | 16.5 ms | 10.8 MiB | 105 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent 0.02, 10 sizes) -- ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 252 µs | 261 µs | 723 µs | 616.5 KiB | 3,964 |
| 40 | 274 µs | 288 µs | 900 µs | 620.3 KiB | 3,655 |
| 80 | 279 µs | 294 µs | 901 µs | 626.2 KiB | 3,585 |
| 160 | 293 µs | 311 µs | 913 µs | 667.5 KiB | 3,415 |
| 320 | 316 µs | 337 µs | 936 µs | 716.3 KiB | 3,166 |
| 640 | 364 µs | 400 µs | 979 µs | 829.2 KiB | 2,749 |
| 1280 | 405 µs | 429 µs | 1.34 ms | 834.3 KiB | 2,471 |
| 2560 | 363 µs | 395 µs | 980 µs | 829.2 KiB | 2,756 |
| 5120 | 368 µs | 399 µs | 991 µs | 829.2 KiB | 2,718 |
| 10240 | 403 µs | 426 µs | 1.34 ms | 834.3 KiB | 2,480 |

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

**Measured: O(n)** (exponent 1.06, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 195 µs | 204 µs | 598 µs | 45.6 KiB | 5,128 |
| 40 | 343 µs | 364 µs | 901 µs | 115.7 KiB | 2,918 |
| 80 | 733 µs | 766 µs | 1.59 ms | 178.6 KiB | 1,365 |
| 160 | 1.41 ms | 1.45 ms | 3.11 ms | 357.3 KiB | 708 |
| 320 | 2.63 ms | 2.69 ms | 4.58 ms | 712.3 KiB | 381 |
| 640 | 4.72 ms | 4.89 ms | 6.82 ms | 1.4 MiB | 212 |
| 1280 | 9.38 ms | 9.61 ms | 11.7 ms | 2.8 MiB | 107 |
| 2560 | 19.0 ms | 19.7 ms | 21.2 ms | 5.7 MiB | 53 |
| 5120 | 37.9 ms | 38.2 ms | 38.4 ms | 11.3 MiB | 26 |
| 10240 | 91.8 ms | 92.2 ms | 92.3 ms | 22.7 MiB | 11 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.11, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.17 ms | 2.32 ms | 4.13 ms | 599.8 KiB | 461 |
| 40 | 3.83 ms | 3.95 ms | 5.82 ms | 1.2 MiB | 261 |
| 80 | 7.04 ms | 7.15 ms | 9.16 ms | 2.3 MiB | 142 |
| 160 | 13.5 ms | 13.8 ms | 15.8 ms | 4.6 MiB | 74 |
| 320 | 27.0 ms | 27.6 ms | 27.4 ms | 9.3 MiB | 37 |
| 640 | 63.3 ms | 64.0 ms | 63.9 ms | 18.5 MiB | 16 |
| 1280 | 153 ms | 154 ms | 154 ms | 37.0 MiB | 7 |
| 2560 | 330 ms | 332 ms | 331 ms | 73.9 MiB | 3 |
| 5120 | 709 ms | 736 ms | 730 ms | 147.7 MiB | 1 |
| 10240 | 1.40 s | 1.40 s | 1.44 s | 295.3 MiB | 1 |

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
| 20 | 103 µs | 144 µs | 406 µs | 98.0 KiB | 9,664 |
| 40 | 149 µs | 180 µs | 456 µs | 179.0 KiB | 6,716 |
| 80 | 264 µs | 313 µs | 778 µs | 322.3 KiB | 3,792 |
| 160 | 481 µs | 523 µs | 1.26 ms | 637.9 KiB | 2,077 |
| 320 | 864 µs | 943 µs | 1.66 ms | 1.2 MiB | 1,157 |
| 640 | 1.73 ms | 1.87 ms | 3.39 ms | 2.5 MiB | 577 |
| 1280 | 3.26 ms | 3.38 ms | 4.71 ms | 4.9 MiB | 307 |
| 2560 | 6.54 ms | 6.73 ms | 8.62 ms | 9.9 MiB | 153 |
| 5120 | 13.7 ms | 13.9 ms | 16.3 ms | 19.8 MiB | 73 |
| 10240 | 29.0 ms | 32.5 ms | 33.9 ms | 39.6 MiB | 34 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.18, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 93.5 µs | 105 µs | 352 µs | 281.1 KiB | 10,692 |
| 40 | 161 µs | 173 µs | 474 µs | 539.5 KiB | 6,207 |
| 80 | 311 µs | 321 µs | 831 µs | 1.0 MiB | 3,212 |
| 160 | 624 µs | 659 µs | 1.42 ms | 2.1 MiB | 1,603 |
| 320 | 1.32 ms | 1.45 ms | 2.94 ms | 4.2 MiB | 760 |
| 640 | 2.54 ms | 2.64 ms | 4.30 ms | 8.3 MiB | 394 |
| 1280 | 5.30 ms | 5.72 ms | 7.30 ms | 16.7 MiB | 189 |
| 2560 | 10.7 ms | 11.0 ms | 13.3 ms | 33.3 MiB | 93 |
| 5120 | 28.2 ms | 29.2 ms | 32.1 ms | 52.0 MiB | 35 |
| 10240 | 66.1 ms | 68.0 ms | 75.9 ms | 103.7 MiB | 15 |

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
| 20 | 100 µs | 127 µs | 103 µs | 57.4 KiB | 9,993 |
| 40 | 177 µs | 199 µs | 181 µs | 113.5 KiB | 5,665 |
| 80 | 333 µs | 356 µs | 338 µs | 225.7 KiB | 2,999 |
| 160 | 567 µs | 653 µs | 2.10 ms | 450.0 KiB | 1,763 |
| 320 | 920 µs | 971 µs | 2.39 ms | 898.9 KiB | 1,087 |
| 640 | 1.65 ms | 1.70 ms | 3.20 ms | 1.8 MiB | 606 |
| 1280 | 3.09 ms | 3.13 ms | 4.44 ms | 3.5 MiB | 324 |
| 2560 | 5.95 ms | 6.11 ms | 6.29 ms | 6.9 MiB | 168 |
| 5120 | 12.4 ms | 12.7 ms | 12.4 ms | 13.8 MiB | 81 |
| 10240 | 25.1 ms | 25.3 ms | 25.6 ms | 27.7 MiB | 40 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 91.8 µs | 109 µs | 95.0 µs | 56.5 KiB | 10,896 |
| 40 | 167 µs | 186 µs | 171 µs | 111.8 KiB | 5,988 |
| 80 | 323 µs | 352 µs | 327 µs | 222.5 KiB | 3,097 |
| 160 | 544 µs | 565 µs | 1.93 ms | 443.7 KiB | 1,839 |
| 320 | 909 µs | 977 µs | 2.32 ms | 886.2 KiB | 1,100 |
| 640 | 1.66 ms | 1.68 ms | 3.26 ms | 1.7 MiB | 601 |
| 1280 | 3.17 ms | 3.19 ms | 5.15 ms | 3.5 MiB | 315 |
| 2560 | 6.22 ms | 6.28 ms | 8.20 ms | 6.9 MiB | 161 |
| 5120 | 12.8 ms | 13.1 ms | 16.2 ms | 13.8 MiB | 78 |
| 10240 | 26.9 ms | 27.6 ms | 32.7 ms | 27.7 MiB | 37 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 489 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 310 µs | 310 µs | 64% |
| `run-policies` | 1 | 132 µs | 132 µs | 27% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 46.1 µs | 9.4% |

**At 10240 checks** (whole operation: 66.2 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 38.0 ms | 38.0 ms | 57% |
| `run-policies` | 1 | 26.8 ms | 26.8 ms | 41% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 1.36 ms | 2.1% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-21T17:23:09.790Z` → `2026-10-21T17:24:42.920Z` (93 s), ci: CI (run 39640861177)
- Machine: AMD EPYC 9V74 80-Core Processor, 4 logical core(s) (2 physical), 15984 MB RAM, linux/x64, Node v24.22.0, GitHub Actions
- Git: `00f54c81c3ec0279c26a64f3b8614838ad537852` on `changeset-release/main`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

