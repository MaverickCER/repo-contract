# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **140 µs** per operation compared with a bare-minimum baseline (**125% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.02). At list prices that is on the order of **~$0.0001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 140 µs | 28.7 ms |
| Added latency, relative to baseline | 125% | 233% |
| Added CPU time per operation | 339 µs | 33.2 ms |
| Added memory per operation (heap delta) | 345.3 KiB | 44.7 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.0001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 7,159 ops/s | 35 ops/s |

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
| 20 | 31.0 µs | 87.6 µs | 56.6 µs | 183% | 210 µs | $0.00012 – $0.0024 |
| 40 | 55.9 µs | 136 µs | 79.8 µs | 143% | 209 µs | $0.00017 – $0.0023 |
| 80 | 112 µs | 252 µs | 140 µs | 125% | 339 µs | $0.00029 – $0.0038 |
| 160 | 215 µs | 484 µs | 268 µs | 125% | 549 µs | $0.00056 – $0.0062 |
| 320 | 439 µs | 889 µs | 451 µs | 103% | 470 µs | $0.00094 – $0.0053 |
| 640 | 815 µs | 1.95 ms | 1.13 ms | 139% | 1.96 ms | $0.0024 – $0.022 |
| 1280 | 1.65 ms | 7.74 ms | 6.09 ms | 369% | 6.56 ms | $0.013 – $0.074 |
| 2560 | 3.15 ms | 11.5 ms | 8.32 ms | 264% | 8.88 ms | $0.017 – $0.100 |
| 5120 | 6.26 ms | 20.3 ms | 14.1 ms | 225% | 15.4 ms | $0.029 – $0.173 |
| 10240 | 12.3 ms | 41.1 ms | 28.7 ms | 233% | 33.2 ms | $0.060 – $0.373 |

**How the total grows:** O(n) (linear), exponent 1.02 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 158 µs | 21.4 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 1.72 ms | 250 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 67.2 µs | 16.4 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 86.6 µs | 26.6 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 69.5 µs | 16.5 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 90.7 µs | 26.1 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n log n) | ✅ matches | 36.4 µs | 6.21 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 142 µs | 192 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 432 µs | 41.8 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n) | ✅ matches | 3.92 ms | 495 ms |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 135 µs | 16.7 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 161 µs | 42.4 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 184 µs | 15.7 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 181 µs | 15.4 ms |

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
| 20 | 47.9 µs | 52.9 µs | 152 µs | 52.8 KiB | 20,891 |
| 40 | 83.8 µs | 100 µs | 217 µs | 104.3 KiB | 11,930 |
| 80 | 158 µs | 170 µs | 368 µs | 211.1 KiB | 6,340 |
| 160 | 308 µs | 338 µs | 663 µs | 436.0 KiB | 3,248 |
| 320 | 593 µs | 647 µs | 1.14 ms | 938.5 KiB | 1,687 |
| 640 | 1.20 ms | 1.28 ms | 2.31 ms | 2.1 MiB | 835 |
| 1280 | 4.26 ms | 4.45 ms | 5.38 ms | 4.7 MiB | 234 |
| 2560 | 6.64 ms | 7.56 ms | 8.26 ms | 8.0 MiB | 151 |
| 5120 | 11.4 ms | 12.2 ms | 13.2 ms | 14.5 MiB | 87 |
| 10240 | 21.4 ms | 24.6 ms | 25.0 ms | 27.5 MiB | 47 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.08, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 463 µs | 477 µs | 1.00 ms | 294.9 KiB | 2,159 |
| 40 | 854 µs | 897 µs | 1.41 ms | 585.9 KiB | 1,172 |
| 80 | 1.72 ms | 2.11 ms | 2.92 ms | 1.1 MiB | 581 |
| 160 | 3.25 ms | 3.30 ms | 4.60 ms | 2.3 MiB | 308 |
| 320 | 6.35 ms | 6.64 ms | 8.02 ms | 4.7 MiB | 157 |
| 640 | 12.6 ms | 13.1 ms | 14.9 ms | 9.8 MiB | 80 |
| 1280 | 27.2 ms | 30.6 ms | 31.6 ms | 20.1 MiB | 37 |
| 2560 | 53.0 ms | 57.4 ms | 61.8 ms | 38.7 MiB | 19 |
| 5120 | 124 ms | 124 ms | 190 ms | 73.5 MiB | 8 |
| 10240 | 250 ms | 251 ms | 395 ms | 145.2 MiB | 4 |

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

**Measured: O(n log n)** (exponent 1.12, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 24.8 µs | 29.7 µs | 25.4 µs | 47.1 KiB | 40,340 |
| 40 | 33.8 µs | 46.6 µs | 101 µs | 92.4 KiB | 29,598 |
| 80 | 67.2 µs | 93.0 µs | 199 µs | 188.2 KiB | 14,886 |
| 160 | 134 µs | 192 µs | 378 µs | 391.2 KiB | 7,477 |
| 320 | 264 µs | 381 µs | 677 µs | 848.5 KiB | 3,782 |
| 640 | 553 µs | 956 µs | 1.24 ms | 1.9 MiB | 1,809 |
| 1280 | 2.92 ms | 3.18 ms | 4.72 ms | 4.4 MiB | 343 |
| 2560 | 4.33 ms | 4.64 ms | 6.40 ms | 7.3 MiB | 231 |
| 5120 | 7.74 ms | 8.10 ms | 11.1 ms | 13.2 MiB | 129 |
| 10240 | 16.4 ms | 17.7 ms | 23.1 ms | 24.9 MiB | 61 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.20, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 27.5 µs | 30.9 µs | 28.3 µs | 54.1 KiB | 36,372 |
| 40 | 42.5 µs | 56.9 µs | 125 µs | 106.8 KiB | 23,556 |
| 80 | 86.6 µs | 117 µs | 256 µs | 217.1 KiB | 11,550 |
| 160 | 193 µs | 239 µs | 571 µs | 451.1 KiB | 5,189 |
| 320 | 402 µs | 507 µs | 1.25 ms | 970.6 KiB | 2,485 |
| 640 | 754 µs | 956 µs | 1.87 ms | 2.1 MiB | 1,326 |
| 1280 | 4.09 ms | 5.05 ms | 8.87 ms | 4.9 MiB | 244 |
| 2560 | 6.72 ms | 7.19 ms | 13.9 ms | 8.3 MiB | 149 |
| 5120 | 13.5 ms | 19.5 ms | 25.9 ms | 15.1 MiB | 74 |
| 10240 | 26.6 ms | 26.9 ms | 51.8 ms | 28.3 MiB | 38 |

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

**Measured: O(n log n)** (exponent 1.12, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 23.1 µs | 25.6 µs | 24.3 µs | 46.9 KiB | 43,339 |
| 40 | 34.2 µs | 46.5 µs | 98.8 µs | 92.5 KiB | 29,279 |
| 80 | 69.5 µs | 97.9 µs | 209 µs | 188.2 KiB | 14,396 |
| 160 | 135 µs | 233 µs | 389 µs | 389.6 KiB | 7,424 |
| 320 | 272 µs | 397 µs | 700 µs | 853.8 KiB | 3,675 |
| 640 | 547 µs | 741 µs | 1.18 ms | 1.9 MiB | 1,829 |
| 1280 | 3.02 ms | 3.29 ms | 4.51 ms | 4.4 MiB | 332 |
| 2560 | 4.39 ms | 4.61 ms | 6.65 ms | 7.3 MiB | 228 |
| 5120 | 7.55 ms | 7.78 ms | 10.9 ms | 13.2 MiB | 132 |
| 10240 | 16.5 ms | 18.1 ms | 23.3 ms | 24.8 MiB | 60 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.11, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 28.8 µs | 34.5 µs | 29.7 µs | 54.1 KiB | 34,731 |
| 40 | 43.4 µs | 55.1 µs | 133 µs | 106.9 KiB | 23,055 |
| 80 | 90.7 µs | 119 µs | 286 µs | 217.1 KiB | 11,025 |
| 160 | 166 µs | 234 µs | 477 µs | 444.5 KiB | 6,039 |
| 320 | 347 µs | 384 µs | 1.00 ms | 955.9 KiB | 2,880 |
| 640 | 959 µs | 1.06 ms | 3.23 ms | 2.1 MiB | 1,043 |
| 1280 | 4.39 ms | 7.79 ms | 9.08 ms | 4.8 MiB | 228 |
| 2560 | 7.04 ms | 7.49 ms | 14.7 ms | 8.2 MiB | 142 |
| 5120 | 13.3 ms | 13.9 ms | 26.1 ms | 14.9 MiB | 75 |
| 10240 | 26.1 ms | 26.1 ms | 50.8 ms | 28.3 MiB | 38 |

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

**Measured: O(n log n)** (exponent 1.34, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 18.2 µs | 33.0 µs | 18.8 µs | 30.5 KiB | 55,013 |
| 40 | 20.0 µs | 36.3 µs | 59.3 µs | 55.1 KiB | 49,878 |
| 80 | 36.4 µs | 51.3 µs | 111 µs | 104.6 KiB | 27,473 |
| 160 | 71.7 µs | 101 µs | 205 µs | 206.7 KiB | 13,941 |
| 320 | 67.4 µs | 75.6 µs | 182 µs | 298.6 KiB | 14,833 |
| 640 | 132 µs | 138 µs | 341 µs | 610.7 KiB | 7,595 |
| 1280 | 595 µs | 631 µs | 1.30 ms | 1.3 MiB | 1,682 |
| 2560 | 1.33 ms | 1.39 ms | 3.06 ms | 2.7 MiB | 753 |
| 5120 | 2.81 ms | 2.89 ms | 5.24 ms | 5.5 MiB | 357 |
| 10240 | 6.21 ms | 6.38 ms | 10.8 ms | 10.8 MiB | 161 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent -0.00, 10 sizes) -- ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 138 µs | 151 µs | 384 µs | 614.2 KiB | 7,255 |
| 40 | 134 µs | 169 µs | 340 µs | 625.4 KiB | 7,464 |
| 80 | 142 µs | 155 µs | 385 µs | 628.3 KiB | 7,062 |
| 160 | 149 µs | 163 µs | 396 µs | 661.3 KiB | 6,720 |
| 320 | 160 µs | 174 µs | 404 µs | 731.7 KiB | 6,235 |
| 640 | 194 µs | 208 µs | 500 µs | 826.6 KiB | 5,157 |
| 1280 | 191 µs | 211 µs | 498 µs | 826.6 KiB | 5,234 |
| 2560 | 192 µs | 208 µs | 495 µs | 826.6 KiB | 5,219 |
| 5120 | 193 µs | 208 µs | 498 µs | 826.6 KiB | 5,186 |
| 10240 | 192 µs | 207 µs | 496 µs | 826.6 KiB | 5,213 |

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

**Measured: O(n)** (exponent 0.86, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 99.7 µs | 105 µs | 283 µs | 50.5 KiB | 10,031 |
| 40 | 185 µs | 196 µs | 467 µs | 109.0 KiB | 5,402 |
| 80 | 432 µs | 454 µs | 1.02 ms | 178.6 KiB | 2,314 |
| 160 | 1.11 ms | 1.15 ms | 2.28 ms | 357.3 KiB | 900 |
| 320 | 2.09 ms | 2.21 ms | 3.47 ms | 712.3 KiB | 478 |
| 640 | 3.93 ms | 4.16 ms | 5.36 ms | 1.4 MiB | 254 |
| 1280 | 7.16 ms | 7.47 ms | 8.75 ms | 2.8 MiB | 140 |
| 2560 | 12.7 ms | 13.3 ms | 14.8 ms | 5.7 MiB | 79 |
| 5120 | 23.8 ms | 24.3 ms | 26.6 ms | 11.3 MiB | 42 |
| 10240 | 41.8 ms | 42.2 ms | 46.0 ms | 22.7 MiB | 24 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.98, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.24 ms | 1.35 ms | 2.55 ms | 599.8 KiB | 808 |
| 40 | 2.12 ms | 2.24 ms | 3.44 ms | 1.2 MiB | 472 |
| 80 | 3.92 ms | 4.14 ms | 5.30 ms | 2.3 MiB | 255 |
| 160 | 7.11 ms | 7.62 ms | 8.85 ms | 4.6 MiB | 141 |
| 320 | 21.9 ms | 35.5 ms | 24.4 ms | 9.3 MiB | 46 |
| 640 | 32.5 ms | 32.8 ms | 35.0 ms | 18.5 MiB | 31 |
| 1280 | 62.6 ms | 63.6 ms | 67.2 ms | 37.0 MiB | 16 |
| 2560 | 127 ms | 131 ms | 135 ms | 73.9 MiB | 8 |
| 5120 | 248 ms | 254 ms | 258 ms | 147.7 MiB | 4 |
| 10240 | 495 ms | 539 ms | 518 ms | 295.3 MiB | 2 |

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
| 20 | 53.8 µs | 77.5 µs | 198 µs | 98.0 KiB | 18,600 |
| 40 | 76.4 µs | 107 µs | 188 µs | 178.9 KiB | 13,087 |
| 80 | 135 µs | 149 µs | 336 µs | 322.2 KiB | 7,404 |
| 160 | 262 µs | 278 µs | 602 µs | 637.7 KiB | 3,818 |
| 320 | 503 µs | 553 µs | 1.04 ms | 1.2 MiB | 1,986 |
| 640 | 1.02 ms | 1.08 ms | 2.13 ms | 2.5 MiB | 981 |
| 1280 | 1.90 ms | 2.01 ms | 2.90 ms | 4.9 MiB | 527 |
| 2560 | 3.72 ms | 3.85 ms | 4.94 ms | 9.9 MiB | 269 |
| 5120 | 7.88 ms | 11.7 ms | 9.67 ms | 19.8 MiB | 127 |
| 10240 | 16.7 ms | 18.2 ms | 19.7 ms | 39.6 MiB | 60 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.22, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 46.6 µs | 51.4 µs | 142 µs | 280.3 KiB | 21,452 |
| 40 | 81.8 µs | 87.7 µs | 211 µs | 538.7 KiB | 12,232 |
| 80 | 161 µs | 174 µs | 368 µs | 1.0 MiB | 6,218 |
| 160 | 330 µs | 356 µs | 680 µs | 2.1 MiB | 3,027 |
| 320 | 663 µs | 709 µs | 1.20 ms | 4.2 MiB | 1,508 |
| 640 | 1.45 ms | 1.55 ms | 2.56 ms | 8.3 MiB | 688 |
| 1280 | 3.10 ms | 3.36 ms | 4.40 ms | 16.7 MiB | 323 |
| 2560 | 6.50 ms | 6.66 ms | 8.11 ms | 33.3 MiB | 154 |
| 5120 | 17.2 ms | 17.9 ms | 19.5 ms | 52.0 MiB | 58 |
| 10240 | 42.4 ms | 42.8 ms | 50.1 ms | 103.7 MiB | 24 |

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
| 20 | 57.9 µs | 82.2 µs | 61.0 µs | 57.3 KiB | 17,260 |
| 40 | 99.0 µs | 111 µs | 102 µs | 113.3 KiB | 10,097 |
| 80 | 184 µs | 199 µs | 187 µs | 225.5 KiB | 5,423 |
| 160 | 337 µs | 351 µs | 1.33 ms | 450.0 KiB | 2,969 |
| 320 | 543 µs | 576 µs | 1.49 ms | 898.7 KiB | 1,842 |
| 640 | 973 µs | 1.01 ms | 1.96 ms | 1.8 MiB | 1,027 |
| 1280 | 1.91 ms | 1.97 ms | 2.91 ms | 3.5 MiB | 524 |
| 2560 | 3.58 ms | 3.80 ms | 3.76 ms | 6.9 MiB | 279 |
| 5120 | 7.47 ms | 7.73 ms | 7.62 ms | 13.8 MiB | 134 |
| 10240 | 15.7 ms | 16.5 ms | 16.1 ms | 27.7 MiB | 64 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 52.3 µs | 55.1 µs | 55.0 µs | 56.4 KiB | 19,117 |
| 40 | 94.4 µs | 107 µs | 97.0 µs | 111.7 KiB | 10,592 |
| 80 | 181 µs | 194 µs | 183 µs | 222.3 KiB | 5,538 |
| 160 | 326 µs | 341 µs | 1.24 ms | 443.6 KiB | 3,067 |
| 320 | 534 µs | 553 µs | 1.41 ms | 886.1 KiB | 1,873 |
| 640 | 986 µs | 1.01 ms | 1.99 ms | 1.7 MiB | 1,015 |
| 1280 | 1.87 ms | 2.04 ms | 3.05 ms | 3.5 MiB | 536 |
| 2560 | 3.57 ms | 3.64 ms | 4.65 ms | 6.9 MiB | 280 |
| 5120 | 7.34 ms | 7.44 ms | 9.43 ms | 13.8 MiB | 136 |
| 10240 | 15.4 ms | 15.5 ms | 18.9 ms | 27.7 MiB | 65 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 252 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 158 µs | 158 µs | 63% |
| `run-policies` | 1 | 67.2 µs | 67.2 µs | 27% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 26.8 µs | 11% |

**At 10240 checks** (whole operation: 41.1 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 21.4 ms | 21.4 ms | 52% |
| `run-policies` | 1 | 16.4 ms | 16.4 ms | 40% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 3.26 ms | 7.9% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-23T05:07:13.862Z` → `2026-10-23T05:08:14.632Z` (61 s), ci: CI (run 39903023267)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `c21aa4523e111ad21b93cd15b55d98b1a5de5ba2` on `chore/security-and-dep-updates`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

