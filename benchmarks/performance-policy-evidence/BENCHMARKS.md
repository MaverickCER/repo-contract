# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **401 µs** per operation compared with a bare-minimum baseline (**133% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.86). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 401 µs | 48.2 ms |
| Added latency, relative to baseline | 133% | 217% |
| Added CPU time per operation | 1.81 ms | 50.7 ms |
| Added memory per operation (heap delta) | 354.1 KiB | 44.8 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 2,496 ops/s | 21 ops/s |

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
| 20 | 92.8 µs | 271 µs | 186 µs | 201% | 191 µs | $0.00039 – $0.0021 |
| 40 | 156 µs | 443 µs | 282 µs | 181% | 1.73 ms | $0.00059 – $0.019 |
| 80 | 300 µs | 705 µs | 401 µs | 133% | 1.81 ms | $0.00083 – $0.020 |
| 160 | 535 µs | 1.13 ms | 572 µs | 107% | 622 µs | $0.0012 – $0.007 |
| 320 | 886 µs | 2.53 ms | 1.64 ms | 185% | 1.62 ms | $0.0034 – $0.018 |
| 640 | 1.55 ms | 5.92 ms | 4.37 ms | 282% | 4.26 ms | $0.0091 – $0.048 |
| 1280 | 2.93 ms | 13.6 ms | 10.6 ms | 363% | 11.3 ms | $0.022 – $0.127 |
| 2560 | 5.65 ms | 21.0 ms | 15.4 ms | 273% | 14.7 ms | $0.032 – $0.165 |
| 5120 | 11.3 ms | 37.6 ms | 26.5 ms | 234% | 29.2 ms | $0.055 – $0.328 |
| 10240 | 22.2 ms | 70.2 ms | 48.2 ms | 217% | 50.7 ms | $0.100 – $0.570 |

**How the total grows:** O(n) (linear), exponent 0.86 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 315 µs | 39.3 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 3.04 ms | 410 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 151 µs | 26.2 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 202 µs | 36.2 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 154 µs | 26.2 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 203 µs | 35.9 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n) | 🟡 close (neighbouring class) | 83.0 µs | 9.72 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 291 µs | 426 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 779 µs | 98.4 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 7.93 ms | 1.50 s |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 288 µs | 32.3 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 331 µs | 65.7 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 380 µs | 28.6 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 365 µs | 28.5 ms |

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
| 20 | 92.4 µs | 108 µs | 292 µs | 52.9 KiB | 10,823 |
| 40 | 177 µs | 190 µs | 538 µs | 104.6 KiB | 5,663 |
| 80 | 315 µs | 427 µs | 812 µs | 211.4 KiB | 3,170 |
| 160 | 596 µs | 629 µs | 1.35 ms | 436.3 KiB | 1,677 |
| 320 | 1.21 ms | 1.29 ms | 2.79 ms | 938.9 KiB | 823 |
| 640 | 2.23 ms | 2.38 ms | 3.81 ms | 2.1 MiB | 448 |
| 1280 | 7.32 ms | 7.58 ms | 8.89 ms | 4.7 MiB | 137 |
| 2560 | 11.5 ms | 12.0 ms | 13.6 ms | 8.0 MiB | 87 |
| 5120 | 20.8 ms | 21.3 ms | 23.3 ms | 14.5 MiB | 48 |
| 10240 | 39.3 ms | 39.6 ms | 43.4 ms | 27.6 MiB | 25 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.05, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 810 µs | 838 µs | 1.57 ms | 294.9 KiB | 1,235 |
| 40 | 1.62 ms | 1.64 ms | 3.20 ms | 587.1 KiB | 618 |
| 80 | 3.04 ms | 3.59 ms | 4.76 ms | 1.1 MiB | 329 |
| 160 | 5.83 ms | 6.02 ms | 7.90 ms | 2.3 MiB | 171 |
| 320 | 11.4 ms | 13.6 ms | 13.8 ms | 4.7 MiB | 88 |
| 640 | 22.4 ms | 22.5 ms | 25.6 ms | 9.8 MiB | 45 |
| 1280 | 47.7 ms | 48.0 ms | 53.6 ms | 20.1 MiB | 21 |
| 2560 | 92.8 ms | 99.7 ms | 103 ms | 38.7 MiB | 11 |
| 5120 | 210 ms | 224 ms | 304 ms | 73.5 MiB | 5 |
| 10240 | 410 ms | 415 ms | 606 ms | 145.1 MiB | 2 |

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

**Measured: O(n)** (exponent 1.02, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 59.2 µs | 70.5 µs | 61.2 µs | 48.2 KiB | 16,889 |
| 40 | 85.6 µs | 112 µs | 297 µs | 92.6 KiB | 11,688 |
| 80 | 151 µs | 209 µs | 450 µs | 188.5 KiB | 6,629 |
| 160 | 301 µs | 419 µs | 881 µs | 393.8 KiB | 3,322 |
| 320 | 598 µs | 846 µs | 1.52 ms | 855.2 KiB | 1,672 |
| 640 | 1.18 ms | 1.36 ms | 2.93 ms | 1.9 MiB | 845 |
| 1280 | 5.35 ms | 5.81 ms | 7.66 ms | 4.4 MiB | 187 |
| 2560 | 7.56 ms | 7.91 ms | 10.6 ms | 7.3 MiB | 132 |
| 5120 | 13.0 ms | 13.9 ms | 17.7 ms | 13.2 MiB | 77 |
| 10240 | 26.2 ms | 28.0 ms | 34.3 ms | 24.5 MiB | 38 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 59.5 µs | 64.7 µs | 230 µs | 54.1 KiB | 16,820 |
| 40 | 115 µs | 128 µs | 350 µs | 107.0 KiB | 8,692 |
| 80 | 202 µs | 244 µs | 639 µs | 217.5 KiB | 4,955 |
| 160 | 368 µs | 520 µs | 1.10 ms | 451.7 KiB | 2,720 |
| 320 | 980 µs | 1.12 ms | 3.45 ms | 975.6 KiB | 1,020 |
| 640 | 1.91 ms | 2.33 ms | 5.42 ms | 2.2 MiB | 523 |
| 1280 | 7.02 ms | 7.61 ms | 13.0 ms | 4.9 MiB | 142 |
| 2560 | 10.7 ms | 11.2 ms | 20.4 ms | 8.3 MiB | 93 |
| 5120 | 18.8 ms | 19.2 ms | 36.2 ms | 15.1 MiB | 53 |
| 10240 | 36.2 ms | 36.4 ms | 69.0 ms | 28.0 MiB | 28 |

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

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 48.1 µs | 52.6 µs | 190 µs | 46.9 KiB | 20,788 |
| 40 | 96.9 µs | 105 µs | 284 µs | 92.6 KiB | 10,318 |
| 80 | 154 µs | 211 µs | 459 µs | 188.5 KiB | 6,489 |
| 160 | 297 µs | 415 µs | 896 µs | 393.9 KiB | 3,369 |
| 320 | 588 µs | 768 µs | 1.50 ms | 856.1 KiB | 1,699 |
| 640 | 1.32 ms | 1.68 ms | 3.19 ms | 1.9 MiB | 759 |
| 1280 | 5.52 ms | 5.86 ms | 8.01 ms | 4.4 MiB | 181 |
| 2560 | 8.07 ms | 8.59 ms | 11.2 ms | 7.3 MiB | 124 |
| 5120 | 13.7 ms | 29.3 ms | 18.1 ms | 13.1 MiB | 73 |
| 10240 | 26.2 ms | 27.0 ms | 34.3 ms | 24.5 MiB | 38 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.97, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 56.4 µs | 61.5 µs | 220 µs | 54.2 KiB | 17,744 |
| 40 | 109 µs | 124 µs | 318 µs | 107.0 KiB | 9,184 |
| 80 | 203 µs | 249 µs | 658 µs | 217.5 KiB | 4,923 |
| 160 | 428 µs | 518 µs | 1.45 ms | 452.9 KiB | 2,334 |
| 320 | 838 µs | 1.06 ms | 2.24 ms | 970.6 KiB | 1,193 |
| 640 | 2.01 ms | 2.42 ms | 5.62 ms | 2.2 MiB | 497 |
| 1280 | 7.11 ms | 8.58 ms | 13.3 ms | 4.9 MiB | 141 |
| 2560 | 10.6 ms | 11.4 ms | 20.6 ms | 8.3 MiB | 95 |
| 5120 | 18.8 ms | 19.6 ms | 36.7 ms | 15.0 MiB | 53 |
| 10240 | 35.9 ms | 54.1 ms | 70.0 ms | 27.8 MiB | 28 |

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

**Measured: O(n)** (exponent 1.04, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 34.8 µs | 52.0 µs | 35.7 µs | 30.5 KiB | 28,771 |
| 40 | 42.6 µs | 55.9 µs | 143 µs | 55.2 KiB | 23,455 |
| 80 | 83.0 µs | 109 µs | 279 µs | 104.6 KiB | 12,052 |
| 160 | 157 µs | 230 µs | 497 µs | 208.3 KiB | 6,380 |
| 320 | 288 µs | 405 µs | 858 µs | 402.2 KiB | 3,473 |
| 640 | 529 µs | 760 µs | 1.42 ms | 821.1 KiB | 1,891 |
| 1280 | 1.24 ms | 1.36 ms | 3.29 ms | 1.3 MiB | 808 |
| 2560 | 2.36 ms | 2.50 ms | 5.13 ms | 2.7 MiB | 424 |
| 5120 | 4.81 ms | 4.95 ms | 8.92 ms | 5.5 MiB | 208 |
| 10240 | 9.72 ms | 9.80 ms | 16.7 ms | 10.8 MiB | 103 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent 0.00, 10 sizes) -- ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 279 µs | 296 µs | 874 µs | 620.2 KiB | 3,582 |
| 40 | 281 µs | 318 µs | 871 µs | 620.3 KiB | 3,553 |
| 80 | 291 µs | 326 µs | 894 µs | 626.2 KiB | 3,442 |
| 160 | 305 µs | 327 µs | 913 µs | 667.5 KiB | 3,278 |
| 320 | 331 µs | 358 µs | 949 µs | 716.3 KiB | 3,023 |
| 640 | 421 µs | 488 µs | 1.31 ms | 834.3 KiB | 2,377 |
| 1280 | 419 µs | 447 µs | 1.31 ms | 834.3 KiB | 2,384 |
| 2560 | 421 µs | 446 µs | 1.30 ms | 834.3 KiB | 2,374 |
| 5120 | 422 µs | 495 µs | 1.31 ms | 834.3 KiB | 2,368 |
| 10240 | 426 µs | 478 µs | 1.32 ms | 834.3 KiB | 2,348 |

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

**Measured: O(n)** (exponent 1.05, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 208 µs | 221 µs | 593 µs | 45.6 KiB | 4,813 |
| 40 | 408 µs | 429 µs | 1.18 ms | 90.2 KiB | 2,453 |
| 80 | 779 µs | 831 µs | 1.60 ms | 178.6 KiB | 1,284 |
| 160 | 1.52 ms | 1.61 ms | 3.20 ms | 357.3 KiB | 659 |
| 320 | 2.79 ms | 2.95 ms | 4.87 ms | 712.3 KiB | 358 |
| 640 | 5.25 ms | 5.47 ms | 7.46 ms | 1.4 MiB | 190 |
| 1280 | 10.7 ms | 10.9 ms | 13.0 ms | 2.8 MiB | 94 |
| 2560 | 21.4 ms | 21.7 ms | 24.0 ms | 5.7 MiB | 47 |
| 5120 | 42.7 ms | 42.9 ms | 43.1 ms | 11.3 MiB | 23 |
| 10240 | 98.4 ms | 116 ms | 98.8 ms | 22.7 MiB | 10 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.11, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.32 ms | 2.52 ms | 4.26 ms | 599.8 KiB | 431 |
| 40 | 4.22 ms | 4.40 ms | 6.41 ms | 1.2 MiB | 237 |
| 80 | 7.93 ms | 8.07 ms | 10.1 ms | 2.3 MiB | 126 |
| 160 | 15.2 ms | 15.6 ms | 17.4 ms | 4.6 MiB | 66 |
| 320 | 29.9 ms | 33.2 ms | 30.4 ms | 9.3 MiB | 33 |
| 640 | 67.7 ms | 67.9 ms | 68.2 ms | 18.5 MiB | 15 |
| 1280 | 169 ms | 175 ms | 169 ms | 37.0 MiB | 6 |
| 2560 | 361 ms | 362 ms | 362 ms | 73.9 MiB | 3 |
| 5120 | 742 ms | 748 ms | 760 ms | 147.7 MiB | 1 |
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

**Measured: O(n)** (exponent 1.05, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 121 µs | 169 µs | 488 µs | 98.0 KiB | 8,250 |
| 40 | 170 µs | 208 µs | 535 µs | 179.0 KiB | 5,881 |
| 80 | 288 µs | 342 µs | 773 µs | 351.1 KiB | 3,473 |
| 160 | 473 µs | 657 µs | 973 µs | 637.7 KiB | 2,113 |
| 320 | 1.01 ms | 1.13 ms | 2.54 ms | 1.2 MiB | 986 |
| 640 | 1.81 ms | 1.92 ms | 3.40 ms | 2.5 MiB | 553 |
| 1280 | 3.45 ms | 3.63 ms | 5.03 ms | 4.9 MiB | 290 |
| 2560 | 7.25 ms | 10.4 ms | 9.59 ms | 9.9 MiB | 138 |
| 5120 | 15.6 ms | 15.8 ms | 18.8 ms | 19.8 MiB | 64 |
| 10240 | 32.3 ms | 34.0 ms | 37.4 ms | 39.6 MiB | 31 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.18, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 114 µs | 125 µs | 369 µs | 281.1 KiB | 8,757 |
| 40 | 186 µs | 202 µs | 560 µs | 540.1 KiB | 5,376 |
| 80 | 331 µs | 359 µs | 814 µs | 1.0 MiB | 3,025 |
| 160 | 637 µs | 712 µs | 1.39 ms | 2.1 MiB | 1,571 |
| 320 | 1.32 ms | 1.42 ms | 2.91 ms | 4.2 MiB | 755 |
| 640 | 2.55 ms | 2.62 ms | 4.30 ms | 8.3 MiB | 393 |
| 1280 | 5.05 ms | 5.21 ms | 7.12 ms | 16.7 MiB | 198 |
| 2560 | 10.2 ms | 10.5 ms | 13.2 ms | 33.3 MiB | 98 |
| 5120 | 27.7 ms | 29.7 ms | 32.2 ms | 52.0 MiB | 36 |
| 10240 | 65.7 ms | 66.7 ms | 76.4 ms | 103.7 MiB | 15 |

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

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 115 µs | 141 µs | 119 µs | 57.4 KiB | 8,717 |
| 40 | 206 µs | 228 µs | 210 µs | 113.5 KiB | 4,865 |
| 80 | 380 µs | 418 µs | 897 µs | 225.7 KiB | 2,632 |
| 160 | 538 µs | 720 µs | 1.70 ms | 450.0 KiB | 1,858 |
| 320 | 981 µs | 1.41 ms | 2.48 ms | 898.9 KiB | 1,019 |
| 640 | 1.78 ms | 1.96 ms | 3.34 ms | 1.8 MiB | 561 |
| 1280 | 3.31 ms | 3.58 ms | 3.86 ms | 3.5 MiB | 302 |
| 2560 | 6.69 ms | 10.5 ms | 7.13 ms | 6.9 MiB | 149 |
| 5120 | 13.8 ms | 13.9 ms | 13.8 ms | 13.8 MiB | 73 |
| 10240 | 28.6 ms | 29.8 ms | 29.1 ms | 27.7 MiB | 35 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 106 µs | 133 µs | 111 µs | 56.5 KiB | 9,418 |
| 40 | 185 µs | 206 µs | 190 µs | 111.8 KiB | 5,404 |
| 80 | 365 µs | 380 µs | 1.27 ms | 222.5 KiB | 2,739 |
| 160 | 578 µs | 752 µs | 2.01 ms | 443.7 KiB | 1,730 |
| 320 | 951 µs | 966 µs | 2.40 ms | 886.2 KiB | 1,052 |
| 640 | 1.75 ms | 1.80 ms | 3.29 ms | 1.7 MiB | 572 |
| 1280 | 3.38 ms | 3.42 ms | 5.22 ms | 3.5 MiB | 296 |
| 2560 | 6.75 ms | 7.10 ms | 8.06 ms | 6.9 MiB | 148 |
| 5120 | 13.9 ms | 14.5 ms | 17.5 ms | 13.8 MiB | 72 |
| 10240 | 28.5 ms | 29.7 ms | 34.2 ms | 27.7 MiB | 35 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 705 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 315 µs | 315 µs | 45% |
| `run-policies` | 1 | 151 µs | 151 µs | 21% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 238 µs | 34% |

**At 10240 checks** (whole operation: 70.2 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 39.3 ms | 39.3 ms | 56% |
| `run-policies` | 1 | 26.2 ms | 26.2 ms | 37% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 4.65 ms | 6.6% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-14T07:06:41.901Z` → `2026-11-14T07:08:16.151Z` (94 s), ci: CI (run 43568159906)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `43f31f226cc93a6e1a562cc17be0af699c682afd` on `chore/bump-internal-package-contract-v0.18.0`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

