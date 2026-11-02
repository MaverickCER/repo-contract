# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **147 µs** per operation compared with a bare-minimum baseline (**132% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.03). At list prices that is on the order of **~$0.0001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 147 µs | 31.7 ms |
| Added latency, relative to baseline | 132% | 256% |
| Added CPU time per operation | 360 µs | 36.0 ms |
| Added memory per operation (heap delta) | 345.3 KiB | 44.5 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.0001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 6,809 ops/s | 32 ops/s |

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
| 20 | 33.3 µs | 86.5 µs | 53.2 µs | 160% | 190 µs | $0.00011 – $0.0021 |
| 40 | 56.6 µs | 136 µs | 79.9 µs | 141% | 212 µs | $0.00017 – $0.0024 |
| 80 | 111 µs | 258 µs | 147 µs | 132% | 360 µs | $0.00031 – $0.0041 |
| 160 | 220 µs | 499 µs | 280 µs | 127% | 556 µs | $0.00058 – $0.0062 |
| 320 | 449 µs | 1.00 ms | 555 µs | 124% | 1.07 ms | $0.0012 – $0.012 |
| 640 | 827 µs | 1.95 ms | 1.12 ms | 135% | 1.91 ms | $0.0023 – $0.022 |
| 1280 | 1.66 ms | 7.98 ms | 6.32 ms | 380% | 6.66 ms | $0.013 – $0.075 |
| 2560 | 3.13 ms | 11.8 ms | 8.64 ms | 276% | 9.36 ms | $0.018 – $0.105 |
| 5120 | 6.17 ms | 20.2 ms | 14.0 ms | 227% | 15.6 ms | $0.029 – $0.175 |
| 10240 | 12.4 ms | 44.1 ms | 31.7 ms | 256% | 36.0 ms | $0.066 – $0.405 |

**How the total grows:** O(n) (linear), exponent 1.03 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 164 µs | 22.8 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 1.79 ms | 253 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 67.8 µs | 16.0 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 87.9 µs | 26.0 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 75.2 µs | 15.6 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 92.8 µs | 24.5 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n log n) | ✅ matches | 38.8 µs | 6.27 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 141 µs | 193 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 430 µs | 56.7 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 4.07 ms | 915 ms |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 135 µs | 19.5 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 178 µs | 49.9 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 190 µs | 16.4 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 192 µs | 16.0 ms |

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

**Measured: O(n)** (exponent 0.98, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 47.5 µs | 56.2 µs | 136 µs | 52.7 KiB | 21,046 |
| 40 | 85.6 µs | 91.5 µs | 218 µs | 104.3 KiB | 11,679 |
| 80 | 164 µs | 172 µs | 377 µs | 211.1 KiB | 6,091 |
| 160 | 318 µs | 418 µs | 673 µs | 436.0 KiB | 3,144 |
| 320 | 620 µs | 763 µs | 1.18 ms | 938.5 KiB | 1,613 |
| 640 | 1.26 ms | 1.41 ms | 2.40 ms | 2.1 MiB | 795 |
| 1280 | 4.39 ms | 6.09 ms | 5.68 ms | 4.7 MiB | 228 |
| 2560 | 6.82 ms | 15.6 ms | 8.52 ms | 8.0 MiB | 147 |
| 5120 | 11.8 ms | 14.9 ms | 13.6 ms | 14.5 MiB | 85 |
| 10240 | 22.8 ms | 23.3 ms | 26.3 ms | 27.6 MiB | 44 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.08, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 483 µs | 982 µs | 1.03 ms | 294.9 KiB | 2,072 |
| 40 | 892 µs | 919 µs | 1.46 ms | 585.9 KiB | 1,121 |
| 80 | 1.79 ms | 2.26 ms | 3.03 ms | 1.1 MiB | 558 |
| 160 | 3.38 ms | 3.50 ms | 4.76 ms | 2.3 MiB | 296 |
| 320 | 6.65 ms | 6.98 ms | 8.34 ms | 4.7 MiB | 150 |
| 640 | 13.2 ms | 13.5 ms | 15.8 ms | 9.8 MiB | 76 |
| 1280 | 28.3 ms | 32.5 ms | 32.8 ms | 20.1 MiB | 35 |
| 2560 | 59.4 ms | 64.6 ms | 68.2 ms | 38.7 MiB | 17 |
| 5120 | 133 ms | 136 ms | 203 ms | 73.5 MiB | 8 |
| 10240 | 253 ms | 258 ms | 394 ms | 145.3 MiB | 4 |

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

**Measured: O(n log n)** (exponent 1.11, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 26.7 µs | 33.0 µs | 27.2 µs | 47.1 KiB | 37,394 |
| 40 | 36.9 µs | 48.5 µs | 105 µs | 92.4 KiB | 27,090 |
| 80 | 67.8 µs | 96.7 µs | 194 µs | 188.2 KiB | 14,758 |
| 160 | 135 µs | 190 µs | 384 µs | 393.0 KiB | 7,405 |
| 320 | 269 µs | 386 µs | 671 µs | 841.9 KiB | 3,713 |
| 640 | 542 µs | 734 µs | 1.13 ms | 1.9 MiB | 1,847 |
| 1280 | 3.08 ms | 3.44 ms | 4.92 ms | 4.4 MiB | 325 |
| 2560 | 4.77 ms | 9.84 ms | 7.07 ms | 7.3 MiB | 210 |
| 5120 | 7.78 ms | 8.44 ms | 11.0 ms | 13.2 MiB | 129 |
| 10240 | 16.0 ms | 17.9 ms | 22.0 ms | 25.0 MiB | 63 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.10, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 28.1 µs | 30.4 µs | 62.1 µs | 54.1 KiB | 35,556 |
| 40 | 48.3 µs | 59.0 µs | 138 µs | 106.8 KiB | 20,698 |
| 80 | 87.9 µs | 119 µs | 257 µs | 217.0 KiB | 11,382 |
| 160 | 180 µs | 235 µs | 539 µs | 451.1 KiB | 5,544 |
| 320 | 449 µs | 593 µs | 1.32 ms | 970.6 KiB | 2,226 |
| 640 | 979 µs | 2.22 ms | 3.42 ms | 2.2 MiB | 1,021 |
| 1280 | 4.45 ms | 4.81 ms | 9.19 ms | 4.9 MiB | 225 |
| 2560 | 6.84 ms | 7.06 ms | 14.0 ms | 8.3 MiB | 146 |
| 5120 | 13.3 ms | 13.7 ms | 26.3 ms | 15.1 MiB | 75 |
| 10240 | 26.0 ms | 26.5 ms | 51.4 ms | 28.3 MiB | 38 |

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

**Measured: O(n)** (exponent 1.09, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 24.7 µs | 27.9 µs | 50.5 µs | 46.9 KiB | 40,455 |
| 40 | 40.8 µs | 53.2 µs | 125 µs | 92.5 KiB | 24,525 |
| 80 | 75.2 µs | 105 µs | 220 µs | 188.3 KiB | 13,295 |
| 160 | 143 µs | 201 µs | 384 µs | 389.6 KiB | 7,016 |
| 320 | 280 µs | 402 µs | 682 µs | 852.9 KiB | 3,572 |
| 640 | 547 µs | 736 µs | 1.17 ms | 1.9 MiB | 1,828 |
| 1280 | 3.15 ms | 4.35 ms | 5.02 ms | 4.4 MiB | 318 |
| 2560 | 4.33 ms | 4.83 ms | 6.58 ms | 7.3 MiB | 231 |
| 5120 | 7.47 ms | 7.96 ms | 10.6 ms | 13.2 MiB | 134 |
| 10240 | 15.6 ms | 16.0 ms | 21.6 ms | 25.0 MiB | 64 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.17, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 30.8 µs | 62.8 µs | 73.0 µs | 54.1 KiB | 32,513 |
| 40 | 56.4 µs | 62.8 µs | 153 µs | 106.9 KiB | 17,740 |
| 80 | 92.8 µs | 117 µs | 284 µs | 216.2 KiB | 10,778 |
| 160 | 183 µs | 250 µs | 574 µs | 444.8 KiB | 5,455 |
| 320 | 345 µs | 389 µs | 971 µs | 955.9 KiB | 2,896 |
| 640 | 754 µs | 844 µs | 2.04 ms | 2.1 MiB | 1,326 |
| 1280 | 4.25 ms | 4.86 ms | 8.72 ms | 4.8 MiB | 236 |
| 2560 | 6.83 ms | 7.20 ms | 14.3 ms | 8.2 MiB | 146 |
| 5120 | 13.1 ms | 13.5 ms | 27.4 ms | 14.9 MiB | 76 |
| 10240 | 24.5 ms | 25.6 ms | 48.4 ms | 28.3 MiB | 41 |

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

**Measured: O(n log n)** (exponent 1.34, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 16.0 µs | 23.6 µs | 16.2 µs | 30.4 KiB | 62,413 |
| 40 | 20.3 µs | 37.6 µs | 61.0 µs | 55.1 KiB | 49,376 |
| 80 | 38.8 µs | 50.4 µs | 111 µs | 104.6 KiB | 25,747 |
| 160 | 67.3 µs | 87.0 µs | 189 µs | 206.7 KiB | 14,849 |
| 320 | 83.7 µs | 139 µs | 316 µs | 298.5 KiB | 11,952 |
| 640 | 132 µs | 182 µs | 341 µs | 610.7 KiB | 7,557 |
| 1280 | 615 µs | 957 µs | 1.33 ms | 1.3 MiB | 1,627 |
| 2560 | 1.34 ms | 1.42 ms | 3.09 ms | 2.7 MiB | 749 |
| 5120 | 2.89 ms | 5.46 ms | 5.47 ms | 5.5 MiB | 347 |
| 10240 | 6.27 ms | 6.46 ms | 10.9 ms | 10.8 MiB | 159 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent 0.00, 10 sizes) -- ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 162 µs | 203 µs | 580 µs | 620.1 KiB | 6,154 |
| 40 | 133 µs | 142 µs | 336 µs | 625.4 KiB | 7,502 |
| 80 | 141 µs | 151 µs | 386 µs | 628.3 KiB | 7,112 |
| 160 | 149 µs | 161 µs | 397 µs | 661.3 KiB | 6,692 |
| 320 | 160 µs | 174 µs | 403 µs | 731.7 KiB | 6,256 |
| 640 | 192 µs | 208 µs | 494 µs | 826.6 KiB | 5,217 |
| 1280 | 193 µs | 208 µs | 500 µs | 826.6 KiB | 5,179 |
| 2560 | 195 µs | 207 µs | 503 µs | 826.6 KiB | 5,115 |
| 5120 | 194 µs | 205 µs | 502 µs | 826.6 KiB | 5,158 |
| 10240 | 193 µs | 233 µs | 496 µs | 826.6 KiB | 5,190 |

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

**Measured: O(n)** (exponent 1.08, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 105 µs | 113 µs | 321 µs | 45.5 KiB | 9,536 |
| 40 | 180 µs | 195 µs | 454 µs | 109.0 KiB | 5,556 |
| 80 | 430 µs | 447 µs | 1.01 ms | 178.6 KiB | 2,328 |
| 160 | 750 µs | 865 µs | 1.41 ms | 355.8 KiB | 1,333 |
| 320 | 1.48 ms | 1.63 ms | 2.83 ms | 712.3 KiB | 677 |
| 640 | 2.75 ms | 2.94 ms | 4.18 ms | 1.4 MiB | 364 |
| 1280 | 5.39 ms | 5.62 ms | 6.93 ms | 2.8 MiB | 185 |
| 2560 | 10.9 ms | 11.0 ms | 11.6 ms | 5.7 MiB | 92 |
| 5120 | 22.2 ms | 22.5 ms | 22.7 ms | 11.3 MiB | 45 |
| 10240 | 56.7 ms | 58.1 ms | 57.3 ms | 22.7 MiB | 18 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.13, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.27 ms | 1.40 ms | 2.58 ms | 599.8 KiB | 788 |
| 40 | 2.18 ms | 2.32 ms | 3.53 ms | 1.2 MiB | 458 |
| 80 | 4.07 ms | 4.27 ms | 5.49 ms | 2.3 MiB | 246 |
| 160 | 7.91 ms | 8.12 ms | 9.18 ms | 4.6 MiB | 126 |
| 320 | 15.8 ms | 16.3 ms | 16.3 ms | 9.3 MiB | 63 |
| 640 | 38.8 ms | 39.2 ms | 39.3 ms | 18.5 MiB | 26 |
| 1280 | 94.6 ms | 96.1 ms | 95.1 ms | 37.0 MiB | 11 |
| 2560 | 208 ms | 250 ms | 209 ms | 73.9 MiB | 5 |
| 5120 | 439 ms | 446 ms | 452 ms | 147.7 MiB | 2 |
| 10240 | 915 ms | 971 ms | 939 ms | 295.3 MiB | 1 |

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

**Measured: O(n)** (exponent 1.10, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 53.1 µs | 78.4 µs | 197 µs | 98.0 KiB | 18,826 |
| 40 | 75.2 µs | 89.3 µs | 187 µs | 178.8 KiB | 13,298 |
| 80 | 135 µs | 144 µs | 334 µs | 322.2 KiB | 7,405 |
| 160 | 259 µs | 274 µs | 599 µs | 637.6 KiB | 3,868 |
| 320 | 502 µs | 538 µs | 1.03 ms | 1.2 MiB | 1,990 |
| 640 | 920 µs | 979 µs | 1.46 ms | 2.5 MiB | 1,087 |
| 1280 | 1.93 ms | 2.05 ms | 2.91 ms | 4.9 MiB | 519 |
| 2560 | 4.02 ms | 4.18 ms | 5.53 ms | 9.9 MiB | 249 |
| 5120 | 8.68 ms | 9.21 ms | 10.8 ms | 19.8 MiB | 115 |
| 10240 | 19.5 ms | 20.9 ms | 23.6 ms | 39.6 MiB | 51 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.23, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 46.1 µs | 57.5 µs | 154 µs | 281.2 KiB | 21,699 |
| 40 | 86.3 µs | 95.9 µs | 214 µs | 538.7 KiB | 11,591 |
| 80 | 178 µs | 213 µs | 438 µs | 1.0 MiB | 5,630 |
| 160 | 355 µs | 387 µs | 698 µs | 2.1 MiB | 2,820 |
| 320 | 756 µs | 800 µs | 1.29 ms | 4.2 MiB | 1,323 |
| 640 | 1.61 ms | 1.74 ms | 2.79 ms | 8.3 MiB | 620 |
| 1280 | 3.31 ms | 3.47 ms | 4.72 ms | 16.7 MiB | 302 |
| 2560 | 6.66 ms | 7.02 ms | 8.68 ms | 33.3 MiB | 150 |
| 5120 | 17.3 ms | 18.4 ms | 19.8 ms | 52.0 MiB | 58 |
| 10240 | 49.9 ms | 72.8 ms | 59.6 ms | 103.7 MiB | 20 |

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
| 20 | 67.0 µs | 213 µs | 71.0 µs | 57.3 KiB | 14,932 |
| 40 | 110 µs | 144 µs | 113 µs | 113.3 KiB | 9,122 |
| 80 | 190 µs | 206 µs | 193 µs | 225.5 KiB | 5,269 |
| 160 | 346 µs | 369 µs | 1.37 ms | 450.0 KiB | 2,888 |
| 320 | 569 µs | 719 µs | 1.48 ms | 898.7 KiB | 1,757 |
| 640 | 1.06 ms | 1.10 ms | 2.13 ms | 1.8 MiB | 947 |
| 1280 | 1.98 ms | 2.05 ms | 2.61 ms | 3.5 MiB | 505 |
| 2560 | 3.92 ms | 4.16 ms | 4.19 ms | 6.9 MiB | 255 |
| 5120 | 8.02 ms | 8.40 ms | 8.15 ms | 13.8 MiB | 125 |
| 10240 | 16.4 ms | 16.9 ms | 16.8 ms | 27.7 MiB | 61 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 54.4 µs | 58.9 µs | 57.0 µs | 56.4 KiB | 18,388 |
| 40 | 97.2 µs | 110 µs | 100 µs | 111.7 KiB | 10,287 |
| 80 | 192 µs | 429 µs | 220 µs | 222.3 KiB | 5,198 |
| 160 | 333 µs | 345 µs | 1.26 ms | 443.6 KiB | 3,003 |
| 320 | 557 µs | 587 µs | 1.53 ms | 886.1 KiB | 1,797 |
| 640 | 998 µs | 1.05 ms | 2.13 ms | 1.7 MiB | 1,002 |
| 1280 | 1.91 ms | 1.99 ms | 3.35 ms | 3.5 MiB | 525 |
| 2560 | 3.60 ms | 3.66 ms | 4.73 ms | 6.9 MiB | 278 |
| 5120 | 7.57 ms | 7.66 ms | 9.61 ms | 13.8 MiB | 132 |
| 10240 | 16.0 ms | 17.5 ms | 20.0 ms | 27.7 MiB | 63 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 258 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 164 µs | 164 µs | 64% |
| `run-policies` | 1 | 67.8 µs | 67.8 µs | 26% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 26.0 µs | 10% |

**At 10240 checks** (whole operation: 44.1 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 22.8 ms | 22.8 ms | 52% |
| `run-policies` | 1 | 16.0 ms | 16.0 ms | 36% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 5.32 ms | 12% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-02T09:44:23.588Z` → `2026-11-02T09:45:30.744Z` (67 s), ci: CI (run 41421304272)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15984 MB RAM, linux/x64, Node v24.22.1, GitHub Actions
- Git: `e60de69da381ce75b3523692bb63ac8e9f996a65` on `dependabot/npm_and_yarn/internal-package-contract-v0.13.3`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

