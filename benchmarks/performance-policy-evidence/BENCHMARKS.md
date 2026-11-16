# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend, and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **345 µs** per operation compared with a bare-minimum baseline (**184% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.86). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones. Both come from the same run, so they depend far less on the machine than a time does. Runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below). They show scale, not a budget.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 345 µs | 35.4 ms |
| Added latency, relative to baseline | 184% | 260% |
| Added CPU time per operation | 1.88 ms | 36.4 ms |
| Added memory per operation (heap delta) | 354.1 KiB | 45.1 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 2,899 ops/s | 28 ops/s |

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
| 20 | 55.6 µs | 170 µs | 115 µs | 206% | 115 µs | $0.00024 – $0.0013 |
| 40 | 98.6 µs | 296 µs | 198 µs | 201% | 225 µs | $0.00041 – $0.0025 |
| 80 | 187 µs | 523 µs | 345 µs | 184% | 1.88 ms | $0.00072 – $0.021 |
| 160 | 359 µs | 884 µs | 553 µs | 154% | 2.26 ms | $0.0012 – $0.025 |
| 320 | 662 µs | 1.84 ms | 1.16 ms | 176% | 1.24 ms | $0.0024 – $0.014 |
| 640 | 1.10 ms | 4.18 ms | 3.09 ms | 281% | 3.11 ms | $0.0064 – $0.035 |
| 1280 | 1.71 ms | 8.66 ms | 7.00 ms | 409% | 7.38 ms | $0.015 – $0.083 |
| 2560 | 3.25 ms | 13.5 ms | 10.3 ms | 316% | 10.8 ms | $0.021 – $0.121 |
| 5120 | 6.34 ms | 24.8 ms | 18.0 ms | 283% | 21.0 ms | $0.037 – $0.236 |
| 10240 | 13.6 ms | 49.0 ms | 35.4 ms | 260% | 36.4 ms | $0.074 – $0.409 |

**How the total grows:** O(n) (linear), exponent 0.86 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder. Its measured growth rate is then compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report. Either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 187 µs | 28.5 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 2.11 ms | 292 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 87.3 µs | 18.9 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 125 µs | 30.4 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 85.3 µs | 18.3 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 128 µs | 30.3 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n log n) | ✅ matches | 50.0 µs | 7.77 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 202 µs | 252 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 497 µs | 64.6 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n) | ✅ matches | 5.18 ms | 1.02 s |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 149 µs | 19.8 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 222 µs | 70.7 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 184 µs | 19.6 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 195 µs | 21.4 ms |

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

**Measured: O(n)** (exponent 1.02, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 61.0 µs | 73.2 µs | 237 µs | 52.9 KiB | 16,404 |
| 40 | 98.7 µs | 104 µs | 298 µs | 104.3 KiB | 10,130 |
| 80 | 187 µs | 217 µs | 529 µs | 211.2 KiB | 5,354 |
| 160 | 344 µs | 369 µs | 844 µs | 435.9 KiB | 2,906 |
| 320 | 665 µs | 692 µs | 1.41 ms | 938.5 KiB | 1,503 |
| 640 | 1.35 ms | 1.45 ms | 2.93 ms | 2.1 MiB | 742 |
| 1280 | 4.96 ms | 5.22 ms | 6.59 ms | 4.7 MiB | 202 |
| 2560 | 7.30 ms | 8.04 ms | 9.06 ms | 8.0 MiB | 137 |
| 5120 | 12.6 ms | 14.4 ms | 14.5 ms | 14.5 MiB | 79 |
| 10240 | 28.5 ms | 30.4 ms | 32.2 ms | 27.6 MiB | 35 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.06, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 596 µs | 618 µs | 1.48 ms | 294.9 KiB | 1,678 |
| 40 | 1.19 ms | 1.23 ms | 3.07 ms | 587.1 KiB | 837 |
| 80 | 2.11 ms | 2.35 ms | 4.14 ms | 1.1 MiB | 474 |
| 160 | 3.96 ms | 4.45 ms | 6.37 ms | 2.3 MiB | 253 |
| 320 | 6.66 ms | 7.22 ms | 9.29 ms | 4.7 MiB | 150 |
| 640 | 15.3 ms | 18.2 ms | 19.7 ms | 9.8 MiB | 65 |
| 1280 | 33.6 ms | 35.4 ms | 41.4 ms | 20.1 MiB | 30 |
| 2560 | 64.1 ms | 65.3 ms | 78.4 ms | 38.7 MiB | 16 |
| 5120 | 147 ms | 149 ms | 233 ms | 73.5 MiB | 7 |
| 10240 | 292 ms | 298 ms | 475 ms | 145.1 MiB | 3 |

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

**Measured: O(n)** (exponent 1.07, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 32.6 µs | 40.0 µs | 34.3 µs | 48.1 KiB | 30,650 |
| 40 | 47.0 µs | 61.8 µs | 171 µs | 92.4 KiB | 21,292 |
| 80 | 87.3 µs | 93.4 µs | 277 µs | 188.3 KiB | 11,458 |
| 160 | 169 µs | 199 µs | 521 µs | 390.6 KiB | 5,907 |
| 320 | 388 µs | 442 µs | 1.22 ms | 855.2 KiB | 2,579 |
| 640 | 729 µs | 893 µs | 1.83 ms | 1.9 MiB | 1,372 |
| 1280 | 3.77 ms | 4.73 ms | 6.15 ms | 4.4 MiB | 265 |
| 2560 | 5.75 ms | 5.89 ms | 8.59 ms | 7.3 MiB | 174 |
| 5120 | 9.15 ms | 10.9 ms | 12.9 ms | 13.2 MiB | 109 |
| 10240 | 18.9 ms | 20.3 ms | 27.4 ms | 24.4 MiB | 53 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.04, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 32.5 µs | 39.3 µs | 37.5 µs | 54.1 KiB | 30,737 |
| 40 | 59.7 µs | 69.7 µs | 214 µs | 106.9 KiB | 16,745 |
| 80 | 125 µs | 138 µs | 422 µs | 217.2 KiB | 8,001 |
| 160 | 278 µs | 307 µs | 983 µs | 451.7 KiB | 3,603 |
| 320 | 551 µs | 600 µs | 1.81 ms | 970.6 KiB | 1,816 |
| 640 | 1.43 ms | 1.63 ms | 5.37 ms | 2.2 MiB | 700 |
| 1280 | 5.04 ms | 5.77 ms | 11.2 ms | 4.9 MiB | 198 |
| 2560 | 8.41 ms | 10.8 ms | 19.9 ms | 8.3 MiB | 119 |
| 5120 | 15.1 ms | 15.9 ms | 34.9 ms | 15.1 MiB | 66 |
| 10240 | 30.4 ms | 32.3 ms | 73.8 ms | 28.0 MiB | 33 |

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

**Measured: O(n)** (exponent 1.01, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 27.4 µs | 32.0 µs | 29.1 µs | 46.9 KiB | 36,531 |
| 40 | 47.3 µs | 52.9 µs | 163 µs | 92.5 KiB | 21,120 |
| 80 | 85.3 µs | 96.3 µs | 260 µs | 188.2 KiB | 11,726 |
| 160 | 170 µs | 190 µs | 517 µs | 393.2 KiB | 5,894 |
| 320 | 334 µs | 424 µs | 877 µs | 853.8 KiB | 2,997 |
| 640 | 835 µs | 907 µs | 2.05 ms | 1.9 MiB | 1,197 |
| 1280 | 3.84 ms | 4.26 ms | 6.20 ms | 4.4 MiB | 260 |
| 2560 | 5.52 ms | 6.71 ms | 8.64 ms | 7.3 MiB | 181 |
| 5120 | 8.58 ms | 9.73 ms | 12.2 ms | 13.2 MiB | 117 |
| 10240 | 18.3 ms | 18.9 ms | 26.3 ms | 24.4 MiB | 55 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.08, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 33.2 µs | 39.1 µs | 35.5 µs | 54.2 KiB | 30,153 |
| 40 | 62.1 µs | 70.5 µs | 221 µs | 106.9 KiB | 16,108 |
| 80 | 128 µs | 142 µs | 429 µs | 217.2 KiB | 7,818 |
| 160 | 286 µs | 314 µs | 972 µs | 451.7 KiB | 3,502 |
| 320 | 579 µs | 631 µs | 1.95 ms | 970.3 KiB | 1,728 |
| 640 | 1.30 ms | 1.39 ms | 4.80 ms | 2.2 MiB | 771 |
| 1280 | 4.91 ms | 5.21 ms | 11.2 ms | 4.9 MiB | 204 |
| 2560 | 7.90 ms | 8.43 ms | 18.8 ms | 8.3 MiB | 127 |
| 5120 | 16.1 ms | 16.5 ms | 38.6 ms | 15.1 MiB | 62 |
| 10240 | 30.3 ms | 31.0 ms | 72.7 ms | 28.0 MiB | 33 |

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

**Measured: O(n log n)** (exponent 1.32, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 18.9 µs | 29.8 µs | 20.7 µs | 30.4 KiB | 53,010 |
| 40 | 27.5 µs | 41.1 µs | 88.5 µs | 55.1 KiB | 36,345 |
| 80 | 50.0 µs | 65.0 µs | 163 µs | 104.4 KiB | 19,993 |
| 160 | 101 µs | 110 µs | 356 µs | 204.7 KiB | 9,926 |
| 320 | 187 µs | 264 µs | 604 µs | 401.5 KiB | 5,354 |
| 640 | 177 µs | 192 µs | 533 µs | 611.5 KiB | 5,661 |
| 1280 | 757 µs | 822 µs | 1.79 ms | 1.3 MiB | 1,321 |
| 2560 | 1.67 ms | 1.84 ms | 4.25 ms | 2.7 MiB | 599 |
| 5120 | 3.60 ms | 3.87 ms | 7.34 ms | 5.5 MiB | 278 |
| 10240 | 7.77 ms | 8.10 ms | 14.7 ms | 10.8 MiB | 129 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent -0.01, 10 sizes): ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 207 µs | 228 µs | 661 µs | 615.8 KiB | 4,837 |
| 40 | 192 µs | 212 µs | 639 µs | 617.6 KiB | 5,214 |
| 80 | 202 µs | 230 µs | 655 µs | 623.8 KiB | 4,952 |
| 160 | 209 µs | 232 µs | 649 µs | 662.5 KiB | 4,793 |
| 320 | 220 µs | 242 µs | 664 µs | 722.4 KiB | 4,535 |
| 640 | 269 µs | 293 µs | 852 µs | 828.1 KiB | 3,720 |
| 1280 | 252 µs | 265 µs | 698 µs | 825.5 KiB | 3,974 |
| 2560 | 248 µs | 273 µs | 698 µs | 825.5 KiB | 4,034 |
| 5120 | 274 µs | 293 µs | 874 µs | 828.1 KiB | 3,651 |
| 10240 | 252 µs | 283 µs | 704 µs | 825.5 KiB | 3,961 |

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

**Measured: O(n)** (exponent 1.07, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 131 µs | 141 µs | 445 µs | 45.5 KiB | 7,617 |
| 40 | 224 µs | 235 µs | 623 µs | 109.0 KiB | 4,461 |
| 80 | 497 µs | 550 µs | 1.31 ms | 178.6 KiB | 2,013 |
| 160 | 864 µs | 918 µs | 1.77 ms | 355.8 KiB | 1,158 |
| 320 | 1.75 ms | 1.86 ms | 3.67 ms | 712.3 KiB | 572 |
| 640 | 3.27 ms | 3.41 ms | 5.31 ms | 1.4 MiB | 306 |
| 1280 | 6.65 ms | 6.82 ms | 8.82 ms | 2.8 MiB | 150 |
| 2560 | 13.5 ms | 13.9 ms | 16.1 ms | 5.7 MiB | 74 |
| 5120 | 29.0 ms | 31.0 ms | 32.5 ms | 11.3 MiB | 35 |
| 10240 | 64.6 ms | 64.8 ms | 69.2 ms | 22.7 MiB | 15 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.05, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.50 ms | 1.70 ms | 3.24 ms | 599.8 KiB | 666 |
| 40 | 2.75 ms | 2.82 ms | 4.71 ms | 1.2 MiB | 364 |
| 80 | 5.18 ms | 5.31 ms | 7.31 ms | 2.3 MiB | 193 |
| 160 | 11.1 ms | 20.4 ms | 13.3 ms | 4.6 MiB | 90 |
| 320 | 23.8 ms | 24.3 ms | 27.4 ms | 9.3 MiB | 42 |
| 640 | 56.1 ms | 57.2 ms | 59.7 ms | 18.5 MiB | 18 |
| 1280 | 109 ms | 112 ms | 115 ms | 37.0 MiB | 9 |
| 2560 | 225 ms | 230 ms | 228 ms | 73.9 MiB | 4 |
| 5120 | 468 ms | 502 ms | 483 ms | 147.7 MiB | 2 |
| 10240 | 1.02 s | 1.07 s | 1.06 s | 295.3 MiB | 1 |

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

**Measured: O(n)** (exponent 1.05, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 61.2 µs | 90.0 µs | 115 µs | 98.0 KiB | 16,346 |
| 40 | 91.0 µs | 108 µs | 267 µs | 178.9 KiB | 10,984 |
| 80 | 149 µs | 172 µs | 438 µs | 322.2 KiB | 6,699 |
| 160 | 285 µs | 316 µs | 780 µs | 637.7 KiB | 3,506 |
| 320 | 552 µs | 605 µs | 1.32 ms | 1.2 MiB | 1,813 |
| 640 | 1.09 ms | 1.23 ms | 2.66 ms | 2.5 MiB | 918 |
| 1280 | 2.11 ms | 2.29 ms | 3.74 ms | 4.9 MiB | 475 |
| 2560 | 4.27 ms | 4.48 ms | 6.17 ms | 9.9 MiB | 234 |
| 5120 | 9.37 ms | 9.50 ms | 11.8 ms | 19.8 MiB | 107 |
| 10240 | 19.8 ms | 20.8 ms | 24.0 ms | 39.6 MiB | 50 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.29, 10 sizes): 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 62.5 µs | 74.9 µs | 229 µs | 281.2 KiB | 15,994 |
| 40 | 107 µs | 124 µs | 316 µs | 538.9 KiB | 9,315 |
| 80 | 222 µs | 242 µs | 590 µs | 1.0 MiB | 4,513 |
| 160 | 479 µs | 515 µs | 1.26 ms | 2.1 MiB | 2,086 |
| 320 | 1.08 ms | 1.13 ms | 2.69 ms | 4.2 MiB | 929 |
| 640 | 2.07 ms | 2.14 ms | 3.85 ms | 8.3 MiB | 484 |
| 1280 | 4.06 ms | 4.22 ms | 6.17 ms | 16.7 MiB | 246 |
| 2560 | 8.24 ms | 8.79 ms | 11.2 ms | 33.3 MiB | 121 |
| 5120 | 27.0 ms | 28.5 ms | 32.2 ms | 52.0 MiB | 37 |
| 10240 | 70.7 ms | 84.1 ms | 85.0 ms | 103.7 MiB | 14 |

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

**Measured: O(n)** (exponent 1.05, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 64.0 µs | 82.4 µs | 67.0 µs | 57.3 KiB | 15,614 |
| 40 | 102 µs | 143 µs | 106 µs | 113.3 KiB | 9,797 |
| 80 | 184 µs | 216 µs | 187 µs | 225.5 KiB | 5,443 |
| 160 | 349 µs | 382 µs | 353 µs | 450.0 KiB | 2,868 |
| 320 | 623 µs | 687 µs | 2.10 ms | 898.7 KiB | 1,606 |
| 640 | 1.10 ms | 1.18 ms | 2.55 ms | 1.8 MiB | 913 |
| 1280 | 2.06 ms | 2.15 ms | 3.13 ms | 3.5 MiB | 485 |
| 2560 | 4.46 ms | 4.68 ms | 4.81 ms | 6.9 MiB | 224 |
| 5120 | 9.45 ms | 9.71 ms | 9.60 ms | 13.8 MiB | 106 |
| 10240 | 19.6 ms | 20.3 ms | 20.4 ms | 27.7 MiB | 51 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.01, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 60.5 µs | 76.2 µs | 64.0 µs | 56.4 KiB | 16,527 |
| 40 | 103 µs | 122 µs | 107 µs | 111.7 KiB | 9,663 |
| 80 | 195 µs | 219 µs | 199 µs | 222.3 KiB | 5,127 |
| 160 | 399 µs | 429 µs | 1.36 ms | 443.6 KiB | 2,508 |
| 320 | 671 µs | 760 µs | 1.96 ms | 886.1 KiB | 1,490 |
| 640 | 1.29 ms | 1.34 ms | 2.99 ms | 1.7 MiB | 775 |
| 1280 | 2.51 ms | 2.54 ms | 4.73 ms | 3.5 MiB | 399 |
| 2560 | 4.88 ms | 4.98 ms | 7.07 ms | 6.9 MiB | 205 |
| 5120 | 10.1 ms | 10.2 ms | 14.0 ms | 13.8 MiB | 99 |
| 10240 | 21.4 ms | 21.9 ms | 28.2 ms | 27.7 MiB | 47 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls. So where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time). Every moment of the operation then belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly. They are not measured against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 523 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 187 µs | 187 µs | 36% |
| `run-policies` | 1 | 87.3 µs | 87.3 µs | 17% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 249 µs | 48% |

**At 10240 checks** (whole operation: 49.0 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 28.5 ms | 28.5 ms | 58% |
| `run-policies` | 1 | 18.9 ms | 18.9 ms | 39% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 1.54 ms | 3.1% |

## Cost model

Estimates use two bracketing price shapes. **Low** is CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time). **High** is duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-16T07:17:57.177Z` → `2026-11-16T07:19:12.623Z` (75 s), ci: CI (run 43821281531)
- Machine: Intel(R) Xeon(R) 6973P-C, 4 logical core(s) (2 physical), 15982 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `9ed6892d1b5d84763183988768b29c47b99889cc` on `chore/bump-internal-package-contract-v0.20.0`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks: One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They show how _this_ package's cost changes between runs on comparable hardware, and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

