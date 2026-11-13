# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **398 µs** per operation compared with a bare-minimum baseline (**134% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.84). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 398 µs | 45.2 ms |
| Added latency, relative to baseline | 134% | 201% |
| Added CPU time per operation | 1.84 ms | 48.7 ms |
| Added memory per operation (heap delta) | 354.1 KiB | 44.7 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 2,515 ops/s | 22 ops/s |

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
| 20 | 92.0 µs | 261 µs | 166 µs | 181% | 176 µs | $0.00035 – $0.002 |
| 40 | 155 µs | 435 µs | 279 µs | 180% | 1.69 ms | $0.00058 – $0.019 |
| 80 | 296 µs | 692 µs | 398 µs | 134% | 1.84 ms | $0.00083 – $0.021 |
| 160 | 541 µs | 1.23 ms | 697 µs | 129% | 632 µs | $0.0015 – $0.0071 |
| 320 | 881 µs | 2.48 ms | 1.58 ms | 179% | 1.64 ms | $0.0033 – $0.018 |
| 640 | 1.58 ms | 5.89 ms | 4.30 ms | 271% | 4.43 ms | $0.0089 – $0.050 |
| 1280 | 2.95 ms | 13.2 ms | 10.2 ms | 346% | 10.7 ms | $0.021 – $0.120 |
| 2560 | 5.71 ms | 19.8 ms | 14.1 ms | 246% | 14.8 ms | $0.029 – $0.167 |
| 5120 | 11.2 ms | 33.6 ms | 22.4 ms | 200% | 24.6 ms | $0.047 – $0.277 |
| 10240 | 22.5 ms | 67.8 ms | 45.2 ms | 201% | 48.7 ms | $0.094 – $0.548 |

**How the total grows:** O(n) (linear), exponent 0.84 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 316 µs | 38.0 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 3.01 ms | 411 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 151 µs | 25.5 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 175 µs | 35.4 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 147 µs | 25.8 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 177 µs | 35.9 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n log n) | ✅ matches | 75.4 µs | 9.69 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 283 µs | 414 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 761 µs | 97.5 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n) | ✅ matches | 7.77 ms | 1.50 s |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 274 µs | 28.4 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 316 µs | 63.5 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 361 µs | 26.7 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 359 µs | 28.8 ms |

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
| 20 | 99.2 µs | 103 µs | 344 µs | 53.0 KiB | 10,080 |
| 40 | 166 µs | 170 µs | 462 µs | 104.5 KiB | 6,036 |
| 80 | 316 µs | 340 µs | 810 µs | 211.4 KiB | 3,161 |
| 160 | 594 µs | 710 µs | 1.34 ms | 436.3 KiB | 1,684 |
| 320 | 1.17 ms | 1.35 ms | 2.70 ms | 938.9 KiB | 853 |
| 640 | 2.17 ms | 2.28 ms | 3.76 ms | 2.1 MiB | 461 |
| 1280 | 7.22 ms | 7.69 ms | 8.71 ms | 4.7 MiB | 138 |
| 2560 | 11.2 ms | 11.6 ms | 13.1 ms | 8.0 MiB | 89 |
| 5120 | 20.5 ms | 25.8 ms | 23.2 ms | 14.5 MiB | 49 |
| 10240 | 38.0 ms | 38.4 ms | 42.0 ms | 27.5 MiB | 26 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.06, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 810 µs | 835 µs | 1.58 ms | 294.9 KiB | 1,235 |
| 40 | 1.61 ms | 1.75 ms | 3.20 ms | 587.1 KiB | 619 |
| 80 | 3.01 ms | 3.54 ms | 4.71 ms | 1.1 MiB | 332 |
| 160 | 5.75 ms | 5.82 ms | 7.69 ms | 2.3 MiB | 174 |
| 320 | 11.2 ms | 13.7 ms | 13.5 ms | 4.7 MiB | 89 |
| 640 | 22.3 ms | 22.3 ms | 25.5 ms | 9.8 MiB | 45 |
| 1280 | 47.5 ms | 48.1 ms | 52.9 ms | 20.1 MiB | 21 |
| 2560 | 96.1 ms | 109 ms | 105 ms | 38.7 MiB | 10 |
| 5120 | 209 ms | 215 ms | 306 ms | 73.5 MiB | 5 |
| 10240 | 411 ms | 412 ms | 609 ms | 145.3 MiB | 2 |

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

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 55.5 µs | 61.3 µs | 58.3 µs | 48.1 KiB | 18,025 |
| 40 | 78.9 µs | 120 µs | 264 µs | 92.6 KiB | 12,675 |
| 80 | 151 µs | 201 µs | 464 µs | 188.5 KiB | 6,644 |
| 160 | 265 µs | 404 µs | 687 µs | 393.3 KiB | 3,769 |
| 320 | 554 µs | 749 µs | 1.48 ms | 855.2 KiB | 1,805 |
| 640 | 1.19 ms | 1.54 ms | 2.95 ms | 1.9 MiB | 839 |
| 1280 | 5.09 ms | 5.90 ms | 7.68 ms | 4.4 MiB | 197 |
| 2560 | 7.26 ms | 7.80 ms | 10.4 ms | 7.3 MiB | 138 |
| 5120 | 12.2 ms | 13.2 ms | 16.4 ms | 13.2 MiB | 82 |
| 10240 | 25.5 ms | 40.2 ms | 33.2 ms | 24.6 MiB | 39 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.03, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 58.1 µs | 62.9 µs | 184 µs | 54.1 KiB | 17,206 |
| 40 | 92.8 µs | 119 µs | 301 µs | 107.0 KiB | 10,779 |
| 80 | 175 µs | 236 µs | 536 µs | 217.3 KiB | 5,714 |
| 160 | 353 µs | 477 µs | 1.06 ms | 451.7 KiB | 2,830 |
| 320 | 707 µs | 922 µs | 2.04 ms | 955.7 KiB | 1,415 |
| 640 | 1.68 ms | 1.97 ms | 5.07 ms | 2.2 MiB | 595 |
| 1280 | 6.25 ms | 6.46 ms | 12.3 ms | 4.9 MiB | 160 |
| 2560 | 9.73 ms | 11.0 ms | 19.6 ms | 8.3 MiB | 103 |
| 5120 | 17.9 ms | 18.4 ms | 34.9 ms | 15.1 MiB | 56 |
| 10240 | 35.4 ms | 36.5 ms | 67.9 ms | 28.2 MiB | 28 |

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
| 20 | 49.6 µs | 54.5 µs | 144 µs | 47.0 KiB | 20,155 |
| 40 | 77.6 µs | 102 µs | 248 µs | 92.6 KiB | 12,892 |
| 80 | 147 µs | 202 µs | 446 µs | 188.5 KiB | 6,782 |
| 160 | 288 µs | 414 µs | 873 µs | 393.9 KiB | 3,474 |
| 320 | 545 µs | 752 µs | 1.40 ms | 853.7 KiB | 1,834 |
| 640 | 1.18 ms | 1.58 ms | 2.94 ms | 1.9 MiB | 847 |
| 1280 | 5.03 ms | 5.40 ms | 7.32 ms | 4.4 MiB | 199 |
| 2560 | 7.10 ms | 7.59 ms | 10.3 ms | 7.3 MiB | 141 |
| 5120 | 12.8 ms | 23.9 ms | 17.2 ms | 13.2 MiB | 78 |
| 10240 | 25.8 ms | 26.5 ms | 34.2 ms | 24.7 MiB | 39 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.04, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 55.5 µs | 61.8 µs | 219 µs | 54.2 KiB | 18,029 |
| 40 | 113 µs | 121 µs | 341 µs | 107.1 KiB | 8,837 |
| 80 | 177 µs | 233 µs | 566 µs | 217.3 KiB | 5,656 |
| 160 | 349 µs | 379 µs | 1.07 ms | 451.7 KiB | 2,865 |
| 320 | 708 µs | 926 µs | 1.98 ms | 970.6 KiB | 1,412 |
| 640 | 1.62 ms | 1.92 ms | 4.96 ms | 2.2 MiB | 616 |
| 1280 | 6.28 ms | 6.85 ms | 12.1 ms | 4.9 MiB | 159 |
| 2560 | 10.8 ms | 13.5 ms | 21.1 ms | 8.3 MiB | 92 |
| 5120 | 17.6 ms | 18.6 ms | 34.4 ms | 14.5 MiB | 57 |
| 10240 | 35.9 ms | 36.6 ms | 69.1 ms | 28.4 MiB | 28 |

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
| 20 | 31.1 µs | 46.6 µs | 31.6 µs | 30.5 KiB | 32,165 |
| 40 | 38.3 µs | 49.9 µs | 108 µs | 55.1 KiB | 26,118 |
| 80 | 75.4 µs | 91.1 µs | 227 µs | 104.6 KiB | 13,264 |
| 160 | 128 µs | 171 µs | 319 µs | 206.8 KiB | 7,803 |
| 320 | 280 µs | 332 µs | 825 µs | 402.2 KiB | 3,567 |
| 640 | 276 µs | 288 µs | 851 µs | 620.0 KiB | 3,626 |
| 1280 | 1.21 ms | 1.34 ms | 3.24 ms | 1.3 MiB | 826 |
| 2560 | 2.31 ms | 2.41 ms | 4.86 ms | 2.7 MiB | 432 |
| 5120 | 4.70 ms | 4.77 ms | 8.55 ms | 5.5 MiB | 213 |
| 10240 | 9.69 ms | 22.2 ms | 16.5 ms | 10.8 MiB | 103 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent 0.00, 10 sizes) -- ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 274 µs | 294 µs | 847 µs | 620.2 KiB | 3,646 |
| 40 | 277 µs | 297 µs | 862 µs | 620.3 KiB | 3,606 |
| 80 | 283 µs | 343 µs | 861 µs | 626.2 KiB | 3,540 |
| 160 | 299 µs | 337 µs | 878 µs | 667.5 KiB | 3,349 |
| 320 | 323 µs | 356 µs | 911 µs | 716.3 KiB | 3,100 |
| 640 | 412 µs | 432 µs | 1.28 ms | 834.3 KiB | 2,427 |
| 1280 | 414 µs | 480 µs | 1.29 ms | 834.3 KiB | 2,418 |
| 2560 | 413 µs | 477 µs | 1.29 ms | 834.3 KiB | 2,419 |
| 5120 | 416 µs | 466 µs | 1.29 ms | 834.3 KiB | 2,406 |
| 10240 | 414 µs | 498 µs | 1.29 ms | 834.3 KiB | 2,415 |

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

**Measured: O(n)** (exponent 0.97, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 206 µs | 220 µs | 588 µs | 45.6 KiB | 4,856 |
| 40 | 398 µs | 418 µs | 1.16 ms | 90.2 KiB | 2,514 |
| 80 | 761 µs | 835 µs | 1.57 ms | 178.6 KiB | 1,315 |
| 160 | 1.84 ms | 1.89 ms | 3.44 ms | 357.3 KiB | 543 |
| 320 | 3.49 ms | 3.67 ms | 5.46 ms | 712.3 KiB | 287 |
| 640 | 6.70 ms | 6.95 ms | 8.75 ms | 1.4 MiB | 149 |
| 1280 | 13.6 ms | 28.2 ms | 15.9 ms | 2.8 MiB | 73 |
| 2560 | 27.2 ms | 28.0 ms | 29.8 ms | 5.7 MiB | 37 |
| 5120 | 54.7 ms | 61.7 ms | 55.1 ms | 11.3 MiB | 18 |
| 10240 | 97.5 ms | 112 ms | 98.3 ms | 22.7 MiB | 10 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.04, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.25 ms | 2.46 ms | 4.14 ms | 599.8 KiB | 444 |
| 40 | 4.06 ms | 4.25 ms | 6.04 ms | 1.2 MiB | 246 |
| 80 | 7.77 ms | 11.3 ms | 9.86 ms | 2.3 MiB | 129 |
| 160 | 15.1 ms | 15.4 ms | 17.4 ms | 4.6 MiB | 66 |
| 320 | 41.8 ms | 42.7 ms | 42.4 ms | 9.3 MiB | 24 |
| 640 | 83.2 ms | 84.6 ms | 83.6 ms | 18.5 MiB | 12 |
| 1280 | 185 ms | 190 ms | 186 ms | 37.0 MiB | 5 |
| 2560 | 375 ms | 398 ms | 375 ms | 73.9 MiB | 3 |
| 5120 | 749 ms | 762 ms | 767 ms | 147.7 MiB | 1 |
| 10240 | 1.50 s | 1.55 s | 1.53 s | 295.3 MiB | 1 |

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
| 20 | 107 µs | 151 µs | 390 µs | 98.0 KiB | 9,358 |
| 40 | 155 µs | 229 µs | 440 µs | 179.0 KiB | 6,444 |
| 80 | 274 µs | 322 µs | 744 µs | 322.3 KiB | 3,656 |
| 160 | 496 µs | 594 µs | 1.22 ms | 637.9 KiB | 2,015 |
| 320 | 1.01 ms | 1.42 ms | 2.49 ms | 1.2 MiB | 990 |
| 640 | 1.79 ms | 1.98 ms | 3.33 ms | 2.5 MiB | 558 |
| 1280 | 3.35 ms | 3.45 ms | 4.58 ms | 4.9 MiB | 299 |
| 2560 | 6.74 ms | 6.93 ms | 8.66 ms | 9.9 MiB | 148 |
| 5120 | 13.6 ms | 14.3 ms | 16.4 ms | 19.8 MiB | 73 |
| 10240 | 28.4 ms | 30.2 ms | 32.6 ms | 39.6 MiB | 35 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.19, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 97.2 µs | 107 µs | 339 µs | 281.1 KiB | 10,283 |
| 40 | 162 µs | 180 µs | 449 µs | 539.5 KiB | 6,171 |
| 80 | 316 µs | 331 µs | 794 µs | 1.0 MiB | 3,165 |
| 160 | 620 µs | 713 µs | 1.36 ms | 2.1 MiB | 1,614 |
| 320 | 1.27 ms | 1.39 ms | 2.74 ms | 4.2 MiB | 785 |
| 640 | 2.43 ms | 2.58 ms | 4.03 ms | 8.3 MiB | 412 |
| 1280 | 4.84 ms | 6.52 ms | 6.74 ms | 16.7 MiB | 207 |
| 2560 | 9.70 ms | 10.2 ms | 12.1 ms | 33.3 MiB | 103 |
| 5120 | 26.7 ms | 28.0 ms | 30.4 ms | 52.0 MiB | 37 |
| 10240 | 63.5 ms | 66.7 ms | 73.9 ms | 103.7 MiB | 16 |

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

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 108 µs | 131 µs | 111 µs | 57.4 KiB | 9,285 |
| 40 | 193 µs | 218 µs | 197 µs | 113.5 KiB | 5,187 |
| 80 | 361 µs | 400 µs | 446 µs | 225.7 KiB | 2,767 |
| 160 | 590 µs | 733 µs | 2.02 ms | 450.0 KiB | 1,694 |
| 320 | 962 µs | 1.01 ms | 2.37 ms | 898.9 KiB | 1,040 |
| 640 | 1.69 ms | 1.80 ms | 2.91 ms | 1.8 MiB | 593 |
| 1280 | 3.24 ms | 3.60 ms | 4.14 ms | 3.5 MiB | 308 |
| 2560 | 6.25 ms | 6.60 ms | 6.59 ms | 6.9 MiB | 160 |
| 5120 | 12.9 ms | 13.6 ms | 13.2 ms | 13.8 MiB | 77 |
| 10240 | 26.7 ms | 27.1 ms | 27.3 ms | 27.7 MiB | 37 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 98.2 µs | 117 µs | 102 µs | 56.5 KiB | 10,186 |
| 40 | 181 µs | 202 µs | 185 µs | 111.8 KiB | 5,511 |
| 80 | 359 µs | 373 µs | 804 µs | 222.5 KiB | 2,782 |
| 160 | 548 µs | 679 µs | 1.88 ms | 443.7 KiB | 1,826 |
| 320 | 946 µs | 986 µs | 2.25 ms | 886.2 KiB | 1,057 |
| 640 | 1.71 ms | 1.86 ms | 3.20 ms | 1.7 MiB | 585 |
| 1280 | 3.33 ms | 3.43 ms | 5.13 ms | 3.5 MiB | 301 |
| 2560 | 6.38 ms | 6.50 ms | 7.91 ms | 6.9 MiB | 157 |
| 5120 | 12.6 ms | 13.6 ms | 15.8 ms | 13.8 MiB | 79 |
| 10240 | 28.8 ms | 40.3 ms | 33.4 ms | 27.7 MiB | 35 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 692 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 316 µs | 316 µs | 46% |
| `run-policies` | 1 | 151 µs | 151 µs | 22% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 225 µs | 33% |

**At 10240 checks** (whole operation: 67.8 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 38.0 ms | 38.0 ms | 56% |
| `run-policies` | 1 | 25.5 ms | 25.5 ms | 38% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 4.28 ms | 6.3% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-13T06:55:48.480Z` → `2026-11-13T06:57:21.898Z` (93 s), ci: CI (run 43379180763)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `b218ab4f7826516cb741170f087bebfb3a00c876` on `docs/v1-claims-evidence`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

