# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend, and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **394 µs** per operation compared with a bare-minimum baseline (**132% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.85). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones. Both come from the same run, so they depend far less on the machine than a time does. Runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below). They show scale, not a budget.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 394 µs | 45.6 ms |
| Added latency, relative to baseline | 132% | 203% |
| Added CPU time per operation | 1.79 ms | 52.0 ms |
| Added memory per operation (heap delta) | 354.1 KiB | 44.7 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 2,538 ops/s | 22 ops/s |

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
| 20 | 91.8 µs | 261 µs | 173 µs | 188% | 175 µs | $0.00036 – $0.002 |
| 40 | 156 µs | 432 µs | 277 µs | 178% | 1.65 ms | $0.00058 – $0.018 |
| 80 | 298 µs | 694 µs | 394 µs | 132% | 1.79 ms | $0.00082 – $0.020 |
| 160 | 538 µs | 1.17 ms | 598 µs | 111% | 729 µs | $0.0012 – $0.0082 |
| 320 | 871 µs | 2.47 ms | 1.33 ms | 153% | 1.54 ms | $0.0028 – $0.017 |
| 640 | 1.57 ms | 5.87 ms | 4.19 ms | 267% | 4.44 ms | $0.0087 – $0.050 |
| 1280 | 2.91 ms | 13.1 ms | 10.2 ms | 350% | 10.7 ms | $0.021 – $0.120 |
| 2560 | 5.57 ms | 19.3 ms | 13.7 ms | 246% | 14.3 ms | $0.029 – $0.161 |
| 5120 | 10.9 ms | 35.2 ms | 24.1 ms | 222% | 29.3 ms | $0.050 – $0.330 |
| 10240 | 22.5 ms | 68.1 ms | 45.6 ms | 203% | 52.0 ms | $0.095 – $0.584 |

**How the total grows:** O(n) (linear), exponent 0.85 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder. Its measured growth rate is then compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report. Either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 319 µs | 38.6 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 2.97 ms | 406 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 162 µs | 25.8 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 182 µs | 37.0 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 164 µs | 26.7 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 204 µs | 39.1 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n log n) | ✅ matches | 76.4 µs | 9.61 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 286 µs | 418 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 859 µs | 96.7 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 7.69 ms | 1.50 s |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 274 µs | 28.4 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 322 µs | 65.7 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 370 µs | 27.9 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 352 µs | 27.0 ms |

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

**Measured: O(n)** (exponent 0.95, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 95.0 µs | 99.3 µs | 304 µs | 52.9 KiB | 10,523 |
| 40 | 168 µs | 181 µs | 457 µs | 104.5 KiB | 5,956 |
| 80 | 319 µs | 418 µs | 813 µs | 211.4 KiB | 3,132 |
| 160 | 660 µs | 793 µs | 1.41 ms | 436.3 KiB | 1,516 |
| 320 | 1.48 ms | 1.68 ms | 2.99 ms | 938.9 KiB | 675 |
| 640 | 2.33 ms | 2.46 ms | 3.92 ms | 2.1 MiB | 429 |
| 1280 | 7.72 ms | 11.4 ms | 9.62 ms | 4.7 MiB | 129 |
| 2560 | 11.7 ms | 12.0 ms | 13.6 ms | 8.0 MiB | 86 |
| 5120 | 20.4 ms | 21.6 ms | 23.1 ms | 14.5 MiB | 49 |
| 10240 | 38.6 ms | 43.7 ms | 41.9 ms | 27.6 MiB | 26 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.05, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 818 µs | 837 µs | 1.58 ms | 294.9 KiB | 1,222 |
| 40 | 1.61 ms | 1.64 ms | 3.19 ms | 587.1 KiB | 623 |
| 80 | 2.97 ms | 3.50 ms | 4.67 ms | 1.1 MiB | 337 |
| 160 | 5.67 ms | 5.78 ms | 7.63 ms | 2.3 MiB | 176 |
| 320 | 11.1 ms | 11.2 ms | 13.4 ms | 4.7 MiB | 90 |
| 640 | 22.2 ms | 22.6 ms | 25.5 ms | 9.8 MiB | 45 |
| 1280 | 47.1 ms | 47.5 ms | 53.0 ms | 20.1 MiB | 21 |
| 2560 | 91.0 ms | 97.4 ms | 101 ms | 38.7 MiB | 11 |
| 5120 | 207 ms | 212 ms | 304 ms | 73.5 MiB | 5 |
| 10240 | 406 ms | 407 ms | 600 ms | 145.2 MiB | 2 |

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

**Measured: O(n)** (exponent 1.01, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 58.3 µs | 66.6 µs | 63.0 µs | 48.2 KiB | 17,149 |
| 40 | 82.7 µs | 117 µs | 271 µs | 92.6 KiB | 12,090 |
| 80 | 162 µs | 205 µs | 488 µs | 188.5 KiB | 6,182 |
| 160 | 289 µs | 404 µs | 819 µs | 393.8 KiB | 3,457 |
| 320 | 584 µs | 764 µs | 1.55 ms | 855.2 KiB | 1,713 |
| 640 | 1.22 ms | 1.64 ms | 3.00 ms | 1.9 MiB | 817 |
| 1280 | 5.16 ms | 5.49 ms | 7.79 ms | 4.4 MiB | 194 |
| 2560 | 7.27 ms | 7.63 ms | 10.3 ms | 7.3 MiB | 138 |
| 5120 | 12.8 ms | 17.4 ms | 17.6 ms | 13.2 MiB | 78 |
| 10240 | 25.8 ms | 26.0 ms | 33.3 ms | 24.7 MiB | 39 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.96, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 58.3 µs | 63.2 µs | 239 µs | 54.1 KiB | 17,153 |
| 40 | 104 µs | 122 µs | 336 µs | 107.0 KiB | 9,654 |
| 80 | 182 µs | 239 µs | 560 µs | 217.3 KiB | 5,482 |
| 160 | 453 µs | 499 µs | 1.46 ms | 452.9 KiB | 2,207 |
| 320 | 739 µs | 976 µs | 2.07 ms | 955.6 KiB | 1,354 |
| 640 | 2.17 ms | 2.32 ms | 5.96 ms | 2.2 MiB | 461 |
| 1280 | 7.01 ms | 7.78 ms | 13.1 ms | 4.9 MiB | 143 |
| 2560 | 10.6 ms | 11.4 ms | 20.4 ms | 8.3 MiB | 95 |
| 5120 | 18.2 ms | 19.6 ms | 35.9 ms | 15.1 MiB | 55 |
| 10240 | 37.0 ms | 43.3 ms | 70.6 ms | 28.0 MiB | 27 |

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

**Measured: O(n)** (exponent 1.04, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 51.0 µs | 54.9 µs | 171 µs | 47.0 KiB | 19,619 |
| 40 | 77.5 µs | 102 µs | 243 µs | 92.6 KiB | 12,895 |
| 80 | 164 µs | 206 µs | 539 µs | 188.7 KiB | 6,095 |
| 160 | 296 µs | 414 µs | 913 µs | 393.9 KiB | 3,374 |
| 320 | 559 µs | 740 µs | 1.46 ms | 849.7 KiB | 1,790 |
| 640 | 1.19 ms | 1.48 ms | 2.94 ms | 1.9 MiB | 838 |
| 1280 | 5.04 ms | 5.50 ms | 7.55 ms | 4.4 MiB | 198 |
| 2560 | 7.31 ms | 8.08 ms | 10.4 ms | 7.3 MiB | 137 |
| 5120 | 13.2 ms | 14.7 ms | 17.7 ms | 13.2 MiB | 75 |
| 10240 | 26.7 ms | 27.2 ms | 34.6 ms | 24.5 MiB | 38 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.03, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 57.1 µs | 62.2 µs | 220 µs | 54.2 KiB | 17,520 |
| 40 | 118 µs | 133 µs | 351 µs | 107.1 KiB | 8,501 |
| 80 | 204 µs | 246 µs | 659 µs | 217.5 KiB | 4,911 |
| 160 | 432 µs | 539 µs | 1.45 ms | 452.9 KiB | 2,313 |
| 320 | 775 µs | 992 µs | 2.14 ms | 970.6 KiB | 1,291 |
| 640 | 1.87 ms | 2.31 ms | 5.39 ms | 2.2 MiB | 536 |
| 1280 | 6.70 ms | 7.30 ms | 12.3 ms | 4.9 MiB | 149 |
| 2560 | 10.4 ms | 11.2 ms | 20.1 ms | 8.3 MiB | 96 |
| 5120 | 18.6 ms | 28.5 ms | 36.4 ms | 15.1 MiB | 54 |
| 10240 | 39.1 ms | 39.2 ms | 71.2 ms | 28.2 MiB | 26 |

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

**Measured: O(n log n)** (exponent 1.15, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 31.0 µs | 45.6 µs | 31.5 µs | 30.4 KiB | 32,220 |
| 40 | 44.3 µs | 51.1 µs | 152 µs | 55.2 KiB | 22,591 |
| 80 | 76.4 µs | 105 µs | 231 µs | 104.5 KiB | 13,092 |
| 160 | 150 µs | 211 µs | 461 µs | 204.6 KiB | 6,688 |
| 320 | 283 µs | 492 µs | 826 µs | 401.8 KiB | 3,530 |
| 640 | 357 µs | 770 µs | 1.31 ms | 600.2 KiB | 2,804 |
| 1280 | 1.20 ms | 1.30 ms | 3.24 ms | 1.3 MiB | 834 |
| 2560 | 2.29 ms | 2.53 ms | 4.80 ms | 2.7 MiB | 437 |
| 5120 | 4.70 ms | 5.02 ms | 8.50 ms | 5.5 MiB | 213 |
| 10240 | 9.61 ms | 9.81 ms | 16.2 ms | 10.8 MiB | 104 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent -0.00, 10 sizes): ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 279 µs | 329 µs | 868 µs | 619.7 KiB | 3,579 |
| 40 | 281 µs | 296 µs | 866 µs | 619.9 KiB | 3,559 |
| 80 | 286 µs | 319 µs | 877 µs | 623.9 KiB | 3,491 |
| 160 | 306 µs | 350 µs | 903 µs | 666.7 KiB | 3,266 |
| 320 | 326 µs | 361 µs | 901 µs | 715.9 KiB | 3,069 |
| 640 | 421 µs | 469 µs | 1.30 ms | 833.1 KiB | 2,375 |
| 1280 | 419 µs | 465 µs | 1.29 ms | 833.1 KiB | 2,384 |
| 2560 | 423 µs | 489 µs | 1.31 ms | 833.1 KiB | 2,365 |
| 5120 | 421 µs | 462 µs | 1.29 ms | 833.1 KiB | 2,374 |
| 10240 | 418 µs | 469 µs | 1.30 ms | 833.1 KiB | 2,393 |

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

**Measured: O(n)** (exponent 1.05, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 226 µs | 260 µs | 727 µs | 45.8 KiB | 4,425 |
| 40 | 404 µs | 422 µs | 1.16 ms | 90.2 KiB | 2,476 |
| 80 | 859 µs | 900 µs | 2.40 ms | 179.3 KiB | 1,164 |
| 160 | 1.50 ms | 1.57 ms | 3.16 ms | 357.3 KiB | 666 |
| 320 | 2.74 ms | 2.98 ms | 4.73 ms | 712.3 KiB | 364 |
| 640 | 5.15 ms | 5.29 ms | 7.24 ms | 1.4 MiB | 194 |
| 1280 | 10.4 ms | 10.7 ms | 12.7 ms | 2.8 MiB | 96 |
| 2560 | 20.8 ms | 24.2 ms | 23.5 ms | 5.7 MiB | 48 |
| 5120 | 42.1 ms | 42.3 ms | 42.8 ms | 11.3 MiB | 24 |
| 10240 | 96.7 ms | 97.2 ms | 97.2 ms | 22.7 MiB | 10 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.11, 10 sizes): 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.22 ms | 2.37 ms | 4.07 ms | 599.8 KiB | 450 |
| 40 | 4.06 ms | 4.25 ms | 6.00 ms | 1.2 MiB | 246 |
| 80 | 7.69 ms | 7.79 ms | 9.67 ms | 2.3 MiB | 130 |
| 160 | 14.9 ms | 15.6 ms | 16.9 ms | 4.6 MiB | 67 |
| 320 | 29.5 ms | 29.8 ms | 29.9 ms | 9.3 MiB | 34 |
| 640 | 67.6 ms | 67.8 ms | 68.2 ms | 18.5 MiB | 15 |
| 1280 | 169 ms | 180 ms | 169 ms | 37.0 MiB | 6 |
| 2560 | 363 ms | 366 ms | 364 ms | 73.9 MiB | 3 |
| 5120 | 739 ms | 743 ms | 756 ms | 147.7 MiB | 1 |
| 10240 | 1.50 s | 1.51 s | 1.53 s | 295.3 MiB | 1 |

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

**Measured: O(n)** (exponent 1.00, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 103 µs | 138 µs | 340 µs | 98.0 KiB | 9,731 |
| 40 | 164 µs | 222 µs | 522 µs | 179.0 KiB | 6,096 |
| 80 | 274 µs | 322 µs | 745 µs | 322.3 KiB | 3,645 |
| 160 | 495 µs | 668 µs | 1.22 ms | 637.9 KiB | 2,019 |
| 320 | 893 µs | 965 µs | 1.63 ms | 1.2 MiB | 1,120 |
| 640 | 1.78 ms | 1.95 ms | 3.31 ms | 2.5 MiB | 563 |
| 1280 | 3.36 ms | 3.55 ms | 4.77 ms | 4.9 MiB | 298 |
| 2560 | 6.68 ms | 6.95 ms | 8.56 ms | 9.9 MiB | 150 |
| 5120 | 13.7 ms | 14.1 ms | 16.2 ms | 19.8 MiB | 73 |
| 10240 | 28.4 ms | 29.4 ms | 32.6 ms | 39.6 MiB | 35 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.18, 10 sizes): 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 95.2 µs | 108 µs | 303 µs | 281.1 KiB | 10,506 |
| 40 | 167 µs | 177 µs | 458 µs | 539.5 KiB | 5,972 |
| 80 | 322 µs | 393 µs | 793 µs | 1.0 MiB | 3,110 |
| 160 | 626 µs | 724 µs | 1.37 ms | 2.1 MiB | 1,596 |
| 320 | 1.30 ms | 1.43 ms | 2.80 ms | 4.2 MiB | 767 |
| 640 | 2.52 ms | 2.63 ms | 4.14 ms | 8.3 MiB | 396 |
| 1280 | 4.92 ms | 5.17 ms | 6.87 ms | 16.7 MiB | 203 |
| 2560 | 9.76 ms | 10.3 ms | 12.3 ms | 33.3 MiB | 103 |
| 5120 | 25.8 ms | 27.4 ms | 29.7 ms | 52.0 MiB | 39 |
| 10240 | 65.7 ms | 65.9 ms | 76.1 ms | 103.7 MiB | 15 |

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
| 20 | 106 µs | 128 µs | 109 µs | 57.4 KiB | 9,468 |
| 40 | 192 µs | 216 µs | 195 µs | 113.5 KiB | 5,212 |
| 80 | 370 µs | 412 µs | 684 µs | 225.7 KiB | 2,701 |
| 160 | 591 µs | 628 µs | 2.02 ms | 450.0 KiB | 1,693 |
| 320 | 962 µs | 1.11 ms | 2.34 ms | 898.9 KiB | 1,040 |
| 640 | 1.76 ms | 1.87 ms | 3.19 ms | 1.8 MiB | 570 |
| 1280 | 3.34 ms | 3.45 ms | 4.53 ms | 3.5 MiB | 299 |
| 2560 | 6.56 ms | 6.83 ms | 6.93 ms | 6.9 MiB | 152 |
| 5120 | 13.0 ms | 13.5 ms | 13.0 ms | 13.8 MiB | 77 |
| 10240 | 27.9 ms | 30.2 ms | 28.5 ms | 27.7 MiB | 36 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.98, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 97.3 µs | 117 µs | 101 µs | 56.5 KiB | 10,275 |
| 40 | 179 µs | 198 µs | 182 µs | 111.8 KiB | 5,587 |
| 80 | 352 µs | 370 µs | 1.18 ms | 222.5 KiB | 2,843 |
| 160 | 555 µs | 579 µs | 1.82 ms | 443.7 KiB | 1,803 |
| 320 | 956 µs | 1.03 ms | 2.34 ms | 886.2 KiB | 1,046 |
| 640 | 1.79 ms | 1.92 ms | 3.25 ms | 1.7 MiB | 557 |
| 1280 | 3.29 ms | 3.35 ms | 5.04 ms | 3.5 MiB | 304 |
| 2560 | 6.49 ms | 6.76 ms | 8.00 ms | 6.9 MiB | 154 |
| 5120 | 13.2 ms | 14.8 ms | 16.1 ms | 13.8 MiB | 76 |
| 10240 | 27.0 ms | 27.1 ms | 32.3 ms | 27.7 MiB | 37 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls. So where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time). Every moment of the operation then belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly. They are not measured against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 694 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 319 µs | 319 µs | 46% |
| `run-policies` | 1 | 162 µs | 162 µs | 23% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 213 µs | 31% |

**At 10240 checks** (whole operation: 68.1 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 38.6 ms | 38.6 ms | 57% |
| `run-policies` | 1 | 25.8 ms | 25.8 ms | 38% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 3.72 ms | 5.5% |

## Cost model

Estimates use two bracketing price shapes. **Low** is CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time). **High** is duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-17T07:21:18.227Z` → `2026-11-17T07:22:51.392Z` (93 s), ci: CI (run 44034203264)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `07770a727be6c021f3213310ad0835d634c1472e` on `chore/bump-internal-package-contract-v0.21.0`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks: One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They show how _this_ package's cost changes between runs on comparable hardware, and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

