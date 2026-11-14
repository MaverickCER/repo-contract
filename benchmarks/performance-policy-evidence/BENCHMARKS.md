# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend, and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **210 µs** per operation compared with a bare-minimum baseline (**139% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.86). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones. Both come from the same run, so they depend far less on the machine than a time does. Runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below). They show scale, not a budget.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 210 µs | 28.2 ms |
| Added latency, relative to baseline | 139% | 245% |
| Added CPU time per operation | 1.12 ms | 32.1 ms |
| Added memory per operation (heap delta) | 354.1 KiB | 44.7 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 4,759 ops/s | 35 ops/s |

## 1. End-to-end: the package's total impact

Shows what a contract run pays, after the checks have finished, for turning their raw results into structured evidence and a verdict, compared with the bare minimum of parsing each check's output and counting its findings. Neither side runs a process; this is pure CPU on data already in memory, paid once per contract run.

- **Baseline (no package):** Parse each check's JSON output and count its findings by hand -- the least anyone would do to know what the checks said.
- **With the package:** `buildEvidence` assembles the run's evidence record and `runPolicies` evaluates every check's policy against it, with dependency lookups.

Both sides use empty or minimal functions on purpose. The difference is then the package's own cost, not the cost of the work an application would plug into it. Real applications add their own work on top; this is the floor the package imposes.

**Variables that could change this result**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| checks evaluated | swept | The tier axis: how many check results are turned into evidence and judged. |
| output per check | fixed at "about 500 bytes" | Output volume is measured as a variant in each function below. |
| policy work | fixed at "reads its own parsed output and its dependencies' evidence" | A real, non-trivial policy; an application's own policy logic adds its own cost on top. |
| dependency lookups | fixed at "about 15% of checks depend on an earlier check" | Exercises the per-check dependency-evidence gathering loop. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

The baseline is an empty or minimal function, so it costs almost nothing. The _relative_ overhead can then look enormous (shown as a multiple of the baseline). Read the absolute columns (time, CPU and dollars added): they are what a bill and a latency budget are made of.

| checks | Baseline | With package | Added | Added vs baseline | Added CPU | Est. $ / 1M ops |
| --- | --- | --- | --- | --- | --- | --- |
| 20 | 46.4 µs | 137 µs | 92.3 µs | 199% | 91.0 µs | $0.00019 – $0.001 |
| 40 | 79.7 µs | 233 µs | 144 µs | 181% | 154 µs | $0.0003 – $0.0017 |
| 80 | 151 µs | 367 µs | 210 µs | 139% | 1.12 ms | $0.00044 – $0.013 |
| 160 | 292 µs | 638 µs | 336 µs | 115% | 707 µs | $0.0007 – $0.0079 |
| 320 | 482 µs | 1.31 ms | 798 µs | 166% | 837 µs | $0.0017 – $0.0094 |
| 640 | 832 µs | 3.20 ms | 2.34 ms | 281% | 2.56 ms | $0.0049 – $0.029 |
| 1280 | 1.55 ms | 7.33 ms | 5.77 ms | 373% | 6.04 ms | $0.012 – $0.068 |
| 2560 | 3.02 ms | 11.4 ms | 8.43 ms | 279% | 9.05 ms | $0.018 – $0.102 |
| 5120 | 5.96 ms | 19.2 ms | 13.2 ms | 222% | 14.8 ms | $0.028 – $0.167 |
| 10240 | 11.5 ms | 39.5 ms | 28.2 ms | 245% | 32.1 ms | $0.059 – $0.361 |

**How the total grows:** O(n) (linear), exponent 0.86 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder. Its measured growth rate is then compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report. Either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 151 µs | 20.1 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 1.61 ms | 234 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 61.0 µs | 15.5 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 80.9 µs | 23.7 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 63.5 µs | 16.2 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 77.1 µs | 23.1 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n log n) | ✅ matches | 31.9 µs | 5.81 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 124 µs | 176 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 351 µs | 50.8 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 3.69 ms | 802 ms |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 126 µs | 15.3 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 154 µs | 40.7 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 173 µs | 15.2 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 169 µs | 14.8 ms |

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

**Measured: O(n)** (exponent 0.98, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 42.9 µs | 46.5 µs | 123 µs | 52.8 KiB | 23,318 |
| 40 | 77.1 µs | 80.8 µs | 185 µs | 104.2 KiB | 12,962 |
| 80 | 151 µs | 157 µs | 343 µs | 211.1 KiB | 6,639 |
| 160 | 292 µs | 303 µs | 614 µs | 436.0 KiB | 3,430 |
| 320 | 568 µs | 605 µs | 1.08 ms | 938.5 KiB | 1,762 |
| 640 | 1.13 ms | 1.24 ms | 2.16 ms | 2.1 MiB | 886 |
| 1280 | 3.96 ms | 4.19 ms | 5.03 ms | 4.7 MiB | 252 |
| 2560 | 6.28 ms | 6.63 ms | 7.53 ms | 8.0 MiB | 159 |
| 5120 | 10.8 ms | 11.1 ms | 13.1 ms | 14.5 MiB | 92 |
| 10240 | 20.1 ms | 20.4 ms | 23.0 ms | 27.6 MiB | 50 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.08, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 413 µs | 419 µs | 735 µs | 294.5 KiB | 2,420 |
| 40 | 799 µs | 837 µs | 1.29 ms | 585.9 KiB | 1,252 |
| 80 | 1.61 ms | 1.65 ms | 2.70 ms | 1.1 MiB | 622 |
| 160 | 3.08 ms | 3.13 ms | 4.32 ms | 2.3 MiB | 325 |
| 320 | 6.01 ms | 6.23 ms | 7.52 ms | 4.7 MiB | 166 |
| 640 | 12.0 ms | 12.5 ms | 14.1 ms | 9.8 MiB | 84 |
| 1280 | 25.7 ms | 26.1 ms | 29.4 ms | 20.1 MiB | 39 |
| 2560 | 49.9 ms | 55.5 ms | 57.4 ms | 38.7 MiB | 20 |
| 5120 | 118 ms | 119 ms | 179 ms | 73.4 MiB | 8 |
| 10240 | 234 ms | 239 ms | 362 ms | 145.2 MiB | 4 |

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

**Measured: O(n log n)** (exponent 1.12, 10 sizes): 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 25.4 µs | 28.7 µs | 26.0 µs | 48.1 KiB | 39,307 |
| 40 | 32.0 µs | 47.9 µs | 92.1 µs | 92.4 KiB | 31,253 |
| 80 | 61.0 µs | 87.4 µs | 170 µs | 188.2 KiB | 16,383 |
| 160 | 123 µs | 175 µs | 334 µs | 393.0 KiB | 8,101 |
| 320 | 247 µs | 360 µs | 615 µs | 852.3 KiB | 4,046 |
| 640 | 504 µs | 668 µs | 1.04 ms | 1.9 MiB | 1,984 |
| 1280 | 2.80 ms | 3.06 ms | 4.50 ms | 4.4 MiB | 358 |
| 2560 | 3.98 ms | 4.24 ms | 6.00 ms | 7.3 MiB | 251 |
| 5120 | 6.87 ms | 7.16 ms | 9.74 ms | 13.2 MiB | 146 |
| 10240 | 15.5 ms | 22.7 ms | 20.2 ms | 24.9 MiB | 65 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.12, 10 sizes): 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 24.7 µs | 26.6 µs | 92.9 µs | 54.0 KiB | 40,415 |
| 40 | 39.7 µs | 52.5 µs | 123 µs | 106.8 KiB | 25,220 |
| 80 | 80.9 µs | 108 µs | 238 µs | 216.8 KiB | 12,364 |
| 160 | 176 µs | 229 µs | 535 µs | 451.1 KiB | 5,688 |
| 320 | 324 µs | 443 µs | 838 µs | 955.8 KiB | 3,089 |
| 640 | 874 µs | 1.00 ms | 2.97 ms | 2.2 MiB | 1,144 |
| 1280 | 3.94 ms | 4.23 ms | 8.17 ms | 4.9 MiB | 254 |
| 2560 | 6.32 ms | 7.07 ms | 13.0 ms | 8.3 MiB | 158 |
| 5120 | 12.7 ms | 13.3 ms | 24.6 ms | 15.1 MiB | 79 |
| 10240 | 23.7 ms | 24.3 ms | 45.1 ms | 28.2 MiB | 42 |

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

**Measured: O(n log n)** (exponent 1.14, 10 sizes): 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 21.4 µs | 22.8 µs | 83.9 µs | 46.9 KiB | 46,682 |
| 40 | 32.3 µs | 44.0 µs | 94.1 µs | 92.5 KiB | 31,006 |
| 80 | 63.5 µs | 88.6 µs | 178 µs | 187.3 KiB | 15,741 |
| 160 | 129 µs | 179 µs | 352 µs | 392.9 KiB | 7,779 |
| 320 | 259 µs | 370 µs | 640 µs | 853.8 KiB | 3,862 |
| 640 | 519 µs | 692 µs | 1.11 ms | 1.9 MiB | 1,928 |
| 1280 | 2.81 ms | 3.34 ms | 4.53 ms | 4.4 MiB | 356 |
| 2560 | 4.09 ms | 4.33 ms | 6.19 ms | 7.3 MiB | 244 |
| 5120 | 7.61 ms | 8.22 ms | 10.6 ms | 13.2 MiB | 131 |
| 10240 | 16.2 ms | 20.0 ms | 21.7 ms | 24.4 MiB | 62 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.12, 10 sizes): 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 25.8 µs | 33.3 µs | 62.7 µs | 54.1 KiB | 38,751 |
| 40 | 40.0 µs | 53.2 µs | 122 µs | 106.9 KiB | 24,998 |
| 80 | 77.1 µs | 105 µs | 197 µs | 213.8 KiB | 12,970 |
| 160 | 171 µs | 225 µs | 470 µs | 444.5 KiB | 5,863 |
| 320 | 319 µs | 355 µs | 895 µs | 955.9 KiB | 3,138 |
| 640 | 833 µs | 937 µs | 2.91 ms | 2.1 MiB | 1,200 |
| 1280 | 3.92 ms | 4.15 ms | 8.09 ms | 4.8 MiB | 255 |
| 2560 | 6.34 ms | 7.61 ms | 13.1 ms | 8.2 MiB | 158 |
| 5120 | 12.2 ms | 12.8 ms | 24.6 ms | 14.9 MiB | 82 |
| 10240 | 23.1 ms | 23.4 ms | 44.2 ms | 28.3 MiB | 43 |

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

**Measured: O(n log n)** (exponent 1.34, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 14.6 µs | 21.5 µs | 14.9 µs | 30.4 KiB | 68,380 |
| 40 | 18.0 µs | 25.6 µs | 51.7 µs | 55.0 KiB | 55,634 |
| 80 | 31.9 µs | 46.7 µs | 87.8 µs | 104.4 KiB | 31,388 |
| 160 | 59.7 µs | 88.7 µs | 157 µs | 204.6 KiB | 16,751 |
| 320 | 62.0 µs | 67.1 µs | 163 µs | 297.8 KiB | 16,131 |
| 640 | 124 µs | 134 µs | 354 µs | 611.5 KiB | 8,047 |
| 1280 | 555 µs | 594 µs | 1.19 ms | 1.3 MiB | 1,803 |
| 2560 | 1.25 ms | 1.32 ms | 2.83 ms | 2.7 MiB | 802 |
| 5120 | 2.65 ms | 2.71 ms | 4.91 ms | 5.5 MiB | 378 |
| 10240 | 5.81 ms | 6.36 ms | 9.99 ms | 10.8 MiB | 172 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent -0.00, 10 sizes): ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 120 µs | 130 µs | 312 µs | 612.7 KiB | 8,312 |
| 40 | 121 µs | 128 µs | 308 µs | 625.0 KiB | 8,267 |
| 80 | 124 µs | 129 µs | 314 µs | 627.3 KiB | 8,036 |
| 160 | 135 µs | 141 µs | 359 µs | 661.0 KiB | 7,435 |
| 320 | 147 µs | 157 µs | 374 µs | 731.5 KiB | 6,814 |
| 640 | 177 µs | 202 µs | 460 µs | 825.5 KiB | 5,652 |
| 1280 | 176 µs | 194 µs | 462 µs | 825.5 KiB | 5,683 |
| 2560 | 177 µs | 190 µs | 460 µs | 825.5 KiB | 5,643 |
| 5120 | 176 µs | 191 µs | 460 µs | 825.5 KiB | 5,692 |
| 10240 | 176 µs | 190 µs | 458 µs | 825.5 KiB | 5,687 |

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

**Measured: O(n)** (exponent 1.08, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 92.1 µs | 105 µs | 261 µs | 50.5 KiB | 10,862 |
| 40 | 168 µs | 187 µs | 424 µs | 109.0 KiB | 5,961 |
| 80 | 351 µs | 374 µs | 701 µs | 178.1 KiB | 2,851 |
| 160 | 664 µs | 726 µs | 1.26 ms | 355.8 KiB | 1,506 |
| 320 | 1.30 ms | 1.41 ms | 2.54 ms | 712.3 KiB | 768 |
| 640 | 2.42 ms | 2.55 ms | 3.74 ms | 1.4 MiB | 413 |
| 1280 | 4.87 ms | 5.01 ms | 6.31 ms | 2.8 MiB | 205 |
| 2560 | 9.85 ms | 10.4 ms | 10.5 ms | 5.7 MiB | 102 |
| 5120 | 19.8 ms | 20.2 ms | 20.2 ms | 11.3 MiB | 51 |
| 10240 | 50.8 ms | 51.0 ms | 51.2 ms | 22.7 MiB | 20 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.12, 10 sizes): 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.12 ms | 1.22 ms | 2.34 ms | 599.8 KiB | 892 |
| 40 | 2.05 ms | 2.14 ms | 3.33 ms | 1.2 MiB | 488 |
| 80 | 3.69 ms | 3.84 ms | 5.01 ms | 2.3 MiB | 271 |
| 160 | 7.14 ms | 7.27 ms | 7.98 ms | 4.6 MiB | 140 |
| 320 | 14.3 ms | 28.2 ms | 14.7 ms | 9.3 MiB | 70 |
| 640 | 35.2 ms | 35.4 ms | 35.7 ms | 18.5 MiB | 28 |
| 1280 | 86.5 ms | 90.6 ms | 87.0 ms | 37.0 MiB | 12 |
| 2560 | 190 ms | 193 ms | 191 ms | 73.9 MiB | 5 |
| 5120 | 397 ms | 401 ms | 408 ms | 147.7 MiB | 3 |
| 10240 | 802 ms | 812 ms | 828 ms | 295.3 MiB | 1 |

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

**Measured: O(n)** (exponent 1.03, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 52.9 µs | 70.0 µs | 208 µs | 98.0 KiB | 18,897 |
| 40 | 71.6 µs | 97.2 µs | 176 µs | 178.8 KiB | 13,975 |
| 80 | 126 µs | 141 µs | 315 µs | 322.2 KiB | 7,947 |
| 160 | 232 µs | 250 µs | 476 µs | 637.7 KiB | 4,308 |
| 320 | 464 µs | 490 µs | 961 µs | 1.2 MiB | 2,154 |
| 640 | 876 µs | 932 µs | 1.40 ms | 2.5 MiB | 1,142 |
| 1280 | 1.73 ms | 1.80 ms | 2.59 ms | 4.9 MiB | 577 |
| 2560 | 3.45 ms | 3.57 ms | 4.63 ms | 9.9 MiB | 290 |
| 5120 | 7.28 ms | 7.41 ms | 8.89 ms | 19.8 MiB | 137 |
| 10240 | 15.3 ms | 16.0 ms | 18.2 ms | 39.6 MiB | 65 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.22, 10 sizes): 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 42.7 µs | 49.8 µs | 130 µs | 280.3 KiB | 23,399 |
| 40 | 77.5 µs | 80.8 µs | 185 µs | 538.6 KiB | 12,907 |
| 80 | 154 µs | 163 µs | 349 µs | 1.0 MiB | 6,494 |
| 160 | 315 µs | 334 µs | 635 µs | 2.1 MiB | 3,177 |
| 320 | 648 µs | 701 µs | 1.17 ms | 4.2 MiB | 1,543 |
| 640 | 1.41 ms | 1.47 ms | 2.46 ms | 8.3 MiB | 712 |
| 1280 | 2.85 ms | 2.99 ms | 4.05 ms | 16.7 MiB | 351 |
| 2560 | 5.91 ms | 6.11 ms | 7.47 ms | 33.3 MiB | 169 |
| 5120 | 15.8 ms | 16.6 ms | 18.2 ms | 52.0 MiB | 63 |
| 10240 | 40.7 ms | 54.8 ms | 47.7 ms | 103.7 MiB | 25 |

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

**Measured: O(n)** (exponent 1.02, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 53.0 µs | 64.5 µs | 55.0 µs | 57.3 KiB | 18,854 |
| 40 | 92.3 µs | 103 µs | 95.0 µs | 113.3 KiB | 10,838 |
| 80 | 173 µs | 184 µs | 175 µs | 225.5 KiB | 5,792 |
| 160 | 297 µs | 333 µs | 1.07 ms | 450.0 KiB | 3,371 |
| 320 | 512 µs | 534 µs | 1.37 ms | 898.7 KiB | 1,954 |
| 640 | 936 µs | 1.03 ms | 1.89 ms | 1.8 MiB | 1,069 |
| 1280 | 1.70 ms | 1.79 ms | 2.10 ms | 3.5 MiB | 590 |
| 2560 | 3.39 ms | 4.93 ms | 3.55 ms | 6.9 MiB | 295 |
| 5120 | 7.36 ms | 7.60 ms | 7.41 ms | 13.8 MiB | 136 |
| 10240 | 15.2 ms | 15.3 ms | 15.6 ms | 27.7 MiB | 66 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.99, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 48.7 µs | 59.1 µs | 51.0 µs | 56.4 KiB | 20,549 |
| 40 | 88.0 µs | 101 µs | 91.0 µs | 111.7 KiB | 11,367 |
| 80 | 169 µs | 183 µs | 172 µs | 222.3 KiB | 5,916 |
| 160 | 302 µs | 323 µs | 1.17 ms | 443.6 KiB | 3,306 |
| 320 | 509 µs | 620 µs | 1.34 ms | 886.1 KiB | 1,965 |
| 640 | 937 µs | 1.01 ms | 1.83 ms | 1.7 MiB | 1,068 |
| 1280 | 1.83 ms | 1.87 ms | 3.18 ms | 3.5 MiB | 547 |
| 2560 | 3.50 ms | 3.55 ms | 4.31 ms | 6.9 MiB | 286 |
| 5120 | 7.13 ms | 7.31 ms | 9.34 ms | 13.8 MiB | 140 |
| 10240 | 14.8 ms | 15.2 ms | 18.8 ms | 27.7 MiB | 68 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls. So where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time). Every moment of the operation then belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly. They are not measured against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 367 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 151 µs | 151 µs | 41% |
| `run-policies` | 1 | 61.0 µs | 61.0 µs | 17% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 156 µs | 42% |

**At 10240 checks** (whole operation: 39.5 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 20.1 ms | 20.1 ms | 51% |
| `run-policies` | 1 | 15.5 ms | 15.5 ms | 39% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 3.97 ms | 10% |

## Cost model

Estimates use two bracketing price shapes. **Low** is CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time). **High** is duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-14T20:52:40.151Z` → `2026-11-14T20:53:40.890Z` (61 s), ci: CI (run 43638758320)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `0c53398b06c4a73ae2cedecd36d3f56ac46c4da4` on `fix/release-build-without-contract`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks: One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They show how _this_ package's cost changes between runs on comparable hardware, and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

