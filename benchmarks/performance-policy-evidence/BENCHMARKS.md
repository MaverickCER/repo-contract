# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend, and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **299 µs** per operation compared with a bare-minimum baseline (**143% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.84). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones. Both come from the same run, so they depend far less on the machine than a time does. Runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below). They show scale, not a budget.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 299 µs | 38.5 ms |
| Added latency, relative to baseline | 143% | 231% |
| Added CPU time per operation | 1.54 ms | 46.6 ms |
| Added memory per operation (heap delta) | 354.1 KiB | 44.9 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,339 ops/s | 26 ops/s |

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
| 20 | 65.1 µs | 193 µs | 128 µs | 197% | 133 µs | $0.00027 – $0.0015 |
| 40 | 111 µs | 319 µs | 210 µs | 190% | 574 µs | $0.00044 – $0.0065 |
| 80 | 209 µs | 507 µs | 299 µs | 143% | 1.54 ms | $0.00062 – $0.017 |
| 160 | 403 µs | 893 µs | 490 µs | 121% | 498 µs | $0.001 – $0.0056 |
| 320 | 651 µs | 1.89 ms | 1.24 ms | 190% | 1.25 ms | $0.0026 – $0.014 |
| 640 | 1.18 ms | 4.70 ms | 3.51 ms | 298% | 3.81 ms | $0.0073 – $0.043 |
| 1280 | 2.20 ms | 10.6 ms | 8.42 ms | 382% | 8.62 ms | $0.018 – $0.097 |
| 2560 | 4.34 ms | 16.7 ms | 12.4 ms | 285% | 12.9 ms | $0.026 – $0.145 |
| 5120 | 8.49 ms | 26.7 ms | 18.3 ms | 215% | 19.1 ms | $0.038 – $0.215 |
| 10240 | 16.7 ms | 55.2 ms | 38.5 ms | 231% | 46.6 ms | $0.080 – $0.524 |

**How the total grows:** O(n) (linear), exponent 0.84 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder. Its measured growth rate is then compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report. Either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 224 µs | 32.3 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 2.26 ms | 314 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 100 µs | 22.9 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 140 µs | 34.0 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 119 µs | 22.7 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 138 µs | 32.8 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n log n) | ✅ matches | 54.4 µs | 8.01 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 214 µs | 296 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 579 µs | 75.3 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 5.91 ms | 1.14 s |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 196 µs | 25.6 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 281 µs | 65.9 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 267 µs | 22.7 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 261 µs | 24.1 ms |

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

**Measured: O(n)** (exponent 0.99, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 63.9 µs | 69.6 µs | 189 µs | 52.8 KiB | 15,646 |
| 40 | 126 µs | 151 µs | 374 µs | 104.5 KiB | 7,923 |
| 80 | 224 µs | 247 µs | 536 µs | 211.2 KiB | 4,468 |
| 160 | 455 µs | 479 µs | 1.09 ms | 436.3 KiB | 2,199 |
| 320 | 829 µs | 867 µs | 1.50 ms | 938.5 KiB | 1,206 |
| 640 | 1.73 ms | 1.81 ms | 3.17 ms | 2.1 MiB | 579 |
| 1280 | 6.22 ms | 7.06 ms | 8.02 ms | 4.7 MiB | 161 |
| 2560 | 9.46 ms | 10.0 ms | 11.7 ms | 8.0 MiB | 106 |
| 5120 | 16.9 ms | 18.6 ms | 19.7 ms | 14.5 MiB | 59 |
| 10240 | 32.3 ms | 32.8 ms | 36.0 ms | 27.5 MiB | 31 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.06, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 606 µs | 622 µs | 1.28 ms | 294.9 KiB | 1,651 |
| 40 | 1.21 ms | 1.32 ms | 2.59 ms | 587.1 KiB | 826 |
| 80 | 2.26 ms | 2.80 ms | 3.81 ms | 1.1 MiB | 442 |
| 160 | 4.34 ms | 4.42 ms | 6.21 ms | 2.3 MiB | 231 |
| 320 | 8.40 ms | 8.47 ms | 10.6 ms | 4.7 MiB | 119 |
| 640 | 16.7 ms | 17.1 ms | 19.9 ms | 9.8 MiB | 60 |
| 1280 | 36.0 ms | 37.1 ms | 41.4 ms | 20.1 MiB | 28 |
| 2560 | 69.4 ms | 75.9 ms | 78.7 ms | 38.7 MiB | 14 |
| 5120 | 160 ms | 164 ms | 242 ms | 73.5 MiB | 6 |
| 10240 | 314 ms | 326 ms | 478 ms | 145.1 MiB | 3 |

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

**Measured: O(n)** (exponent 1.04, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 39.2 µs | 44.0 µs | 40.4 µs | 48.1 KiB | 25,505 |
| 40 | 54.0 µs | 74.4 µs | 166 µs | 92.5 KiB | 18,515 |
| 80 | 100 µs | 133 µs | 286 µs | 188.3 KiB | 9,988 |
| 160 | 201 µs | 278 µs | 585 µs | 393.3 KiB | 4,986 |
| 320 | 429 µs | 552 µs | 1.22 ms | 855.2 KiB | 2,331 |
| 640 | 972 µs | 1.29 ms | 2.50 ms | 1.9 MiB | 1,029 |
| 1280 | 4.71 ms | 5.26 ms | 6.84 ms | 4.4 MiB | 212 |
| 2560 | 6.84 ms | 7.50 ms | 9.71 ms | 7.3 MiB | 146 |
| 5120 | 11.2 ms | 12.7 ms | 15.1 ms | 13.2 MiB | 89 |
| 10240 | 22.9 ms | 24.6 ms | 30.2 ms | 24.3 MiB | 44 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.03, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 41.2 µs | 44.3 µs | 167 µs | 54.1 KiB | 24,246 |
| 40 | 67.0 µs | 83.5 µs | 216 µs | 106.9 KiB | 14,923 |
| 80 | 140 µs | 171 µs | 447 µs | 217.3 KiB | 7,154 |
| 160 | 306 µs | 372 µs | 931 µs | 451.7 KiB | 3,269 |
| 320 | 626 µs | 804 µs | 1.82 ms | 970.6 KiB | 1,597 |
| 640 | 1.62 ms | 1.98 ms | 4.81 ms | 2.2 MiB | 615 |
| 1280 | 6.15 ms | 6.49 ms | 11.4 ms | 4.9 MiB | 163 |
| 2560 | 9.37 ms | 10.5 ms | 17.7 ms | 8.3 MiB | 107 |
| 5120 | 17.3 ms | 26.1 ms | 33.1 ms | 15.0 MiB | 58 |
| 10240 | 34.0 ms | 35.0 ms | 62.6 ms | 28.0 MiB | 29 |

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

**Measured: O(n)** (exponent 1.00, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 35.2 µs | 39.1 µs | 110 µs | 46.9 KiB | 28,388 |
| 40 | 59.9 µs | 67.7 µs | 193 µs | 92.6 KiB | 16,692 |
| 80 | 119 µs | 139 µs | 358 µs | 188.4 KiB | 8,378 |
| 160 | 206 µs | 279 µs | 607 µs | 393.6 KiB | 4,855 |
| 320 | 451 µs | 597 µs | 1.26 ms | 856.1 KiB | 2,219 |
| 640 | 1.09 ms | 1.41 ms | 2.72 ms | 1.9 MiB | 920 |
| 1280 | 5.01 ms | 5.32 ms | 7.44 ms | 4.4 MiB | 200 |
| 2560 | 6.54 ms | 6.98 ms | 9.34 ms | 7.3 MiB | 153 |
| 5120 | 11.8 ms | 16.3 ms | 15.9 ms | 13.2 MiB | 85 |
| 10240 | 22.7 ms | 23.4 ms | 29.9 ms | 24.3 MiB | 44 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.01, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 40.6 µs | 44.5 µs | 167 µs | 54.2 KiB | 24,628 |
| 40 | 69.7 µs | 84.2 µs | 226 µs | 107.0 KiB | 14,354 |
| 80 | 138 µs | 169 µs | 436 µs | 217.3 KiB | 7,242 |
| 160 | 295 µs | 378 µs | 893 µs | 451.7 KiB | 3,385 |
| 320 | 641 µs | 773 µs | 1.85 ms | 967.2 KiB | 1,561 |
| 640 | 1.64 ms | 1.99 ms | 4.71 ms | 2.2 MiB | 608 |
| 1280 | 6.19 ms | 6.48 ms | 11.4 ms | 4.9 MiB | 162 |
| 2560 | 8.58 ms | 10.1 ms | 17.4 ms | 8.3 MiB | 117 |
| 5120 | 16.6 ms | 18.9 ms | 32.8 ms | 15.1 MiB | 60 |
| 10240 | 32.8 ms | 33.5 ms | 61.0 ms | 27.9 MiB | 31 |

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

**Measured: O(n log n)** (exponent 1.26, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 23.4 µs | 32.5 µs | 25.0 µs | 30.4 KiB | 42,721 |
| 40 | 30.4 µs | 38.4 µs | 94.2 µs | 55.1 KiB | 32,892 |
| 80 | 54.4 µs | 71.8 µs | 155 µs | 104.5 KiB | 18,384 |
| 160 | 105 µs | 178 µs | 300 µs | 204.7 KiB | 9,566 |
| 320 | 196 µs | 260 µs | 547 µs | 401.5 KiB | 5,114 |
| 640 | 203 µs | 221 µs | 578 µs | 614.5 KiB | 4,928 |
| 1280 | 979 µs | 1.03 ms | 2.67 ms | 1.3 MiB | 1,021 |
| 2560 | 1.90 ms | 2.02 ms | 4.13 ms | 2.7 MiB | 525 |
| 5120 | 3.97 ms | 4.40 ms | 7.35 ms | 5.5 MiB | 252 |
| 10240 | 8.01 ms | 8.36 ms | 14.3 ms | 10.8 MiB | 125 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent -0.00, 10 sizes): ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 207 µs | 240 µs | 591 µs | 615.8 KiB | 4,822 |
| 40 | 209 µs | 229 µs | 589 µs | 617.6 KiB | 4,786 |
| 80 | 214 µs | 232 µs | 599 µs | 623.8 KiB | 4,666 |
| 160 | 225 µs | 248 µs | 609 µs | 662.5 KiB | 4,452 |
| 320 | 257 µs | 305 µs | 755 µs | 715.9 KiB | 3,887 |
| 640 | 296 µs | 326 µs | 802 µs | 828.1 KiB | 3,374 |
| 1280 | 298 µs | 328 µs | 803 µs | 828.1 KiB | 3,359 |
| 2560 | 297 µs | 344 µs | 795 µs | 828.1 KiB | 3,367 |
| 5120 | 295 µs | 370 µs | 792 µs | 828.1 KiB | 3,395 |
| 10240 | 296 µs | 322 µs | 800 µs | 828.1 KiB | 3,375 |

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

**Measured: O(n)** (exponent 1.06, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 147 µs | 159 µs | 405 µs | 45.5 KiB | 6,814 |
| 40 | 272 µs | 285 µs | 713 µs | 115.7 KiB | 3,675 |
| 80 | 579 µs | 627 µs | 1.28 ms | 178.6 KiB | 1,726 |
| 160 | 1.13 ms | 1.17 ms | 2.53 ms | 357.3 KiB | 885 |
| 320 | 2.06 ms | 2.16 ms | 3.69 ms | 712.3 KiB | 486 |
| 640 | 3.86 ms | 4.00 ms | 5.68 ms | 1.4 MiB | 259 |
| 1280 | 7.97 ms | 8.28 ms | 10.3 ms | 2.8 MiB | 126 |
| 2560 | 15.9 ms | 16.1 ms | 18.1 ms | 5.7 MiB | 63 |
| 5120 | 31.6 ms | 39.6 ms | 32.1 ms | 11.3 MiB | 32 |
| 10240 | 75.3 ms | 76.0 ms | 75.8 ms | 22.7 MiB | 13 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.10, 10 sizes): 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.78 ms | 1.89 ms | 3.42 ms | 599.8 KiB | 561 |
| 40 | 3.20 ms | 3.32 ms | 4.92 ms | 1.2 MiB | 313 |
| 80 | 5.91 ms | 6.09 ms | 7.80 ms | 2.3 MiB | 169 |
| 160 | 11.4 ms | 12.3 ms | 13.6 ms | 4.6 MiB | 87 |
| 320 | 22.3 ms | 22.5 ms | 22.8 ms | 9.3 MiB | 45 |
| 640 | 53.0 ms | 53.8 ms | 53.4 ms | 18.5 MiB | 19 |
| 1280 | 126 ms | 135 ms | 126 ms | 37.0 MiB | 8 |
| 2560 | 273 ms | 283 ms | 273 ms | 73.9 MiB | 4 |
| 5120 | 562 ms | 607 ms | 577 ms | 147.7 MiB | 2 |
| 10240 | 1.14 s | 1.17 s | 1.17 s | 295.3 MiB | 1 |

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

**Measured: O(n)** (exponent 1.06, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 83.1 µs | 131 µs | 322 µs | 97.9 KiB | 12,040 |
| 40 | 112 µs | 141 µs | 286 µs | 178.9 KiB | 8,893 |
| 80 | 196 µs | 232 µs | 498 µs | 322.2 KiB | 5,112 |
| 160 | 361 µs | 385 µs | 775 µs | 637.7 KiB | 2,767 |
| 320 | 695 µs | 758 µs | 1.33 ms | 1.2 MiB | 1,439 |
| 640 | 1.37 ms | 1.48 ms | 2.65 ms | 2.5 MiB | 727 |
| 1280 | 2.69 ms | 2.85 ms | 4.01 ms | 4.9 MiB | 371 |
| 2560 | 5.51 ms | 5.75 ms | 7.27 ms | 9.9 MiB | 181 |
| 5120 | 11.7 ms | 14.9 ms | 14.2 ms | 19.8 MiB | 85 |
| 10240 | 25.6 ms | 26.7 ms | 30.2 ms | 39.6 MiB | 39 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.21, 10 sizes): 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 79.5 µs | 92.0 µs | 258 µs | 281.1 KiB | 12,585 |
| 40 | 142 µs | 158 µs | 391 µs | 539.5 KiB | 7,024 |
| 80 | 281 µs | 312 µs | 703 µs | 1.0 MiB | 3,558 |
| 160 | 564 µs | 607 µs | 1.21 ms | 2.1 MiB | 1,774 |
| 320 | 1.19 ms | 1.29 ms | 2.47 ms | 4.2 MiB | 838 |
| 640 | 2.37 ms | 2.47 ms | 3.86 ms | 8.3 MiB | 421 |
| 1280 | 4.76 ms | 4.86 ms | 6.57 ms | 16.7 MiB | 210 |
| 2560 | 9.90 ms | 12.4 ms | 12.6 ms | 33.3 MiB | 101 |
| 5120 | 27.3 ms | 28.6 ms | 31.2 ms | 52.0 MiB | 37 |
| 10240 | 65.9 ms | 68.7 ms | 75.1 ms | 103.7 MiB | 15 |

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

**Measured: O(n)** (exponent 0.99, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 82.8 µs | 112 µs | 87.0 µs | 57.3 KiB | 12,072 |
| 40 | 142 µs | 158 µs | 146 µs | 113.3 KiB | 7,050 |
| 80 | 267 µs | 284 µs | 273 µs | 225.5 KiB | 3,741 |
| 160 | 455 µs | 493 µs | 1.69 ms | 450.0 KiB | 2,198 |
| 320 | 777 µs | 931 µs | 2.05 ms | 898.7 KiB | 1,287 |
| 640 | 1.41 ms | 1.94 ms | 2.74 ms | 1.8 MiB | 711 |
| 1280 | 2.81 ms | 2.93 ms | 3.60 ms | 3.5 MiB | 356 |
| 2560 | 5.24 ms | 5.54 ms | 5.71 ms | 6.9 MiB | 191 |
| 5120 | 10.4 ms | 11.0 ms | 10.8 ms | 13.8 MiB | 96 |
| 10240 | 22.7 ms | 44.0 ms | 23.1 ms | 27.7 MiB | 44 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.03, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 76.5 µs | 112 µs | 80.0 µs | 56.4 KiB | 13,076 |
| 40 | 137 µs | 154 µs | 141 µs | 111.7 KiB | 7,321 |
| 80 | 261 µs | 281 µs | 266 µs | 222.3 KiB | 3,825 |
| 160 | 457 µs | 515 µs | 1.71 ms | 443.6 KiB | 2,188 |
| 320 | 765 µs | 821 µs | 2.07 ms | 886.1 KiB | 1,307 |
| 640 | 1.42 ms | 2.11 ms | 3.01 ms | 1.7 MiB | 706 |
| 1280 | 2.62 ms | 2.72 ms | 4.32 ms | 3.5 MiB | 382 |
| 2560 | 5.29 ms | 5.38 ms | 6.48 ms | 6.9 MiB | 189 |
| 5120 | 11.2 ms | 11.4 ms | 14.2 ms | 13.8 MiB | 89 |
| 10240 | 24.1 ms | 25.0 ms | 29.4 ms | 27.7 MiB | 41 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls. So where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time). Every moment of the operation then belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly. They are not measured against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 507 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 224 µs | 224 µs | 44% |
| `run-policies` | 1 | 100 µs | 100 µs | 20% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 183 µs | 36% |

**At 10240 checks** (whole operation: 55.2 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 32.3 ms | 32.3 ms | 58% |
| `run-policies` | 1 | 22.9 ms | 22.9 ms | 42% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 25.1 µs | 0.0% |

## Cost model

Estimates use two bracketing price shapes. **Low** is CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time). **High** is duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-16T09:42:36.570Z` → `2026-11-16T09:43:54.751Z` (78 s), ci: CI (run 43839938121)
- Machine: AMD EPYC 9V74 80-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `840150fd8089014ee1ec83fa7c90c569c347f2d9` on `dependabot/npm_and_yarn/dev-dependencies-5419b902d4`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks: One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They show how _this_ package's cost changes between runs on comparable hardware, and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

