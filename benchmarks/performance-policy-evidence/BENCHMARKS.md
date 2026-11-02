# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **161 µs** per operation compared with a bare-minimum baseline (**142% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.04). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 161 µs | 32.8 ms |
| Added latency, relative to baseline | 142% | 246% |
| Added CPU time per operation | 385 µs | 36.6 ms |
| Added memory per operation (heap delta) | 345.3 KiB | 44.7 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 6,209 ops/s | 31 ops/s |

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
| 20 | 32.6 µs | 98.1 µs | 65.4 µs | 200% | 271 µs | $0.00014 – $0.003 |
| 40 | 58.7 µs | 155 µs | 96.3 µs | 164% | 282 µs | $0.0002 – $0.0032 |
| 80 | 114 µs | 275 µs | 161 µs | 142% | 385 µs | $0.00034 – $0.0043 |
| 160 | 228 µs | 514 µs | 286 µs | 126% | 579 µs | $0.0006 – $0.0065 |
| 320 | 457 µs | 1.04 ms | 587 µs | 128% | 1.08 ms | $0.0012 – $0.012 |
| 640 | 845 µs | 2.08 ms | 1.24 ms | 146% | 2.15 ms | $0.0026 – $0.024 |
| 1280 | 1.72 ms | 8.50 ms | 6.79 ms | 395% | 7.29 ms | $0.014 – $0.082 |
| 2560 | 3.25 ms | 13.0 ms | 9.72 ms | 299% | 10.5 ms | $0.020 – $0.118 |
| 5120 | 6.47 ms | 23.8 ms | 17.3 ms | 268% | 20.9 ms | $0.036 – $0.235 |
| 10240 | 13.3 ms | 46.1 ms | 32.8 ms | 246% | 36.6 ms | $0.068 – $0.411 |

**How the total grows:** O(n) (linear), exponent 1.04 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 181 µs | 22.9 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 1.69 ms | 252 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 62.7 µs | 18.7 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 92.1 µs | 27.1 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 72.4 µs | 17.3 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 91.2 µs | 26.8 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n log n) | ✅ matches | 38.8 µs | 6.31 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 152 µs | 208 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 428 µs | 55.9 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 4.08 ms | 878 ms |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 139 µs | 21.2 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 194 µs | 46.7 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 195 µs | 18.6 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 194 µs | 17.7 ms |

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
| 20 | 55.3 µs | 58.2 µs | 194 µs | 52.8 KiB | 18,074 |
| 40 | 93.9 µs | 99.3 µs | 255 µs | 104.3 KiB | 10,650 |
| 80 | 181 µs | 205 µs | 467 µs | 211.2 KiB | 5,529 |
| 160 | 349 µs | 392 µs | 769 µs | 436.0 KiB | 2,868 |
| 320 | 719 µs | 793 µs | 1.51 ms | 938.5 KiB | 1,391 |
| 640 | 1.37 ms | 1.51 ms | 2.72 ms | 2.1 MiB | 731 |
| 1280 | 4.48 ms | 4.87 ms | 6.16 ms | 4.7 MiB | 223 |
| 2560 | 6.93 ms | 8.69 ms | 9.06 ms | 8.0 MiB | 144 |
| 5120 | 13.2 ms | 19.7 ms | 16.3 ms | 14.5 MiB | 76 |
| 10240 | 22.9 ms | 23.7 ms | 26.7 ms | 27.6 MiB | 44 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.08, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 470 µs | 487 µs | 1.01 ms | 294.9 KiB | 2,130 |
| 40 | 841 µs | 861 µs | 1.39 ms | 585.9 KiB | 1,189 |
| 80 | 1.69 ms | 2.16 ms | 2.87 ms | 1.1 MiB | 591 |
| 160 | 3.24 ms | 3.39 ms | 4.62 ms | 2.3 MiB | 308 |
| 320 | 6.41 ms | 6.59 ms | 8.19 ms | 4.7 MiB | 156 |
| 640 | 12.8 ms | 13.3 ms | 15.4 ms | 9.8 MiB | 78 |
| 1280 | 27.8 ms | 31.0 ms | 32.5 ms | 20.1 MiB | 36 |
| 2560 | 53.5 ms | 58.4 ms | 62.7 ms | 38.7 MiB | 19 |
| 5120 | 126 ms | 128 ms | 196 ms | 73.5 MiB | 8 |
| 10240 | 252 ms | 253 ms | 393 ms | 145.2 MiB | 4 |

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

**Measured: O(n log n)** (exponent 1.15, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 28.5 µs | 41.3 µs | 29.3 µs | 47.2 KiB | 35,146 |
| 40 | 35.6 µs | 47.2 µs | 101 µs | 92.4 KiB | 28,098 |
| 80 | 62.7 µs | 89.5 µs | 153 µs | 186.7 KiB | 15,961 |
| 160 | 137 µs | 194 µs | 386 µs | 393.0 KiB | 7,278 |
| 320 | 278 µs | 365 µs | 715 µs | 852.8 KiB | 3,593 |
| 640 | 582 µs | 775 µs | 1.30 ms | 1.9 MiB | 1,719 |
| 1280 | 3.11 ms | 3.52 ms | 5.16 ms | 4.4 MiB | 322 |
| 2560 | 4.60 ms | 4.88 ms | 7.23 ms | 7.3 MiB | 217 |
| 5120 | 8.94 ms | 10.3 ms | 12.8 ms | 13.2 MiB | 112 |
| 10240 | 18.7 ms | 19.7 ms | 25.8 ms | 24.5 MiB | 54 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.08, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 29.1 µs | 33.3 µs | 29.5 µs | 54.1 KiB | 34,354 |
| 40 | 45.8 µs | 58.5 µs | 142 µs | 106.8 KiB | 21,827 |
| 80 | 92.1 µs | 120 µs | 266 µs | 217.1 KiB | 10,859 |
| 160 | 194 µs | 249 µs | 595 µs | 451.1 KiB | 5,154 |
| 320 | 429 µs | 543 µs | 1.31 ms | 970.6 KiB | 2,333 |
| 640 | 1.06 ms | 1.25 ms | 3.57 ms | 2.2 MiB | 942 |
| 1280 | 5.03 ms | 5.43 ms | 10.2 ms | 4.9 MiB | 199 |
| 2560 | 7.07 ms | 7.69 ms | 14.2 ms | 8.3 MiB | 141 |
| 5120 | 13.3 ms | 14.7 ms | 26.9 ms | 15.1 MiB | 75 |
| 10240 | 27.1 ms | 28.5 ms | 52.6 ms | 28.2 MiB | 37 |

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

**Measured: O(n log n)** (exponent 1.12, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 26.0 µs | 32.0 µs | 26.6 µs | 47.0 KiB | 38,472 |
| 40 | 39.0 µs | 49.3 µs | 121 µs | 92.5 KiB | 25,647 |
| 80 | 72.4 µs | 100 µs | 212 µs | 188.2 KiB | 13,805 |
| 160 | 143 µs | 199 µs | 384 µs | 393.2 KiB | 7,001 |
| 320 | 289 µs | 395 µs | 784 µs | 853.8 KiB | 3,459 |
| 640 | 588 µs | 772 µs | 1.35 ms | 1.9 MiB | 1,702 |
| 1280 | 3.20 ms | 3.96 ms | 5.50 ms | 4.4 MiB | 312 |
| 2560 | 4.84 ms | 5.18 ms | 7.70 ms | 7.3 MiB | 206 |
| 5120 | 8.64 ms | 9.16 ms | 12.9 ms | 13.2 MiB | 116 |
| 10240 | 17.3 ms | 18.1 ms | 24.1 ms | 24.5 MiB | 58 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.07, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 28.6 µs | 31.2 µs | 30.3 µs | 54.2 KiB | 35,010 |
| 40 | 45.1 µs | 57.9 µs | 133 µs | 106.9 KiB | 22,151 |
| 80 | 91.2 µs | 119 µs | 250 µs | 217.0 KiB | 10,962 |
| 160 | 191 µs | 278 µs | 562 µs | 451.1 KiB | 5,237 |
| 320 | 436 µs | 522 µs | 1.28 ms | 970.6 KiB | 2,292 |
| 640 | 1.10 ms | 1.87 ms | 3.59 ms | 2.2 MiB | 907 |
| 1280 | 4.69 ms | 5.22 ms | 9.74 ms | 4.9 MiB | 213 |
| 2560 | 7.06 ms | 7.36 ms | 14.6 ms | 8.3 MiB | 142 |
| 5120 | 13.6 ms | 14.7 ms | 27.1 ms | 15.1 MiB | 73 |
| 10240 | 26.8 ms | 27.9 ms | 51.9 ms | 28.2 MiB | 37 |

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
| 20 | 16.7 µs | 25.8 µs | 17.0 µs | 30.5 KiB | 59,718 |
| 40 | 20.6 µs | 36.8 µs | 61.8 µs | 55.1 KiB | 48,658 |
| 80 | 38.8 µs | 54.2 µs | 116 µs | 104.6 KiB | 25,756 |
| 160 | 69.2 µs | 84.4 µs | 186 µs | 206.6 KiB | 14,456 |
| 320 | 98.0 µs | 165 µs | 305 µs | 298.7 KiB | 10,204 |
| 640 | 148 µs | 165 µs | 397 µs | 612.2 KiB | 6,744 |
| 1280 | 617 µs | 673 µs | 1.32 ms | 1.3 MiB | 1,620 |
| 2560 | 1.46 ms | 1.53 ms | 3.30 ms | 2.7 MiB | 687 |
| 5120 | 2.99 ms | 3.05 ms | 5.84 ms | 5.5 MiB | 335 |
| 10240 | 6.31 ms | 6.47 ms | 11.6 ms | 10.8 MiB | 158 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent 0.01, 10 sizes) -- ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 144 µs | 157 µs | 349 µs | 612.9 KiB | 6,949 |
| 40 | 151 µs | 170 µs | 395 µs | 628.1 KiB | 6,618 |
| 80 | 152 µs | 173 µs | 395 µs | 628.3 KiB | 6,564 |
| 160 | 162 µs | 171 µs | 410 µs | 661.3 KiB | 6,174 |
| 320 | 181 µs | 204 µs | 490 µs | 722.7 KiB | 5,510 |
| 640 | 202 µs | 225 µs | 500 µs | 826.6 KiB | 4,950 |
| 1280 | 208 µs | 239 µs | 516 µs | 826.6 KiB | 4,817 |
| 2560 | 208 µs | 237 µs | 515 µs | 826.6 KiB | 4,816 |
| 5120 | 209 µs | 238 µs | 518 µs | 826.6 KiB | 4,776 |
| 10240 | 208 µs | 234 µs | 509 µs | 826.6 KiB | 4,805 |

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
| 20 | 106 µs | 115 µs | 318 µs | 45.5 KiB | 9,461 |
| 40 | 181 µs | 192 µs | 457 µs | 109.0 KiB | 5,532 |
| 80 | 428 µs | 450 µs | 997 µs | 178.6 KiB | 2,338 |
| 160 | 754 µs | 901 µs | 1.43 ms | 355.8 KiB | 1,327 |
| 320 | 1.49 ms | 1.63 ms | 2.90 ms | 712.3 KiB | 670 |
| 640 | 2.75 ms | 2.93 ms | 4.32 ms | 1.4 MiB | 363 |
| 1280 | 5.50 ms | 5.75 ms | 7.21 ms | 2.8 MiB | 182 |
| 2560 | 10.9 ms | 11.3 ms | 11.9 ms | 5.7 MiB | 91 |
| 5120 | 21.9 ms | 22.8 ms | 22.3 ms | 11.3 MiB | 46 |
| 10240 | 55.9 ms | 56.2 ms | 56.4 ms | 22.7 MiB | 18 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.12, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.27 ms | 1.46 ms | 2.72 ms | 599.8 KiB | 790 |
| 40 | 2.16 ms | 2.31 ms | 3.57 ms | 1.2 MiB | 462 |
| 80 | 4.08 ms | 4.33 ms | 5.77 ms | 2.3 MiB | 245 |
| 160 | 7.86 ms | 7.99 ms | 8.90 ms | 4.6 MiB | 127 |
| 320 | 15.7 ms | 17.0 ms | 16.2 ms | 9.3 MiB | 64 |
| 640 | 38.3 ms | 38.5 ms | 38.9 ms | 18.5 MiB | 26 |
| 1280 | 94.9 ms | 97.8 ms | 95.5 ms | 37.0 MiB | 11 |
| 2560 | 205 ms | 205 ms | 205 ms | 73.9 MiB | 5 |
| 5120 | 431 ms | 451 ms | 445 ms | 147.7 MiB | 2 |
| 10240 | 878 ms | 901 ms | 904 ms | 295.3 MiB | 1 |

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

**Measured: O(n)** (exponent 1.09, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 63.0 µs | 95.6 µs | 65.0 µs | 97.9 KiB | 15,864 |
| 40 | 80.7 µs | 113 µs | 209 µs | 178.9 KiB | 12,398 |
| 80 | 139 µs | 165 µs | 341 µs | 322.2 KiB | 7,211 |
| 160 | 269 µs | 291 µs | 616 µs | 637.6 KiB | 3,722 |
| 320 | 515 µs | 574 µs | 1.04 ms | 1.2 MiB | 1,940 |
| 640 | 1.04 ms | 1.12 ms | 2.09 ms | 2.5 MiB | 964 |
| 1280 | 1.95 ms | 2.10 ms | 2.96 ms | 4.9 MiB | 512 |
| 2560 | 4.10 ms | 4.23 ms | 5.54 ms | 9.9 MiB | 244 |
| 5120 | 9.08 ms | 9.38 ms | 11.4 ms | 19.8 MiB | 110 |
| 10240 | 21.2 ms | 21.6 ms | 25.9 ms | 39.6 MiB | 47 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.21, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 53.2 µs | 63.7 µs | 183 µs | 281.1 KiB | 18,785 |
| 40 | 98.0 µs | 106 µs | 231 µs | 538.7 KiB | 10,208 |
| 80 | 194 µs | 214 µs | 462 µs | 1.0 MiB | 5,161 |
| 160 | 403 µs | 430 µs | 941 µs | 2.1 MiB | 2,483 |
| 320 | 774 µs | 907 µs | 1.34 ms | 4.2 MiB | 1,292 |
| 640 | 1.66 ms | 1.76 ms | 2.84 ms | 8.3 MiB | 604 |
| 1280 | 3.48 ms | 3.69 ms | 4.91 ms | 16.7 MiB | 287 |
| 2560 | 7.10 ms | 8.65 ms | 9.36 ms | 33.3 MiB | 141 |
| 5120 | 19.3 ms | 21.4 ms | 22.8 ms | 52.0 MiB | 52 |
| 10240 | 46.7 ms | 49.4 ms | 55.5 ms | 103.7 MiB | 21 |

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
| 20 | 59.8 µs | 86.8 µs | 62.0 µs | 57.3 KiB | 16,725 |
| 40 | 103 µs | 117 µs | 106 µs | 113.3 KiB | 9,691 |
| 80 | 195 µs | 209 µs | 198 µs | 225.5 KiB | 5,133 |
| 160 | 352 µs | 376 µs | 1.37 ms | 450.0 KiB | 2,842 |
| 320 | 576 µs | 755 µs | 1.52 ms | 898.7 KiB | 1,737 |
| 640 | 1.06 ms | 1.18 ms | 2.13 ms | 1.8 MiB | 940 |
| 1280 | 2.05 ms | 2.14 ms | 2.81 ms | 3.5 MiB | 487 |
| 2560 | 4.07 ms | 4.22 ms | 4.28 ms | 6.9 MiB | 246 |
| 5120 | 8.45 ms | 8.59 ms | 8.60 ms | 13.8 MiB | 118 |
| 10240 | 18.6 ms | 21.4 ms | 19.0 ms | 27.7 MiB | 54 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.02, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 54.9 µs | 70.0 µs | 58.0 µs | 56.4 KiB | 18,221 |
| 40 | 102 µs | 114 µs | 105 µs | 111.7 KiB | 9,848 |
| 80 | 194 µs | 210 µs | 198 µs | 222.3 KiB | 5,152 |
| 160 | 350 µs | 635 µs | 1.38 ms | 443.6 KiB | 2,855 |
| 320 | 595 µs | 638 µs | 1.69 ms | 886.1 KiB | 1,681 |
| 640 | 1.07 ms | 1.10 ms | 2.28 ms | 1.7 MiB | 936 |
| 1280 | 1.99 ms | 2.06 ms | 3.62 ms | 3.5 MiB | 502 |
| 2560 | 3.88 ms | 4.03 ms | 5.17 ms | 6.9 MiB | 258 |
| 5120 | 8.26 ms | 8.57 ms | 11.1 ms | 13.8 MiB | 121 |
| 10240 | 17.7 ms | 17.8 ms | 22.0 ms | 27.7 MiB | 56 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 275 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 181 µs | 181 µs | 66% |
| `run-policies` | 1 | 62.7 µs | 62.7 µs | 23% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 31.1 µs | 11% |

**At 10240 checks** (whole operation: 46.1 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 22.9 ms | 22.9 ms | 50% |
| `run-policies` | 1 | 18.7 ms | 18.7 ms | 40% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 4.54 ms | 9.8% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-02T13:18:14.039Z` → `2026-11-02T13:19:21.284Z` (67 s), ci: CI (run 41449961951)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15984 MB RAM, linux/x64, Node v24.22.1, GitHub Actions
- Git: `362be6b4a56d04cba3dc736c412a9bf56bcb6ee3` on `feat/affected-scope`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

