# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **271 µs** per operation compared with a bare-minimum baseline (**126% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.98). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 271 µs | 41.2 ms |
| Added latency, relative to baseline | 126% | 188% |
| Added CPU time per operation | 673 µs | 44.2 ms |
| Added memory per operation (heap delta) | 345.9 KiB | 44.4 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,689 ops/s | 24 ops/s |

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
| 20 | 59.6 µs | 157 µs | 97.6 µs | 164% | 355 µs | $0.0002 – $0.004 |
| 40 | 115 µs | 267 µs | 152 µs | 132% | 424 µs | $0.00032 – $0.0048 |
| 80 | 215 µs | 486 µs | 271 µs | 126% | 673 µs | $0.00056 – $0.0076 |
| 160 | 426 µs | 975 µs | 549 µs | 129% | 1.39 ms | $0.0011 – $0.016 |
| 320 | 783 µs | 1.71 ms | 929 µs | 119% | 1.66 ms | $0.0019 – $0.019 |
| 640 | 1.56 ms | 3.33 ms | 1.77 ms | 113% | 2.17 ms | $0.0037 – $0.024 |
| 1280 | 2.91 ms | 13.3 ms | 10.4 ms | 356% | 10.8 ms | $0.022 – $0.121 |
| 2560 | 5.64 ms | 19.5 ms | 13.9 ms | 246% | 14.4 ms | $0.029 – $0.162 |
| 5120 | 11.1 ms | 33.1 ms | 22.0 ms | 197% | 24.5 ms | $0.046 – $0.276 |
| 10240 | 21.9 ms | 63.1 ms | 41.2 ms | 188% | 44.2 ms | $0.086 – $0.496 |

**How the total grows:** O(n) (linear), exponent 0.98 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 314 µs | 37.3 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 2.98 ms | 412 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 139 µs | 24.6 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 171 µs | 36.1 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 130 µs | 24.8 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 173 µs | 36.8 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n log n) | ✅ matches | 74.0 µs | 9.65 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 281 µs | 362 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 760 µs | 92.2 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n) | ✅ matches | 7.56 ms | 1.41 s |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 266 µs | 28.4 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 313 µs | 64.6 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 332 µs | 25.5 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 325 µs | 27.5 ms |

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
| 20 | 87.9 µs | 89.5 µs | 274 µs | 52.8 KiB | 11,375 |
| 40 | 161 µs | 165 µs | 449 µs | 104.5 KiB | 6,230 |
| 80 | 314 µs | 319 µs | 849 µs | 211.4 KiB | 3,186 |
| 160 | 588 µs | 616 µs | 1.40 ms | 436.2 KiB | 1,699 |
| 320 | 1.18 ms | 1.22 ms | 2.81 ms | 938.9 KiB | 848 |
| 640 | 2.17 ms | 2.42 ms | 3.87 ms | 2.1 MiB | 460 |
| 1280 | 7.64 ms | 8.06 ms | 9.36 ms | 4.7 MiB | 131 |
| 2560 | 11.6 ms | 12.3 ms | 13.9 ms | 8.0 MiB | 86 |
| 5120 | 20.0 ms | 22.4 ms | 21.6 ms | 14.5 MiB | 50 |
| 10240 | 37.3 ms | 37.4 ms | 40.9 ms | 27.6 MiB | 27 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.06, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 810 µs | 850 µs | 1.64 ms | 294.9 KiB | 1,234 |
| 40 | 1.60 ms | 1.62 ms | 3.30 ms | 587.0 KiB | 625 |
| 80 | 2.98 ms | 3.67 ms | 4.79 ms | 1.1 MiB | 335 |
| 160 | 5.67 ms | 5.85 ms | 7.75 ms | 2.3 MiB | 176 |
| 320 | 11.0 ms | 11.1 ms | 13.6 ms | 4.7 MiB | 91 |
| 640 | 21.9 ms | 22.2 ms | 25.4 ms | 9.8 MiB | 46 |
| 1280 | 46.8 ms | 49.8 ms | 52.7 ms | 20.1 MiB | 21 |
| 2560 | 91.1 ms | 97.5 ms | 102 ms | 38.7 MiB | 11 |
| 5120 | 207 ms | 207 ms | 307 ms | 73.5 MiB | 5 |
| 10240 | 412 ms | 414 ms | 618 ms | 145.2 MiB | 2 |

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

**Measured: O(n)** (exponent 1.02, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 46.1 µs | 57.2 µs | 47.3 µs | 47.2 KiB | 21,698 |
| 40 | 72.0 µs | 85.2 µs | 233 µs | 92.5 KiB | 13,895 |
| 80 | 139 µs | 175 µs | 457 µs | 188.5 KiB | 7,190 |
| 160 | 279 µs | 355 µs | 859 µs | 393.8 KiB | 3,581 |
| 320 | 518 µs | 690 µs | 1.46 ms | 854.7 KiB | 1,932 |
| 640 | 1.10 ms | 1.33 ms | 2.95 ms | 1.9 MiB | 910 |
| 1280 | 5.33 ms | 5.65 ms | 7.95 ms | 4.4 MiB | 188 |
| 2560 | 7.60 ms | 7.88 ms | 10.5 ms | 7.3 MiB | 132 |
| 5120 | 12.4 ms | 13.1 ms | 16.6 ms | 13.2 MiB | 81 |
| 10240 | 24.6 ms | 25.5 ms | 32.2 ms | 24.8 MiB | 41 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.06, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 51.6 µs | 54.8 µs | 106 µs | 54.1 KiB | 19,397 |
| 40 | 87.6 µs | 105 µs | 301 µs | 107.0 KiB | 11,422 |
| 80 | 171 µs | 214 µs | 538 µs | 217.3 KiB | 5,860 |
| 160 | 357 µs | 432 µs | 1.15 ms | 451.7 KiB | 2,803 |
| 320 | 684 µs | 873 µs | 2.07 ms | 970.6 KiB | 1,463 |
| 640 | 1.55 ms | 1.69 ms | 5.09 ms | 2.2 MiB | 644 |
| 1280 | 6.75 ms | 7.03 ms | 13.0 ms | 4.9 MiB | 148 |
| 2560 | 10.4 ms | 10.7 ms | 20.7 ms | 8.3 MiB | 96 |
| 5120 | 20.0 ms | 20.8 ms | 39.4 ms | 15.1 MiB | 50 |
| 10240 | 36.1 ms | 37.9 ms | 69.7 ms | 28.5 MiB | 28 |

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
| 20 | 42.5 µs | 48.7 µs | 44.8 µs | 47.0 KiB | 23,508 |
| 40 | 69.8 µs | 86.0 µs | 232 µs | 92.6 KiB | 14,322 |
| 80 | 130 µs | 172 µs | 401 µs | 188.4 KiB | 7,687 |
| 160 | 269 µs | 353 µs | 824 µs | 393.9 KiB | 3,723 |
| 320 | 521 µs | 713 µs | 1.51 ms | 854.7 KiB | 1,920 |
| 640 | 1.14 ms | 1.49 ms | 3.02 ms | 1.9 MiB | 879 |
| 1280 | 5.41 ms | 5.76 ms | 7.95 ms | 4.4 MiB | 185 |
| 2560 | 7.51 ms | 7.83 ms | 10.6 ms | 7.3 MiB | 133 |
| 5120 | 12.7 ms | 14.0 ms | 17.1 ms | 13.2 MiB | 79 |
| 10240 | 24.8 ms | 26.6 ms | 32.9 ms | 24.8 MiB | 40 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.06, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 52.0 µs | 54.6 µs | 108 µs | 54.2 KiB | 19,247 |
| 40 | 98.6 µs | 107 µs | 317 µs | 107.0 KiB | 10,142 |
| 80 | 173 µs | 216 µs | 550 µs | 217.3 KiB | 5,788 |
| 160 | 344 µs | 441 µs | 1.09 ms | 451.7 KiB | 2,909 |
| 320 | 681 µs | 876 µs | 1.97 ms | 968.7 KiB | 1,468 |
| 640 | 1.58 ms | 1.90 ms | 5.14 ms | 2.2 MiB | 633 |
| 1280 | 6.90 ms | 7.54 ms | 13.1 ms | 4.9 MiB | 145 |
| 2560 | 10.4 ms | 10.9 ms | 20.5 ms | 8.3 MiB | 96 |
| 5120 | 20.2 ms | 21.0 ms | 38.9 ms | 15.1 MiB | 50 |
| 10240 | 36.8 ms | 36.8 ms | 72.0 ms | 28.5 MiB | 27 |

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

**Measured: O(n log n)** (exponent 1.18, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 30.4 µs | 43.0 µs | 39.4 µs | 30.5 KiB | 32,941 |
| 40 | 41.2 µs | 49.4 µs | 142 µs | 55.2 KiB | 24,247 |
| 80 | 74.0 µs | 93.5 µs | 240 µs | 104.6 KiB | 13,509 |
| 160 | 137 µs | 173 µs | 412 µs | 207.7 KiB | 7,309 |
| 320 | 278 µs | 379 µs | 865 µs | 402.2 KiB | 3,599 |
| 640 | 318 µs | 690 µs | 1.25 ms | 604.1 KiB | 3,142 |
| 1280 | 1.18 ms | 1.23 ms | 3.32 ms | 1.3 MiB | 850 |
| 2560 | 2.21 ms | 2.31 ms | 4.87 ms | 2.7 MiB | 452 |
| 5120 | 4.55 ms | 4.65 ms | 8.35 ms | 5.5 MiB | 220 |
| 10240 | 9.65 ms | 9.84 ms | 16.4 ms | 10.8 MiB | 104 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent -0.03, 10 sizes) -- ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 251 µs | 275 µs | 719 µs | 616.5 KiB | 3,991 |
| 40 | 254 µs | 267 µs | 723 µs | 618.2 KiB | 3,938 |
| 80 | 281 µs | 292 µs | 904 µs | 626.2 KiB | 3,556 |
| 160 | 293 µs | 311 µs | 920 µs | 667.5 KiB | 3,410 |
| 320 | 316 µs | 337 µs | 936 µs | 716.3 KiB | 3,164 |
| 640 | 405 µs | 452 µs | 1.34 ms | 834.3 KiB | 2,468 |
| 1280 | 363 µs | 383 µs | 994 µs | 829.2 KiB | 2,751 |
| 2560 | 363 µs | 394 µs | 984 µs | 829.2 KiB | 2,754 |
| 5120 | 364 µs | 397 µs | 992 µs | 829.2 KiB | 2,749 |
| 10240 | 362 µs | 394 µs | 987 µs | 829.2 KiB | 2,764 |

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

**Measured: O(n)** (exponent 1.05, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 195 µs | 206 µs | 604 µs | 45.6 KiB | 5,126 |
| 40 | 347 µs | 376 µs | 893 µs | 115.7 KiB | 2,878 |
| 80 | 760 µs | 785 µs | 1.62 ms | 178.6 KiB | 1,316 |
| 160 | 1.47 ms | 1.52 ms | 3.18 ms | 357.3 KiB | 679 |
| 320 | 2.65 ms | 2.77 ms | 4.67 ms | 712.3 KiB | 377 |
| 640 | 4.87 ms | 5.00 ms | 7.02 ms | 1.4 MiB | 205 |
| 1280 | 9.55 ms | 9.68 ms | 11.9 ms | 2.8 MiB | 105 |
| 2560 | 19.1 ms | 19.3 ms | 21.2 ms | 5.7 MiB | 52 |
| 5120 | 38.7 ms | 40.6 ms | 39.2 ms | 11.3 MiB | 26 |
| 10240 | 92.2 ms | 92.7 ms | 92.7 ms | 22.7 MiB | 11 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.09, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.28 ms | 2.42 ms | 4.26 ms | 599.8 KiB | 439 |
| 40 | 3.99 ms | 4.12 ms | 6.02 ms | 1.2 MiB | 250 |
| 80 | 7.56 ms | 7.67 ms | 9.69 ms | 2.3 MiB | 132 |
| 160 | 14.6 ms | 14.8 ms | 16.7 ms | 4.6 MiB | 69 |
| 320 | 28.7 ms | 29.0 ms | 29.2 ms | 9.3 MiB | 35 |
| 640 | 67.0 ms | 67.4 ms | 67.5 ms | 18.5 MiB | 15 |
| 1280 | 156 ms | 157 ms | 157 ms | 37.0 MiB | 6 |
| 2560 | 336 ms | 337 ms | 336 ms | 73.9 MiB | 3 |
| 5120 | 694 ms | 699 ms | 716 ms | 147.7 MiB | 1 |
| 10240 | 1.41 s | 1.42 s | 1.45 s | 295.3 MiB | 1 |

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
| 20 | 102 µs | 144 µs | 403 µs | 98.0 KiB | 9,802 |
| 40 | 151 µs | 183 µs | 454 µs | 179.0 KiB | 6,642 |
| 80 | 266 µs | 355 µs | 770 µs | 322.3 KiB | 3,756 |
| 160 | 479 µs | 499 µs | 1.26 ms | 637.9 KiB | 2,086 |
| 320 | 860 µs | 925 µs | 1.66 ms | 1.2 MiB | 1,162 |
| 640 | 1.72 ms | 1.85 ms | 3.32 ms | 2.5 MiB | 583 |
| 1280 | 3.23 ms | 3.40 ms | 4.82 ms | 4.9 MiB | 310 |
| 2560 | 6.50 ms | 6.65 ms | 8.70 ms | 9.9 MiB | 154 |
| 5120 | 13.8 ms | 13.9 ms | 16.7 ms | 19.8 MiB | 73 |
| 10240 | 28.4 ms | 28.5 ms | 32.8 ms | 39.6 MiB | 35 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.18, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 89.9 µs | 95.6 µs | 311 µs | 281.1 KiB | 11,120 |
| 40 | 160 µs | 172 µs | 469 µs | 539.5 KiB | 6,236 |
| 80 | 313 µs | 340 µs | 826 µs | 1.0 MiB | 3,192 |
| 160 | 615 µs | 643 µs | 1.41 ms | 2.1 MiB | 1,625 |
| 320 | 1.31 ms | 1.38 ms | 2.95 ms | 4.2 MiB | 762 |
| 640 | 2.50 ms | 2.60 ms | 4.25 ms | 8.3 MiB | 399 |
| 1280 | 5.18 ms | 5.50 ms | 7.22 ms | 16.7 MiB | 193 |
| 2560 | 10.5 ms | 10.8 ms | 13.2 ms | 33.3 MiB | 95 |
| 5120 | 28.0 ms | 29.1 ms | 32.0 ms | 52.0 MiB | 36 |
| 10240 | 64.6 ms | 66.4 ms | 74.1 ms | 103.7 MiB | 15 |

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
| 20 | 102 µs | 124 µs | 106 µs | 57.4 KiB | 9,827 |
| 40 | 180 µs | 201 µs | 184 µs | 113.5 KiB | 5,569 |
| 80 | 332 µs | 383 µs | 337 µs | 225.7 KiB | 3,009 |
| 160 | 570 µs | 655 µs | 2.11 ms | 450.0 KiB | 1,754 |
| 320 | 940 µs | 974 µs | 2.45 ms | 898.9 KiB | 1,064 |
| 640 | 1.69 ms | 1.81 ms | 3.24 ms | 1.8 MiB | 590 |
| 1280 | 3.16 ms | 3.28 ms | 4.46 ms | 3.5 MiB | 317 |
| 2560 | 6.08 ms | 6.59 ms | 6.57 ms | 6.9 MiB | 165 |
| 5120 | 12.6 ms | 12.8 ms | 12.6 ms | 13.8 MiB | 80 |
| 10240 | 25.5 ms | 25.7 ms | 25.9 ms | 27.7 MiB | 39 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 92.8 µs | 112 µs | 96.0 µs | 56.5 KiB | 10,779 |
| 40 | 171 µs | 188 µs | 175 µs | 111.8 KiB | 5,860 |
| 80 | 325 µs | 346 µs | 328 µs | 222.5 KiB | 3,079 |
| 160 | 555 µs | 586 µs | 1.96 ms | 443.7 KiB | 1,802 |
| 320 | 923 µs | 959 µs | 2.30 ms | 886.2 KiB | 1,083 |
| 640 | 1.70 ms | 1.88 ms | 3.31 ms | 1.7 MiB | 588 |
| 1280 | 3.22 ms | 3.26 ms | 4.91 ms | 3.5 MiB | 311 |
| 2560 | 6.48 ms | 6.50 ms | 8.44 ms | 6.9 MiB | 154 |
| 5120 | 12.8 ms | 13.2 ms | 16.5 ms | 13.8 MiB | 78 |
| 10240 | 27.5 ms | 27.9 ms | 33.3 ms | 27.7 MiB | 36 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 486 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 314 µs | 314 µs | 65% |
| `run-policies` | 1 | 139 µs | 139 µs | 29% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 33.3 µs | 6.9% |

**At 10240 checks** (whole operation: 63.1 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 37.3 ms | 37.3 ms | 59% |
| `run-policies` | 1 | 24.6 ms | 24.6 ms | 39% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 1.22 ms | 1.9% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-02T22:30:09.429Z` → `2026-11-02T22:31:42.265Z` (93 s), ci: CI (run 41535281642)
- Machine: AMD EPYC 9V74 80-Core Processor, 4 logical core(s) (2 physical), 15984 MB RAM, linux/x64, Node v24.22.1, GitHub Actions
- Git: `818eb8dd569874b8e9e0fabe99cd5c0ab52dce36` on `chore/deps-sync`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

