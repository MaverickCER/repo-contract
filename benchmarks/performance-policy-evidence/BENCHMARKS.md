# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **306 µs** per operation compared with a bare-minimum baseline (**140% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.95). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 306 µs | 40.4 ms |
| Added latency, relative to baseline | 140% | 195% |
| Added CPU time per operation | 757 µs | 44.4 ms |
| Added memory per operation (heap delta) | 345.9 KiB | 44.0 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,263 ops/s | 25 ops/s |

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
| 20 | 68.5 µs | 201 µs | 133 µs | 193% | 537 µs | $0.00028 – $0.006 |
| 40 | 122 µs | 293 µs | 171 µs | 140% | 465 µs | $0.00036 – $0.0052 |
| 80 | 219 µs | 525 µs | 306 µs | 140% | 757 µs | $0.00064 – $0.0085 |
| 160 | 442 µs | 1.07 ms | 624 µs | 141% | 1.53 ms | $0.0013 – $0.017 |
| 320 | 768 µs | 1.83 ms | 1.06 ms | 138% | 1.85 ms | $0.0022 – $0.021 |
| 640 | 1.54 ms | 3.50 ms | 1.96 ms | 127% | 2.13 ms | $0.0041 – $0.024 |
| 1280 | 2.80 ms | 13.8 ms | 11.0 ms | 393% | 11.5 ms | $0.023 – $0.129 |
| 2560 | 5.30 ms | 19.8 ms | 14.5 ms | 274% | 15.4 ms | $0.030 – $0.173 |
| 5120 | 10.5 ms | 33.6 ms | 23.1 ms | 219% | 25.7 ms | $0.048 – $0.289 |
| 10240 | 20.7 ms | 61.1 ms | 40.4 ms | 195% | 44.4 ms | $0.084 – $0.499 |

**How the total grows:** O(n) (linear), exponent 0.95 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 373 µs | 38.0 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 2.89 ms | 399 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 158 µs | 23.8 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 259 µs | 35.6 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 159 µs | 24.0 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 223 µs | 35.6 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n log n) | ✅ matches | 83.0 µs | 10.0 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 336 µs | 463 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 904 µs | 76.4 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n) | ✅ matches | 7.31 ms | 893 ms |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 283 µs | 28.9 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 398 µs | 77.4 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 347 µs | 26.1 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 351 µs | 28.9 ms |

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

**Measured: O(n)** (exponent 0.95, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 109 µs | 120 µs | 393 µs | 52.9 KiB | 9,189 |
| 40 | 189 µs | 208 µs | 623 µs | 104.6 KiB | 5,283 |
| 80 | 373 µs | 392 µs | 1.23 ms | 211.8 KiB | 2,681 |
| 160 | 618 µs | 659 µs | 1.49 ms | 436.3 KiB | 1,618 |
| 320 | 1.23 ms | 1.29 ms | 3.05 ms | 938.9 KiB | 811 |
| 640 | 2.25 ms | 2.33 ms | 4.12 ms | 2.1 MiB | 445 |
| 1280 | 8.34 ms | 8.63 ms | 10.3 ms | 4.7 MiB | 120 |
| 2560 | 12.5 ms | 13.0 ms | 15.0 ms | 8.0 MiB | 80 |
| 5120 | 21.0 ms | 21.3 ms | 23.0 ms | 14.5 MiB | 48 |
| 10240 | 38.0 ms | 38.3 ms | 42.3 ms | 27.6 MiB | 26 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.06, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 797 µs | 820 µs | 1.74 ms | 294.9 KiB | 1,255 |
| 40 | 1.60 ms | 1.63 ms | 3.53 ms | 587.1 KiB | 625 |
| 80 | 2.89 ms | 3.25 ms | 5.01 ms | 1.1 MiB | 346 |
| 160 | 5.51 ms | 5.80 ms | 8.12 ms | 2.3 MiB | 181 |
| 320 | 10.7 ms | 10.7 ms | 13.9 ms | 4.7 MiB | 94 |
| 640 | 21.1 ms | 21.4 ms | 25.7 ms | 9.8 MiB | 47 |
| 1280 | 46.1 ms | 47.5 ms | 54.1 ms | 20.1 MiB | 22 |
| 2560 | 87.2 ms | 91.9 ms | 101 ms | 38.7 MiB | 11 |
| 5120 | 204 ms | 206 ms | 323 ms | 73.5 MiB | 5 |
| 10240 | 399 ms | 401 ms | 642 ms | 145.3 MiB | 3 |

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

**Measured: O(n)** (exponent 0.94, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 55.7 µs | 69.4 µs | 57.5 µs | 47.2 KiB | 17,949 |
| 40 | 69.8 µs | 94.3 µs | 220 µs | 92.4 KiB | 14,334 |
| 80 | 158 µs | 192 µs | 516 µs | 188.5 KiB | 6,340 |
| 160 | 296 µs | 398 µs | 918 µs | 393.8 KiB | 3,382 |
| 320 | 579 µs | 754 µs | 1.68 ms | 841.3 KiB | 1,728 |
| 640 | 1.31 ms | 1.66 ms | 3.49 ms | 1.9 MiB | 762 |
| 1280 | 6.36 ms | 6.68 ms | 9.18 ms | 4.4 MiB | 157 |
| 2560 | 8.40 ms | 8.86 ms | 12.0 ms | 7.3 MiB | 119 |
| 5120 | 13.5 ms | 14.2 ms | 18.8 ms | 13.2 MiB | 74 |
| 10240 | 23.8 ms | 24.8 ms | 32.9 ms | 24.4 MiB | 42 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.93, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 62.0 µs | 72.7 µs | 69.8 µs | 54.2 KiB | 16,131 |
| 40 | 116 µs | 127 µs | 418 µs | 107.1 KiB | 8,585 |
| 80 | 259 µs | 280 µs | 917 µs | 217.8 KiB | 3,862 |
| 160 | 504 µs | 564 µs | 1.75 ms | 452.9 KiB | 1,985 |
| 320 | 1.20 ms | 1.31 ms | 4.40 ms | 975.6 KiB | 834 |
| 640 | 2.18 ms | 2.32 ms | 6.90 ms | 2.2 MiB | 459 |
| 1280 | 8.30 ms | 8.66 ms | 16.0 ms | 4.9 MiB | 121 |
| 2560 | 11.3 ms | 11.6 ms | 23.2 ms | 8.3 MiB | 89 |
| 5120 | 20.0 ms | 20.4 ms | 42.8 ms | 15.1 MiB | 50 |
| 10240 | 35.6 ms | 38.4 ms | 78.1 ms | 28.0 MiB | 28 |

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
| 20 | 51.7 µs | 59.9 µs | 54.3 µs | 47.1 KiB | 19,340 |
| 40 | 94.0 µs | 99.7 µs | 311 µs | 92.6 KiB | 10,634 |
| 80 | 159 µs | 197 µs | 550 µs | 188.5 KiB | 6,277 |
| 160 | 296 µs | 362 µs | 918 µs | 393.9 KiB | 3,383 |
| 320 | 591 µs | 787 µs | 1.73 ms | 853.7 KiB | 1,693 |
| 640 | 1.27 ms | 1.65 ms | 3.49 ms | 1.9 MiB | 786 |
| 1280 | 6.29 ms | 6.55 ms | 9.27 ms | 4.4 MiB | 159 |
| 2560 | 8.41 ms | 8.80 ms | 12.0 ms | 7.3 MiB | 119 |
| 5120 | 13.5 ms | 14.0 ms | 18.7 ms | 13.2 MiB | 74 |
| 10240 | 24.0 ms | 24.5 ms | 33.1 ms | 24.4 MiB | 42 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.91, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 63.1 µs | 72.6 µs | 70.7 µs | 54.3 KiB | 15,855 |
| 40 | 123 µs | 132 µs | 476 µs | 107.2 KiB | 8,160 |
| 80 | 223 µs | 266 µs | 763 µs | 217.5 KiB | 4,475 |
| 160 | 512 µs | 580 µs | 1.80 ms | 452.9 KiB | 1,953 |
| 320 | 1.12 ms | 1.24 ms | 4.20 ms | 975.8 KiB | 890 |
| 640 | 2.29 ms | 2.62 ms | 7.04 ms | 2.2 MiB | 437 |
| 1280 | 8.41 ms | 8.83 ms | 16.2 ms | 4.9 MiB | 119 |
| 2560 | 11.4 ms | 11.9 ms | 23.7 ms | 8.3 MiB | 88 |
| 5120 | 19.3 ms | 19.5 ms | 42.4 ms | 15.1 MiB | 52 |
| 10240 | 35.6 ms | 36.1 ms | 78.9 ms | 28.0 MiB | 28 |

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

**Measured: O(n log n)** (exponent 1.13, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 35.2 µs | 53.4 µs | 36.0 µs | 30.5 KiB | 28,410 |
| 40 | 48.2 µs | 55.3 µs | 181 µs | 55.0 KiB | 20,765 |
| 80 | 83.0 µs | 105 µs | 293 µs | 104.6 KiB | 12,052 |
| 160 | 161 µs | 259 µs | 546 µs | 208.3 KiB | 6,201 |
| 320 | 312 µs | 462 µs | 996 µs | 402.2 KiB | 3,209 |
| 640 | 394 µs | 676 µs | 1.52 ms | 622.5 KiB | 2,541 |
| 1280 | 1.29 ms | 1.34 ms | 3.79 ms | 1.3 MiB | 777 |
| 2560 | 2.53 ms | 2.64 ms | 5.86 ms | 2.7 MiB | 395 |
| 5120 | 4.98 ms | 5.18 ms | 9.98 ms | 5.5 MiB | 201 |
| 10240 | 10.0 ms | 10.2 ms | 18.0 ms | 10.8 MiB | 100 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent -0.01, 10 sizes) -- ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 317 µs | 337 µs | 1.03 ms | 620.2 KiB | 3,156 |
| 40 | 319 µs | 357 µs | 1.03 ms | 620.3 KiB | 3,136 |
| 80 | 336 µs | 354 µs | 1.09 ms | 626.2 KiB | 2,979 |
| 160 | 345 µs | 364 µs | 1.08 ms | 667.5 KiB | 2,899 |
| 320 | 419 µs | 439 µs | 1.50 ms | 714.8 KiB | 2,386 |
| 640 | 466 µs | 508 µs | 1.54 ms | 834.3 KiB | 2,146 |
| 1280 | 476 µs | 499 µs | 1.59 ms | 834.3 KiB | 2,102 |
| 2560 | 471 µs | 504 µs | 1.54 ms | 834.3 KiB | 2,122 |
| 5120 | 463 µs | 528 µs | 1.53 ms | 834.3 KiB | 2,162 |
| 10240 | 463 µs | 534 µs | 1.51 ms | 834.3 KiB | 2,160 |

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
| 20 | 235 µs | 255 µs | 836 µs | 45.8 KiB | 4,253 |
| 40 | 416 µs | 453 µs | 1.34 ms | 90.2 KiB | 2,404 |
| 80 | 904 µs | 973 µs | 2.80 ms | 179.3 KiB | 1,106 |
| 160 | 1.51 ms | 1.57 ms | 3.55 ms | 357.3 KiB | 663 |
| 320 | 2.67 ms | 2.91 ms | 5.16 ms | 712.3 KiB | 375 |
| 640 | 4.98 ms | 5.26 ms | 7.75 ms | 1.4 MiB | 201 |
| 1280 | 9.95 ms | 10.5 ms | 13.0 ms | 2.8 MiB | 100 |
| 2560 | 19.1 ms | 19.3 ms | 22.3 ms | 5.7 MiB | 52 |
| 5120 | 37.3 ms | 37.5 ms | 42.0 ms | 11.3 MiB | 27 |
| 10240 | 76.4 ms | 76.8 ms | 83.2 ms | 22.7 MiB | 13 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.20 ms | 2.41 ms | 4.55 ms | 599.8 KiB | 455 |
| 40 | 3.87 ms | 4.09 ms | 6.31 ms | 1.2 MiB | 258 |
| 80 | 7.31 ms | 7.44 ms | 9.95 ms | 2.3 MiB | 137 |
| 160 | 13.8 ms | 14.0 ms | 16.9 ms | 4.6 MiB | 73 |
| 320 | 26.4 ms | 26.8 ms | 30.2 ms | 9.3 MiB | 38 |
| 640 | 54.1 ms | 54.5 ms | 59.4 ms | 18.5 MiB | 18 |
| 1280 | 110 ms | 111 ms | 118 ms | 37.0 MiB | 9 |
| 2560 | 221 ms | 223 ms | 233 ms | 73.9 MiB | 5 |
| 5120 | 444 ms | 445 ms | 468 ms | 147.7 MiB | 2 |
| 10240 | 893 ms | 895 ms | 937 ms | 295.3 MiB | 1 |

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
| 20 | 112 µs | 165 µs | 450 µs | 97.9 KiB | 8,896 |
| 40 | 161 µs | 216 µs | 513 µs | 178.9 KiB | 6,215 |
| 80 | 283 µs | 400 µs | 877 µs | 322.3 KiB | 3,538 |
| 160 | 470 µs | 518 µs | 1.06 ms | 637.7 KiB | 2,126 |
| 320 | 1.02 ms | 1.17 ms | 2.86 ms | 1.2 MiB | 985 |
| 640 | 1.78 ms | 1.87 ms | 3.63 ms | 2.5 MiB | 562 |
| 1280 | 3.38 ms | 3.63 ms | 5.44 ms | 4.9 MiB | 296 |
| 2560 | 6.66 ms | 6.79 ms | 9.30 ms | 9.9 MiB | 150 |
| 5120 | 13.9 ms | 14.2 ms | 17.4 ms | 19.8 MiB | 72 |
| 10240 | 28.9 ms | 29.8 ms | 34.8 ms | 39.6 MiB | 35 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.20, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 109 µs | 115 µs | 404 µs | 281.1 KiB | 9,134 |
| 40 | 199 µs | 207 µs | 639 µs | 540.1 KiB | 5,024 |
| 80 | 398 µs | 418 µs | 1.29 ms | 1.0 MiB | 2,513 |
| 160 | 701 µs | 750 µs | 1.64 ms | 2.1 MiB | 1,426 |
| 320 | 1.49 ms | 1.59 ms | 3.44 ms | 4.2 MiB | 672 |
| 640 | 2.89 ms | 3.07 ms | 5.08 ms | 8.3 MiB | 346 |
| 1280 | 5.55 ms | 5.76 ms | 8.32 ms | 16.7 MiB | 180 |
| 2560 | 11.2 ms | 11.6 ms | 15.4 ms | 33.3 MiB | 89 |
| 5120 | 31.4 ms | 32.9 ms | 37.4 ms | 52.0 MiB | 32 |
| 10240 | 77.4 ms | 80.4 ms | 91.9 ms | 103.7 MiB | 13 |

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

**Measured: O(n)** (exponent 0.97, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 109 µs | 149 µs | 113 µs | 57.3 KiB | 9,192 |
| 40 | 191 µs | 212 µs | 196 µs | 113.3 KiB | 5,239 |
| 80 | 347 µs | 368 µs | 353 µs | 225.5 KiB | 2,878 |
| 160 | 606 µs | 655 µs | 2.41 ms | 450.0 KiB | 1,651 |
| 320 | 1.00e+3 µs | 1.08 ms | 2.98 ms | 898.7 KiB | 1,000 |
| 640 | 1.78 ms | 1.82 ms | 3.80 ms | 1.8 MiB | 562 |
| 1280 | 3.28 ms | 3.45 ms | 4.70 ms | 3.5 MiB | 305 |
| 2560 | 6.27 ms | 6.42 ms | 6.81 ms | 7.0 MiB | 160 |
| 5120 | 12.6 ms | 12.8 ms | 12.8 ms | 13.8 MiB | 80 |
| 10240 | 26.1 ms | 26.4 ms | 26.5 ms | 27.7 MiB | 38 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 110 µs | 125 µs | 115 µs | 56.4 KiB | 9,096 |
| 40 | 192 µs | 208 µs | 197 µs | 111.7 KiB | 5,215 |
| 80 | 351 µs | 371 µs | 358 µs | 222.3 KiB | 2,849 |
| 160 | 604 µs | 640 µs | 2.32 ms | 443.6 KiB | 1,657 |
| 320 | 992 µs | 1.05 ms | 2.85 ms | 886.1 KiB | 1,008 |
| 640 | 1.80 ms | 1.85 ms | 3.90 ms | 1.7 MiB | 555 |
| 1280 | 3.43 ms | 3.47 ms | 6.03 ms | 3.5 MiB | 292 |
| 2560 | 6.61 ms | 6.67 ms | 9.28 ms | 6.9 MiB | 151 |
| 5120 | 13.5 ms | 14.2 ms | 17.8 ms | 13.8 MiB | 74 |
| 10240 | 28.9 ms | 29.9 ms | 36.5 ms | 27.7 MiB | 35 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 525 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 373 µs | 373 µs | 71% |
| `run-policies` | 1 | 158 µs | 158 µs | 30% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 0 | 0.0% |

**At 10240 checks** (whole operation: 61.1 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 38.0 ms | 38.0 ms | 62% |
| `run-policies` | 1 | 23.8 ms | 23.8 ms | 39% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 0 | 0.0% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-20T08:49:15.389Z` → `2026-10-20T08:50:44.984Z` (90 s), ci: CI (run 39394260238)
- Machine: Intel(R) Xeon(R) Platinum 8370C CPU @ 2.80GHz, 4 logical core(s) (2 physical), 15989 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `29b96aabcbd1bbdbc252335ae1854e9d1d2345e7` on `dependabot/npm_and_yarn/dev-dependencies-0a04ba22e9`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

