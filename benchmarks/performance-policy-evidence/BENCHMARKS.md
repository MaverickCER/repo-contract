# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **184 µs** per operation compared with a bare-minimum baseline (**120% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.05). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 184 µs | 40.8 ms |
| Added latency, relative to baseline | 120% | 245% |
| Added CPU time per operation | 350 µs | 42.8 ms |
| Added memory per operation (heap delta) | 345.2 KiB | 44.0 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 5,446 ops/s | 25 ops/s |

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
| 20 | 43.4 µs | 122 µs | 78.4 µs | 181% | 294 µs | $0.00016 – $0.0033 |
| 40 | 79.0 µs | 192 µs | 113 µs | 143% | 290 µs | $0.00024 – $0.0033 |
| 80 | 153 µs | 337 µs | 184 µs | 120% | 350 µs | $0.00038 – $0.0039 |
| 160 | 298 µs | 652 µs | 354 µs | 119% | 579 µs | $0.00074 – $0.0065 |
| 320 | 580 µs | 1.30 ms | 720 µs | 124% | 1.31 ms | $0.0015 – $0.015 |
| 640 | 1.16 ms | 2.55 ms | 1.39 ms | 120% | 1.71 ms | $0.0029 – $0.019 |
| 1280 | 2.18 ms | 10.2 ms | 8.05 ms | 368% | 8.57 ms | $0.017 – $0.096 |
| 2560 | 4.23 ms | 15.6 ms | 11.4 ms | 269% | 11.9 ms | $0.024 – $0.134 |
| 5120 | 8.40 ms | 28.7 ms | 20.3 ms | 242% | 22.0 ms | $0.042 – $0.247 |
| 10240 | 16.7 ms | 57.4 ms | 40.8 ms | 245% | 42.8 ms | $0.085 – $0.481 |

**How the total grows:** O(n) (linear), exponent 1.05 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 224 µs | 31.1 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 2.24 ms | 318 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 110 µs | 23.9 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 141 µs | 32.0 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 112 µs | 22.1 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 128 µs | 31.8 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n log n) | ✅ matches | 56.4 µs | 7.58 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 209 µs | 286 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 562 µs | 58.2 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n) | ✅ matches | 5.43 ms | 638 ms |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 190 µs | 24.1 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 265 µs | 58.5 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 269 µs | 21.3 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 267 µs | 22.0 ms |

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

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 64.4 µs | 66.4 µs | 190 µs | 52.8 KiB | 15,532 |
| 40 | 119 µs | 125 µs | 327 µs | 104.4 KiB | 8,377 |
| 80 | 224 µs | 260 µs | 538 µs | 211.2 KiB | 4,463 |
| 160 | 450 µs | 478 µs | 1.07 ms | 436.3 KiB | 2,223 |
| 320 | 824 µs | 887 µs | 1.49 ms | 938.5 KiB | 1,214 |
| 640 | 1.68 ms | 1.74 ms | 3.02 ms | 2.1 MiB | 596 |
| 1280 | 6.09 ms | 6.35 ms | 7.55 ms | 4.7 MiB | 164 |
| 2560 | 9.27 ms | 9.55 ms | 11.3 ms | 8.0 MiB | 108 |
| 5120 | 16.7 ms | 18.9 ms | 19.6 ms | 14.5 MiB | 60 |
| 10240 | 31.1 ms | 31.9 ms | 34.6 ms | 27.5 MiB | 32 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.07, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 601 µs | 618 µs | 1.25 ms | 294.9 KiB | 1,664 |
| 40 | 1.21 ms | 1.22 ms | 2.54 ms | 587.1 KiB | 830 |
| 80 | 2.24 ms | 2.71 ms | 3.68 ms | 1.1 MiB | 447 |
| 160 | 4.31 ms | 4.38 ms | 5.99 ms | 2.3 MiB | 232 |
| 320 | 8.44 ms | 8.55 ms | 10.6 ms | 4.7 MiB | 118 |
| 640 | 16.8 ms | 16.9 ms | 19.9 ms | 9.8 MiB | 59 |
| 1280 | 36.5 ms | 40.6 ms | 42.4 ms | 20.1 MiB | 27 |
| 2560 | 72.8 ms | 76.3 ms | 82.5 ms | 38.7 MiB | 14 |
| 5120 | 170 ms | 177 ms | 271 ms | 73.5 MiB | 6 |
| 10240 | 318 ms | 320 ms | 489 ms | 145.3 MiB | 3 |

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

**Measured: O(n)** (exponent 1.09, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 33.7 µs | 43.2 µs | 35.6 µs | 47.0 KiB | 29,718 |
| 40 | 51.3 µs | 66.4 µs | 161 µs | 92.4 KiB | 19,494 |
| 80 | 110 µs | 135 µs | 335 µs | 188.4 KiB | 9,099 |
| 160 | 195 µs | 273 µs | 560 µs | 393.3 KiB | 5,121 |
| 320 | 420 µs | 548 µs | 1.23 ms | 855.2 KiB | 2,383 |
| 640 | 889 µs | 1.18 ms | 2.32 ms | 1.9 MiB | 1,125 |
| 1280 | 4.29 ms | 4.77 ms | 6.60 ms | 4.4 MiB | 233 |
| 2560 | 6.42 ms | 7.04 ms | 9.02 ms | 7.3 MiB | 156 |
| 5120 | 11.4 ms | 12.0 ms | 15.2 ms | 13.2 MiB | 88 |
| 10240 | 23.9 ms | 24.4 ms | 31.0 ms | 24.3 MiB | 42 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.05, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 40.1 µs | 43.8 µs | 126 µs | 54.1 KiB | 24,945 |
| 40 | 73.0 µs | 83.9 µs | 231 µs | 106.9 KiB | 13,698 |
| 80 | 141 µs | 169 µs | 445 µs | 217.3 KiB | 7,096 |
| 160 | 273 µs | 341 µs | 825 µs | 451.7 KiB | 3,658 |
| 320 | 576 µs | 722 µs | 1.75 ms | 970.6 KiB | 1,735 |
| 640 | 1.41 ms | 1.72 ms | 4.49 ms | 2.2 MiB | 708 |
| 1280 | 6.17 ms | 7.20 ms | 11.3 ms | 4.9 MiB | 162 |
| 2560 | 8.23 ms | 8.71 ms | 16.9 ms | 8.3 MiB | 122 |
| 5120 | 17.2 ms | 18.0 ms | 33.6 ms | 14.9 MiB | 58 |
| 10240 | 32.0 ms | 32.5 ms | 61.3 ms | 28.1 MiB | 31 |

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

**Measured: O(n)** (exponent 1.07, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 32.6 µs | 36.4 µs | 32.9 µs | 47.0 KiB | 30,706 |
| 40 | 56.5 µs | 67.4 µs | 180 µs | 92.6 KiB | 17,690 |
| 80 | 112 µs | 137 µs | 319 µs | 188.3 KiB | 8,902 |
| 160 | 195 µs | 276 µs | 567 µs | 393.6 KiB | 5,122 |
| 320 | 413 µs | 543 µs | 1.21 ms | 856.1 KiB | 2,420 |
| 640 | 870 µs | 1.17 ms | 2.40 ms | 1.9 MiB | 1,150 |
| 1280 | 4.22 ms | 4.55 ms | 6.37 ms | 4.4 MiB | 237 |
| 2560 | 5.98 ms | 6.27 ms | 8.32 ms | 7.3 MiB | 167 |
| 5120 | 10.7 ms | 11.7 ms | 14.4 ms | 13.2 MiB | 93 |
| 10240 | 22.1 ms | 22.5 ms | 29.1 ms | 24.5 MiB | 45 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.06, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 40.3 µs | 43.4 µs | 145 µs | 54.2 KiB | 24,813 |
| 40 | 64.7 µs | 82.7 µs | 203 µs | 106.9 KiB | 15,455 |
| 80 | 128 µs | 166 µs | 397 µs | 217.2 KiB | 7,807 |
| 160 | 269 µs | 340 µs | 810 µs | 451.7 KiB | 3,722 |
| 320 | 548 µs | 700 µs | 1.69 ms | 970.6 KiB | 1,825 |
| 640 | 1.32 ms | 1.60 ms | 4.32 ms | 2.2 MiB | 759 |
| 1280 | 5.78 ms | 6.09 ms | 11.2 ms | 4.9 MiB | 173 |
| 2560 | 9.03 ms | 9.45 ms | 18.0 ms | 8.3 MiB | 111 |
| 5120 | 15.3 ms | 16.5 ms | 30.5 ms | 15.1 MiB | 65 |
| 10240 | 31.8 ms | 32.5 ms | 61.3 ms | 28.1 MiB | 31 |

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

**Measured: O(n log n)** (exponent 1.26, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 22.2 µs | 31.8 µs | 22.7 µs | 30.4 KiB | 45,034 |
| 40 | 29.7 µs | 41.3 µs | 90.8 µs | 55.1 KiB | 33,622 |
| 80 | 56.4 µs | 77.1 µs | 169 µs | 104.6 KiB | 17,733 |
| 160 | 105 µs | 189 µs | 299 µs | 207.3 KiB | 9,526 |
| 320 | 192 µs | 265 µs | 525 µs | 402.0 KiB | 5,204 |
| 640 | 205 µs | 225 µs | 581 µs | 615.2 KiB | 4,873 |
| 1280 | 815 µs | 864 µs | 1.69 ms | 1.3 MiB | 1,227 |
| 2560 | 1.79 ms | 1.89 ms | 3.96 ms | 2.7 MiB | 557 |
| 5120 | 3.68 ms | 3.77 ms | 6.96 ms | 5.5 MiB | 272 |
| 10240 | 7.58 ms | 7.79 ms | 13.5 ms | 10.8 MiB | 132 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent -0.01, 10 sizes) -- ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 203 µs | 227 µs | 573 µs | 616.4 KiB | 4,929 |
| 40 | 203 µs | 219 µs | 567 µs | 618.2 KiB | 4,936 |
| 80 | 209 µs | 224 µs | 577 µs | 625.9 KiB | 4,775 |
| 160 | 217 µs | 233 µs | 584 µs | 663.4 KiB | 4,599 |
| 320 | 236 µs | 257 µs | 605 µs | 722.7 KiB | 4,234 |
| 640 | 291 µs | 314 µs | 781 µs | 829.2 KiB | 3,441 |
| 1280 | 286 µs | 318 µs | 769 µs | 829.2 KiB | 3,495 |
| 2560 | 289 µs | 316 µs | 778 µs | 829.2 KiB | 3,462 |
| 5120 | 285 µs | 307 µs | 768 µs | 829.2 KiB | 3,507 |
| 10240 | 286 µs | 300 µs | 773 µs | 829.2 KiB | 3,498 |

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

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 141 µs | 151 µs | 396 µs | 45.5 KiB | 7,080 |
| 40 | 267 µs | 279 µs | 701 µs | 115.7 KiB | 3,744 |
| 80 | 562 µs | 581 µs | 1.23 ms | 178.6 KiB | 1,779 |
| 160 | 1.09 ms | 1.13 ms | 2.43 ms | 357.3 KiB | 919 |
| 320 | 1.98 ms | 2.10 ms | 3.55 ms | 712.3 KiB | 505 |
| 640 | 3.65 ms | 3.74 ms | 5.32 ms | 1.4 MiB | 274 |
| 1280 | 7.37 ms | 7.64 ms | 9.32 ms | 2.8 MiB | 136 |
| 2560 | 13.7 ms | 14.8 ms | 15.9 ms | 5.7 MiB | 73 |
| 5120 | 27.2 ms | 27.3 ms | 30.4 ms | 11.3 MiB | 37 |
| 10240 | 58.2 ms | 58.6 ms | 62.3 ms | 22.7 MiB | 17 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.02, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.70 ms | 1.86 ms | 3.25 ms | 599.8 KiB | 587 |
| 40 | 2.99 ms | 4.62 ms | 4.64 ms | 1.2 MiB | 334 |
| 80 | 5.43 ms | 5.63 ms | 7.16 ms | 2.3 MiB | 184 |
| 160 | 9.95 ms | 10.2 ms | 11.9 ms | 4.6 MiB | 100 |
| 320 | 19.1 ms | 19.3 ms | 21.6 ms | 9.3 MiB | 52 |
| 640 | 37.3 ms | 38.0 ms | 40.5 ms | 18.5 MiB | 27 |
| 1280 | 76.3 ms | 77.0 ms | 80.8 ms | 37.0 MiB | 13 |
| 2560 | 155 ms | 156 ms | 163 ms | 73.9 MiB | 6 |
| 5120 | 317 ms | 320 ms | 331 ms | 147.7 MiB | 3 |
| 10240 | 638 ms | 642 ms | 670 ms | 295.3 MiB | 2 |

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

**Measured: O(n)** (exponent 1.03, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 72.2 µs | 96.8 µs | 242 µs | 98.0 KiB | 13,848 |
| 40 | 113 µs | 151 µs | 311 µs | 178.9 KiB | 8,846 |
| 80 | 190 µs | 210 µs | 485 µs | 322.2 KiB | 5,273 |
| 160 | 360 µs | 410 µs | 764 µs | 637.7 KiB | 2,775 |
| 320 | 699 µs | 772 µs | 1.34 ms | 1.2 MiB | 1,431 |
| 640 | 1.39 ms | 1.47 ms | 2.65 ms | 2.5 MiB | 720 |
| 1280 | 2.69 ms | 2.80 ms | 3.85 ms | 4.9 MiB | 372 |
| 2560 | 5.38 ms | 5.59 ms | 7.12 ms | 9.9 MiB | 186 |
| 5120 | 11.4 ms | 11.8 ms | 13.8 ms | 19.8 MiB | 88 |
| 10240 | 24.1 ms | 25.8 ms | 27.9 ms | 39.6 MiB | 41 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.19, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 69.9 µs | 80.1 µs | 203 µs | 281.2 KiB | 14,306 |
| 40 | 130 µs | 150 µs | 331 µs | 539.2 KiB | 7,679 |
| 80 | 265 µs | 281 µs | 662 µs | 1.0 MiB | 3,768 |
| 160 | 524 µs | 551 µs | 1.14 ms | 2.1 MiB | 1,908 |
| 320 | 1.19 ms | 1.30 ms | 2.51 ms | 4.2 MiB | 837 |
| 640 | 2.18 ms | 2.35 ms | 3.54 ms | 8.3 MiB | 458 |
| 1280 | 4.49 ms | 4.61 ms | 6.11 ms | 16.7 MiB | 223 |
| 2560 | 9.15 ms | 9.31 ms | 11.4 ms | 33.3 MiB | 109 |
| 5120 | 24.5 ms | 31.6 ms | 28.0 ms | 51.9 MiB | 41 |
| 10240 | 58.5 ms | 61.0 ms | 67.0 ms | 103.7 MiB | 17 |

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
| 20 | 79.7 µs | 97.3 µs | 82.0 µs | 57.4 KiB | 12,539 |
| 40 | 143 µs | 171 µs | 146 µs | 113.5 KiB | 6,969 |
| 80 | 269 µs | 285 µs | 272 µs | 225.7 KiB | 3,715 |
| 160 | 458 µs | 499 µs | 1.64 ms | 450.0 KiB | 2,185 |
| 320 | 764 µs | 822 µs | 1.96 ms | 898.9 KiB | 1,310 |
| 640 | 1.36 ms | 1.53 ms | 2.40 ms | 1.8 MiB | 737 |
| 1280 | 2.67 ms | 2.79 ms | 3.72 ms | 3.5 MiB | 375 |
| 2560 | 5.02 ms | 5.12 ms | 5.28 ms | 6.9 MiB | 199 |
| 5120 | 10.5 ms | 10.9 ms | 10.7 ms | 13.8 MiB | 95 |
| 10240 | 21.3 ms | 21.7 ms | 21.6 ms | 27.7 MiB | 47 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 74.1 µs | 87.2 µs | 77.0 µs | 56.5 KiB | 13,493 |
| 40 | 136 µs | 155 µs | 139 µs | 111.8 KiB | 7,327 |
| 80 | 267 µs | 282 µs | 270 µs | 222.5 KiB | 3,749 |
| 160 | 434 µs | 461 µs | 1.51 ms | 443.7 KiB | 2,305 |
| 320 | 755 µs | 938 µs | 1.91 ms | 886.2 KiB | 1,324 |
| 640 | 1.40 ms | 1.43 ms | 2.74 ms | 1.7 MiB | 715 |
| 1280 | 2.67 ms | 2.68 ms | 4.20 ms | 3.5 MiB | 375 |
| 2560 | 5.11 ms | 5.29 ms | 6.52 ms | 6.9 MiB | 196 |
| 5120 | 11.2 ms | 17.6 ms | 14.4 ms | 13.8 MiB | 89 |
| 10240 | 22.0 ms | 23.5 ms | 27.3 ms | 27.7 MiB | 46 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 337 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 224 µs | 224 µs | 66% |
| `run-policies` | 1 | 110 µs | 110 µs | 33% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 3.16 µs | 0.9% |

**At 10240 checks** (whole operation: 57.4 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 31.1 ms | 31.1 ms | 54% |
| `run-policies` | 1 | 23.9 ms | 23.9 ms | 42% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 2.40 ms | 4.2% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-26T09:44:03.642Z` → `2026-10-26T09:45:15.485Z` (72 s), ci: CI (run 40300171082)
- Machine: AMD EPYC 9V74 80-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `01e446d8ae3f1d815cf4deb1ba15902ebdb1a598` on `dependabot/npm_and_yarn/dev-dependencies-6c9b387527`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

