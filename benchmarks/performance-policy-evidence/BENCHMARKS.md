# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **285 µs** per operation compared with a bare-minimum baseline (**133% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.00). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 285 µs | 45.7 ms |
| Added latency, relative to baseline | 133% | 209% |
| Added CPU time per operation | 636 µs | 50.8 ms |
| Added memory per operation (heap delta) | 345.9 KiB | 44.4 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,512 ops/s | 22 ops/s |

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
| 20 | 60.4 µs | 163 µs | 102 µs | 169% | 317 µs | $0.00021 – $0.0036 |
| 40 | 111 µs | 277 µs | 166 µs | 150% | 429 µs | $0.00035 – $0.0048 |
| 80 | 215 µs | 499 µs | 285 µs | 133% | 636 µs | $0.00059 – $0.0071 |
| 160 | 428 µs | 1.02 ms | 593 µs | 139% | 1.38 ms | $0.0012 – $0.015 |
| 320 | 780 µs | 1.79 ms | 1.01 ms | 129% | 1.72 ms | $0.0021 – $0.019 |
| 640 | 1.55 ms | 3.47 ms | 1.92 ms | 123% | 2.26 ms | $0.004 – $0.025 |
| 1280 | 2.89 ms | 12.8 ms | 9.94 ms | 344% | 10.5 ms | $0.021 – $0.118 |
| 2560 | 5.59 ms | 19.6 ms | 14.0 ms | 251% | 14.6 ms | $0.029 – $0.164 |
| 5120 | 11.0 ms | 34.3 ms | 23.3 ms | 211% | 25.9 ms | $0.048 – $0.291 |
| 10240 | 21.9 ms | 67.7 ms | 45.7 ms | 209% | 50.8 ms | $0.095 – $0.571 |

**How the total grows:** O(n) (linear), exponent 1.00 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 318 µs | 38.5 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 3.00 ms | 407 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 153 µs | 26.4 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 196 µs | 36.0 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 170 µs | 26.6 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 203 µs | 36.0 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n) | 🟡 close (neighbouring class) | 83.6 µs | 9.56 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 293 µs | 427 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 946 µs | 98.6 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 8.08 ms | 1.53 s |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 283 µs | 28.2 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 327 µs | 63.6 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 369 µs | 26.8 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 371 µs | 29.8 ms |

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
| 20 | 89.8 µs | 93.8 µs | 271 µs | 52.8 KiB | 11,141 |
| 40 | 167 µs | 178 µs | 465 µs | 104.5 KiB | 5,987 |
| 80 | 318 µs | 336 µs | 808 µs | 211.4 KiB | 3,141 |
| 160 | 601 µs | 693 µs | 1.35 ms | 436.2 KiB | 1,664 |
| 320 | 1.19 ms | 1.38 ms | 2.68 ms | 938.9 KiB | 838 |
| 640 | 2.20 ms | 2.31 ms | 3.77 ms | 2.1 MiB | 455 |
| 1280 | 7.23 ms | 7.49 ms | 9.14 ms | 4.7 MiB | 138 |
| 2560 | 11.6 ms | 15.8 ms | 13.9 ms | 8.0 MiB | 86 |
| 5120 | 20.7 ms | 22.4 ms | 23.0 ms | 14.5 MiB | 48 |
| 10240 | 38.5 ms | 40.8 ms | 42.1 ms | 27.5 MiB | 26 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.05, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 808 µs | 831 µs | 1.60 ms | 294.9 KiB | 1,237 |
| 40 | 1.61 ms | 1.64 ms | 3.22 ms | 587.0 KiB | 621 |
| 80 | 3.00 ms | 3.55 ms | 4.75 ms | 1.1 MiB | 333 |
| 160 | 5.72 ms | 5.96 ms | 7.71 ms | 2.3 MiB | 175 |
| 320 | 11.2 ms | 11.4 ms | 13.6 ms | 4.7 MiB | 90 |
| 640 | 22.2 ms | 23.1 ms | 25.8 ms | 9.8 MiB | 45 |
| 1280 | 47.5 ms | 49.2 ms | 53.0 ms | 20.1 MiB | 21 |
| 2560 | 91.1 ms | 97.8 ms | 101 ms | 38.7 MiB | 11 |
| 5120 | 206 ms | 207 ms | 303 ms | 73.5 MiB | 5 |
| 10240 | 407 ms | 418 ms | 606 ms | 145.1 MiB | 2 |

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

**Measured: O(n)** (exponent 1.03, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 53.6 µs | 66.8 µs | 54.5 µs | 47.2 KiB | 18,670 |
| 40 | 75.5 µs | 100 µs | 230 µs | 92.5 KiB | 13,236 |
| 80 | 153 µs | 205 µs | 468 µs | 188.5 KiB | 6,553 |
| 160 | 323 µs | 425 µs | 940 µs | 393.8 KiB | 3,100 |
| 320 | 593 µs | 768 µs | 1.52 ms | 855.1 KiB | 1,687 |
| 640 | 1.20 ms | 1.66 ms | 2.91 ms | 1.9 MiB | 834 |
| 1280 | 5.22 ms | 5.61 ms | 7.83 ms | 4.4 MiB | 192 |
| 2560 | 7.38 ms | 7.80 ms | 10.3 ms | 7.3 MiB | 135 |
| 5120 | 13.2 ms | 14.4 ms | 17.4 ms | 13.2 MiB | 75 |
| 10240 | 26.4 ms | 26.9 ms | 34.2 ms | 24.5 MiB | 38 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.02, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 58.0 µs | 64.8 µs | 147 µs | 54.2 KiB | 17,242 |
| 40 | 96.2 µs | 121 µs | 300 µs | 107.0 KiB | 10,400 |
| 80 | 196 µs | 239 µs | 620 µs | 217.5 KiB | 5,115 |
| 160 | 414 µs | 494 µs | 1.42 ms | 452.9 KiB | 2,416 |
| 320 | 725 µs | 931 µs | 2.09 ms | 970.6 KiB | 1,380 |
| 640 | 1.74 ms | 2.31 ms | 5.24 ms | 2.2 MiB | 575 |
| 1280 | 6.55 ms | 6.86 ms | 12.5 ms | 4.9 MiB | 153 |
| 2560 | 10.3 ms | 11.4 ms | 20.3 ms | 8.3 MiB | 97 |
| 5120 | 18.5 ms | 20.2 ms | 36.4 ms | 15.0 MiB | 54 |
| 10240 | 36.0 ms | 39.1 ms | 68.0 ms | 27.9 MiB | 28 |

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

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 51.4 µs | 58.2 µs | 55.4 µs | 47.0 KiB | 19,465 |
| 40 | 91.0 µs | 112 µs | 332 µs | 92.7 KiB | 10,992 |
| 80 | 170 µs | 210 µs | 554 µs | 188.7 KiB | 5,898 |
| 160 | 339 µs | 429 µs | 973 µs | 393.9 KiB | 2,946 |
| 320 | 577 µs | 766 µs | 1.56 ms | 854.7 KiB | 1,734 |
| 640 | 1.25 ms | 1.71 ms | 2.99 ms | 1.9 MiB | 798 |
| 1280 | 5.28 ms | 5.70 ms | 7.71 ms | 4.4 MiB | 189 |
| 2560 | 7.73 ms | 8.07 ms | 10.9 ms | 7.3 MiB | 129 |
| 5120 | 12.9 ms | 13.7 ms | 17.6 ms | 13.2 MiB | 77 |
| 10240 | 26.6 ms | 27.0 ms | 34.2 ms | 24.5 MiB | 38 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.02, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 61.3 µs | 72.2 µs | 168 µs | 54.2 KiB | 16,310 |
| 40 | 105 µs | 123 µs | 332 µs | 107.0 KiB | 9,564 |
| 80 | 203 µs | 253 µs | 645 µs | 217.5 KiB | 4,916 |
| 160 | 417 µs | 509 µs | 1.40 ms | 452.9 KiB | 2,398 |
| 320 | 733 µs | 954 µs | 2.08 ms | 970.6 KiB | 1,365 |
| 640 | 1.75 ms | 2.17 ms | 5.16 ms | 2.2 MiB | 573 |
| 1280 | 6.55 ms | 7.19 ms | 12.7 ms | 4.9 MiB | 153 |
| 2560 | 10.3 ms | 10.8 ms | 20.2 ms | 8.3 MiB | 97 |
| 5120 | 18.2 ms | 19.2 ms | 35.9 ms | 15.1 MiB | 55 |
| 10240 | 36.0 ms | 37.2 ms | 68.8 ms | 28.2 MiB | 28 |

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

**Measured: O(n)** (exponent 1.03, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 33.1 µs | 47.6 µs | 33.9 µs | 30.5 KiB | 30,186 |
| 40 | 44.4 µs | 57.6 µs | 144 µs | 55.2 KiB | 22,519 |
| 80 | 83.6 µs | 149 µs | 278 µs | 104.6 KiB | 11,959 |
| 160 | 146 µs | 201 µs | 420 µs | 207.7 KiB | 6,831 |
| 320 | 288 µs | 401 µs | 839 µs | 402.2 KiB | 3,478 |
| 640 | 528 µs | 774 µs | 1.42 ms | 821.1 KiB | 1,894 |
| 1280 | 1.19 ms | 1.31 ms | 3.21 ms | 1.3 MiB | 842 |
| 2560 | 2.19 ms | 2.27 ms | 4.77 ms | 2.7 MiB | 456 |
| 5120 | 4.51 ms | 4.76 ms | 8.45 ms | 5.5 MiB | 222 |
| 10240 | 9.56 ms | 9.80 ms | 16.8 ms | 10.8 MiB | 105 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent -0.00, 10 sizes) -- ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 284 µs | 299 µs | 880 µs | 620.2 KiB | 3,523 |
| 40 | 286 µs | 323 µs | 873 µs | 620.3 KiB | 3,495 |
| 80 | 293 µs | 314 µs | 878 µs | 626.2 KiB | 3,412 |
| 160 | 306 µs | 345 µs | 924 µs | 667.5 KiB | 3,270 |
| 320 | 336 µs | 361 µs | 920 µs | 716.3 KiB | 2,980 |
| 640 | 429 µs | 498 µs | 1.31 ms | 834.3 KiB | 2,329 |
| 1280 | 429 µs | 496 µs | 1.30 ms | 834.3 KiB | 2,330 |
| 2560 | 430 µs | 497 µs | 1.30 ms | 834.3 KiB | 2,325 |
| 5120 | 431 µs | 493 µs | 1.32 ms | 834.3 KiB | 2,322 |
| 10240 | 427 µs | 497 µs | 1.28 ms | 834.3 KiB | 2,342 |

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
| 20 | 225 µs | 254 µs | 735 µs | 45.8 KiB | 4,439 |
| 40 | 401 µs | 433 µs | 1.16 ms | 90.2 KiB | 2,491 |
| 80 | 946 µs | 1.02 ms | 2.50 ms | 179.3 KiB | 1,057 |
| 160 | 1.60 ms | 1.65 ms | 3.20 ms | 357.3 KiB | 626 |
| 320 | 2.87 ms | 3.01 ms | 4.88 ms | 712.3 KiB | 349 |
| 640 | 5.45 ms | 5.57 ms | 7.62 ms | 1.4 MiB | 184 |
| 1280 | 10.8 ms | 11.1 ms | 13.0 ms | 2.8 MiB | 93 |
| 2560 | 21.3 ms | 21.7 ms | 23.9 ms | 5.7 MiB | 47 |
| 5120 | 42.8 ms | 43.2 ms | 43.7 ms | 11.3 MiB | 23 |
| 10240 | 98.6 ms | 98.9 ms | 99.3 ms | 22.7 MiB | 10 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.10, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.56 ms | 2.61 ms | 4.42 ms | 599.8 KiB | 391 |
| 40 | 4.36 ms | 4.52 ms | 6.30 ms | 1.2 MiB | 229 |
| 80 | 8.08 ms | 8.30 ms | 10.1 ms | 2.3 MiB | 124 |
| 160 | 15.5 ms | 16.7 ms | 17.8 ms | 4.6 MiB | 65 |
| 320 | 30.6 ms | 30.9 ms | 31.0 ms | 9.3 MiB | 33 |
| 640 | 69.6 ms | 69.9 ms | 70.0 ms | 18.5 MiB | 14 |
| 1280 | 174 ms | 176 ms | 175 ms | 37.0 MiB | 6 |
| 2560 | 370 ms | 374 ms | 370 ms | 73.9 MiB | 3 |
| 5120 | 755 ms | 772 ms | 773 ms | 147.7 MiB | 1 |
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

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 119 µs | 158 µs | 478 µs | 98.0 KiB | 8,400 |
| 40 | 161 µs | 197 µs | 448 µs | 179.0 KiB | 6,222 |
| 80 | 283 µs | 423 µs | 759 µs | 328.4 KiB | 3,539 |
| 160 | 505 µs | 532 µs | 1.23 ms | 637.9 KiB | 1,979 |
| 320 | 992 µs | 1.16 ms | 2.46 ms | 1.2 MiB | 1,008 |
| 640 | 1.79 ms | 2.04 ms | 3.32 ms | 2.5 MiB | 559 |
| 1280 | 3.35 ms | 3.49 ms | 4.67 ms | 4.9 MiB | 298 |
| 2560 | 6.66 ms | 6.88 ms | 8.38 ms | 9.9 MiB | 150 |
| 5120 | 13.7 ms | 14.3 ms | 16.5 ms | 19.8 MiB | 73 |
| 10240 | 28.2 ms | 29.1 ms | 33.0 ms | 39.6 MiB | 35 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.18, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 96.3 µs | 105 µs | 303 µs | 281.1 KiB | 10,382 |
| 40 | 186 µs | 215 µs | 550 µs | 540.1 KiB | 5,387 |
| 80 | 327 µs | 341 µs | 801 µs | 1.0 MiB | 3,061 |
| 160 | 621 µs | 687 µs | 1.36 ms | 2.1 MiB | 1,611 |
| 320 | 1.31 ms | 1.40 ms | 2.83 ms | 4.2 MiB | 766 |
| 640 | 2.47 ms | 2.59 ms | 4.10 ms | 8.3 MiB | 405 |
| 1280 | 4.90 ms | 5.06 ms | 6.76 ms | 16.7 MiB | 204 |
| 2560 | 9.70 ms | 9.97 ms | 12.1 ms | 33.3 MiB | 103 |
| 5120 | 26.0 ms | 27.0 ms | 30.0 ms | 52.0 MiB | 39 |
| 10240 | 63.6 ms | 67.2 ms | 74.5 ms | 103.7 MiB | 16 |

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

**Measured: O(n)** (exponent 0.98, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 111 µs | 160 µs | 115 µs | 57.4 KiB | 9,047 |
| 40 | 193 µs | 220 µs | 197 µs | 113.5 KiB | 5,175 |
| 80 | 369 µs | 400 µs | 815 µs | 225.7 KiB | 2,710 |
| 160 | 584 µs | 645 µs | 2.01 ms | 450.0 KiB | 1,712 |
| 320 | 987 µs | 1.07 ms | 2.43 ms | 898.9 KiB | 1,014 |
| 640 | 1.77 ms | 1.81 ms | 3.21 ms | 1.8 MiB | 564 |
| 1280 | 3.33 ms | 3.43 ms | 4.64 ms | 3.5 MiB | 300 |
| 2560 | 6.52 ms | 8.87 ms | 6.92 ms | 6.9 MiB | 153 |
| 5120 | 13.4 ms | 13.7 ms | 13.5 ms | 13.8 MiB | 75 |
| 10240 | 26.8 ms | 28.5 ms | 27.3 ms | 27.7 MiB | 37 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 99.0 µs | 124 µs | 103 µs | 56.5 KiB | 10,102 |
| 40 | 183 µs | 209 µs | 187 µs | 111.8 KiB | 5,458 |
| 80 | 371 µs | 379 µs | 1.33 ms | 222.5 KiB | 2,694 |
| 160 | 569 µs | 633 µs | 1.92 ms | 443.7 KiB | 1,758 |
| 320 | 958 µs | 1.02 ms | 2.31 ms | 886.2 KiB | 1,043 |
| 640 | 1.93 ms | 2.03 ms | 3.60 ms | 1.7 MiB | 518 |
| 1280 | 3.34 ms | 3.37 ms | 5.11 ms | 3.5 MiB | 300 |
| 2560 | 6.63 ms | 6.72 ms | 8.78 ms | 6.9 MiB | 151 |
| 5120 | 13.8 ms | 14.0 ms | 17.1 ms | 13.8 MiB | 73 |
| 10240 | 29.8 ms | 30.9 ms | 35.3 ms | 27.7 MiB | 34 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 499 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 318 µs | 318 µs | 64% |
| `run-policies` | 1 | 153 µs | 153 µs | 31% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 28.5 µs | 5.7% |

**At 10240 checks** (whole operation: 67.7 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 38.5 ms | 38.5 ms | 57% |
| `run-policies` | 1 | 26.4 ms | 26.4 ms | 39% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 2.70 ms | 4.0% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-02T15:07:35.486Z` → `2026-11-02T15:09:12.084Z` (97 s), ci: CI (run 41465720616)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15984 MB RAM, linux/x64, Node v24.22.1, GitHub Actions
- Git: `f9404a39378d5c59955ede13de7733a57af56353` on `feat/affected-scope`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

