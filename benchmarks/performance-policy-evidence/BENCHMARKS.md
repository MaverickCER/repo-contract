# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **282 µs** per operation compared with a bare-minimum baseline (**131% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.97). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 282 µs | 41.0 ms |
| Added latency, relative to baseline | 131% | 187% |
| Added CPU time per operation | 625 µs | 43.9 ms |
| Added memory per operation (heap delta) | 345.9 KiB | 44.9 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,544 ops/s | 24 ops/s |

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
| 20 | 60.6 µs | 180 µs | 119 µs | 197% | 476 µs | $0.00025 – $0.0054 |
| 40 | 112 µs | 278 µs | 166 µs | 149% | 426 µs | $0.00035 – $0.0048 |
| 80 | 215 µs | 497 µs | 282 µs | 131% | 625 µs | $0.00059 – $0.007 |
| 160 | 439 µs | 1.00 ms | 565 µs | 129% | 1.34 ms | $0.0012 – $0.015 |
| 320 | 774 µs | 1.77 ms | 994 µs | 128% | 1.66 ms | $0.0021 – $0.019 |
| 640 | 1.54 ms | 3.43 ms | 1.89 ms | 123% | 2.36 ms | $0.0039 – $0.027 |
| 1280 | 2.91 ms | 13.1 ms | 10.2 ms | 351% | 10.7 ms | $0.021 – $0.120 |
| 2560 | 5.61 ms | 18.8 ms | 13.2 ms | 234% | 13.5 ms | $0.027 – $0.151 |
| 5120 | 11.1 ms | 32.8 ms | 21.7 ms | 196% | 23.8 ms | $0.045 – $0.268 |
| 10240 | 21.9 ms | 62.9 ms | 41.0 ms | 187% | 43.9 ms | $0.085 – $0.494 |

**How the total grows:** O(n) (linear), exponent 0.97 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 316 µs | 36.7 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 2.99 ms | 408 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 146 µs | 24.6 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 179 µs | 34.9 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 141 µs | 25.0 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 175 µs | 34.0 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n log n) | ✅ matches | 78.6 µs | 9.31 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 287 µs | 418 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 870 µs | 96.9 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 8.18 ms | 1.53 s |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 277 µs | 29.5 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 328 µs | 59.5 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 355 µs | 27.6 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 356 µs | 27.0 ms |

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
| 20 | 88.8 µs | 91.9 µs | 269 µs | 52.8 KiB | 11,259 |
| 40 | 166 µs | 171 µs | 462 µs | 104.5 KiB | 6,011 |
| 80 | 316 µs | 330 µs | 805 µs | 211.4 KiB | 3,162 |
| 160 | 595 µs | 610 µs | 1.35 ms | 436.2 KiB | 1,682 |
| 320 | 1.18 ms | 1.26 ms | 2.69 ms | 938.9 KiB | 845 |
| 640 | 2.16 ms | 2.32 ms | 3.71 ms | 2.1 MiB | 463 |
| 1280 | 7.09 ms | 7.45 ms | 8.54 ms | 4.7 MiB | 141 |
| 2560 | 11.2 ms | 11.6 ms | 13.5 ms | 8.0 MiB | 89 |
| 5120 | 19.5 ms | 19.9 ms | 21.5 ms | 14.5 MiB | 51 |
| 10240 | 36.7 ms | 36.8 ms | 40.2 ms | 27.6 MiB | 27 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.05, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 801 µs | 821 µs | 1.55 ms | 294.9 KiB | 1,248 |
| 40 | 1.60 ms | 1.64 ms | 3.19 ms | 587.0 KiB | 624 |
| 80 | 2.99 ms | 3.54 ms | 4.67 ms | 1.1 MiB | 335 |
| 160 | 5.72 ms | 5.75 ms | 7.63 ms | 2.3 MiB | 175 |
| 320 | 11.2 ms | 11.4 ms | 13.5 ms | 4.7 MiB | 89 |
| 640 | 22.2 ms | 22.3 ms | 25.4 ms | 9.8 MiB | 45 |
| 1280 | 47.5 ms | 50.1 ms | 52.7 ms | 20.1 MiB | 21 |
| 2560 | 91.6 ms | 98.5 ms | 101 ms | 38.7 MiB | 11 |
| 5120 | 206 ms | 208 ms | 302 ms | 73.5 MiB | 5 |
| 10240 | 408 ms | 411 ms | 604 ms | 145.1 MiB | 2 |

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

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 50.9 µs | 63.3 µs | 58.7 µs | 47.0 KiB | 19,653 |
| 40 | 79.1 µs | 101 µs | 255 µs | 92.5 KiB | 12,648 |
| 80 | 146 µs | 201 µs | 445 µs | 188.5 KiB | 6,833 |
| 160 | 287 µs | 408 µs | 863 µs | 393.8 KiB | 3,480 |
| 320 | 544 µs | 615 µs | 1.40 ms | 855.1 KiB | 1,839 |
| 640 | 1.18 ms | 1.56 ms | 2.93 ms | 1.9 MiB | 849 |
| 1280 | 4.96 ms | 5.24 ms | 7.32 ms | 4.4 MiB | 202 |
| 2560 | 6.90 ms | 7.31 ms | 9.88 ms | 7.3 MiB | 145 |
| 5120 | 11.9 ms | 13.0 ms | 16.5 ms | 13.2 MiB | 84 |
| 10240 | 24.6 ms | 26.4 ms | 32.5 ms | 24.9 MiB | 41 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 54.7 µs | 61.6 µs | 217 µs | 54.1 KiB | 18,268 |
| 40 | 91.4 µs | 104 µs | 291 µs | 107.0 KiB | 10,938 |
| 80 | 179 µs | 236 µs | 587 µs | 217.3 KiB | 5,577 |
| 160 | 407 µs | 488 µs | 1.37 ms | 452.9 KiB | 2,459 |
| 320 | 710 µs | 914 µs | 1.96 ms | 970.6 KiB | 1,408 |
| 640 | 1.71 ms | 2.06 ms | 5.07 ms | 2.2 MiB | 583 |
| 1280 | 6.48 ms | 6.91 ms | 11.9 ms | 4.9 MiB | 154 |
| 2560 | 9.98 ms | 10.4 ms | 19.4 ms | 8.3 MiB | 100 |
| 5120 | 17.0 ms | 18.0 ms | 34.4 ms | 15.1 MiB | 59 |
| 10240 | 34.9 ms | 35.2 ms | 67.9 ms | 28.1 MiB | 29 |

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

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 47.2 µs | 52.8 µs | 48.8 µs | 47.0 KiB | 21,204 |
| 40 | 76.8 µs | 86.7 µs | 251 µs | 92.6 KiB | 13,022 |
| 80 | 141 µs | 206 µs | 434 µs | 188.4 KiB | 7,075 |
| 160 | 288 µs | 406 µs | 866 µs | 393.9 KiB | 3,472 |
| 320 | 552 µs | 766 µs | 1.42 ms | 852.0 KiB | 1,812 |
| 640 | 1.20 ms | 1.56 ms | 2.95 ms | 1.9 MiB | 836 |
| 1280 | 5.11 ms | 5.71 ms | 7.38 ms | 4.4 MiB | 196 |
| 2560 | 7.30 ms | 7.64 ms | 10.3 ms | 7.3 MiB | 137 |
| 5120 | 12.0 ms | 12.7 ms | 16.2 ms | 13.2 MiB | 83 |
| 10240 | 25.0 ms | 25.5 ms | 33.0 ms | 24.6 MiB | 40 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.02, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 54.9 µs | 60.3 µs | 218 µs | 54.2 KiB | 18,218 |
| 40 | 91.0 µs | 102 µs | 290 µs | 107.0 KiB | 10,989 |
| 80 | 175 µs | 232 µs | 546 µs | 217.3 KiB | 5,725 |
| 160 | 343 µs | 481 µs | 1.03 ms | 450.1 KiB | 2,919 |
| 320 | 878 µs | 1.00 ms | 3.25 ms | 975.7 KiB | 1,139 |
| 640 | 1.64 ms | 2.02 ms | 4.98 ms | 2.2 MiB | 610 |
| 1280 | 6.39 ms | 6.69 ms | 12.1 ms | 4.9 MiB | 156 |
| 2560 | 9.74 ms | 10.5 ms | 19.6 ms | 8.3 MiB | 103 |
| 5120 | 17.5 ms | 18.3 ms | 35.1 ms | 15.0 MiB | 57 |
| 10240 | 34.0 ms | 34.9 ms | 67.2 ms | 28.5 MiB | 29 |

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

**Measured: O(n log n)** (exponent 1.21, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 33.8 µs | 48.9 µs | 34.3 µs | 30.5 KiB | 29,630 |
| 40 | 43.2 µs | 55.5 µs | 141 µs | 55.2 KiB | 23,139 |
| 80 | 78.6 µs | 101 µs | 247 µs | 104.6 KiB | 12,723 |
| 160 | 153 µs | 206 µs | 469 µs | 208.3 KiB | 6,548 |
| 320 | 272 µs | 397 µs | 651 µs | 402.1 KiB | 3,681 |
| 640 | 280 µs | 314 µs | 865 µs | 620.0 KiB | 3,576 |
| 1280 | 1.16 ms | 1.24 ms | 3.15 ms | 1.3 MiB | 866 |
| 2560 | 2.19 ms | 2.29 ms | 4.73 ms | 2.7 MiB | 456 |
| 5120 | 4.45 ms | 4.55 ms | 8.03 ms | 5.5 MiB | 225 |
| 10240 | 9.31 ms | 9.49 ms | 15.8 ms | 10.8 MiB | 107 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent 0.00, 10 sizes) -- ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 278 µs | 298 µs | 845 µs | 620.2 KiB | 3,600 |
| 40 | 281 µs | 302 µs | 865 µs | 620.3 KiB | 3,554 |
| 80 | 287 µs | 308 µs | 870 µs | 626.2 KiB | 3,482 |
| 160 | 301 µs | 414 µs | 878 µs | 667.5 KiB | 3,317 |
| 320 | 327 µs | 346 µs | 900 µs | 716.3 KiB | 3,058 |
| 640 | 419 µs | 446 µs | 1.28 ms | 834.3 KiB | 2,389 |
| 1280 | 418 µs | 447 µs | 1.28 ms | 834.3 KiB | 2,391 |
| 2560 | 422 µs | 459 µs | 1.30 ms | 834.3 KiB | 2,370 |
| 5120 | 423 µs | 449 µs | 1.29 ms | 834.3 KiB | 2,363 |
| 10240 | 418 µs | 445 µs | 1.28 ms | 834.3 KiB | 2,393 |

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

**Measured: O(n)** (exponent 1.04, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 206 µs | 221 µs | 586 µs | 45.6 KiB | 4,846 |
| 40 | 429 µs | 453 µs | 1.18 ms | 90.2 KiB | 2,329 |
| 80 | 870 µs | 897 µs | 1.67 ms | 178.6 KiB | 1,149 |
| 160 | 1.61 ms | 1.65 ms | 3.17 ms | 357.3 KiB | 620 |
| 320 | 2.83 ms | 2.95 ms | 4.72 ms | 712.3 KiB | 354 |
| 640 | 5.31 ms | 5.46 ms | 7.27 ms | 1.4 MiB | 188 |
| 1280 | 10.7 ms | 10.8 ms | 12.8 ms | 2.8 MiB | 94 |
| 2560 | 20.8 ms | 21.1 ms | 23.0 ms | 5.7 MiB | 48 |
| 5120 | 42.0 ms | 42.2 ms | 42.4 ms | 11.3 MiB | 24 |
| 10240 | 96.9 ms | 97.1 ms | 97.4 ms | 22.7 MiB | 10 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.10, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.47 ms | 2.67 ms | 4.30 ms | 599.8 KiB | 405 |
| 40 | 4.43 ms | 4.55 ms | 6.33 ms | 1.2 MiB | 226 |
| 80 | 8.18 ms | 8.41 ms | 10.0 ms | 2.3 MiB | 122 |
| 160 | 15.5 ms | 16.0 ms | 17.2 ms | 4.6 MiB | 64 |
| 320 | 30.6 ms | 30.8 ms | 31.1 ms | 9.3 MiB | 33 |
| 640 | 69.6 ms | 69.7 ms | 70.0 ms | 18.5 MiB | 14 |
| 1280 | 172 ms | 174 ms | 173 ms | 37.0 MiB | 6 |
| 2560 | 369 ms | 371 ms | 369 ms | 73.9 MiB | 3 |
| 5120 | 749 ms | 761 ms | 767 ms | 147.7 MiB | 1 |
| 10240 | 1.53 s | 1.53 s | 1.56 s | 295.3 MiB | 1 |

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

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 110 µs | 144 µs | 393 µs | 98.0 KiB | 9,109 |
| 40 | 159 µs | 220 µs | 446 µs | 179.0 KiB | 6,283 |
| 80 | 277 µs | 338 µs | 756 µs | 322.3 KiB | 3,614 |
| 160 | 499 µs | 522 µs | 1.22 ms | 637.9 KiB | 2,003 |
| 320 | 979 µs | 1.11 ms | 2.46 ms | 1.2 MiB | 1,022 |
| 640 | 1.78 ms | 1.95 ms | 3.31 ms | 2.5 MiB | 562 |
| 1280 | 3.35 ms | 3.51 ms | 4.75 ms | 4.9 MiB | 299 |
| 2560 | 6.59 ms | 6.75 ms | 8.41 ms | 9.9 MiB | 152 |
| 5120 | 13.8 ms | 14.6 ms | 16.4 ms | 19.8 MiB | 73 |
| 10240 | 29.5 ms | 29.9 ms | 34.0 ms | 39.6 MiB | 34 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.15, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 100 µs | 116 µs | 339 µs | 281.1 KiB | 9,985 |
| 40 | 173 µs | 187 µs | 460 µs | 539.5 KiB | 5,790 |
| 80 | 328 µs | 362 µs | 804 µs | 1.0 MiB | 3,049 |
| 160 | 626 µs | 658 µs | 1.37 ms | 2.1 MiB | 1,598 |
| 320 | 1.29 ms | 1.35 ms | 2.75 ms | 4.2 MiB | 776 |
| 640 | 2.47 ms | 2.58 ms | 4.08 ms | 8.3 MiB | 405 |
| 1280 | 4.88 ms | 5.04 ms | 6.77 ms | 16.7 MiB | 205 |
| 2560 | 9.55 ms | 9.86 ms | 11.9 ms | 33.3 MiB | 105 |
| 5120 | 24.1 ms | 24.7 ms | 27.5 ms | 52.0 MiB | 42 |
| 10240 | 59.5 ms | 60.0 ms | 68.8 ms | 103.7 MiB | 17 |

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
| 20 | 107 µs | 131 µs | 110 µs | 57.4 KiB | 9,359 |
| 40 | 190 µs | 218 µs | 193 µs | 113.5 KiB | 5,259 |
| 80 | 355 µs | 382 µs | 359 µs | 225.7 KiB | 2,813 |
| 160 | 599 µs | 727 µs | 2.00 ms | 450.0 KiB | 1,669 |
| 320 | 965 µs | 1.01 ms | 2.35 ms | 898.9 KiB | 1,037 |
| 640 | 1.77 ms | 1.87 ms | 3.20 ms | 1.8 MiB | 566 |
| 1280 | 3.40 ms | 3.65 ms | 4.85 ms | 3.5 MiB | 294 |
| 2560 | 6.66 ms | 7.02 ms | 6.96 ms | 7.0 MiB | 150 |
| 5120 | 13.6 ms | 13.9 ms | 13.6 ms | 14.0 MiB | 74 |
| 10240 | 27.6 ms | 28.0 ms | 28.1 ms | 28.1 MiB | 36 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.98, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 100 µs | 125 µs | 104 µs | 57.4 KiB | 9,966 |
| 40 | 186 µs | 212 µs | 190 µs | 113.5 KiB | 5,380 |
| 80 | 356 µs | 382 µs | 1.17 ms | 225.7 KiB | 2,805 |
| 160 | 559 µs | 587 µs | 1.78 ms | 450.0 KiB | 1,789 |
| 320 | 968 µs | 1.00 ms | 2.28 ms | 898.9 KiB | 1,033 |
| 640 | 1.80 ms | 1.85 ms | 3.29 ms | 1.8 MiB | 557 |
| 1280 | 3.47 ms | 3.54 ms | 5.36 ms | 3.5 MiB | 288 |
| 2560 | 6.71 ms | 6.88 ms | 8.42 ms | 7.0 MiB | 149 |
| 5120 | 13.6 ms | 13.7 ms | 16.6 ms | 14.0 MiB | 74 |
| 10240 | 27.0 ms | 27.5 ms | 32.7 ms | 28.1 MiB | 37 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 497 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 316 µs | 316 µs | 64% |
| `run-policies` | 1 | 146 µs | 146 µs | 29% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 34.5 µs | 6.9% |

**At 10240 checks** (whole operation: 62.9 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 36.7 ms | 36.7 ms | 58% |
| `run-policies` | 1 | 24.6 ms | 24.6 ms | 39% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 1.64 ms | 2.6% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-02T15:32:38.145Z` → `2026-11-02T15:34:13.716Z` (96 s), ci: CI (run 41469808794)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15984 MB RAM, linux/x64, Node v24.22.1, GitHub Actions
- Git: `681e9b7117407b93ad93a09625dc294ab5bdcc1b` on `feat/affected-scope`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

