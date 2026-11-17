# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend, and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **314 µs** per operation compared with a bare-minimum baseline (**158% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.87). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones. Both come from the same run, so they depend far less on the machine than a time does. Runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below). They show scale, not a budget.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 314 µs | 34.3 ms |
| Added latency, relative to baseline | 158% | 230% |
| Added CPU time per operation | 1.44 ms | 36.8 ms |
| Added memory per operation (heap delta) | 354.1 KiB | 45.1 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,183 ops/s | 29 ops/s |

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
| 20 | 67.2 µs | 224 µs | 152 µs | 226% | 184 µs | $0.00032 – $0.0021 |
| 40 | 97.6 µs | 335 µs | 228 µs | 234% | 903 µs | $0.00048 – $0.010 |
| 80 | 199 µs | 538 µs | 314 µs | 158% | 1.44 ms | $0.00065 – $0.016 |
| 160 | 368 µs | 921 µs | 500 µs | 136% | 930 µs | $0.001 – $0.010 |
| 320 | 667 µs | 1.70 ms | 985 µs | 148% | 1.27 ms | $0.0021 – $0.014 |
| 640 | 1.08 ms | 3.81 ms | 2.43 ms | 226% | 2.80 ms | $0.0051 – $0.031 |
| 1280 | 1.99 ms | 10.2 ms | 8.09 ms | 407% | 8.74 ms | $0.017 – $0.098 |
| 2560 | 4.33 ms | 15.8 ms | 11.2 ms | 258% | 13.0 ms | $0.023 – $0.146 |
| 5120 | 9.51 ms | 27.9 ms | 18.0 ms | 190% | 19.4 ms | $0.038 – $0.218 |
| 10240 | 14.9 ms | 47.8 ms | 34.3 ms | 230% | 36.8 ms | $0.071 – $0.414 |

**How the total grows:** O(n) (linear), exponent 0.87 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder. Its measured growth rate is then compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report. Either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 280 µs | 23.9 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 2.09 ms | 281 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 93.0 µs | 23.6 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 131 µs | 30.1 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 106 µs | 22.9 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 155 µs | 30.8 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n log n) | ✅ matches | 54.6 µs | 7.71 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 170 µs | 314 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 501 µs | 54.8 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n) | ✅ matches | 4.70 ms | 848 ms |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 164 µs | 22.2 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 238 µs | 60.3 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 228 µs | 20.0 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 223 µs | 21.9 ms |

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

**Measured: O(n)** (exponent 0.89, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 59.2 µs | 162 µs | 206 µs | 52.9 KiB | 16,890 |
| 40 | 122 µs | 230 µs | 313 µs | 104.3 KiB | 8,200 |
| 80 | 280 µs | 573 µs | 950 µs | 211.8 KiB | 3,570 |
| 160 | 449 µs | 753 µs | 1.18 ms | 436.3 KiB | 2,226 |
| 320 | 817 µs | 1.31 ms | 1.68 ms | 938.5 KiB | 1,223 |
| 640 | 1.75 ms | 3.55 ms | 3.60 ms | 2.1 MiB | 572 |
| 1280 | 6.00 ms | 9.25 ms | 8.18 ms | 4.7 MiB | 167 |
| 2560 | 8.66 ms | 13.2 ms | 11.0 ms | 8.0 MiB | 116 |
| 5120 | 15.1 ms | 18.1 ms | 17.5 ms | 14.5 MiB | 66 |
| 10240 | 23.9 ms | 30.9 ms | 27.7 ms | 27.5 MiB | 42 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.01, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 501 µs | 1.02 ms | 1.15 ms | 294.9 KiB | 1,996 |
| 40 | 1.05 ms | 2.05 ms | 2.44 ms | 587.1 KiB | 957 |
| 80 | 2.09 ms | 3.08 ms | 3.82 ms | 1.1 MiB | 479 |
| 160 | 3.56 ms | 5.77 ms | 5.77 ms | 2.3 MiB | 281 |
| 320 | 8.79 ms | 10.7 ms | 11.5 ms | 4.7 MiB | 114 |
| 640 | 16.9 ms | 24.7 ms | 21.8 ms | 9.8 MiB | 59 |
| 1280 | 35.3 ms | 41.8 ms | 42.1 ms | 20.1 MiB | 28 |
| 2560 | 66.9 ms | 70.8 ms | 77.2 ms | 38.7 MiB | 15 |
| 5120 | 138 ms | 153 ms | 233 ms | 73.5 MiB | 7 |
| 10240 | 281 ms | 287 ms | 460 ms | 145.2 MiB | 4 |

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

**Measured: O(n)** (exponent 1.05, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 35.4 µs | 80.0 µs | 39.0 µs | 48.1 KiB | 28,272 |
| 40 | 52.5 µs | 88.9 µs | 173 µs | 92.6 KiB | 19,064 |
| 80 | 93.0 µs | 212 µs | 238 µs | 188.2 KiB | 10,748 |
| 160 | 187 µs | 338 µs | 454 µs | 393.0 KiB | 5,356 |
| 320 | 385 µs | 741 µs | 914 µs | 847.2 KiB | 2,599 |
| 640 | 1.01 ms | 1.90 ms | 2.65 ms | 1.9 MiB | 991 |
| 1280 | 4.29 ms | 6.69 ms | 6.76 ms | 4.3 MiB | 233 |
| 2560 | 6.00 ms | 7.77 ms | 9.42 ms | 7.3 MiB | 167 |
| 5120 | 11.6 ms | 13.8 ms | 15.8 ms | 13.2 MiB | 86 |
| 10240 | 23.6 ms | 24.6 ms | 31.8 ms | 24.4 MiB | 42 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.97, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 45.1 µs | 94.0 µs | 46.3 µs | 54.6 KiB | 22,192 |
| 40 | 62.9 µs | 119 µs | 194 µs | 106.9 KiB | 15,903 |
| 80 | 131 µs | 385 µs | 454 µs | 217.5 KiB | 7,637 |
| 160 | 297 µs | 489 µs | 856 µs | 451.7 KiB | 3,370 |
| 320 | 582 µs | 1.32 ms | 1.66 ms | 970.6 KiB | 1,718 |
| 640 | 1.80 ms | 2.60 ms | 5.72 ms | 2.2 MiB | 557 |
| 1280 | 5.84 ms | 10.1 ms | 12.5 ms | 4.9 MiB | 171 |
| 2560 | 8.84 ms | 12.1 ms | 18.1 ms | 8.3 MiB | 113 |
| 5120 | 17.4 ms | 20.2 ms | 34.0 ms | 15.1 MiB | 58 |
| 10240 | 30.1 ms | 30.7 ms | 56.7 ms | 28.2 MiB | 33 |

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
| 20 | 31.2 µs | 53.9 µs | 58.6 µs | 46.9 KiB | 32,066 |
| 40 | 50.6 µs | 142 µs | 169 µs | 92.6 KiB | 19,749 |
| 80 | 106 µs | 292 µs | 350 µs | 188.5 KiB | 9,417 |
| 160 | 213 µs | 366 µs | 598 µs | 393.6 KiB | 4,699 |
| 320 | 465 µs | 1.01 ms | 1.30 ms | 856.1 KiB | 2,152 |
| 640 | 1.12 ms | 2.26 ms | 2.86 ms | 1.9 MiB | 895 |
| 1280 | 4.46 ms | 7.28 ms | 7.46 ms | 4.4 MiB | 224 |
| 2560 | 5.87 ms | 7.78 ms | 9.16 ms | 7.3 MiB | 170 |
| 5120 | 10.5 ms | 13.9 ms | 15.4 ms | 13.2 MiB | 95 |
| 10240 | 22.9 ms | 37.8 ms | 31.6 ms | 24.4 MiB | 44 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.95, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 32.5 µs | 69.5 µs | 34.8 µs | 54.2 KiB | 30,743 |
| 40 | 64.8 µs | 200 µs | 192 µs | 106.9 KiB | 15,425 |
| 80 | 155 µs | 454 µs | 437 µs | 217.5 KiB | 6,458 |
| 160 | 307 µs | 687 µs | 924 µs | 451.7 KiB | 3,254 |
| 320 | 627 µs | 1.21 ms | 1.91 ms | 970.6 KiB | 1,594 |
| 640 | 1.87 ms | 2.79 ms | 5.29 ms | 2.2 MiB | 535 |
| 1280 | 6.07 ms | 8.66 ms | 12.6 ms | 4.9 MiB | 165 |
| 2560 | 9.57 ms | 12.8 ms | 18.3 ms | 8.3 MiB | 104 |
| 5120 | 16.6 ms | 19.7 ms | 32.0 ms | 15.1 MiB | 60 |
| 10240 | 30.8 ms | 35.2 ms | 58.0 ms | 28.1 MiB | 32 |

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

**Measured: O(n log n)** (exponent 1.24, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 21.2 µs | 91.0 µs | 24.0 µs | 30.4 KiB | 47,175 |
| 40 | 29.7 µs | 102 µs | 110 µs | 55.2 KiB | 33,632 |
| 80 | 54.6 µs | 113 µs | 188 µs | 104.5 KiB | 18,310 |
| 160 | 95.3 µs | 190 µs | 276 µs | 204.6 KiB | 10,497 |
| 320 | 197 µs | 396 µs | 586 µs | 401.4 KiB | 5,073 |
| 640 | 218 µs | 387 µs | 685 µs | 619.6 KiB | 4,584 |
| 1280 | 840 µs | 1.43 ms | 2.31 ms | 1.3 MiB | 1,191 |
| 2560 | 1.82 ms | 3.22 ms | 4.15 ms | 2.7 MiB | 549 |
| 5120 | 3.66 ms | 5.36 ms | 7.25 ms | 5.5 MiB | 273 |
| 10240 | 7.71 ms | 21.0 ms | 14.6 ms | 10.8 MiB | 130 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent 0.03, 10 sizes): ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 183 µs | 338 µs | 536 µs | 615.8 KiB | 5,450 |
| 40 | 167 µs | 407 µs | 543 µs | 617.6 KiB | 5,989 |
| 80 | 170 µs | 343 µs | 469 µs | 628.1 KiB | 5,895 |
| 160 | 210 µs | 385 µs | 586 µs | 662.5 KiB | 4,762 |
| 320 | 232 µs | 393 µs | 708 µs | 715.9 KiB | 4,317 |
| 640 | 271 µs | 546 µs | 746 µs | 828.2 KiB | 3,694 |
| 1280 | 291 µs | 631 µs | 841 µs | 828.2 KiB | 3,438 |
| 2560 | 308 µs | 582 µs | 1.01 ms | 833.1 KiB | 3,252 |
| 5120 | 270 µs | 538 µs | 828 µs | 828.2 KiB | 3,704 |
| 10240 | 314 µs | 616 µs | 867 µs | 828.2 KiB | 3,189 |

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

**Measured: O(n)** (exponent 0.93, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 132 µs | 217 µs | 400 µs | 45.5 KiB | 7,569 |
| 40 | 236 µs | 431 µs | 696 µs | 115.4 KiB | 4,233 |
| 80 | 501 µs | 963 µs | 1.29 ms | 178.6 KiB | 1,998 |
| 160 | 1.01 ms | 2.08 ms | 2.48 ms | 357.2 KiB | 985 |
| 320 | 1.95 ms | 2.85 ms | 4.18 ms | 712.3 KiB | 513 |
| 640 | 3.94 ms | 6.26 ms | 6.05 ms | 1.4 MiB | 254 |
| 1280 | 6.82 ms | 10.2 ms | 9.25 ms | 2.8 MiB | 147 |
| 2560 | 14.0 ms | 21.2 ms | 16.6 ms | 5.7 MiB | 71 |
| 5120 | 22.8 ms | 29.4 ms | 28.0 ms | 11.3 MiB | 44 |
| 10240 | 54.8 ms | 73.0 ms | 55.3 ms | 22.7 MiB | 18 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.07, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.56 ms | 2.62 ms | 3.23 ms | 599.8 KiB | 640 |
| 40 | 2.47 ms | 4.72 ms | 4.40 ms | 1.2 MiB | 405 |
| 80 | 4.70 ms | 6.93 ms | 6.71 ms | 2.3 MiB | 213 |
| 160 | 9.12 ms | 14.0 ms | 11.3 ms | 4.6 MiB | 110 |
| 320 | 18.9 ms | 23.7 ms | 20.5 ms | 9.3 MiB | 53 |
| 640 | 42.0 ms | 49.5 ms | 42.5 ms | 18.5 MiB | 24 |
| 1280 | 105 ms | 119 ms | 105 ms | 37.0 MiB | 10 |
| 2560 | 218 ms | 221 ms | 204 ms | 73.9 MiB | 5 |
| 5120 | 425 ms | 458 ms | 438 ms | 147.7 MiB | 2 |
| 10240 | 848 ms | 868 ms | 875 ms | 295.3 MiB | 1 |

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
| 20 | 71.4 µs | 123 µs | 238 µs | 97.9 KiB | 14,015 |
| 40 | 104 µs | 251 µs | 281 µs | 178.9 KiB | 9,593 |
| 80 | 164 µs | 245 µs | 427 µs | 322.2 KiB | 6,089 |
| 160 | 346 µs | 814 µs | 927 µs | 637.8 KiB | 2,887 |
| 320 | 636 µs | 1.42 ms | 1.38 ms | 1.2 MiB | 1,572 |
| 640 | 1.36 ms | 2.42 ms | 3.05 ms | 2.5 MiB | 737 |
| 1280 | 2.40 ms | 3.59 ms | 4.08 ms | 4.9 MiB | 416 |
| 2560 | 4.92 ms | 7.72 ms | 7.83 ms | 9.9 MiB | 203 |
| 5120 | 11.0 ms | 16.3 ms | 14.5 ms | 19.8 MiB | 91 |
| 10240 | 22.2 ms | 33.5 ms | 28.9 ms | 39.6 MiB | 45 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.22, 10 sizes): 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 74.5 µs | 197 µs | 232 µs | 281.1 KiB | 13,425 |
| 40 | 125 µs | 264 µs | 315 µs | 538.9 KiB | 7,972 |
| 80 | 238 µs | 454 µs | 580 µs | 1.0 MiB | 4,199 |
| 160 | 499 µs | 1.21 ms | 1.20 ms | 2.1 MiB | 2,004 |
| 320 | 1.02 ms | 1.74 ms | 2.58 ms | 4.2 MiB | 980 |
| 640 | 2.15 ms | 5.32 ms | 4.55 ms | 8.3 MiB | 465 |
| 1280 | 3.85 ms | 6.40 ms | 6.15 ms | 16.7 MiB | 260 |
| 2560 | 8.48 ms | 13.1 ms | 13.1 ms | 33.3 MiB | 118 |
| 5120 | 22.5 ms | 34.5 ms | 27.9 ms | 52.0 MiB | 45 |
| 10240 | 60.3 ms | 65.3 ms | 69.4 ms | 103.7 MiB | 17 |

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

**Measured: O(n)** (exponent 1.01, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 76.7 µs | 211 µs | 82.0 µs | 57.3 KiB | 13,042 |
| 40 | 111 µs | 218 µs | 118 µs | 113.3 KiB | 8,972 |
| 80 | 228 µs | 451 µs | 320 µs | 225.5 KiB | 4,393 |
| 160 | 402 µs | 661 µs | 1.43 ms | 450.0 KiB | 2,485 |
| 320 | 739 µs | 1.60 ms | 2.29 ms | 898.7 KiB | 1,354 |
| 640 | 1.24 ms | 2.41 ms | 2.97 ms | 1.8 MiB | 806 |
| 1280 | 2.45 ms | 3.27 ms | 4.18 ms | 3.5 MiB | 408 |
| 2560 | 4.48 ms | 5.08 ms | 4.91 ms | 6.9 MiB | 223 |
| 5120 | 10.4 ms | 11.4 ms | 10.7 ms | 13.8 MiB | 96 |
| 10240 | 20.0 ms | 22.9 ms | 20.6 ms | 27.7 MiB | 50 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.99, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 66.3 µs | 136 µs | 70.0 µs | 56.4 KiB | 15,085 |
| 40 | 113 µs | 283 µs | 117 µs | 111.7 KiB | 8,872 |
| 80 | 223 µs | 485 µs | 255 µs | 222.3 KiB | 4,482 |
| 160 | 437 µs | 820 µs | 1.68 ms | 443.6 KiB | 2,290 |
| 320 | 700 µs | 1.45 ms | 2.15 ms | 886.1 KiB | 1,428 |
| 640 | 1.48 ms | 2.15 ms | 3.81 ms | 1.7 MiB | 674 |
| 1280 | 2.39 ms | 3.61 ms | 6.34 ms | 3.5 MiB | 418 |
| 2560 | 4.52 ms | 5.55 ms | 6.66 ms | 6.9 MiB | 221 |
| 5120 | 10.4 ms | 12.1 ms | 14.3 ms | 13.8 MiB | 96 |
| 10240 | 21.9 ms | 22.4 ms | 27.4 ms | 27.7 MiB | 46 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls. So where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time). Every moment of the operation then belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly. They are not measured against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 538 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 280 µs | 280 µs | 52% |
| `run-policies` | 1 | 93.0 µs | 93.0 µs | 17% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 165 µs | 31% |

**At 10240 checks** (whole operation: 47.8 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 23.9 ms | 23.9 ms | 50% |
| `run-policies` | 1 | 23.6 ms | 23.6 ms | 49% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 272 µs | 0.6% |

## Cost model

Estimates use two bracketing price shapes. **Low** is CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time). **High** is duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-17T18:46:04.352Z` → `2026-11-17T18:47:19.676Z` (75 s), ci: CI (run 44148884303)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `ff0304f1cc5188d15ea2c2acc56e5ac2ab9340cf` on `fix/round7-gaps`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks: One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They show how _this_ package's cost changes between runs on comparable hardware, and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

