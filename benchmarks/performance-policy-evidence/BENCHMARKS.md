# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **295 µs** per operation compared with a bare-minimum baseline (**138% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.97). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 295 µs | 44.4 ms |
| Added latency, relative to baseline | 138% | 203% |
| Added CPU time per operation | 646 µs | 49.0 ms |
| Added memory per operation (heap delta) | 345.9 KiB | 44.5 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,384 ops/s | 23 ops/s |

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
| 20 | 62.1 µs | 185 µs | 123 µs | 198% | 474 µs | $0.00026 – $0.0053 |
| 40 | 110 µs | 282 µs | 171 µs | 155% | 447 µs | $0.00036 – $0.005 |
| 80 | 213 µs | 509 µs | 295 µs | 138% | 646 µs | $0.00062 – $0.0073 |
| 160 | 418 µs | 1.02 ms | 604 µs | 145% | 1.41 ms | $0.0013 – $0.016 |
| 320 | 761 µs | 1.85 ms | 1.09 ms | 143% | 1.84 ms | $0.0023 – $0.021 |
| 640 | 1.52 ms | 3.68 ms | 2.15 ms | 141% | 2.69 ms | $0.0045 – $0.030 |
| 1280 | 2.85 ms | 13.4 ms | 10.6 ms | 372% | 11.0 ms | $0.022 – $0.124 |
| 2560 | 5.57 ms | 20.4 ms | 14.9 ms | 267% | 15.6 ms | $0.031 – $0.175 |
| 5120 | 11.0 ms | 35.6 ms | 24.6 ms | 223% | 26.7 ms | $0.051 – $0.300 |
| 10240 | 21.9 ms | 66.3 ms | 44.4 ms | 203% | 49.0 ms | $0.093 – $0.551 |

**How the total grows:** O(n) (linear), exponent 0.97 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 315 µs | 38.9 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 2.98 ms | 408 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 177 µs | 27.0 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 204 µs | 36.5 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 164 µs | 28.0 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 218 µs | 36.5 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n) | 🟡 close (neighbouring class) | 87.5 µs | 9.27 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 293 µs | 432 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 877 µs | 81.2 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n) | ✅ matches | 8.05 ms | 933 ms |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 293 µs | 30.4 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 340 µs | 62.4 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 382 µs | 28.1 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 362 µs | 29.5 ms |

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
| 20 | 103 µs | 108 µs | 362 µs | 52.9 KiB | 9,752 |
| 40 | 180 µs | 201 µs | 565 µs | 104.6 KiB | 5,567 |
| 80 | 315 µs | 354 µs | 824 µs | 211.4 KiB | 3,176 |
| 160 | 601 µs | 635 µs | 1.39 ms | 436.3 KiB | 1,664 |
| 320 | 1.21 ms | 1.27 ms | 2.82 ms | 938.9 KiB | 829 |
| 640 | 2.18 ms | 2.31 ms | 3.73 ms | 2.1 MiB | 459 |
| 1280 | 7.49 ms | 9.09 ms | 9.21 ms | 4.7 MiB | 134 |
| 2560 | 11.4 ms | 12.5 ms | 13.6 ms | 8.0 MiB | 87 |
| 5120 | 20.4 ms | 21.0 ms | 22.9 ms | 14.5 MiB | 49 |
| 10240 | 38.9 ms | 39.2 ms | 42.9 ms | 27.6 MiB | 26 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.06, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 806 µs | 825 µs | 1.60 ms | 294.9 KiB | 1,240 |
| 40 | 1.60 ms | 1.64 ms | 3.24 ms | 587.1 KiB | 625 |
| 80 | 2.98 ms | 3.52 ms | 4.78 ms | 1.1 MiB | 335 |
| 160 | 5.71 ms | 5.84 ms | 7.75 ms | 2.3 MiB | 175 |
| 320 | 11.1 ms | 11.5 ms | 13.7 ms | 4.7 MiB | 90 |
| 640 | 22.1 ms | 22.1 ms | 25.6 ms | 9.8 MiB | 45 |
| 1280 | 47.0 ms | 49.5 ms | 53.1 ms | 20.1 MiB | 21 |
| 2560 | 90.7 ms | 97.9 ms | 101 ms | 38.7 MiB | 11 |
| 5120 | 206 ms | 219 ms | 307 ms | 73.5 MiB | 5 |
| 10240 | 408 ms | 411 ms | 613 ms | 145.2 MiB | 2 |

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
| 20 | 53.0 µs | 72.4 µs | 54.0 µs | 47.2 KiB | 18,884 |
| 40 | 89.2 µs | 105 µs | 285 µs | 92.6 KiB | 11,208 |
| 80 | 177 µs | 211 µs | 580 µs | 188.7 KiB | 5,658 |
| 160 | 338 µs | 437 µs | 964 µs | 393.8 KiB | 2,958 |
| 320 | 625 µs | 836 µs | 1.62 ms | 855.2 KiB | 1,599 |
| 640 | 1.31 ms | 1.47 ms | 3.14 ms | 1.9 MiB | 763 |
| 1280 | 5.50 ms | 6.02 ms | 8.23 ms | 4.4 MiB | 182 |
| 2560 | 8.00 ms | 8.62 ms | 11.1 ms | 7.3 MiB | 125 |
| 5120 | 13.7 ms | 14.8 ms | 18.3 ms | 13.2 MiB | 73 |
| 10240 | 27.0 ms | 27.2 ms | 35.0 ms | 24.5 MiB | 37 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.98, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 60.7 µs | 70.1 µs | 62.4 µs | 54.2 KiB | 16,463 |
| 40 | 104 µs | 130 µs | 350 µs | 107.0 KiB | 9,652 |
| 80 | 204 µs | 253 µs | 671 µs | 217.5 KiB | 4,902 |
| 160 | 437 µs | 523 µs | 1.49 ms | 452.9 KiB | 2,286 |
| 320 | 1.06 ms | 1.15 ms | 3.63 ms | 975.6 KiB | 944 |
| 640 | 2.00 ms | 2.42 ms | 5.90 ms | 2.2 MiB | 500 |
| 1280 | 6.90 ms | 7.17 ms | 13.3 ms | 4.9 MiB | 145 |
| 2560 | 9.89 ms | 10.2 ms | 20.3 ms | 8.3 MiB | 101 |
| 5120 | 18.9 ms | 19.4 ms | 38.4 ms | 15.1 MiB | 53 |
| 10240 | 36.5 ms | 36.9 ms | 72.2 ms | 28.0 MiB | 27 |

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
| 20 | 52.5 µs | 56.8 µs | 146 µs | 47.0 KiB | 19,052 |
| 40 | 83.5 µs | 106 µs | 269 µs | 92.6 KiB | 11,970 |
| 80 | 164 µs | 216 µs | 502 µs | 188.5 KiB | 6,090 |
| 160 | 320 µs | 457 µs | 938 µs | 393.9 KiB | 3,121 |
| 320 | 619 µs | 830 µs | 1.60 ms | 856.1 KiB | 1,615 |
| 640 | 1.42 ms | 1.87 ms | 3.44 ms | 1.9 MiB | 705 |
| 1280 | 5.61 ms | 5.99 ms | 8.31 ms | 4.4 MiB | 178 |
| 2560 | 8.38 ms | 8.78 ms | 11.8 ms | 7.3 MiB | 119 |
| 5120 | 14.4 ms | 15.1 ms | 19.2 ms | 13.2 MiB | 69 |
| 10240 | 28.0 ms | 28.7 ms | 36.7 ms | 24.4 MiB | 36 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.96, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 66.9 µs | 74.1 µs | 129 µs | 54.3 KiB | 14,956 |
| 40 | 122 µs | 140 µs | 433 µs | 107.1 KiB | 8,204 |
| 80 | 218 µs | 277 µs | 705 µs | 217.5 KiB | 4,579 |
| 160 | 469 µs | 577 µs | 1.57 ms | 452.9 KiB | 2,134 |
| 320 | 1.09 ms | 1.22 ms | 3.84 ms | 975.8 KiB | 916 |
| 640 | 2.23 ms | 2.64 ms | 6.66 ms | 2.2 MiB | 449 |
| 1280 | 6.85 ms | 7.46 ms | 13.2 ms | 4.9 MiB | 146 |
| 2560 | 10.4 ms | 10.8 ms | 20.9 ms | 8.3 MiB | 96 |
| 5120 | 19.2 ms | 19.7 ms | 38.4 ms | 15.1 MiB | 52 |
| 10240 | 36.5 ms | 37.4 ms | 72.4 ms | 28.1 MiB | 27 |

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

**Measured: O(n)** (exponent 0.94, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 35.6 µs | 53.3 µs | 37.0 µs | 30.5 KiB | 28,057 |
| 40 | 54.5 µs | 60.6 µs | 232 µs | 55.0 KiB | 18,357 |
| 80 | 87.5 µs | 158 µs | 301 µs | 104.6 KiB | 11,430 |
| 160 | 158 µs | 205 µs | 516 µs | 208.3 KiB | 6,332 |
| 320 | 294 µs | 414 µs | 902 µs | 402.2 KiB | 3,397 |
| 640 | 709 µs | 820 µs | 2.64 ms | 836.2 KiB | 1,410 |
| 1280 | 1.21 ms | 1.86 ms | 3.50 ms | 1.3 MiB | 829 |
| 2560 | 2.29 ms | 2.46 ms | 5.11 ms | 2.7 MiB | 437 |
| 5120 | 4.61 ms | 4.84 ms | 8.82 ms | 5.5 MiB | 217 |
| 10240 | 9.27 ms | 9.38 ms | 16.5 ms | 10.8 MiB | 108 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent -0.00, 10 sizes) -- ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 286 µs | 308 µs | 901 µs | 620.2 KiB | 3,494 |
| 40 | 287 µs | 310 µs | 888 µs | 620.3 KiB | 3,488 |
| 80 | 293 µs | 346 µs | 897 µs | 626.2 KiB | 3,414 |
| 160 | 306 µs | 339 µs | 916 µs | 667.5 KiB | 3,266 |
| 320 | 336 µs | 371 µs | 939 µs | 716.3 KiB | 2,978 |
| 640 | 433 µs | 494 µs | 1.35 ms | 834.3 KiB | 2,308 |
| 1280 | 435 µs | 473 µs | 1.35 ms | 834.3 KiB | 2,300 |
| 2560 | 436 µs | 504 µs | 1.36 ms | 834.3 KiB | 2,293 |
| 5120 | 433 µs | 450 µs | 1.35 ms | 834.3 KiB | 2,308 |
| 10240 | 432 µs | 503 µs | 1.33 ms | 834.3 KiB | 2,316 |

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
| 20 | 230 µs | 256 µs | 745 µs | 45.8 KiB | 4,347 |
| 40 | 437 µs | 466 µs | 1.22 ms | 90.2 KiB | 2,290 |
| 80 | 877 µs | 914 µs | 1.73 ms | 178.6 KiB | 1,140 |
| 160 | 1.64 ms | 1.73 ms | 3.29 ms | 357.3 KiB | 610 |
| 320 | 2.96 ms | 3.02 ms | 5.07 ms | 712.3 KiB | 337 |
| 640 | 5.35 ms | 5.66 ms | 7.60 ms | 1.4 MiB | 187 |
| 1280 | 10.3 ms | 11.1 ms | 12.8 ms | 2.8 MiB | 97 |
| 2560 | 20.2 ms | 20.9 ms | 23.3 ms | 5.7 MiB | 49 |
| 5120 | 39.4 ms | 39.6 ms | 43.3 ms | 11.3 MiB | 25 |
| 10240 | 81.2 ms | 81.7 ms | 87.1 ms | 22.7 MiB | 12 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.52 ms | 2.71 ms | 4.72 ms | 599.8 KiB | 398 |
| 40 | 4.46 ms | 4.66 ms | 6.68 ms | 1.2 MiB | 224 |
| 80 | 8.05 ms | 8.27 ms | 10.4 ms | 2.3 MiB | 124 |
| 160 | 14.6 ms | 14.9 ms | 16.6 ms | 4.6 MiB | 69 |
| 320 | 27.2 ms | 27.9 ms | 30.2 ms | 9.3 MiB | 37 |
| 640 | 54.3 ms | 54.4 ms | 58.1 ms | 18.5 MiB | 18 |
| 1280 | 123 ms | 125 ms | 129 ms | 37.0 MiB | 8 |
| 2560 | 240 ms | 240 ms | 250 ms | 73.9 MiB | 4 |
| 5120 | 466 ms | 467 ms | 486 ms | 147.7 MiB | 2 |
| 10240 | 933 ms | 935 ms | 970 ms | 295.3 MiB | 1 |

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
| 20 | 112 µs | 157 µs | 409 µs | 97.9 KiB | 8,959 |
| 40 | 173 µs | 236 µs | 540 µs | 178.9 KiB | 5,791 |
| 80 | 293 µs | 413 µs | 804 µs | 328.4 KiB | 3,418 |
| 160 | 504 µs | 582 µs | 1.26 ms | 637.8 KiB | 1,984 |
| 320 | 899 µs | 1.02 ms | 1.68 ms | 1.2 MiB | 1,112 |
| 640 | 1.81 ms | 1.92 ms | 3.41 ms | 2.5 MiB | 553 |
| 1280 | 3.42 ms | 3.71 ms | 4.99 ms | 4.9 MiB | 292 |
| 2560 | 6.92 ms | 7.36 ms | 9.06 ms | 9.9 MiB | 145 |
| 5120 | 13.8 ms | 14.1 ms | 16.3 ms | 19.8 MiB | 73 |
| 10240 | 30.4 ms | 31.5 ms | 35.1 ms | 39.6 MiB | 33 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.17, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 100 µs | 118 µs | 313 µs | 281.1 KiB | 9,965 |
| 40 | 191 µs | 207 µs | 570 µs | 540.1 KiB | 5,226 |
| 80 | 340 µs | 388 µs | 842 µs | 1.0 MiB | 2,937 |
| 160 | 661 µs | 694 µs | 1.44 ms | 2.1 MiB | 1,513 |
| 320 | 1.32 ms | 1.41 ms | 2.86 ms | 4.2 MiB | 759 |
| 640 | 2.53 ms | 2.69 ms | 4.27 ms | 8.3 MiB | 396 |
| 1280 | 4.96 ms | 5.06 ms | 7.04 ms | 16.7 MiB | 202 |
| 2560 | 9.78 ms | 10.2 ms | 12.4 ms | 33.3 MiB | 102 |
| 5120 | 26.4 ms | 27.3 ms | 30.6 ms | 52.0 MiB | 38 |
| 10240 | 62.4 ms | 63.1 ms | 73.5 ms | 103.7 MiB | 16 |

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
| 20 | 110 µs | 133 µs | 115 µs | 57.3 KiB | 9,096 |
| 40 | 197 µs | 229 µs | 201 µs | 113.3 KiB | 5,081 |
| 80 | 382 µs | 425 µs | 840 µs | 225.5 KiB | 2,616 |
| 160 | 584 µs | 619 µs | 1.85 ms | 450.0 KiB | 1,712 |
| 320 | 1.00 ms | 1.11 ms | 2.40 ms | 898.7 KiB | 1,000 |
| 640 | 1.88 ms | 1.95 ms | 3.43 ms | 1.8 MiB | 531 |
| 1280 | 3.46 ms | 3.74 ms | 4.58 ms | 3.5 MiB | 289 |
| 2560 | 6.74 ms | 7.00 ms | 7.19 ms | 6.9 MiB | 148 |
| 5120 | 14.0 ms | 14.2 ms | 14.2 ms | 13.8 MiB | 72 |
| 10240 | 28.1 ms | 29.2 ms | 28.6 ms | 27.7 MiB | 36 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 101 µs | 124 µs | 105 µs | 56.4 KiB | 9,919 |
| 40 | 193 µs | 226 µs | 198 µs | 111.7 KiB | 5,178 |
| 80 | 362 µs | 383 µs | 1.20 ms | 222.3 KiB | 2,762 |
| 160 | 613 µs | 662 µs | 2.04 ms | 443.6 KiB | 1,632 |
| 320 | 996 µs | 1.04 ms | 2.32 ms | 886.1 KiB | 1,004 |
| 640 | 1.80 ms | 1.91 ms | 3.54 ms | 1.7 MiB | 555 |
| 1280 | 3.41 ms | 3.49 ms | 5.11 ms | 3.5 MiB | 293 |
| 2560 | 6.65 ms | 6.74 ms | 8.33 ms | 6.9 MiB | 150 |
| 5120 | 13.9 ms | 14.9 ms | 16.9 ms | 13.8 MiB | 72 |
| 10240 | 29.5 ms | 29.7 ms | 34.9 ms | 27.7 MiB | 34 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 509 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 315 µs | 315 µs | 62% |
| `run-policies` | 1 | 177 µs | 177 µs | 35% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 17.3 µs | 3.4% |

**At 10240 checks** (whole operation: 66.3 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 38.9 ms | 38.9 ms | 59% |
| `run-policies` | 1 | 27.0 ms | 27.0 ms | 41% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 348 µs | 0.5% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-24T18:48:35.210Z` → `2026-10-24T18:50:04.558Z` (89 s), ci: CI (run 40121134103)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `bac2da01a8dfafb0aace4a6a1f72c1e7fe51354e` on `chore/bump-internal-package-contract-v0.13.2`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

