# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **305 µs** per operation compared with a bare-minimum baseline (**131% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.98). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 305 µs | 51.7 ms |
| Added latency, relative to baseline | 131% | 229% |
| Added CPU time per operation | 591 µs | 58.7 ms |
| Added memory per operation (heap delta) | 345.8 KiB | 44.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,275 ops/s | 19 ops/s |

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
| 20 | 63.6 µs | 196 µs | 133 µs | 209% | 497 µs | $0.00028 – $0.0056 |
| 40 | 112 µs | 301 µs | 188 µs | 168% | 506 µs | $0.00039 – $0.0057 |
| 80 | 233 µs | 538 µs | 305 µs | 131% | 591 µs | $0.00064 – $0.0066 |
| 160 | 438 µs | 1.10 ms | 665 µs | 152% | 1.50 ms | $0.0014 – $0.017 |
| 320 | 778 µs | 2.03 ms | 1.25 ms | 161% | 2.07 ms | $0.0026 – $0.023 |
| 640 | 1.57 ms | 4.12 ms | 2.55 ms | 162% | 3.10 ms | $0.0053 – $0.035 |
| 1280 | 2.94 ms | 14.6 ms | 11.6 ms | 395% | 12.5 ms | $0.024 – $0.140 |
| 2560 | 5.88 ms | 22.3 ms | 16.4 ms | 279% | 17.9 ms | $0.034 – $0.201 |
| 5120 | 11.7 ms | 39.9 ms | 28.2 ms | 241% | 31.3 ms | $0.059 – $0.352 |
| 10240 | 22.6 ms | 74.3 ms | 51.7 ms | 229% | 58.7 ms | $0.108 – $0.660 |

**How the total grows:** O(n) (linear), exponent 0.98 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 322 µs | 39.7 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 3.09 ms | 424 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 156 µs | 29.4 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 245 µs | 39.7 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 156 µs | 29.3 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 246 µs | 40.4 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n log n) | ✅ matches | 85.3 µs | 10.2 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 317 µs | 443 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 988 µs | 101 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 8.32 ms | 1.57 s |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 299 µs | 33.5 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 358 µs | 72.8 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 388 µs | 28.0 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 387 µs | 32.7 ms |

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
| 20 | 99.1 µs | 106 µs | 337 µs | 52.9 KiB | 10,094 |
| 40 | 177 µs | 197 µs | 534 µs | 104.6 KiB | 5,660 |
| 80 | 322 µs | 342 µs | 787 µs | 211.3 KiB | 3,107 |
| 160 | 619 µs | 639 µs | 1.39 ms | 436.2 KiB | 1,615 |
| 320 | 1.25 ms | 1.33 ms | 2.73 ms | 938.9 KiB | 800 |
| 640 | 2.34 ms | 2.45 ms | 3.95 ms | 2.1 MiB | 428 |
| 1280 | 7.70 ms | 8.46 ms | 9.60 ms | 4.7 MiB | 130 |
| 2560 | 11.8 ms | 13.4 ms | 14.0 ms | 8.0 MiB | 85 |
| 5120 | 21.6 ms | 24.1 ms | 24.7 ms | 14.5 MiB | 46 |
| 10240 | 39.7 ms | 41.0 ms | 43.7 ms | 27.6 MiB | 25 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.06, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 836 µs | 876 µs | 1.66 ms | 294.9 KiB | 1,197 |
| 40 | 1.66 ms | 1.71 ms | 3.32 ms | 587.0 KiB | 604 |
| 80 | 3.09 ms | 3.68 ms | 4.88 ms | 1.1 MiB | 324 |
| 160 | 5.93 ms | 6.59 ms | 8.08 ms | 2.3 MiB | 169 |
| 320 | 11.6 ms | 11.9 ms | 14.3 ms | 4.7 MiB | 86 |
| 640 | 23.0 ms | 23.2 ms | 26.7 ms | 9.8 MiB | 44 |
| 1280 | 48.4 ms | 49.4 ms | 54.2 ms | 20.1 MiB | 21 |
| 2560 | 94.3 ms | 102 ms | 105 ms | 38.7 MiB | 11 |
| 5120 | 215 ms | 216 ms | 321 ms | 73.5 MiB | 5 |
| 10240 | 424 ms | 429 ms | 639 ms | 145.3 MiB | 2 |

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
| 20 | 55.4 µs | 66.8 µs | 58.8 µs | 47.1 KiB | 18,036 |
| 40 | 87.5 µs | 105 µs | 307 µs | 92.6 KiB | 11,423 |
| 80 | 156 µs | 212 µs | 473 µs | 188.5 KiB | 6,418 |
| 160 | 323 µs | 442 µs | 958 µs | 393.8 KiB | 3,100 |
| 320 | 620 µs | 847 µs | 1.57 ms | 855.1 KiB | 1,613 |
| 640 | 1.37 ms | 1.78 ms | 3.19 ms | 1.9 MiB | 731 |
| 1280 | 6.02 ms | 6.30 ms | 8.76 ms | 4.4 MiB | 166 |
| 2560 | 8.41 ms | 9.78 ms | 11.7 ms | 7.3 MiB | 119 |
| 5120 | 15.4 ms | 16.6 ms | 20.6 ms | 13.1 MiB | 65 |
| 10240 | 29.4 ms | 31.0 ms | 38.6 ms | 24.4 MiB | 34 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.98, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 63.7 µs | 71.4 µs | 207 µs | 54.2 KiB | 15,710 |
| 40 | 120 µs | 131 µs | 441 µs | 107.2 KiB | 8,362 |
| 80 | 245 µs | 284 µs | 840 µs | 217.8 KiB | 4,087 |
| 160 | 513 µs | 571 µs | 1.65 ms | 452.9 KiB | 1,950 |
| 320 | 1.16 ms | 1.43 ms | 3.92 ms | 975.5 KiB | 859 |
| 640 | 2.21 ms | 2.57 ms | 6.79 ms | 2.2 MiB | 452 |
| 1280 | 7.64 ms | 8.08 ms | 14.0 ms | 4.9 MiB | 131 |
| 2560 | 11.2 ms | 12.0 ms | 21.6 ms | 8.3 MiB | 89 |
| 5120 | 20.6 ms | 21.4 ms | 40.0 ms | 15.0 MiB | 48 |
| 10240 | 39.7 ms | 41.4 ms | 73.9 ms | 28.0 MiB | 25 |

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
| 20 | 52.7 µs | 60.8 µs | 57.6 µs | 47.0 KiB | 18,960 |
| 40 | 82.4 µs | 105 µs | 272 µs | 92.6 KiB | 12,138 |
| 80 | 156 µs | 203 µs | 467 µs | 188.5 KiB | 6,426 |
| 160 | 315 µs | 460 µs | 943 µs | 393.9 KiB | 3,174 |
| 320 | 856 µs | 1.04 ms | 2.56 ms | 862.5 KiB | 1,168 |
| 640 | 1.53 ms | 1.93 ms | 3.57 ms | 1.9 MiB | 654 |
| 1280 | 5.51 ms | 6.12 ms | 8.38 ms | 4.4 MiB | 181 |
| 2560 | 8.09 ms | 8.57 ms | 11.5 ms | 7.3 MiB | 124 |
| 5120 | 15.0 ms | 15.9 ms | 20.3 ms | 13.2 MiB | 67 |
| 10240 | 29.3 ms | 31.2 ms | 37.9 ms | 24.5 MiB | 34 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.98, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 65.1 µs | 73.6 µs | 263 µs | 54.2 KiB | 15,363 |
| 40 | 115 µs | 135 µs | 390 µs | 107.1 KiB | 8,689 |
| 80 | 246 µs | 304 µs | 850 µs | 217.8 KiB | 4,069 |
| 160 | 491 µs | 598 µs | 1.58 ms | 452.9 KiB | 2,037 |
| 320 | 1.15 ms | 1.38 ms | 3.92 ms | 975.7 KiB | 872 |
| 640 | 2.22 ms | 2.49 ms | 6.27 ms | 2.2 MiB | 450 |
| 1280 | 7.38 ms | 7.93 ms | 13.9 ms | 4.9 MiB | 135 |
| 2560 | 10.6 ms | 11.0 ms | 20.8 ms | 8.3 MiB | 95 |
| 5120 | 20.6 ms | 22.1 ms | 38.2 ms | 14.9 MiB | 48 |
| 10240 | 40.4 ms | 41.4 ms | 76.9 ms | 27.9 MiB | 25 |

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
| 20 | 34.1 µs | 51.3 µs | 34.9 µs | 30.5 KiB | 29,350 |
| 40 | 45.7 µs | 57.6 µs | 156 µs | 55.2 KiB | 21,870 |
| 80 | 85.3 µs | 114 µs | 288 µs | 104.6 KiB | 11,727 |
| 160 | 141 µs | 213 µs | 399 µs | 207.0 KiB | 7,110 |
| 320 | 298 µs | 416 µs | 897 µs | 402.2 KiB | 3,350 |
| 640 | 341 µs | 557 µs | 1.28 ms | 604.1 KiB | 2,935 |
| 1280 | 1.29 ms | 1.38 ms | 3.51 ms | 1.3 MiB | 775 |
| 2560 | 2.58 ms | 2.73 ms | 5.77 ms | 2.7 MiB | 388 |
| 5120 | 5.10 ms | 5.24 ms | 9.97 ms | 5.5 MiB | 196 |
| 10240 | 10.2 ms | 11.5 ms | 18.3 ms | 10.8 MiB | 98 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent -0.01, 10 sizes) -- ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 302 µs | 385 µs | 945 µs | 620.2 KiB | 3,307 |
| 40 | 302 µs | 326 µs | 932 µs | 620.3 KiB | 3,313 |
| 80 | 317 µs | 349 µs | 977 µs | 626.2 KiB | 3,155 |
| 160 | 333 µs | 355 µs | 998 µs | 667.5 KiB | 3,000 |
| 320 | 405 µs | 485 µs | 1.39 ms | 714.7 KiB | 2,469 |
| 640 | 464 µs | 510 µs | 1.47 ms | 834.3 KiB | 2,155 |
| 1280 | 445 µs | 486 µs | 1.38 ms | 834.3 KiB | 2,246 |
| 2560 | 443 µs | 490 µs | 1.40 ms | 834.3 KiB | 2,256 |
| 5120 | 448 µs | 483 µs | 1.37 ms | 834.3 KiB | 2,233 |
| 10240 | 443 µs | 473 µs | 1.36 ms | 834.3 KiB | 2,256 |

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

**Measured: O(n)** (exponent 1.03, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 229 µs | 246 µs | 747 µs | 45.8 KiB | 4,370 |
| 40 | 439 µs | 477 µs | 1.25 ms | 90.2 KiB | 2,279 |
| 80 | 988 µs | 1.06 ms | 2.57 ms | 179.3 KiB | 1,012 |
| 160 | 1.64 ms | 1.71 ms | 3.21 ms | 357.3 KiB | 608 |
| 320 | 2.94 ms | 3.13 ms | 5.03 ms | 712.3 KiB | 340 |
| 640 | 5.62 ms | 5.83 ms | 7.99 ms | 1.4 MiB | 178 |
| 1280 | 11.1 ms | 11.4 ms | 13.7 ms | 2.8 MiB | 90 |
| 2560 | 22.1 ms | 22.7 ms | 24.6 ms | 5.7 MiB | 45 |
| 5120 | 44.0 ms | 44.2 ms | 44.4 ms | 11.3 MiB | 23 |
| 10240 | 101 ms | 103 ms | 101 ms | 22.7 MiB | 10 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.11, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.54 ms | 2.73 ms | 4.55 ms | 599.8 KiB | 394 |
| 40 | 4.59 ms | 4.81 ms | 6.84 ms | 1.2 MiB | 218 |
| 80 | 8.32 ms | 8.51 ms | 10.6 ms | 2.3 MiB | 120 |
| 160 | 15.9 ms | 15.9 ms | 18.0 ms | 4.6 MiB | 63 |
| 320 | 31.2 ms | 31.4 ms | 31.8 ms | 9.3 MiB | 32 |
| 640 | 70.3 ms | 71.1 ms | 71.0 ms | 18.5 MiB | 14 |
| 1280 | 175 ms | 178 ms | 175 ms | 37.0 MiB | 6 |
| 2560 | 374 ms | 378 ms | 375 ms | 73.9 MiB | 3 |
| 5120 | 770 ms | 775 ms | 791 ms | 147.7 MiB | 1 |
| 10240 | 1.57 s | 1.60 s | 1.61 s | 295.3 MiB | 1 |

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

**Measured: O(n)** (exponent 1.04, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 124 µs | 188 µs | 498 µs | 98.0 KiB | 8,034 |
| 40 | 175 µs | 249 µs | 550 µs | 179.0 KiB | 5,708 |
| 80 | 299 µs | 367 µs | 807 µs | 351.1 KiB | 3,346 |
| 160 | 522 µs | 567 µs | 1.29 ms | 637.9 KiB | 1,917 |
| 320 | 1.06 ms | 1.48 ms | 2.62 ms | 1.2 MiB | 946 |
| 640 | 1.90 ms | 2.04 ms | 3.54 ms | 2.5 MiB | 526 |
| 1280 | 3.69 ms | 3.97 ms | 5.46 ms | 4.9 MiB | 271 |
| 2560 | 7.62 ms | 8.01 ms | 9.92 ms | 9.9 MiB | 131 |
| 5120 | 15.8 ms | 16.4 ms | 19.3 ms | 19.8 MiB | 63 |
| 10240 | 33.5 ms | 34.4 ms | 38.8 ms | 39.6 MiB | 30 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.20, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 112 µs | 118 µs | 367 µs | 281.1 KiB | 8,953 |
| 40 | 197 µs | 209 µs | 576 µs | 540.1 KiB | 5,078 |
| 80 | 358 µs | 395 µs | 867 µs | 1.0 MiB | 2,791 |
| 160 | 708 µs | 768 µs | 1.51 ms | 2.1 MiB | 1,412 |
| 320 | 1.40 ms | 1.49 ms | 3.01 ms | 4.2 MiB | 714 |
| 640 | 2.68 ms | 2.91 ms | 4.40 ms | 8.3 MiB | 373 |
| 1280 | 5.34 ms | 5.52 ms | 7.63 ms | 16.7 MiB | 187 |
| 2560 | 11.4 ms | 12.1 ms | 15.0 ms | 33.3 MiB | 87 |
| 5120 | 29.4 ms | 30.5 ms | 34.8 ms | 52.0 MiB | 34 |
| 10240 | 72.8 ms | 78.9 ms | 85.7 ms | 103.7 MiB | 14 |

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
| 20 | 114 µs | 145 µs | 118 µs | 57.4 KiB | 8,806 |
| 40 | 205 µs | 239 µs | 210 µs | 113.5 KiB | 4,868 |
| 80 | 388 µs | 409 µs | 1.17 ms | 225.7 KiB | 2,576 |
| 160 | 627 µs | 675 µs | 2.18 ms | 450.0 KiB | 1,594 |
| 320 | 1.06 ms | 1.58 ms | 2.65 ms | 898.9 KiB | 941 |
| 640 | 1.94 ms | 2.16 ms | 3.50 ms | 1.8 MiB | 516 |
| 1280 | 3.50 ms | 4.00 ms | 4.30 ms | 3.5 MiB | 285 |
| 2560 | 6.80 ms | 7.22 ms | 7.19 ms | 7.0 MiB | 147 |
| 5120 | 14.0 ms | 14.2 ms | 14.4 ms | 13.8 MiB | 72 |
| 10240 | 28.0 ms | 30.2 ms | 28.4 ms | 27.7 MiB | 36 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.03, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 105 µs | 134 µs | 109 µs | 56.5 KiB | 9,543 |
| 40 | 200 µs | 229 µs | 204 µs | 111.8 KiB | 5,005 |
| 80 | 387 µs | 416 µs | 741 µs | 222.5 KiB | 2,581 |
| 160 | 621 µs | 772 µs | 2.32 ms | 443.7 KiB | 1,611 |
| 320 | 1.04 ms | 1.31 ms | 2.75 ms | 886.2 KiB | 963 |
| 640 | 1.87 ms | 1.91 ms | 3.74 ms | 1.7 MiB | 534 |
| 1280 | 3.63 ms | 3.80 ms | 5.95 ms | 3.5 MiB | 275 |
| 2560 | 7.13 ms | 7.20 ms | 8.56 ms | 6.9 MiB | 140 |
| 5120 | 15.1 ms | 21.9 ms | 19.0 ms | 13.8 MiB | 66 |
| 10240 | 32.7 ms | 33.3 ms | 40.3 ms | 27.7 MiB | 31 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 538 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 322 µs | 322 µs | 60% |
| `run-policies` | 1 | 156 µs | 156 µs | 29% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 60.5 µs | 11% |

**At 10240 checks** (whole operation: 74.3 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 39.7 ms | 39.7 ms | 53% |
| `run-policies` | 1 | 29.4 ms | 29.4 ms | 40% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 5.22 ms | 7.0% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-30T10:52:22.650Z` → `2026-10-30T10:54:02.211Z` (100 s), ci: CI (run 41041815726)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15984 MB RAM, linux/x64, Node v24.22.1, GitHub Actions
- Git: `cbb0d7a2f418c721aa976ec1722fe84be6fccd55` on `dependabot/npm_and_yarn/dev-dependencies-6c9b387527`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

