# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **267 µs** per operation compared with a bare-minimum baseline (**159% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.98). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 267 µs | 33.5 ms |
| Added latency, relative to baseline | 159% | 204% |
| Added CPU time per operation | 844 µs | 35.6 ms |
| Added memory per operation (heap delta) | 345.9 KiB | 44.8 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,741 ops/s | 30 ops/s |

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
| 20 | 48.9 µs | 164 µs | 115 µs | 234% | 166 µs | $0.00024 – $0.0019 |
| 40 | 93.4 µs | 226 µs | 132 µs | 142% | 349 µs | $0.00028 – $0.0039 |
| 80 | 168 µs | 436 µs | 267 µs | 159% | 844 µs | $0.00056 – $0.0095 |
| 160 | 327 µs | 898 µs | 571 µs | 174% | 1.81 ms | $0.0012 – $0.020 |
| 320 | 616 µs | 1.50 ms | 885 µs | 144% | 1.74 ms | $0.0018 – $0.020 |
| 640 | 1.25 ms | 2.76 ms | 1.51 ms | 121% | 1.87 ms | $0.0032 – $0.021 |
| 1280 | 2.24 ms | 10.2 ms | 7.94 ms | 355% | 8.30 ms | $0.017 – $0.093 |
| 2560 | 4.23 ms | 15.5 ms | 11.3 ms | 267% | 11.6 ms | $0.024 – $0.130 |
| 5120 | 8.14 ms | 27.4 ms | 19.3 ms | 237% | 21.3 ms | $0.040 – $0.239 |
| 10240 | 16.4 ms | 49.9 ms | 33.5 ms | 204% | 35.6 ms | $0.070 – $0.401 |

**How the total grows:** O(n) (linear), exponent 0.98 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 238 µs | 29.9 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 2.56 ms | 330 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 127 µs | 20.3 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 171 µs | 30.0 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 133 µs | 19.5 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 171 µs | 30.1 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n log n) | ✅ matches | 68.4 µs | 8.34 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 233 µs | 320 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 592 µs | 62.5 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n) | ✅ matches | 5.95 ms | 764 ms |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 214 µs | 22.8 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 293 µs | 63.2 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 274 µs | 24.9 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 272 µs | 25.6 ms |

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
| 20 | 77.0 µs | 83.8 µs | 288 µs | 52.8 KiB | 12,994 |
| 40 | 135 µs | 144 µs | 426 µs | 104.4 KiB | 7,397 |
| 80 | 238 µs | 262 µs | 669 µs | 211.2 KiB | 4,194 |
| 160 | 488 µs | 522 µs | 1.37 ms | 436.3 KiB | 2,047 |
| 320 | 839 µs | 907 µs | 1.73 ms | 938.5 KiB | 1,192 |
| 640 | 1.63 ms | 1.77 ms | 3.09 ms | 2.1 MiB | 612 |
| 1280 | 6.19 ms | 6.44 ms | 8.35 ms | 4.7 MiB | 161 |
| 2560 | 9.29 ms | 11.4 ms | 11.7 ms | 8.0 MiB | 108 |
| 5120 | 15.3 ms | 17.8 ms | 17.1 ms | 14.5 MiB | 65 |
| 10240 | 29.9 ms | 32.0 ms | 33.8 ms | 27.5 MiB | 33 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.07, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 635 µs | 691 µs | 1.51 ms | 294.9 KiB | 1,574 |
| 40 | 1.33 ms | 1.38 ms | 3.28 ms | 587.1 KiB | 750 |
| 80 | 2.56 ms | 2.79 ms | 4.60 ms | 1.1 MiB | 391 |
| 160 | 4.44 ms | 4.62 ms | 6.71 ms | 2.3 MiB | 225 |
| 320 | 8.61 ms | 8.89 ms | 11.4 ms | 4.7 MiB | 116 |
| 640 | 16.8 ms | 17.4 ms | 21.1 ms | 9.8 MiB | 60 |
| 1280 | 36.9 ms | 38.7 ms | 43.9 ms | 20.1 MiB | 27 |
| 2560 | 69.7 ms | 75.3 ms | 82.4 ms | 38.7 MiB | 14 |
| 5120 | 165 ms | 168 ms | 266 ms | 73.5 MiB | 6 |
| 10240 | 330 ms | 330 ms | 539 ms | 145.3 MiB | 3 |

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

**Measured: O(n)** (exponent 0.96, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 38.3 µs | 43.8 µs | 40.1 µs | 46.9 KiB | 26,127 |
| 40 | 70.1 µs | 76.4 µs | 244 µs | 92.5 KiB | 14,269 |
| 80 | 127 µs | 146 µs | 436 µs | 188.4 KiB | 7,853 |
| 160 | 233 µs | 293 µs | 727 µs | 393.3 KiB | 4,297 |
| 320 | 490 µs | 633 µs | 1.51 ms | 855.2 KiB | 2,042 |
| 640 | 1.04 ms | 1.27 ms | 3.22 ms | 1.9 MiB | 959 |
| 1280 | 4.78 ms | 5.17 ms | 7.33 ms | 4.4 MiB | 209 |
| 2560 | 6.36 ms | 6.79 ms | 9.82 ms | 7.3 MiB | 157 |
| 5120 | 10.1 ms | 10.9 ms | 14.7 ms | 13.2 MiB | 99 |
| 10240 | 20.3 ms | 21.1 ms | 28.3 ms | 24.6 MiB | 49 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 45.4 µs | 51.2 µs | 85.3 µs | 54.1 KiB | 22,033 |
| 40 | 83.2 µs | 95.5 µs | 313 µs | 107.0 KiB | 12,017 |
| 80 | 171 µs | 191 µs | 592 µs | 217.3 KiB | 5,831 |
| 160 | 330 µs | 358 µs | 1.13 ms | 451.7 KiB | 3,033 |
| 320 | 691 µs | 795 µs | 2.29 ms | 968.8 KiB | 1,448 |
| 640 | 1.55 ms | 1.65 ms | 5.69 ms | 2.2 MiB | 643 |
| 1280 | 6.00 ms | 6.61 ms | 12.4 ms | 4.9 MiB | 167 |
| 2560 | 8.22 ms | 10.7 ms | 18.6 ms | 8.3 MiB | 122 |
| 5120 | 15.0 ms | 16.8 ms | 33.9 ms | 15.1 MiB | 67 |
| 10240 | 30.0 ms | 34.5 ms | 68.7 ms | 28.1 MiB | 33 |

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

**Measured: O(n)** (exponent 0.96, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 37.8 µs | 42.7 µs | 38.5 µs | 47.0 KiB | 26,478 |
| 40 | 69.3 µs | 76.0 µs | 245 µs | 92.6 KiB | 14,440 |
| 80 | 133 µs | 151 µs | 460 µs | 188.4 KiB | 7,525 |
| 160 | 265 µs | 304 µs | 751 µs | 393.6 KiB | 3,776 |
| 320 | 472 µs | 600 µs | 1.48 ms | 856.1 KiB | 2,118 |
| 640 | 1.03 ms | 1.28 ms | 3.18 ms | 1.9 MiB | 972 |
| 1280 | 4.54 ms | 5.15 ms | 7.27 ms | 4.4 MiB | 220 |
| 2560 | 5.99 ms | 6.69 ms | 9.29 ms | 7.3 MiB | 167 |
| 5120 | 9.67 ms | 10.9 ms | 14.0 ms | 13.2 MiB | 103 |
| 10240 | 19.5 ms | 21.0 ms | 27.2 ms | 24.6 MiB | 51 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.02, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 44.0 µs | 49.5 µs | 45.8 µs | 54.2 KiB | 22,749 |
| 40 | 80.6 µs | 92.4 µs | 277 µs | 107.0 KiB | 12,402 |
| 80 | 171 µs | 186 µs | 610 µs | 217.5 KiB | 5,850 |
| 160 | 336 µs | 386 µs | 1.14 ms | 451.7 KiB | 2,975 |
| 320 | 647 µs | 778 µs | 2.13 ms | 970.6 KiB | 1,546 |
| 640 | 1.46 ms | 1.61 ms | 5.46 ms | 2.2 MiB | 686 |
| 1280 | 5.50 ms | 5.85 ms | 11.9 ms | 4.9 MiB | 182 |
| 2560 | 8.10 ms | 8.65 ms | 17.8 ms | 8.3 MiB | 123 |
| 5120 | 15.4 ms | 15.9 ms | 35.3 ms | 15.1 MiB | 65 |
| 10240 | 30.1 ms | 31.0 ms | 68.7 ms | 28.1 MiB | 33 |

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

**Measured: O(n log n)** (exponent 1.22, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 25.7 µs | 39.8 µs | 26.1 µs | 30.5 KiB | 38,976 |
| 40 | 38.4 µs | 50.4 µs | 140 µs | 55.2 KiB | 26,029 |
| 80 | 68.4 µs | 81.4 µs | 224 µs | 104.6 KiB | 14,623 |
| 160 | 140 µs | 215 µs | 517 µs | 208.3 KiB | 7,162 |
| 320 | 241 µs | 365 µs | 753 µs | 402.0 KiB | 4,148 |
| 640 | 237 µs | 259 µs | 784 µs | 615.2 KiB | 4,216 |
| 1280 | 1.09 ms | 1.16 ms | 3.38 ms | 1.3 MiB | 918 |
| 2560 | 2.04 ms | 2.10 ms | 5.12 ms | 2.7 MiB | 489 |
| 5120 | 4.10 ms | 4.28 ms | 8.04 ms | 5.5 MiB | 244 |
| 10240 | 8.34 ms | 8.70 ms | 14.5 ms | 10.8 MiB | 120 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent -0.01, 10 sizes) -- ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 229 µs | 252 µs | 748 µs | 616.4 KiB | 4,365 |
| 40 | 227 µs | 254 µs | 739 µs | 618.2 KiB | 4,409 |
| 80 | 233 µs | 256 µs | 747 µs | 625.9 KiB | 4,300 |
| 160 | 241 µs | 258 µs | 780 µs | 663.4 KiB | 4,147 |
| 320 | 281 µs | 312 µs | 955 µs | 716.3 KiB | 3,563 |
| 640 | 338 µs | 355 µs | 1.05 ms | 829.2 KiB | 2,958 |
| 1280 | 319 µs | 353 µs | 990 µs | 829.2 KiB | 3,139 |
| 2560 | 319 µs | 347 µs | 985 µs | 829.2 KiB | 3,138 |
| 5120 | 323 µs | 371 µs | 1.00 ms | 829.2 KiB | 3,097 |
| 10240 | 320 µs | 353 µs | 984 µs | 829.2 KiB | 3,127 |

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
| 20 | 173 µs | 196 µs | 628 µs | 45.6 KiB | 5,785 |
| 40 | 291 µs | 323 µs | 892 µs | 115.7 KiB | 3,433 |
| 80 | 592 µs | 660 µs | 1.52 ms | 178.6 KiB | 1,689 |
| 160 | 1.14 ms | 1.25 ms | 2.99 ms | 357.3 KiB | 874 |
| 320 | 2.09 ms | 2.30 ms | 4.29 ms | 712.3 KiB | 478 |
| 640 | 4.00 ms | 4.24 ms | 6.47 ms | 1.4 MiB | 250 |
| 1280 | 7.70 ms | 8.28 ms | 10.3 ms | 2.8 MiB | 130 |
| 2560 | 14.9 ms | 19.5 ms | 18.0 ms | 5.7 MiB | 67 |
| 5120 | 30.2 ms | 31.0 ms | 34.5 ms | 11.3 MiB | 33 |
| 10240 | 62.5 ms | 63.3 ms | 67.8 ms | 22.7 MiB | 16 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.03, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.86 ms | 1.99 ms | 3.99 ms | 599.8 KiB | 537 |
| 40 | 3.27 ms | 3.69 ms | 5.62 ms | 1.2 MiB | 306 |
| 80 | 5.95 ms | 6.71 ms | 8.33 ms | 2.3 MiB | 168 |
| 160 | 10.9 ms | 11.6 ms | 13.6 ms | 4.6 MiB | 92 |
| 320 | 21.3 ms | 22.5 ms | 24.7 ms | 9.3 MiB | 47 |
| 640 | 44.7 ms | 49.5 ms | 49.9 ms | 18.5 MiB | 22 |
| 1280 | 91.0 ms | 92.0 ms | 98.4 ms | 37.0 MiB | 11 |
| 2560 | 185 ms | 186 ms | 196 ms | 73.9 MiB | 5 |
| 5120 | 383 ms | 398 ms | 403 ms | 147.7 MiB | 3 |
| 10240 | 764 ms | 776 ms | 805 ms | 295.3 MiB | 1 |

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
| 20 | 90.2 µs | 124 µs | 319 µs | 98.0 KiB | 11,085 |
| 40 | 126 µs | 169 µs | 424 µs | 178.9 KiB | 7,924 |
| 80 | 214 µs | 301 µs | 661 µs | 322.2 KiB | 4,682 |
| 160 | 425 µs | 469 µs | 1.33 ms | 637.9 KiB | 2,351 |
| 320 | 731 µs | 820 µs | 1.66 ms | 1.2 MiB | 1,368 |
| 640 | 1.44 ms | 1.52 ms | 3.28 ms | 2.5 MiB | 694 |
| 1280 | 2.62 ms | 2.88 ms | 4.33 ms | 4.9 MiB | 382 |
| 2560 | 5.46 ms | 5.74 ms | 7.84 ms | 9.9 MiB | 183 |
| 5120 | 11.2 ms | 11.6 ms | 13.9 ms | 19.8 MiB | 90 |
| 10240 | 22.8 ms | 23.2 ms | 27.4 ms | 39.6 MiB | 44 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.21, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 76.1 µs | 90.0 µs | 288 µs | 281.1 KiB | 13,137 |
| 40 | 139 µs | 160 µs | 478 µs | 539.5 KiB | 7,195 |
| 80 | 293 µs | 313 µs | 879 µs | 1.0 MiB | 3,415 |
| 160 | 569 µs | 614 µs | 1.44 ms | 2.1 MiB | 1,759 |
| 320 | 1.25 ms | 1.35 ms | 3.17 ms | 4.2 MiB | 798 |
| 640 | 2.33 ms | 2.43 ms | 4.39 ms | 8.3 MiB | 430 |
| 1280 | 4.62 ms | 5.69 ms | 7.05 ms | 16.7 MiB | 216 |
| 2560 | 9.10 ms | 9.25 ms | 12.2 ms | 33.3 MiB | 110 |
| 5120 | 27.1 ms | 28.6 ms | 31.7 ms | 52.0 MiB | 37 |
| 10240 | 63.2 ms | 67.2 ms | 74.8 ms | 103.7 MiB | 16 |

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

**Measured: O(n)** (exponent 1.02, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 90.6 µs | 121 µs | 93.0 µs | 57.4 KiB | 11,042 |
| 40 | 150 µs | 165 µs | 153 µs | 113.5 KiB | 6,670 |
| 80 | 274 µs | 302 µs | 278 µs | 225.7 KiB | 3,653 |
| 160 | 500 µs | 538 µs | 1.39 ms | 450.0 KiB | 2,000 |
| 320 | 832 µs | 966 µs | 2.62 ms | 898.9 KiB | 1,201 |
| 640 | 1.45 ms | 1.59 ms | 3.19 ms | 1.8 MiB | 689 |
| 1280 | 2.91 ms | 3.05 ms | 4.46 ms | 3.5 MiB | 344 |
| 2560 | 5.52 ms | 5.67 ms | 5.99 ms | 7.0 MiB | 181 |
| 5120 | 11.7 ms | 12.0 ms | 12.0 ms | 14.0 MiB | 85 |
| 10240 | 24.9 ms | 25.2 ms | 25.3 ms | 28.1 MiB | 40 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.98, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 85.9 µs | 92.5 µs | 88.0 µs | 57.4 KiB | 11,635 |
| 40 | 151 µs | 164 µs | 154 µs | 113.5 KiB | 6,617 |
| 80 | 272 µs | 303 µs | 288 µs | 225.7 KiB | 3,678 |
| 160 | 516 µs | 556 µs | 2.05 ms | 450.0 KiB | 1,938 |
| 320 | 850 µs | 926 µs | 2.40 ms | 898.9 KiB | 1,176 |
| 640 | 1.69 ms | 1.76 ms | 3.56 ms | 1.8 MiB | 592 |
| 1280 | 3.11 ms | 3.28 ms | 5.36 ms | 3.5 MiB | 322 |
| 2560 | 5.85 ms | 5.92 ms | 7.80 ms | 7.0 MiB | 171 |
| 5120 | 12.4 ms | 12.5 ms | 16.7 ms | 14.0 MiB | 81 |
| 10240 | 25.6 ms | 27.3 ms | 32.5 ms | 28.1 MiB | 39 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 436 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 238 µs | 238 µs | 55% |
| `run-policies` | 1 | 127 µs | 127 µs | 29% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 69.9 µs | 16% |

**At 10240 checks** (whole operation: 49.9 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 29.9 ms | 29.9 ms | 60% |
| `run-policies` | 1 | 20.3 ms | 20.3 ms | 41% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 0 | 0.0% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-23T08:23:59.715Z` → `2026-10-23T08:25:20.317Z` (81 s), ci: CI (run 39922840872)
- Machine: INTEL(R) XEON(R) PLATINUM 8573C, 4 logical core(s) (2 physical), 15989 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `3353338870be39317cacea06985298a9ce822c7d` on `chore/security-and-dep-updates`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

