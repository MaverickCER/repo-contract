# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend, and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **297 µs** per operation compared with a bare-minimum baseline (**170% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.82). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones. Both come from the same run, so they depend far less on the machine than a time does. Runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below). They show scale, not a budget.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 297 µs | 29.4 ms |
| Added latency, relative to baseline | 170% | 222% |
| Added CPU time per operation | 1.41 ms | 32.2 ms |
| Added memory per operation (heap delta) | 353.8 KiB | 44.7 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,369 ops/s | 34 ops/s |

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
| 20 | 58.1 µs | 175 µs | 118 µs | 203% | 117 µs | $0.00025 – $0.0013 |
| 40 | 94.8 µs | 277 µs | 176 µs | 186% | 190 µs | $0.00037 – $0.0021 |
| 80 | 175 µs | 499 µs | 297 µs | 170% | 1.41 ms | $0.00062 – $0.016 |
| 160 | 335 µs | 788 µs | 454 µs | 135% | 2.10 ms | $0.00094 – $0.024 |
| 320 | 606 µs | 1.60 ms | 953 µs | 157% | 1.04 ms | $0.002 – $0.012 |
| 640 | 1.02 ms | 3.95 ms | 2.94 ms | 288% | 3.22 ms | $0.0061 – $0.036 |
| 1280 | 1.83 ms | 8.75 ms | 6.91 ms | 377% | 7.42 ms | $0.014 – $0.083 |
| 2560 | 3.49 ms | 13.0 ms | 9.46 ms | 271% | 9.99 ms | $0.020 – $0.112 |
| 5120 | 6.34 ms | 22.8 ms | 15.9 ms | 251% | 21.0 ms | $0.033 – $0.236 |
| 10240 | 13.2 ms | 42.0 ms | 29.4 ms | 222% | 32.2 ms | $0.061 – $0.362 |

**How the total grows:** O(n) (linear), exponent 0.82 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder. Its measured growth rate is then compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report. Either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 198 µs | 23.4 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 1.92 ms | 262 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 94.4 µs | 15.7 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 121 µs | 25.3 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 93.5 µs | 14.6 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 136 µs | 26.7 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n log n) | ✅ matches | 53.3 µs | 6.73 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 198 µs | 275 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 523 µs | 63.8 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n) | ✅ matches | 5.30 ms | 997 ms |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 158 µs | 17.1 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 249 µs | 51.1 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 198 µs | 17.9 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 199 µs | 19.9 ms |

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

**Measured: O(n)** (exponent 0.94, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 59.1 µs | 65.1 µs | 208 µs | 52.8 KiB | 16,934 |
| 40 | 104 µs | 108 µs | 313 µs | 104.3 KiB | 9,616 |
| 80 | 198 µs | 206 µs | 566 µs | 211.1 KiB | 5,038 |
| 160 | 408 µs | 428 µs | 1.20 ms | 436.3 KiB | 2,452 |
| 320 | 705 µs | 724 µs | 1.54 ms | 938.5 KiB | 1,419 |
| 640 | 1.42 ms | 1.50 ms | 3.13 ms | 2.1 MiB | 705 |
| 1280 | 5.09 ms | 5.35 ms | 6.63 ms | 4.7 MiB | 196 |
| 2560 | 7.52 ms | 7.70 ms | 9.44 ms | 8.0 MiB | 133 |
| 5120 | 12.8 ms | 13.7 ms | 14.8 ms | 14.5 MiB | 78 |
| 10240 | 23.4 ms | 24.2 ms | 27.6 ms | 27.5 MiB | 43 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.07, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 545 µs | 556 µs | 1.41 ms | 294.9 KiB | 1,835 |
| 40 | 1.09 ms | 1.21 ms | 2.86 ms | 587.1 KiB | 916 |
| 80 | 1.92 ms | 2.32 ms | 4.49 ms | 1.1 MiB | 520 |
| 160 | 3.58 ms | 3.94 ms | 5.99 ms | 2.3 MiB | 279 |
| 320 | 6.93 ms | 7.50 ms | 10.2 ms | 4.7 MiB | 144 |
| 640 | 13.5 ms | 13.8 ms | 17.8 ms | 9.8 MiB | 74 |
| 1280 | 29.9 ms | 30.1 ms | 36.8 ms | 20.1 MiB | 33 |
| 2560 | 58.0 ms | 61.6 ms | 72.4 ms | 38.7 MiB | 17 |
| 5120 | 134 ms | 134 ms | 216 ms | 73.5 MiB | 7 |
| 10240 | 262 ms | 265 ms | 431 ms | 145.3 MiB | 4 |

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

**Measured: O(n)** (exponent 0.95, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 32.4 µs | 38.2 µs | 33.1 µs | 48.1 KiB | 30,875 |
| 40 | 48.6 µs | 60.4 µs | 177 µs | 92.4 KiB | 20,586 |
| 80 | 94.4 µs | 104 µs | 319 µs | 188.3 KiB | 10,597 |
| 160 | 172 µs | 185 µs | 532 µs | 393.0 KiB | 5,822 |
| 320 | 341 µs | 437 µs | 929 µs | 853.1 KiB | 2,933 |
| 640 | 847 µs | 882 µs | 2.09 ms | 1.9 MiB | 1,181 |
| 1280 | 3.85 ms | 4.08 ms | 6.29 ms | 4.4 MiB | 260 |
| 2560 | 5.21 ms | 5.50 ms | 7.98 ms | 7.3 MiB | 192 |
| 5120 | 8.07 ms | 8.41 ms | 12.1 ms | 13.2 MiB | 124 |
| 10240 | 15.7 ms | 16.9 ms | 22.7 ms | 24.6 MiB | 64 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.00, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 31.9 µs | 34.0 µs | 33.0 µs | 54.0 KiB | 31,355 |
| 40 | 61.7 µs | 66.9 µs | 228 µs | 106.9 KiB | 16,210 |
| 80 | 121 µs | 133 µs | 394 µs | 217.1 KiB | 8,280 |
| 160 | 286 µs | 315 µs | 1.01 ms | 451.7 KiB | 3,498 |
| 320 | 557 µs | 611 µs | 1.87 ms | 970.6 KiB | 1,797 |
| 640 | 1.24 ms | 1.31 ms | 4.82 ms | 2.2 MiB | 806 |
| 1280 | 4.94 ms | 5.27 ms | 11.0 ms | 4.9 MiB | 202 |
| 2560 | 6.52 ms | 7.29 ms | 15.3 ms | 8.1 MiB | 153 |
| 5120 | 12.3 ms | 13.6 ms | 30.3 ms | 15.1 MiB | 82 |
| 10240 | 25.3 ms | 27.4 ms | 62.6 ms | 28.1 MiB | 40 |

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

**Measured: O(n)** (exponent 0.97, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 27.5 µs | 29.8 µs | 28.7 µs | 46.9 KiB | 36,360 |
| 40 | 48.7 µs | 53.1 µs | 178 µs | 92.5 KiB | 20,548 |
| 80 | 93.5 µs | 102 µs | 315 µs | 188.3 KiB | 10,694 |
| 160 | 178 µs | 213 µs | 545 µs | 393.2 KiB | 5,615 |
| 320 | 344 µs | 431 µs | 904 µs | 853.8 KiB | 2,910 |
| 640 | 718 µs | 867 µs | 1.75 ms | 1.9 MiB | 1,393 |
| 1280 | 3.86 ms | 4.10 ms | 6.41 ms | 4.4 MiB | 259 |
| 2560 | 5.26 ms | 5.49 ms | 8.09 ms | 7.3 MiB | 190 |
| 5120 | 7.93 ms | 8.24 ms | 11.6 ms | 13.0 MiB | 126 |
| 10240 | 14.6 ms | 15.6 ms | 21.1 ms | 24.5 MiB | 69 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.01, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 33.1 µs | 36.0 µs | 34.3 µs | 54.1 KiB | 30,224 |
| 40 | 63.6 µs | 67.5 µs | 172 µs | 107.0 KiB | 15,717 |
| 80 | 136 µs | 152 µs | 453 µs | 217.2 KiB | 7,352 |
| 160 | 267 µs | 306 µs | 844 µs | 451.3 KiB | 3,743 |
| 320 | 606 µs | 671 µs | 2.03 ms | 970.6 KiB | 1,651 |
| 640 | 1.30 ms | 1.35 ms | 4.80 ms | 2.2 MiB | 771 |
| 1280 | 4.80 ms | 5.00 ms | 10.9 ms | 4.9 MiB | 208 |
| 2560 | 6.47 ms | 7.19 ms | 15.4 ms | 8.3 MiB | 154 |
| 5120 | 12.2 ms | 14.1 ms | 30.3 ms | 15.1 MiB | 82 |
| 10240 | 26.7 ms | 30.4 ms | 66.6 ms | 28.0 MiB | 37 |

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

**Measured: O(n log n)** (exponent 1.23, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 20.1 µs | 31.6 µs | 20.5 µs | 30.4 KiB | 49,699 |
| 40 | 30.3 µs | 37.5 µs | 108 µs | 55.1 KiB | 33,029 |
| 80 | 53.3 µs | 61.0 µs | 181 µs | 104.5 KiB | 18,748 |
| 160 | 106 µs | 140 µs | 382 µs | 204.7 KiB | 9,392 |
| 320 | 185 µs | 234 µs | 564 µs | 401.4 KiB | 5,405 |
| 640 | 181 µs | 191 µs | 565 µs | 611.5 KiB | 5,536 |
| 1280 | 909 µs | 1.01 ms | 3.06 ms | 1.3 MiB | 1,101 |
| 2560 | 1.65 ms | 1.72 ms | 4.35 ms | 2.7 MiB | 606 |
| 5120 | 3.29 ms | 3.41 ms | 7.04 ms | 5.5 MiB | 304 |
| 10240 | 6.73 ms | 6.95 ms | 12.3 ms | 10.8 MiB | 149 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent 0.00, 10 sizes): ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 194 µs | 204 µs | 669 µs | 615.8 KiB | 5,150 |
| 40 | 194 µs | 204 µs | 662 µs | 617.6 KiB | 5,160 |
| 80 | 198 µs | 222 µs | 666 µs | 623.8 KiB | 5,058 |
| 160 | 195 µs | 203 µs | 568 µs | 661.1 KiB | 5,135 |
| 320 | 224 µs | 235 µs | 692 µs | 722.4 KiB | 4,470 |
| 640 | 275 µs | 284 µs | 905 µs | 828.1 KiB | 3,638 |
| 1280 | 254 µs | 286 µs | 724 µs | 825.5 KiB | 3,932 |
| 2560 | 275 µs | 298 µs | 902 µs | 828.1 KiB | 3,633 |
| 5120 | 255 µs | 265 µs | 727 µs | 825.5 KiB | 3,927 |
| 10240 | 275 µs | 306 µs | 899 µs | 828.1 KiB | 3,635 |

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

**Measured: O(n)** (exponent 0.98, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 136 µs | 144 µs | 459 µs | 45.5 KiB | 7,342 |
| 40 | 235 µs | 243 µs | 650 µs | 109.0 KiB | 4,254 |
| 80 | 523 µs | 547 µs | 1.38 ms | 178.6 KiB | 1,913 |
| 160 | 1.02 ms | 1.08 ms | 2.72 ms | 357.3 KiB | 979 |
| 320 | 1.79 ms | 1.88 ms | 3.77 ms | 712.3 KiB | 559 |
| 640 | 4.30 ms | 4.45 ms | 6.36 ms | 1.4 MiB | 233 |
| 1280 | 8.86 ms | 9.04 ms | 11.2 ms | 2.8 MiB | 113 |
| 2560 | 18.1 ms | 18.3 ms | 20.8 ms | 5.7 MiB | 55 |
| 5120 | 36.9 ms | 37.4 ms | 40.4 ms | 11.3 MiB | 27 |
| 10240 | 63.8 ms | 64.4 ms | 67.9 ms | 22.7 MiB | 16 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.02, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.57 ms | 1.65 ms | 3.51 ms | 599.8 KiB | 635 |
| 40 | 2.79 ms | 2.95 ms | 4.83 ms | 1.2 MiB | 358 |
| 80 | 5.30 ms | 5.41 ms | 7.45 ms | 2.3 MiB | 189 |
| 160 | 10.3 ms | 10.4 ms | 12.7 ms | 4.6 MiB | 97 |
| 320 | 29.7 ms | 34.3 ms | 32.8 ms | 9.3 MiB | 34 |
| 640 | 58.7 ms | 58.9 ms | 61.9 ms | 18.5 MiB | 17 |
| 1280 | 117 ms | 117 ms | 120 ms | 37.0 MiB | 9 |
| 2560 | 232 ms | 233 ms | 233 ms | 73.9 MiB | 4 |
| 5120 | 469 ms | 483 ms | 488 ms | 147.7 MiB | 2 |
| 10240 | 997 ms | 1.00e+3 ms | 1.03 s | 295.3 MiB | 1 |

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

**Measured: O(n)** (exponent 0.98, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 63.0 µs | 89.7 µs | 197 µs | 98.0 KiB | 15,883 |
| 40 | 91.0 µs | 108 µs | 279 µs | 178.9 KiB | 10,987 |
| 80 | 158 µs | 168 µs | 458 µs | 322.2 KiB | 6,323 |
| 160 | 305 µs | 320 µs | 820 µs | 637.7 KiB | 3,282 |
| 320 | 582 µs | 621 µs | 1.39 ms | 1.2 MiB | 1,717 |
| 640 | 1.15 ms | 1.24 ms | 2.79 ms | 2.5 MiB | 866 |
| 1280 | 2.15 ms | 2.26 ms | 3.69 ms | 4.9 MiB | 464 |
| 2560 | 4.16 ms | 4.28 ms | 5.92 ms | 9.9 MiB | 240 |
| 5120 | 8.54 ms | 8.58 ms | 11.0 ms | 19.8 MiB | 117 |
| 10240 | 17.1 ms | 17.9 ms | 21.1 ms | 39.6 MiB | 58 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.19, 10 sizes): 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 66.9 µs | 71.6 µs | 239 µs | 281.3 KiB | 14,942 |
| 40 | 128 µs | 134 µs | 385 µs | 539.0 KiB | 7,841 |
| 80 | 249 µs | 260 µs | 732 µs | 1.0 MiB | 4,009 |
| 160 | 538 µs | 557 µs | 1.78 ms | 2.1 MiB | 1,859 |
| 320 | 1.11 ms | 1.15 ms | 3.63 ms | 4.2 MiB | 900 |
| 640 | 1.97 ms | 2.04 ms | 4.66 ms | 8.3 MiB | 508 |
| 1280 | 3.67 ms | 3.80 ms | 6.63 ms | 16.7 MiB | 272 |
| 2560 | 7.03 ms | 7.29 ms | 10.5 ms | 33.3 MiB | 142 |
| 5120 | 21.0 ms | 22.5 ms | 26.1 ms | 52.0 MiB | 48 |
| 10240 | 51.1 ms | 56.2 ms | 62.1 ms | 103.7 MiB | 20 |

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

**Measured: O(n)** (exponent 0.98, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 67.2 µs | 90.7 µs | 71.0 µs | 57.3 KiB | 14,871 |
| 40 | 110 µs | 130 µs | 113 µs | 113.3 KiB | 9,105 |
| 80 | 198 µs | 226 µs | 201 µs | 225.5 KiB | 5,053 |
| 160 | 373 µs | 408 µs | 379 µs | 450.0 KiB | 2,679 |
| 320 | 657 µs | 685 µs | 2.17 ms | 898.7 KiB | 1,522 |
| 640 | 1.16 ms | 1.19 ms | 2.67 ms | 1.8 MiB | 862 |
| 1280 | 2.13 ms | 2.16 ms | 3.37 ms | 3.5 MiB | 470 |
| 2560 | 4.09 ms | 4.39 ms | 4.52 ms | 7.0 MiB | 245 |
| 5120 | 8.20 ms | 8.71 ms | 8.66 ms | 14.0 MiB | 122 |
| 10240 | 17.9 ms | 18.2 ms | 18.3 ms | 28.1 MiB | 56 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.00, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 64.1 µs | 74.3 µs | 67.0 µs | 57.3 KiB | 15,590 |
| 40 | 109 µs | 130 µs | 112 µs | 113.3 KiB | 9,199 |
| 80 | 199 µs | 229 µs | 203 µs | 225.5 KiB | 5,014 |
| 160 | 388 µs | 418 µs | 891 µs | 450.0 KiB | 2,575 |
| 320 | 662 µs | 752 µs | 2.10 ms | 898.7 KiB | 1,511 |
| 640 | 1.24 ms | 1.28 ms | 2.89 ms | 1.8 MiB | 804 |
| 1280 | 2.29 ms | 2.34 ms | 4.46 ms | 3.5 MiB | 436 |
| 2560 | 4.41 ms | 4.58 ms | 6.39 ms | 7.0 MiB | 227 |
| 5120 | 9.03 ms | 9.27 ms | 12.8 ms | 14.0 MiB | 111 |
| 10240 | 19.9 ms | 20.4 ms | 25.8 ms | 28.1 MiB | 50 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls. So where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time). Every moment of the operation then belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly. They are not measured against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 499 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 198 µs | 198 µs | 40% |
| `run-policies` | 1 | 94.4 µs | 94.4 µs | 19% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 206 µs | 41% |

**At 10240 checks** (whole operation: 42.0 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 23.4 ms | 23.4 ms | 56% |
| `run-policies` | 1 | 15.7 ms | 15.7 ms | 37% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 2.92 ms | 6.9% |

## Cost model

Estimates use two bracketing price shapes. **Low** is CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time). **High** is duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-15T21:48:39.448Z` → `2026-11-15T21:49:53.851Z` (74 s), ci: CI (run 43764681048)
- Machine: Intel(R) Xeon(R) 6975P-C, 4 logical core(s) (2 physical), 15701 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `4e579bb6c18fc4991d98d19f391f709f27edd82e` on `feat/v1-readiness`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks: One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They show how _this_ package's cost changes between runs on comparable hardware, and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

