# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **287 µs** per operation compared with a bare-minimum baseline (**134% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.99). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 287 µs | 44.8 ms |
| Added latency, relative to baseline | 134% | 204% |
| Added CPU time per operation | 673 µs | 47.9 ms |
| Added memory per operation (heap delta) | 345.9 KiB | 44.6 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,481 ops/s | 22 ops/s |

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
| 20 | 62.2 µs | 184 µs | 122 µs | 196% | 452 µs | $0.00025 – $0.0051 |
| 40 | 112 µs | 282 µs | 170 µs | 152% | 436 µs | $0.00035 – $0.0049 |
| 80 | 215 µs | 502 µs | 287 µs | 134% | 673 µs | $0.0006 – $0.0076 |
| 160 | 425 µs | 998 µs | 573 µs | 135% | 1.34 ms | $0.0012 – $0.015 |
| 320 | 772 µs | 1.77 ms | 999 µs | 129% | 1.71 ms | $0.0021 – $0.019 |
| 640 | 1.54 ms | 3.48 ms | 1.94 ms | 127% | 2.37 ms | $0.004 – $0.027 |
| 1280 | 2.85 ms | 12.9 ms | 10.0 ms | 352% | 10.5 ms | $0.021 – $0.119 |
| 2560 | 5.55 ms | 19.7 ms | 14.2 ms | 256% | 15.2 ms | $0.030 – $0.171 |
| 5120 | 11.0 ms | 34.6 ms | 23.6 ms | 216% | 25.6 ms | $0.049 – $0.288 |
| 10240 | 22.0 ms | 66.7 ms | 44.8 ms | 204% | 47.9 ms | $0.093 – $0.538 |

**How the total grows:** O(n) (linear), exponent 0.99 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 318 µs | 38.8 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 2.96 ms | 402 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 152 µs | 27.6 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 198 µs | 37.5 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 154 µs | 27.2 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 199 µs | 37.8 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n log n) | ✅ matches | 80.6 µs | 9.29 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 291 µs | 430 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 927 µs | 82.5 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n) | ✅ matches | 8.15 ms | 930 ms |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 273 µs | 29.5 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 331 µs | 61.7 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 371 µs | 27.8 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 362 µs | 28.8 ms |

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
| 20 | 94.5 µs | 106 µs | 307 µs | 52.9 KiB | 10,580 |
| 40 | 167 µs | 174 µs | 470 µs | 104.5 KiB | 5,994 |
| 80 | 318 µs | 339 µs | 820 µs | 211.4 KiB | 3,149 |
| 160 | 598 µs | 622 µs | 1.37 ms | 436.3 KiB | 1,671 |
| 320 | 1.19 ms | 1.27 ms | 2.77 ms | 938.9 KiB | 841 |
| 640 | 2.17 ms | 2.48 ms | 3.77 ms | 2.1 MiB | 461 |
| 1280 | 7.20 ms | 7.67 ms | 8.94 ms | 4.7 MiB | 139 |
| 2560 | 11.6 ms | 12.7 ms | 14.2 ms | 8.0 MiB | 86 |
| 5120 | 21.3 ms | 23.2 ms | 24.1 ms | 14.5 MiB | 47 |
| 10240 | 38.8 ms | 39.2 ms | 42.6 ms | 27.6 MiB | 26 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.05, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 792 µs | 864 µs | 1.57 ms | 294.9 KiB | 1,262 |
| 40 | 1.60 ms | 1.62 ms | 3.21 ms | 587.1 KiB | 626 |
| 80 | 2.96 ms | 3.46 ms | 4.72 ms | 1.1 MiB | 338 |
| 160 | 5.66 ms | 5.79 ms | 7.67 ms | 2.3 MiB | 177 |
| 320 | 11.1 ms | 11.2 ms | 13.6 ms | 4.7 MiB | 90 |
| 640 | 21.9 ms | 22.3 ms | 25.4 ms | 9.8 MiB | 46 |
| 1280 | 46.7 ms | 49.2 ms | 52.6 ms | 20.1 MiB | 21 |
| 2560 | 90.3 ms | 96.9 ms | 101 ms | 38.7 MiB | 11 |
| 5120 | 205 ms | 206 ms | 303 ms | 73.5 MiB | 5 |
| 10240 | 402 ms | 407 ms | 604 ms | 145.1 MiB | 2 |

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
| 20 | 50.7 µs | 60.7 µs | 54.3 µs | 47.1 KiB | 19,725 |
| 40 | 91.4 µs | 105 µs | 303 µs | 92.6 KiB | 10,938 |
| 80 | 152 µs | 201 µs | 471 µs | 188.5 KiB | 6,596 |
| 160 | 285 µs | 397 µs | 813 µs | 393.8 KiB | 3,514 |
| 320 | 566 µs | 757 µs | 1.58 ms | 855.2 KiB | 1,768 |
| 640 | 1.21 ms | 1.67 ms | 3.01 ms | 1.9 MiB | 827 |
| 1280 | 5.16 ms | 5.65 ms | 7.86 ms | 4.4 MiB | 194 |
| 2560 | 8.07 ms | 8.46 ms | 11.2 ms | 7.3 MiB | 124 |
| 5120 | 13.7 ms | 14.4 ms | 18.8 ms | 13.2 MiB | 73 |
| 10240 | 27.6 ms | 28.0 ms | 35.5 ms | 24.5 MiB | 36 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.98, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 59.6 µs | 65.4 µs | 62.6 µs | 54.2 KiB | 16,779 |
| 40 | 95.9 µs | 121 µs | 317 µs | 107.0 KiB | 10,426 |
| 80 | 198 µs | 237 µs | 651 µs | 217.5 KiB | 5,043 |
| 160 | 385 µs | 523 µs | 1.19 ms | 451.7 KiB | 2,598 |
| 320 | 787 µs | 1.00 ms | 2.17 ms | 955.6 KiB | 1,271 |
| 640 | 2.01 ms | 2.37 ms | 5.77 ms | 2.2 MiB | 497 |
| 1280 | 7.03 ms | 7.80 ms | 13.2 ms | 4.9 MiB | 142 |
| 2560 | 10.0 ms | 10.7 ms | 20.4 ms | 8.3 MiB | 100 |
| 5120 | 18.5 ms | 19.6 ms | 36.9 ms | 15.0 MiB | 54 |
| 10240 | 37.5 ms | 37.8 ms | 73.2 ms | 27.9 MiB | 27 |

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
| 20 | 52.0 µs | 59.6 µs | 67.6 µs | 47.0 KiB | 19,225 |
| 40 | 92.9 µs | 107 µs | 341 µs | 92.7 KiB | 10,759 |
| 80 | 154 µs | 199 µs | 477 µs | 188.5 KiB | 6,473 |
| 160 | 297 µs | 423 µs | 866 µs | 393.9 KiB | 3,367 |
| 320 | 671 µs | 855 µs | 1.65 ms | 856.1 KiB | 1,490 |
| 640 | 1.33 ms | 1.74 ms | 3.17 ms | 1.9 MiB | 752 |
| 1280 | 5.50 ms | 5.83 ms | 8.19 ms | 4.4 MiB | 182 |
| 2560 | 8.13 ms | 8.47 ms | 11.2 ms | 7.3 MiB | 123 |
| 5120 | 14.0 ms | 14.9 ms | 18.8 ms | 13.2 MiB | 71 |
| 10240 | 27.2 ms | 28.1 ms | 35.4 ms | 24.5 MiB | 37 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 59.8 µs | 64.0 µs | 226 µs | 54.2 KiB | 16,709 |
| 40 | 96.0 µs | 121 µs | 318 µs | 107.0 KiB | 10,417 |
| 80 | 199 µs | 240 µs | 658 µs | 217.5 KiB | 5,032 |
| 160 | 443 µs | 529 µs | 1.52 ms | 452.9 KiB | 2,258 |
| 320 | 785 µs | 1.02 ms | 2.16 ms | 970.6 KiB | 1,275 |
| 640 | 2.00 ms | 2.49 ms | 5.98 ms | 2.2 MiB | 500 |
| 1280 | 6.94 ms | 7.56 ms | 13.2 ms | 4.9 MiB | 144 |
| 2560 | 10.0 ms | 10.5 ms | 20.6 ms | 8.3 MiB | 100 |
| 5120 | 19.1 ms | 19.5 ms | 37.9 ms | 15.0 MiB | 52 |
| 10240 | 37.8 ms | 39.0 ms | 74.0 ms | 28.1 MiB | 26 |

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

**Measured: O(n log n)** (exponent 1.15, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 33.8 µs | 50.3 µs | 45.3 µs | 30.5 KiB | 29,568 |
| 40 | 45.4 µs | 57.6 µs | 156 µs | 55.2 KiB | 22,009 |
| 80 | 80.6 µs | 147 µs | 257 µs | 104.6 KiB | 12,410 |
| 160 | 155 µs | 208 µs | 474 µs | 208.3 KiB | 6,456 |
| 320 | 294 µs | 435 µs | 863 µs | 402.2 KiB | 3,398 |
| 640 | 336 µs | 741 µs | 1.25 ms | 604.1 KiB | 2,972 |
| 1280 | 1.18 ms | 1.28 ms | 3.27 ms | 1.3 MiB | 845 |
| 2560 | 2.26 ms | 2.36 ms | 4.96 ms | 2.7 MiB | 442 |
| 5120 | 4.47 ms | 4.82 ms | 8.48 ms | 5.5 MiB | 224 |
| 10240 | 9.29 ms | 9.55 ms | 16.3 ms | 10.8 MiB | 108 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent -0.00, 10 sizes) -- ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 281 µs | 299 µs | 883 µs | 620.2 KiB | 3,564 |
| 40 | 284 µs | 301 µs | 887 µs | 620.3 KiB | 3,524 |
| 80 | 291 µs | 312 µs | 901 µs | 626.2 KiB | 3,431 |
| 160 | 305 µs | 336 µs | 912 µs | 667.5 KiB | 3,283 |
| 320 | 334 µs | 384 µs | 941 µs | 716.3 KiB | 2,992 |
| 640 | 434 µs | 451 µs | 1.34 ms | 834.3 KiB | 2,306 |
| 1280 | 434 µs | 466 µs | 1.33 ms | 834.3 KiB | 2,302 |
| 2560 | 431 µs | 478 µs | 1.34 ms | 834.3 KiB | 2,320 |
| 5120 | 429 µs | 484 µs | 1.32 ms | 834.3 KiB | 2,329 |
| 10240 | 430 µs | 457 µs | 1.32 ms | 834.3 KiB | 2,328 |

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

**Measured: O(n)** (exponent 0.98, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 229 µs | 250 µs | 754 µs | 45.8 KiB | 4,359 |
| 40 | 433 µs | 467 µs | 1.22 ms | 90.2 KiB | 2,308 |
| 80 | 927 µs | 1.00 ms | 2.54 ms | 179.3 KiB | 1,078 |
| 160 | 1.65 ms | 1.75 ms | 3.28 ms | 357.3 KiB | 607 |
| 320 | 2.93 ms | 3.10 ms | 4.97 ms | 712.3 KiB | 341 |
| 640 | 5.36 ms | 5.54 ms | 7.59 ms | 1.4 MiB | 186 |
| 1280 | 10.3 ms | 11.0 ms | 12.8 ms | 2.8 MiB | 97 |
| 2560 | 20.0 ms | 20.7 ms | 22.9 ms | 5.7 MiB | 50 |
| 5120 | 39.6 ms | 40.1 ms | 43.6 ms | 11.3 MiB | 25 |
| 10240 | 82.5 ms | 83.3 ms | 88.2 ms | 22.7 MiB | 12 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.55 ms | 2.70 ms | 4.47 ms | 599.8 KiB | 392 |
| 40 | 4.73 ms | 6.19 ms | 6.92 ms | 1.2 MiB | 211 |
| 80 | 8.15 ms | 8.40 ms | 10.4 ms | 2.3 MiB | 123 |
| 160 | 14.7 ms | 15.1 ms | 17.3 ms | 4.6 MiB | 68 |
| 320 | 27.5 ms | 28.3 ms | 30.6 ms | 9.3 MiB | 36 |
| 640 | 54.7 ms | 54.7 ms | 58.6 ms | 18.5 MiB | 18 |
| 1280 | 120 ms | 121 ms | 127 ms | 37.0 MiB | 8 |
| 2560 | 233 ms | 233 ms | 242 ms | 73.9 MiB | 4 |
| 5120 | 468 ms | 470 ms | 487 ms | 147.7 MiB | 2 |
| 10240 | 930 ms | 933 ms | 969 ms | 295.3 MiB | 1 |

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

**Measured: O(n)** (exponent 1.02, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 102 µs | 130 µs | 346 µs | 98.0 KiB | 9,832 |
| 40 | 157 µs | 195 µs | 450 µs | 178.9 KiB | 6,367 |
| 80 | 273 µs | 422 µs | 759 µs | 322.3 KiB | 3,661 |
| 160 | 501 µs | 554 µs | 1.25 ms | 637.8 KiB | 1,994 |
| 320 | 885 µs | 968 µs | 1.64 ms | 1.2 MiB | 1,130 |
| 640 | 1.76 ms | 1.94 ms | 3.34 ms | 2.5 MiB | 567 |
| 1280 | 3.35 ms | 3.60 ms | 4.93 ms | 4.9 MiB | 298 |
| 2560 | 6.70 ms | 6.90 ms | 8.71 ms | 9.9 MiB | 149 |
| 5120 | 14.0 ms | 14.3 ms | 16.8 ms | 19.8 MiB | 72 |
| 10240 | 29.5 ms | 29.6 ms | 34.2 ms | 39.6 MiB | 34 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.17, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 98.8 µs | 106 µs | 310 µs | 281.1 KiB | 10,122 |
| 40 | 174 µs | 182 µs | 470 µs | 539.5 KiB | 5,732 |
| 80 | 331 µs | 418 µs | 828 µs | 1.0 MiB | 3,020 |
| 160 | 633 µs | 697 µs | 1.40 ms | 2.1 MiB | 1,581 |
| 320 | 1.30 ms | 1.37 ms | 2.87 ms | 4.2 MiB | 770 |
| 640 | 2.48 ms | 2.63 ms | 4.14 ms | 8.3 MiB | 403 |
| 1280 | 4.87 ms | 4.99 ms | 6.82 ms | 16.7 MiB | 205 |
| 2560 | 9.80 ms | 10.1 ms | 12.4 ms | 33.3 MiB | 102 |
| 5120 | 25.7 ms | 26.5 ms | 29.7 ms | 52.0 MiB | 39 |
| 10240 | 61.7 ms | 63.6 ms | 72.7 ms | 103.7 MiB | 16 |

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
| 20 | 108 µs | 134 µs | 112 µs | 57.3 KiB | 9,255 |
| 40 | 191 µs | 223 µs | 196 µs | 113.3 KiB | 5,246 |
| 80 | 371 µs | 387 µs | 701 µs | 225.5 KiB | 2,698 |
| 160 | 565 µs | 594 µs | 1.82 ms | 450.0 KiB | 1,770 |
| 320 | 980 µs | 1.14 ms | 2.46 ms | 898.7 KiB | 1,020 |
| 640 | 1.77 ms | 1.87 ms | 3.30 ms | 1.8 MiB | 565 |
| 1280 | 3.34 ms | 3.42 ms | 4.70 ms | 3.5 MiB | 300 |
| 2560 | 6.42 ms | 6.65 ms | 6.85 ms | 6.9 MiB | 156 |
| 5120 | 13.3 ms | 13.4 ms | 13.4 ms | 13.8 MiB | 75 |
| 10240 | 27.8 ms | 28.1 ms | 28.3 ms | 27.7 MiB | 36 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.02, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 99.4 µs | 126 µs | 104 µs | 56.4 KiB | 10,059 |
| 40 | 184 µs | 205 µs | 189 µs | 111.7 KiB | 5,449 |
| 80 | 362 µs | 385 µs | 1.26 ms | 222.3 KiB | 2,762 |
| 160 | 581 µs | 703 µs | 2.02 ms | 443.6 KiB | 1,722 |
| 320 | 956 µs | 1.14 ms | 2.42 ms | 886.1 KiB | 1,046 |
| 640 | 1.72 ms | 1.74 ms | 3.28 ms | 1.7 MiB | 581 |
| 1280 | 3.30 ms | 4.41 ms | 5.19 ms | 3.5 MiB | 303 |
| 2560 | 6.38 ms | 6.44 ms | 7.94 ms | 6.9 MiB | 157 |
| 5120 | 13.5 ms | 14.2 ms | 16.8 ms | 13.8 MiB | 74 |
| 10240 | 28.8 ms | 29.5 ms | 34.5 ms | 27.7 MiB | 35 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 502 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 318 µs | 318 µs | 63% |
| `run-policies` | 1 | 152 µs | 152 µs | 30% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 32.9 µs | 6.6% |

**At 10240 checks** (whole operation: 66.7 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 38.8 ms | 38.8 ms | 58% |
| `run-policies` | 1 | 27.6 ms | 27.6 ms | 41% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 401 µs | 0.6% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-23T07:59:25.793Z` → `2026-10-23T08:00:54.511Z` (89 s), ci: CI (run 39919720825)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `3f2e7236938ff50dc39760bdb0dbc9ed7a7337df` on `chore/security-and-dep-updates`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

