# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **293 µs** per operation compared with a bare-minimum baseline (**138% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.98). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 293 µs | 44.4 ms |
| Added latency, relative to baseline | 138% | 208% |
| Added CPU time per operation | 674 µs | 48.6 ms |
| Added memory per operation (heap delta) | 345.9 KiB | 44.9 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,417 ops/s | 23 ops/s |

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
| 20 | 60.8 µs | 162 µs | 101 µs | 166% | 314 µs | $0.00021 – $0.0035 |
| 40 | 110 µs | 280 µs | 171 µs | 155% | 455 µs | $0.00036 – $0.0051 |
| 80 | 212 µs | 505 µs | 293 µs | 138% | 674 µs | $0.00061 – $0.0076 |
| 160 | 424 µs | 1.01 ms | 583 µs | 138% | 1.35 ms | $0.0012 – $0.015 |
| 320 | 770 µs | 1.77 ms | 999 µs | 130% | 1.66 ms | $0.0021 – $0.019 |
| 640 | 1.54 ms | 3.51 ms | 1.97 ms | 128% | 2.28 ms | $0.0041 – $0.026 |
| 1280 | 2.86 ms | 12.8 ms | 9.97 ms | 349% | 10.4 ms | $0.021 – $0.117 |
| 2560 | 5.50 ms | 20.7 ms | 15.2 ms | 277% | 16.1 ms | $0.032 – $0.181 |
| 5120 | 10.8 ms | 33.5 ms | 22.7 ms | 210% | 25.0 ms | $0.047 – $0.281 |
| 10240 | 21.4 ms | 65.8 ms | 44.4 ms | 208% | 48.6 ms | $0.093 – $0.546 |

**How the total grows:** O(n) (linear), exponent 0.98 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 315 µs | 37.1 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 2.95 ms | 409 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 150 µs | 27.2 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 193 µs | 40.8 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 152 µs | 26.9 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 193 µs | 37.7 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n) | 🟡 close (neighbouring class) | 78.1 µs | 10.2 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 287 µs | 414 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 757 µs | 99.6 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 7.59 ms | 1.56 s |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 281 µs | 29.1 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 322 µs | 66.0 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 360 µs | 26.8 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 351 µs | 28.8 ms |

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
| 20 | 88.4 µs | 100 µs | 272 µs | 52.8 KiB | 11,309 |
| 40 | 176 µs | 190 µs | 541 µs | 104.6 KiB | 5,680 |
| 80 | 315 µs | 323 µs | 803 µs | 211.4 KiB | 3,177 |
| 160 | 591 µs | 625 µs | 1.32 ms | 436.2 KiB | 1,692 |
| 320 | 1.18 ms | 1.26 ms | 2.67 ms | 938.9 KiB | 850 |
| 640 | 2.16 ms | 2.28 ms | 3.71 ms | 2.1 MiB | 464 |
| 1280 | 7.20 ms | 7.50 ms | 8.70 ms | 4.7 MiB | 139 |
| 2560 | 11.2 ms | 11.7 ms | 13.3 ms | 8.0 MiB | 89 |
| 5120 | 19.9 ms | 21.0 ms | 22.6 ms | 14.5 MiB | 50 |
| 10240 | 37.1 ms | 37.4 ms | 41.3 ms | 27.6 MiB | 27 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.06, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 798 µs | 831 µs | 1.56 ms | 294.9 KiB | 1,253 |
| 40 | 1.58 ms | 1.62 ms | 3.15 ms | 587.0 KiB | 634 |
| 80 | 2.95 ms | 3.52 ms | 4.63 ms | 1.1 MiB | 339 |
| 160 | 5.64 ms | 5.71 ms | 7.55 ms | 2.3 MiB | 177 |
| 320 | 11.0 ms | 11.2 ms | 13.3 ms | 4.7 MiB | 91 |
| 640 | 21.8 ms | 22.0 ms | 25.0 ms | 9.8 MiB | 46 |
| 1280 | 46.4 ms | 49.5 ms | 52.5 ms | 20.1 MiB | 22 |
| 2560 | 89.9 ms | 98.5 ms | 99.3 ms | 38.7 MiB | 11 |
| 5120 | 206 ms | 207 ms | 306 ms | 73.5 MiB | 5 |
| 10240 | 409 ms | 412 ms | 615 ms | 145.3 MiB | 2 |

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

**Measured: O(n)** (exponent 1.04, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 50.9 µs | 62.3 µs | 52.9 µs | 47.0 KiB | 19,662 |
| 40 | 75.9 µs | 101 µs | 241 µs | 92.5 KiB | 13,171 |
| 80 | 150 µs | 200 µs | 454 µs | 188.5 KiB | 6,670 |
| 160 | 289 µs | 409 µs | 863 µs | 391.5 KiB | 3,461 |
| 320 | 552 µs | 750 µs | 1.43 ms | 855.1 KiB | 1,813 |
| 640 | 1.16 ms | 1.32 ms | 2.86 ms | 1.9 MiB | 860 |
| 1280 | 5.06 ms | 5.27 ms | 7.10 ms | 4.4 MiB | 198 |
| 2560 | 7.22 ms | 7.83 ms | 9.99 ms | 7.3 MiB | 138 |
| 5120 | 12.6 ms | 14.1 ms | 16.9 ms | 13.2 MiB | 80 |
| 10240 | 27.2 ms | 27.9 ms | 36.4 ms | 24.7 MiB | 37 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.08, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 53.8 µs | 60.6 µs | 205 µs | 54.1 KiB | 18,601 |
| 40 | 94.7 µs | 121 µs | 297 µs | 107.0 KiB | 10,556 |
| 80 | 193 µs | 239 µs | 619 µs | 217.5 KiB | 5,178 |
| 160 | 354 µs | 474 µs | 1.07 ms | 451.7 KiB | 2,822 |
| 320 | 700 µs | 917 µs | 1.94 ms | 962.8 KiB | 1,430 |
| 640 | 1.63 ms | 1.97 ms | 5.01 ms | 2.2 MiB | 613 |
| 1280 | 6.68 ms | 7.05 ms | 12.5 ms | 4.9 MiB | 150 |
| 2560 | 10.8 ms | 11.3 ms | 20.8 ms | 8.3 MiB | 93 |
| 5120 | 18.8 ms | 20.8 ms | 36.6 ms | 15.1 MiB | 53 |
| 10240 | 40.8 ms | 42.5 ms | 75.9 ms | 28.3 MiB | 25 |

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

**Measured: O(n)** (exponent 1.03, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 48.8 µs | 54.2 µs | 189 µs | 46.9 KiB | 20,478 |
| 40 | 77.5 µs | 101 µs | 242 µs | 92.6 KiB | 12,902 |
| 80 | 152 µs | 207 µs | 475 µs | 188.5 KiB | 6,580 |
| 160 | 293 µs | 419 µs | 878 µs | 392.9 KiB | 3,416 |
| 320 | 562 µs | 756 µs | 1.46 ms | 856.0 KiB | 1,778 |
| 640 | 1.21 ms | 1.30 ms | 2.96 ms | 1.9 MiB | 829 |
| 1280 | 5.07 ms | 5.40 ms | 7.47 ms | 4.4 MiB | 197 |
| 2560 | 7.47 ms | 7.92 ms | 10.2 ms | 7.3 MiB | 134 |
| 5120 | 12.8 ms | 13.6 ms | 17.7 ms | 13.2 MiB | 78 |
| 10240 | 26.9 ms | 27.3 ms | 35.6 ms | 24.7 MiB | 37 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.06, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 57.3 µs | 62.4 µs | 221 µs | 54.2 KiB | 17,444 |
| 40 | 97.6 µs | 122 µs | 300 µs | 107.0 KiB | 10,248 |
| 80 | 193 µs | 237 µs | 632 µs | 217.5 KiB | 5,180 |
| 160 | 359 µs | 482 µs | 1.07 ms | 451.7 KiB | 2,789 |
| 320 | 708 µs | 766 µs | 1.95 ms | 970.6 KiB | 1,412 |
| 640 | 1.66 ms | 2.00 ms | 5.07 ms | 2.2 MiB | 603 |
| 1280 | 6.40 ms | 8.54 ms | 12.5 ms | 4.9 MiB | 156 |
| 2560 | 10.4 ms | 11.1 ms | 20.6 ms | 8.3 MiB | 96 |
| 5120 | 18.6 ms | 19.2 ms | 36.3 ms | 15.1 MiB | 54 |
| 10240 | 37.7 ms | 38.2 ms | 72.5 ms | 28.4 MiB | 27 |

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

**Measured: O(n)** (exponent 1.07, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 31.8 µs | 46.1 µs | 32.9 µs | 30.5 KiB | 31,473 |
| 40 | 41.7 µs | 55.0 µs | 135 µs | 55.2 KiB | 23,979 |
| 80 | 78.1 µs | 100 µs | 246 µs | 104.6 KiB | 12,800 |
| 160 | 150 µs | 276 µs | 463 µs | 208.3 KiB | 6,680 |
| 320 | 302 µs | 393 µs | 908 µs | 402.2 KiB | 3,316 |
| 640 | 508 µs | 714 µs | 1.39 ms | 821.1 KiB | 1,969 |
| 1280 | 1.23 ms | 1.32 ms | 3.23 ms | 1.3 MiB | 811 |
| 2560 | 2.51 ms | 3.06 ms | 5.06 ms | 2.7 MiB | 399 |
| 5120 | 4.95 ms | 5.13 ms | 8.86 ms | 5.5 MiB | 202 |
| 10240 | 10.2 ms | 10.6 ms | 17.4 ms | 10.8 MiB | 98 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent -0.00, 10 sizes) -- ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 285 µs | 323 µs | 872 µs | 620.2 KiB | 3,509 |
| 40 | 282 µs | 310 µs | 860 µs | 620.3 KiB | 3,548 |
| 80 | 287 µs | 310 µs | 861 µs | 626.2 KiB | 3,482 |
| 160 | 299 µs | 320 µs | 877 µs | 667.5 KiB | 3,348 |
| 320 | 323 µs | 335 µs | 891 µs | 716.3 KiB | 3,099 |
| 640 | 415 µs | 433 µs | 1.28 ms | 834.3 KiB | 2,409 |
| 1280 | 417 µs | 481 µs | 1.27 ms | 834.3 KiB | 2,399 |
| 2560 | 416 µs | 462 µs | 1.28 ms | 834.3 KiB | 2,403 |
| 5120 | 415 µs | 482 µs | 1.28 ms | 834.3 KiB | 2,409 |
| 10240 | 414 µs | 469 µs | 1.28 ms | 834.3 KiB | 2,413 |

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
| 20 | 204 µs | 217 µs | 574 µs | 45.6 KiB | 4,905 |
| 40 | 389 µs | 428 µs | 1.12 ms | 90.2 KiB | 2,570 |
| 80 | 757 µs | 786 µs | 1.53 ms | 178.6 KiB | 1,320 |
| 160 | 1.48 ms | 1.54 ms | 3.09 ms | 357.3 KiB | 674 |
| 320 | 2.72 ms | 2.81 ms | 4.59 ms | 712.3 KiB | 368 |
| 640 | 5.07 ms | 5.26 ms | 7.07 ms | 1.4 MiB | 197 |
| 1280 | 10.3 ms | 10.6 ms | 12.5 ms | 2.8 MiB | 97 |
| 2560 | 20.8 ms | 21.1 ms | 23.1 ms | 5.7 MiB | 48 |
| 5120 | 42.9 ms | 43.5 ms | 44.3 ms | 11.3 MiB | 23 |
| 10240 | 99.6 ms | 100 ms | 100 ms | 22.7 MiB | 10 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.11, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.22 ms | 2.39 ms | 4.02 ms | 599.8 KiB | 450 |
| 40 | 4.00 ms | 4.15 ms | 5.87 ms | 1.2 MiB | 250 |
| 80 | 7.59 ms | 7.82 ms | 9.60 ms | 2.3 MiB | 132 |
| 160 | 15.0 ms | 15.4 ms | 17.3 ms | 4.6 MiB | 66 |
| 320 | 30.0 ms | 30.9 ms | 30.4 ms | 9.3 MiB | 33 |
| 640 | 68.6 ms | 68.9 ms | 69.1 ms | 18.5 MiB | 15 |
| 1280 | 173 ms | 175 ms | 173 ms | 37.0 MiB | 6 |
| 2560 | 367 ms | 371 ms | 367 ms | 73.9 MiB | 3 |
| 5120 | 741 ms | 753 ms | 760 ms | 147.7 MiB | 1 |
| 10240 | 1.56 s | 1.60 s | 1.60 s | 295.3 MiB | 1 |

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
| 20 | 107 µs | 147 µs | 392 µs | 98.0 KiB | 9,306 |
| 40 | 163 µs | 229 µs | 520 µs | 179.0 KiB | 6,127 |
| 80 | 281 µs | 416 µs | 750 µs | 328.4 KiB | 3,565 |
| 160 | 495 µs | 552 µs | 1.23 ms | 637.9 KiB | 2,022 |
| 320 | 890 µs | 955 µs | 1.63 ms | 1.2 MiB | 1,124 |
| 640 | 1.77 ms | 1.88 ms | 3.31 ms | 2.5 MiB | 564 |
| 1280 | 3.36 ms | 3.54 ms | 5.03 ms | 4.9 MiB | 298 |
| 2560 | 6.72 ms | 6.94 ms | 8.64 ms | 9.9 MiB | 149 |
| 5120 | 13.8 ms | 14.9 ms | 16.7 ms | 19.8 MiB | 72 |
| 10240 | 29.1 ms | 31.0 ms | 33.9 ms | 39.6 MiB | 34 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.19, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 93.6 µs | 99.7 µs | 300 µs | 281.1 KiB | 10,689 |
| 40 | 165 µs | 207 µs | 456 µs | 539.5 KiB | 6,072 |
| 80 | 322 µs | 353 µs | 803 µs | 1.0 MiB | 3,108 |
| 160 | 639 µs | 709 µs | 1.38 ms | 2.1 MiB | 1,565 |
| 320 | 1.33 ms | 1.59 ms | 2.87 ms | 4.2 MiB | 751 |
| 640 | 2.54 ms | 2.85 ms | 4.11 ms | 8.3 MiB | 394 |
| 1280 | 5.11 ms | 5.51 ms | 7.01 ms | 16.7 MiB | 196 |
| 2560 | 10.6 ms | 11.2 ms | 13.2 ms | 33.3 MiB | 94 |
| 5120 | 28.6 ms | 30.8 ms | 33.1 ms | 52.0 MiB | 35 |
| 10240 | 66.0 ms | 68.9 ms | 77.3 ms | 103.7 MiB | 15 |

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
| 20 | 106 µs | 128 µs | 110 µs | 57.4 KiB | 9,425 |
| 40 | 191 µs | 210 µs | 195 µs | 113.5 KiB | 5,231 |
| 80 | 360 µs | 379 µs | 363 µs | 225.7 KiB | 2,778 |
| 160 | 546 µs | 705 µs | 1.72 ms | 450.0 KiB | 1,832 |
| 320 | 954 µs | 1.39 ms | 2.25 ms | 898.9 KiB | 1,048 |
| 640 | 1.76 ms | 1.83 ms | 3.21 ms | 1.8 MiB | 569 |
| 1280 | 3.28 ms | 3.52 ms | 4.42 ms | 3.5 MiB | 305 |
| 2560 | 6.38 ms | 6.51 ms | 6.66 ms | 6.9 MiB | 157 |
| 5120 | 13.3 ms | 13.6 ms | 13.5 ms | 13.8 MiB | 75 |
| 10240 | 26.8 ms | 28.3 ms | 27.3 ms | 27.7 MiB | 37 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 98.0 µs | 118 µs | 101 µs | 56.5 KiB | 10,207 |
| 40 | 180 µs | 200 µs | 183 µs | 111.8 KiB | 5,561 |
| 80 | 351 µs | 389 µs | 910 µs | 222.5 KiB | 2,847 |
| 160 | 532 µs | 574 µs | 1.71 ms | 443.7 KiB | 1,878 |
| 320 | 951 µs | 993 µs | 2.18 ms | 886.2 KiB | 1,051 |
| 640 | 1.76 ms | 1.86 ms | 3.38 ms | 1.7 MiB | 569 |
| 1280 | 3.38 ms | 3.43 ms | 5.09 ms | 3.5 MiB | 296 |
| 2560 | 6.51 ms | 6.92 ms | 8.49 ms | 6.9 MiB | 154 |
| 5120 | 13.0 ms | 14.0 ms | 16.2 ms | 13.8 MiB | 77 |
| 10240 | 28.8 ms | 29.5 ms | 34.6 ms | 27.7 MiB | 35 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 505 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 315 µs | 315 µs | 62% |
| `run-policies` | 1 | 150 µs | 150 µs | 30% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 40.0 µs | 7.9% |

**At 10240 checks** (whole operation: 65.8 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 37.1 ms | 37.1 ms | 56% |
| `run-policies` | 1 | 27.2 ms | 27.2 ms | 41% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 1.50 ms | 2.3% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-09T09:45:41.028Z` → `2026-11-09T09:47:17.198Z` (96 s), ci: CI (run 42593706694)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `5b578f6bcba1ac0f565579e06532e32659853e62` on `dependabot/npm_and_yarn/dev-dependencies-582d97ac1b`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

