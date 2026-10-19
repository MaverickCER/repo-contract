# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **271 µs** per operation compared with a bare-minimum baseline (**138% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.97). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 271 µs | 37.7 ms |
| Added latency, relative to baseline | 138% | 216% |
| Added CPU time per operation | 753 µs | 40.6 ms |
| Added memory per operation (heap delta) | 345.9 KiB | 44.6 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,684 ops/s | 27 ops/s |

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
| 20 | 57.8 µs | 177 µs | 119 µs | 206% | 163 µs | $0.00025 – $0.0018 |
| 40 | 98.3 µs | 268 µs | 169 µs | 172% | 575 µs | $0.00035 – $0.0065 |
| 80 | 197 µs | 468 µs | 271 µs | 138% | 753 µs | $0.00057 – $0.0085 |
| 160 | 348 µs | 951 µs | 603 µs | 173% | 1.88 ms | $0.0013 – $0.021 |
| 320 | 670 µs | 1.61 ms | 939 µs | 140% | 1.86 ms | $0.002 – $0.021 |
| 640 | 1.33 ms | 3.08 ms | 1.75 ms | 131% | 2.15 ms | $0.0036 – $0.024 |
| 1280 | 2.37 ms | 11.5 ms | 9.13 ms | 386% | 9.65 ms | $0.019 – $0.109 |
| 2560 | 4.53 ms | 17.6 ms | 13.0 ms | 288% | 13.8 ms | $0.027 – $0.155 |
| 5120 | 8.79 ms | 30.7 ms | 21.9 ms | 249% | 23.9 ms | $0.046 – $0.268 |
| 10240 | 17.5 ms | 55.2 ms | 37.7 ms | 216% | 40.6 ms | $0.079 – $0.456 |

**How the total grows:** O(n) (linear), exponent 0.97 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 281 µs | 32.0 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 2.55 ms | 345 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 142 µs | 20.7 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 182 µs | 32.1 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 137 µs | 21.2 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 182 µs | 32.3 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n log n) | ✅ matches | 78.5 µs | 9.30 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 265 µs | 369 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 672 µs | 67.4 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n) | ✅ matches | 6.61 ms | 815 ms |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 255 µs | 24.5 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 310 µs | 65.6 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 288 µs | 25.5 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 301 µs | 26.7 ms |

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
| 20 | 84.5 µs | 89.5 µs | 307 µs | 52.8 KiB | 11,833 |
| 40 | 150 µs | 159 µs | 492 µs | 104.5 KiB | 6,683 |
| 80 | 281 µs | 291 µs | 838 µs | 211.3 KiB | 3,562 |
| 160 | 538 µs | 572 µs | 1.50 ms | 436.3 KiB | 1,858 |
| 320 | 1.09 ms | 1.24 ms | 3.08 ms | 938.9 KiB | 921 |
| 640 | 1.88 ms | 2.00 ms | 3.93 ms | 2.1 MiB | 532 |
| 1280 | 6.76 ms | 7.74 ms | 8.80 ms | 4.7 MiB | 148 |
| 2560 | 10.3 ms | 10.9 ms | 12.8 ms | 8.0 MiB | 97 |
| 5120 | 17.6 ms | 19.6 ms | 20.3 ms | 14.5 MiB | 57 |
| 10240 | 32.0 ms | 32.7 ms | 36.1 ms | 27.6 MiB | 31 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.06, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 704 µs | 754 µs | 1.68 ms | 294.9 KiB | 1,420 |
| 40 | 1.41 ms | 1.46 ms | 3.45 ms | 587.1 KiB | 707 |
| 80 | 2.55 ms | 3.08 ms | 4.73 ms | 1.1 MiB | 391 |
| 160 | 4.79 ms | 4.97 ms | 7.33 ms | 2.3 MiB | 209 |
| 320 | 9.27 ms | 9.54 ms | 12.4 ms | 4.7 MiB | 108 |
| 640 | 18.2 ms | 19.0 ms | 22.6 ms | 9.8 MiB | 55 |
| 1280 | 39.8 ms | 41.8 ms | 47.3 ms | 20.1 MiB | 25 |
| 2560 | 75.8 ms | 80.4 ms | 88.1 ms | 38.7 MiB | 13 |
| 5120 | 177 ms | 179 ms | 282 ms | 73.5 MiB | 6 |
| 10240 | 345 ms | 347 ms | 558 ms | 145.2 MiB | 3 |

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
| 20 | 40.0 µs | 46.2 µs | 43.9 µs | 46.9 KiB | 24,995 |
| 40 | 72.0 µs | 77.1 µs | 272 µs | 92.5 KiB | 13,888 |
| 80 | 142 µs | 157 µs | 509 µs | 188.5 KiB | 7,020 |
| 160 | 269 µs | 317 µs | 916 µs | 393.8 KiB | 3,720 |
| 320 | 511 µs | 655 µs | 1.58 ms | 855.2 KiB | 1,957 |
| 640 | 1.10 ms | 1.22 ms | 3.44 ms | 1.9 MiB | 906 |
| 1280 | 4.99 ms | 5.49 ms | 7.71 ms | 4.4 MiB | 200 |
| 2560 | 6.63 ms | 6.92 ms | 9.95 ms | 7.3 MiB | 151 |
| 5120 | 11.1 ms | 12.1 ms | 16.0 ms | 13.2 MiB | 90 |
| 10240 | 20.7 ms | 21.6 ms | 29.4 ms | 24.6 MiB | 48 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 47.9 µs | 52.2 µs | 50.4 µs | 54.1 KiB | 20,858 |
| 40 | 89.2 µs | 96.6 µs | 304 µs | 107.0 KiB | 11,208 |
| 80 | 182 µs | 194 µs | 636 µs | 217.3 KiB | 5,492 |
| 160 | 349 µs | 394 µs | 1.21 ms | 451.7 KiB | 2,863 |
| 320 | 700 µs | 802 µs | 2.36 ms | 970.6 KiB | 1,429 |
| 640 | 1.61 ms | 1.69 ms | 5.96 ms | 2.2 MiB | 621 |
| 1280 | 6.13 ms | 6.38 ms | 13.3 ms | 4.9 MiB | 163 |
| 2560 | 9.18 ms | 9.85 ms | 20.7 ms | 8.3 MiB | 109 |
| 5120 | 17.4 ms | 18.2 ms | 40.4 ms | 15.1 MiB | 58 |
| 10240 | 32.1 ms | 35.0 ms | 70.4 ms | 28.2 MiB | 31 |

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
| 20 | 44.3 µs | 52.1 µs | 45.7 µs | 47.0 KiB | 22,555 |
| 40 | 75.6 µs | 84.3 µs | 282 µs | 92.6 KiB | 13,221 |
| 80 | 137 µs | 156 µs | 466 µs | 188.4 KiB | 7,280 |
| 160 | 284 µs | 326 µs | 990 µs | 393.9 KiB | 3,515 |
| 320 | 521 µs | 642 µs | 1.64 ms | 856.1 KiB | 1,920 |
| 640 | 1.11 ms | 1.37 ms | 3.48 ms | 1.9 MiB | 899 |
| 1280 | 4.92 ms | 5.21 ms | 7.76 ms | 4.4 MiB | 203 |
| 2560 | 6.83 ms | 7.30 ms | 10.2 ms | 7.3 MiB | 146 |
| 5120 | 10.8 ms | 12.1 ms | 15.5 ms | 13.2 MiB | 92 |
| 10240 | 21.2 ms | 21.6 ms | 28.8 ms | 24.6 MiB | 47 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 48.2 µs | 53.8 µs | 49.4 µs | 54.2 KiB | 20,728 |
| 40 | 88.6 µs | 101 µs | 337 µs | 107.0 KiB | 11,282 |
| 80 | 182 µs | 197 µs | 646 µs | 217.3 KiB | 5,483 |
| 160 | 350 µs | 394 µs | 1.22 ms | 451.7 KiB | 2,857 |
| 320 | 708 µs | 819 µs | 2.36 ms | 970.6 KiB | 1,412 |
| 640 | 1.59 ms | 1.70 ms | 5.92 ms | 2.2 MiB | 628 |
| 1280 | 6.06 ms | 6.56 ms | 12.9 ms | 4.9 MiB | 165 |
| 2560 | 8.83 ms | 9.10 ms | 19.7 ms | 8.3 MiB | 113 |
| 5120 | 16.0 ms | 17.1 ms | 37.1 ms | 15.1 MiB | 63 |
| 10240 | 32.3 ms | 32.8 ms | 74.3 ms | 28.1 MiB | 31 |

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
| 20 | 28.0 µs | 45.3 µs | 28.6 µs | 30.5 KiB | 35,758 |
| 40 | 43.9 µs | 46.9 µs | 167 µs | 55.2 KiB | 22,785 |
| 80 | 78.5 µs | 114 µs | 275 µs | 104.6 KiB | 12,737 |
| 160 | 146 µs | 180 µs | 482 µs | 207.7 KiB | 6,850 |
| 320 | 285 µs | 414 µs | 972 µs | 402.2 KiB | 3,514 |
| 640 | 263 µs | 286 µs | 836 µs | 615.2 KiB | 3,807 |
| 1280 | 1.17 ms | 1.23 ms | 3.74 ms | 1.3 MiB | 852 |
| 2560 | 2.22 ms | 2.39 ms | 5.41 ms | 2.7 MiB | 450 |
| 5120 | 4.51 ms | 4.64 ms | 9.05 ms | 5.5 MiB | 222 |
| 10240 | 9.30 ms | 9.50 ms | 16.3 ms | 10.8 MiB | 107 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Sorting every check by duration dominates; listing the first few lines of the sorted result adds almost nothing.

**Measured: O(1)** (exponent -0.00, 10 sizes) -- ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 259 µs | 279 µs | 821 µs | 616.5 KiB | 3,867 |
| 40 | 263 µs | 279 µs | 827 µs | 618.2 KiB | 3,798 |
| 80 | 265 µs | 286 µs | 833 µs | 625.9 KiB | 3,779 |
| 160 | 279 µs | 292 µs | 846 µs | 663.4 KiB | 3,581 |
| 320 | 331 µs | 347 µs | 1.09 ms | 716.3 KiB | 3,026 |
| 640 | 372 µs | 391 µs | 1.13 ms | 829.2 KiB | 2,691 |
| 1280 | 370 µs | 398 µs | 1.12 ms | 829.2 KiB | 2,704 |
| 2560 | 367 µs | 395 µs | 1.12 ms | 829.2 KiB | 2,722 |
| 5120 | 367 µs | 401 µs | 1.10 ms | 829.2 KiB | 2,727 |
| 10240 | 369 µs | 403 µs | 1.12 ms | 829.2 KiB | 2,709 |

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

**Measured: O(n)** (exponent 0.91, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 190 µs | 204 µs | 680 µs | 45.6 KiB | 5,272 |
| 40 | 327 µs | 349 µs | 988 µs | 115.7 KiB | 3,056 |
| 80 | 672 µs | 704 µs | 1.70 ms | 178.6 KiB | 1,489 |
| 160 | 1.56 ms | 1.65 ms | 3.60 ms | 357.3 KiB | 642 |
| 320 | 2.88 ms | 3.02 ms | 5.28 ms | 712.3 KiB | 347 |
| 640 | 5.49 ms | 5.74 ms | 7.98 ms | 1.4 MiB | 182 |
| 1280 | 10.6 ms | 11.1 ms | 13.4 ms | 2.8 MiB | 94 |
| 2560 | 19.8 ms | 20.4 ms | 23.0 ms | 5.7 MiB | 50 |
| 5120 | 37.6 ms | 38.3 ms | 42.3 ms | 11.3 MiB | 27 |
| 10240 | 67.4 ms | 67.9 ms | 74.2 ms | 22.7 MiB | 15 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.00 ms | 2.12 ms | 4.32 ms | 599.8 KiB | 501 |
| 40 | 3.57 ms | 3.76 ms | 5.99 ms | 1.2 MiB | 280 |
| 80 | 6.61 ms | 6.87 ms | 9.09 ms | 2.3 MiB | 151 |
| 160 | 12.1 ms | 12.8 ms | 15.0 ms | 4.6 MiB | 83 |
| 320 | 28.5 ms | 29.1 ms | 32.4 ms | 9.3 MiB | 35 |
| 640 | 52.8 ms | 53.8 ms | 58.1 ms | 18.5 MiB | 19 |
| 1280 | 103 ms | 104 ms | 111 ms | 37.0 MiB | 10 |
| 2560 | 210 ms | 212 ms | 221 ms | 73.9 MiB | 5 |
| 5120 | 412 ms | 413 ms | 432 ms | 147.7 MiB | 2 |
| 10240 | 815 ms | 819 ms | 860 ms | 295.3 MiB | 1 |

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
| 20 | 98.7 µs | 143 µs | 219 µs | 97.9 KiB | 10,132 |
| 40 | 146 µs | 181 µs | 516 µs | 178.9 KiB | 6,870 |
| 80 | 255 µs | 302 µs | 864 µs | 322.3 KiB | 3,924 |
| 160 | 448 µs | 485 µs | 1.39 ms | 637.8 KiB | 2,231 |
| 320 | 773 µs | 825 µs | 1.74 ms | 1.2 MiB | 1,293 |
| 640 | 1.55 ms | 1.70 ms | 3.48 ms | 2.5 MiB | 646 |
| 1280 | 2.87 ms | 3.01 ms | 4.55 ms | 4.9 MiB | 349 |
| 2560 | 5.68 ms | 5.86 ms | 8.01 ms | 9.9 MiB | 176 |
| 5120 | 11.9 ms | 12.5 ms | 15.0 ms | 19.8 MiB | 84 |
| 10240 | 24.5 ms | 24.8 ms | 29.0 ms | 39.6 MiB | 41 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.20, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 88.2 µs | 98.1 µs | 362 µs | 281.1 KiB | 11,340 |
| 40 | 155 µs | 168 µs | 527 µs | 539.5 KiB | 6,451 |
| 80 | 310 µs | 328 µs | 941 µs | 1.0 MiB | 3,227 |
| 160 | 598 µs | 642 µs | 1.58 ms | 2.1 MiB | 1,672 |
| 320 | 1.29 ms | 1.37 ms | 3.34 ms | 4.2 MiB | 774 |
| 640 | 2.43 ms | 2.59 ms | 4.58 ms | 8.3 MiB | 412 |
| 1280 | 4.78 ms | 6.41 ms | 7.31 ms | 16.7 MiB | 209 |
| 2560 | 9.29 ms | 9.49 ms | 12.5 ms | 33.3 MiB | 108 |
| 5120 | 27.2 ms | 28.7 ms | 32.0 ms | 52.0 MiB | 37 |
| 10240 | 65.6 ms | 66.5 ms | 77.3 ms | 103.7 MiB | 15 |

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
| 20 | 92.8 µs | 125 µs | 97.0 µs | 57.3 KiB | 10,781 |
| 40 | 158 µs | 175 µs | 161 µs | 113.3 KiB | 6,340 |
| 80 | 288 µs | 305 µs | 295 µs | 225.5 KiB | 3,475 |
| 160 | 545 µs | 574 µs | 1.87 ms | 450.0 KiB | 1,835 |
| 320 | 877 µs | 1.05 ms | 2.74 ms | 898.7 KiB | 1,140 |
| 640 | 1.61 ms | 1.78 ms | 3.49 ms | 1.8 MiB | 623 |
| 1280 | 3.06 ms | 3.18 ms | 4.45 ms | 3.5 MiB | 327 |
| 2560 | 6.21 ms | 6.32 ms | 6.85 ms | 6.9 MiB | 161 |
| 5120 | 12.6 ms | 12.8 ms | 12.7 ms | 13.8 MiB | 79 |
| 10240 | 25.5 ms | 26.2 ms | 26.2 ms | 27.7 MiB | 39 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.98, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 87.6 µs | 101 µs | 92.0 µs | 56.4 KiB | 11,421 |
| 40 | 158 µs | 172 µs | 162 µs | 111.7 KiB | 6,316 |
| 80 | 301 µs | 325 µs | 309 µs | 222.3 KiB | 3,322 |
| 160 | 565 µs | 594 µs | 2.33 ms | 443.6 KiB | 1,770 |
| 320 | 951 µs | 1.00e+3 µs | 2.71 ms | 886.1 KiB | 1,051 |
| 640 | 1.77 ms | 1.91 ms | 4.05 ms | 1.7 MiB | 565 |
| 1280 | 3.33 ms | 3.33 ms | 5.92 ms | 3.5 MiB | 301 |
| 2560 | 6.22 ms | 6.42 ms | 8.71 ms | 6.9 MiB | 161 |
| 5120 | 13.0 ms | 13.2 ms | 17.0 ms | 13.8 MiB | 77 |
| 10240 | 26.7 ms | 26.8 ms | 33.5 ms | 27.7 MiB | 38 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 468 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 281 µs | 281 µs | 60% |
| `run-policies` | 1 | 142 µs | 142 µs | 30% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 44.9 µs | 9.6% |

**At 10240 checks** (whole operation: 55.2 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 32.0 ms | 32.0 ms | 58% |
| `run-policies` | 1 | 20.7 ms | 20.7 ms | 38% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 2.45 ms | 4.4% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-19T06:59:09.369Z` → `2026-10-19T07:00:34.292Z` (85 s), ci: CI (run 39211536253)
- Machine: INTEL(R) XEON(R) PLATINUM 8573C, 4 logical core(s) (2 physical), 15989 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `815dd5ed4df740239025d431bf0867004cac63e7` on `feat/adopt-ipc-v0.12.0`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

