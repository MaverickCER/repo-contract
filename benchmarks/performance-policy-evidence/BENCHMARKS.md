# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **390 µs** per operation compared with a bare-minimum baseline (**130% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.86). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 390 µs | 47.1 ms |
| Added latency, relative to baseline | 130% | 212% |
| Added CPU time per operation | 1.79 ms | 50.1 ms |
| Added memory per operation (heap delta) | 354.1 KiB | 44.8 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 2,563 ops/s | 21 ops/s |

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
| 20 | 92.1 µs | 274 µs | 181 µs | 196% | 193 µs | $0.00038 – $0.0022 |
| 40 | 156 µs | 440 µs | 280 µs | 180% | 1.64 ms | $0.00058 – $0.018 |
| 80 | 300 µs | 688 µs | 390 µs | 130% | 1.79 ms | $0.00081 – $0.020 |
| 160 | 531 µs | 1.22 ms | 686 µs | 129% | 682 µs | $0.0014 – $0.0077 |
| 320 | 873 µs | 2.46 ms | 1.57 ms | 180% | 1.62 ms | $0.0033 – $0.018 |
| 640 | 1.56 ms | 5.79 ms | 4.24 ms | 272% | 4.25 ms | $0.0088 – $0.048 |
| 1280 | 2.93 ms | 13.0 ms | 10.1 ms | 343% | 10.5 ms | $0.021 – $0.118 |
| 2560 | 5.67 ms | 19.7 ms | 14.0 ms | 247% | 14.7 ms | $0.029 – $0.165 |
| 5120 | 11.3 ms | 35.6 ms | 24.3 ms | 215% | 27.0 ms | $0.051 – $0.304 |
| 10240 | 22.3 ms | 69.0 ms | 47.1 ms | 212% | 50.1 ms | $0.098 – $0.563 |

**How the total grows:** O(n) (linear), exponent 0.86 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 353 µs | 40.0 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 3.02 ms | 409 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 148 µs | 26.8 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 176 µs | 36.1 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 132 µs | 25.9 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 178 µs | 36.2 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n) | 🟡 close (neighbouring class) | 79.2 µs | 9.67 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 284 µs | 414 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 880 µs | 109 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 7.89 ms | 1.50 s |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 276 µs | 28.6 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 337 µs | 61.1 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 358 µs | 26.9 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 348 µs | 27.4 ms |

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
| 20 | 94.8 µs | 100 µs | 304 µs | 52.9 KiB | 10,551 |
| 40 | 185 µs | 218 µs | 489 µs | 104.5 KiB | 5,392 |
| 80 | 353 µs | 405 µs | 862 µs | 211.4 KiB | 2,837 |
| 160 | 663 µs | 836 µs | 1.43 ms | 436.3 KiB | 1,508 |
| 320 | 1.35 ms | 1.73 ms | 2.94 ms | 938.9 KiB | 743 |
| 640 | 2.40 ms | 2.65 ms | 4.06 ms | 2.1 MiB | 417 |
| 1280 | 7.44 ms | 7.81 ms | 9.22 ms | 4.7 MiB | 134 |
| 2560 | 11.9 ms | 12.3 ms | 14.2 ms | 8.0 MiB | 84 |
| 5120 | 21.3 ms | 23.4 ms | 24.5 ms | 14.5 MiB | 47 |
| 10240 | 40.0 ms | 41.3 ms | 43.9 ms | 27.6 MiB | 25 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.05, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 799 µs | 997 µs | 1.57 ms | 294.9 KiB | 1,252 |
| 40 | 1.62 ms | 1.72 ms | 3.23 ms | 587.1 KiB | 618 |
| 80 | 3.02 ms | 3.58 ms | 4.77 ms | 1.1 MiB | 331 |
| 160 | 5.78 ms | 5.87 ms | 7.77 ms | 2.3 MiB | 173 |
| 320 | 11.3 ms | 12.0 ms | 13.6 ms | 4.7 MiB | 89 |
| 640 | 22.3 ms | 22.6 ms | 25.7 ms | 9.8 MiB | 45 |
| 1280 | 47.6 ms | 47.8 ms | 53.1 ms | 20.1 MiB | 21 |
| 2560 | 92.6 ms | 99.5 ms | 102 ms | 38.7 MiB | 11 |
| 5120 | 208 ms | 209 ms | 304 ms | 73.5 MiB | 5 |
| 10240 | 409 ms | 412 ms | 605 ms | 145.3 MiB | 2 |

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
| 20 | 58.2 µs | 69.2 µs | 61.2 µs | 48.3 KiB | 17,168 |
| 40 | 80.1 µs | 112 µs | 253 µs | 92.5 KiB | 12,489 |
| 80 | 148 µs | 204 µs | 445 µs | 188.5 KiB | 6,774 |
| 160 | 296 µs | 413 µs | 908 µs | 393.8 KiB | 3,377 |
| 320 | 548 µs | 743 µs | 1.44 ms | 853.7 KiB | 1,825 |
| 640 | 1.18 ms | 1.61 ms | 2.96 ms | 1.9 MiB | 844 |
| 1280 | 5.17 ms | 5.54 ms | 7.61 ms | 4.4 MiB | 193 |
| 2560 | 7.24 ms | 7.62 ms | 10.1 ms | 7.3 MiB | 138 |
| 5120 | 13.1 ms | 26.3 ms | 17.8 ms | 13.2 MiB | 76 |
| 10240 | 26.8 ms | 27.3 ms | 34.7 ms | 24.4 MiB | 37 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 56.3 µs | 61.7 µs | 217 µs | 54.1 KiB | 17,776 |
| 40 | 99.0 µs | 122 µs | 327 µs | 107.0 KiB | 10,097 |
| 80 | 176 µs | 231 µs | 524 µs | 217.3 KiB | 5,692 |
| 160 | 398 µs | 474 µs | 1.38 ms | 452.9 KiB | 2,512 |
| 320 | 697 µs | 921 µs | 1.95 ms | 970.6 KiB | 1,434 |
| 640 | 1.76 ms | 2.23 ms | 5.24 ms | 2.2 MiB | 570 |
| 1280 | 6.91 ms | 8.14 ms | 12.8 ms | 4.9 MiB | 145 |
| 2560 | 10.5 ms | 11.3 ms | 20.0 ms | 8.3 MiB | 95 |
| 5120 | 17.9 ms | 18.7 ms | 35.4 ms | 15.0 MiB | 56 |
| 10240 | 36.1 ms | 36.7 ms | 69.6 ms | 28.2 MiB | 28 |

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

**Measured: O(n)** (exponent 1.02, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 48.8 µs | 53.2 µs | 129 µs | 47.0 KiB | 20,479 |
| 40 | 74.8 µs | 101 µs | 231 µs | 92.6 KiB | 13,366 |
| 80 | 132 µs | 201 µs | 354 µs | 187.2 KiB | 7,596 |
| 160 | 292 µs | 424 µs | 878 µs | 393.9 KiB | 3,423 |
| 320 | 565 µs | 762 µs | 1.51 ms | 856.1 KiB | 1,771 |
| 640 | 1.19 ms | 1.59 ms | 2.93 ms | 1.9 MiB | 837 |
| 1280 | 5.08 ms | 5.59 ms | 7.64 ms | 4.4 MiB | 197 |
| 2560 | 7.42 ms | 7.95 ms | 10.5 ms | 7.3 MiB | 135 |
| 5120 | 12.9 ms | 13.7 ms | 17.6 ms | 13.2 MiB | 77 |
| 10240 | 25.9 ms | 26.3 ms | 33.5 ms | 24.4 MiB | 39 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.02, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 55.8 µs | 61.9 µs | 219 µs | 54.2 KiB | 17,927 |
| 40 | 97.8 µs | 119 µs | 299 µs | 107.0 KiB | 10,223 |
| 80 | 178 µs | 234 µs | 551 µs | 217.3 KiB | 5,620 |
| 160 | 352 µs | 490 µs | 1.09 ms | 451.7 KiB | 2,845 |
| 320 | 709 µs | 912 µs | 2.04 ms | 956.4 KiB | 1,411 |
| 640 | 1.71 ms | 2.07 ms | 5.23 ms | 2.2 MiB | 586 |
| 1280 | 6.68 ms | 7.04 ms | 12.5 ms | 4.9 MiB | 150 |
| 2560 | 10.4 ms | 10.9 ms | 20.0 ms | 8.3 MiB | 96 |
| 5120 | 17.8 ms | 18.0 ms | 35.0 ms | 15.1 MiB | 56 |
| 10240 | 36.2 ms | 36.2 ms | 69.0 ms | 28.2 MiB | 28 |

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

**Measured: O(n)** (exponent 1.04, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 33.4 µs | 46.9 µs | 43.3 µs | 30.5 KiB | 29,952 |
| 40 | 42.8 µs | 56.4 µs | 142 µs | 55.2 KiB | 23,363 |
| 80 | 79.2 µs | 113 µs | 248 µs | 104.6 KiB | 12,633 |
| 160 | 150 µs | 274 µs | 471 µs | 208.3 KiB | 6,672 |
| 320 | 318 µs | 469 µs | 925 µs | 402.2 KiB | 3,149 |
| 640 | 517 µs | 737 µs | 1.39 ms | 821.1 KiB | 1,934 |
| 1280 | 1.20 ms | 1.32 ms | 3.21 ms | 1.3 MiB | 835 |
| 2560 | 2.28 ms | 2.37 ms | 4.85 ms | 2.7 MiB | 439 |
| 5120 | 4.75 ms | 5.31 ms | 8.70 ms | 5.5 MiB | 210 |
| 10240 | 9.67 ms | 9.87 ms | 16.4 ms | 10.8 MiB | 103 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent 0.00, 10 sizes) -- ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 274 µs | 309 µs | 863 µs | 620.2 KiB | 3,646 |
| 40 | 274 µs | 314 µs | 854 µs | 620.3 KiB | 3,647 |
| 80 | 284 µs | 308 µs | 869 µs | 626.2 KiB | 3,526 |
| 160 | 296 µs | 322 µs | 875 µs | 667.5 KiB | 3,378 |
| 320 | 321 µs | 377 µs | 903 µs | 716.3 KiB | 3,113 |
| 640 | 412 µs | 528 µs | 1.29 ms | 834.3 KiB | 2,428 |
| 1280 | 412 µs | 453 µs | 1.29 ms | 834.3 KiB | 2,429 |
| 2560 | 411 µs | 456 µs | 1.28 ms | 834.3 KiB | 2,430 |
| 5120 | 413 µs | 451 µs | 1.28 ms | 834.3 KiB | 2,420 |
| 10240 | 414 µs | 442 µs | 1.28 ms | 834.3 KiB | 2,415 |

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
| 20 | 224 µs | 236 µs | 600 µs | 45.6 KiB | 4,472 |
| 40 | 436 µs | 457 µs | 1.19 ms | 90.2 KiB | 2,294 |
| 80 | 880 µs | 907 µs | 1.70 ms | 178.6 KiB | 1,136 |
| 160 | 1.70 ms | 1.75 ms | 3.31 ms | 357.3 KiB | 587 |
| 320 | 3.22 ms | 3.29 ms | 5.09 ms | 712.3 KiB | 311 |
| 640 | 6.04 ms | 6.23 ms | 8.10 ms | 1.4 MiB | 166 |
| 1280 | 11.9 ms | 12.1 ms | 14.2 ms | 2.8 MiB | 84 |
| 2560 | 24.0 ms | 24.3 ms | 26.1 ms | 5.7 MiB | 42 |
| 5120 | 48.3 ms | 48.7 ms | 48.7 ms | 11.3 MiB | 21 |
| 10240 | 109 ms | 109 ms | 109 ms | 22.7 MiB | 9 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.10, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.26 ms | 2.42 ms | 4.09 ms | 599.8 KiB | 442 |
| 40 | 4.14 ms | 4.31 ms | 6.07 ms | 1.2 MiB | 242 |
| 80 | 7.89 ms | 8.10 ms | 9.99 ms | 2.3 MiB | 127 |
| 160 | 15.2 ms | 15.4 ms | 17.4 ms | 4.6 MiB | 66 |
| 320 | 30.3 ms | 37.9 ms | 30.8 ms | 9.3 MiB | 33 |
| 640 | 68.4 ms | 68.5 ms | 68.8 ms | 18.5 MiB | 15 |
| 1280 | 169 ms | 172 ms | 170 ms | 37.0 MiB | 6 |
| 2560 | 364 ms | 365 ms | 365 ms | 73.9 MiB | 3 |
| 5120 | 739 ms | 743 ms | 755 ms | 147.7 MiB | 1 |
| 10240 | 1.50 s | 1.50 s | 1.53 s | 295.3 MiB | 1 |

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
| 20 | 111 µs | 142 µs | 404 µs | 98.0 KiB | 8,980 |
| 40 | 155 µs | 220 µs | 445 µs | 179.0 KiB | 6,460 |
| 80 | 276 µs | 406 µs | 753 µs | 322.3 KiB | 3,630 |
| 160 | 506 µs | 575 µs | 1.25 ms | 637.9 KiB | 1,976 |
| 320 | 1.00 ms | 1.13 ms | 2.50 ms | 1.2 MiB | 997 |
| 640 | 1.79 ms | 1.97 ms | 3.35 ms | 2.5 MiB | 557 |
| 1280 | 3.35 ms | 3.54 ms | 4.78 ms | 4.9 MiB | 299 |
| 2560 | 6.68 ms | 6.96 ms | 8.54 ms | 9.9 MiB | 150 |
| 5120 | 13.7 ms | 13.9 ms | 16.4 ms | 19.8 MiB | 73 |
| 10240 | 28.6 ms | 30.9 ms | 33.1 ms | 39.6 MiB | 35 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.17, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 97.5 µs | 105 µs | 307 µs | 281.1 KiB | 10,258 |
| 40 | 165 µs | 176 µs | 455 µs | 539.5 KiB | 6,056 |
| 80 | 337 µs | 366 µs | 835 µs | 1.0 MiB | 2,968 |
| 160 | 614 µs | 669 µs | 1.36 ms | 2.1 MiB | 1,629 |
| 320 | 1.26 ms | 1.31 ms | 2.81 ms | 4.2 MiB | 795 |
| 640 | 2.44 ms | 2.53 ms | 4.08 ms | 8.3 MiB | 409 |
| 1280 | 4.81 ms | 5.01 ms | 6.69 ms | 16.7 MiB | 208 |
| 2560 | 9.71 ms | 10.0 ms | 12.2 ms | 33.3 MiB | 103 |
| 5120 | 25.4 ms | 26.7 ms | 28.9 ms | 52.0 MiB | 39 |
| 10240 | 61.1 ms | 62.6 ms | 70.5 ms | 103.7 MiB | 16 |

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
| 20 | 105 µs | 126 µs | 108 µs | 57.4 KiB | 9,494 |
| 40 | 188 µs | 207 µs | 191 µs | 113.5 KiB | 5,331 |
| 80 | 358 µs | 378 µs | 362 µs | 225.7 KiB | 2,797 |
| 160 | 584 µs | 619 µs | 2.03 ms | 450.0 KiB | 1,712 |
| 320 | 984 µs | 1.03 ms | 2.43 ms | 898.9 KiB | 1,016 |
| 640 | 1.77 ms | 1.86 ms | 3.24 ms | 1.8 MiB | 564 |
| 1280 | 3.33 ms | 3.52 ms | 4.46 ms | 3.5 MiB | 300 |
| 2560 | 6.40 ms | 7.03 ms | 6.67 ms | 6.9 MiB | 156 |
| 5120 | 13.1 ms | 14.0 ms | 13.1 ms | 13.8 MiB | 76 |
| 10240 | 26.9 ms | 27.9 ms | 27.3 ms | 27.7 MiB | 37 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 97.9 µs | 117 µs | 101 µs | 56.5 KiB | 10,216 |
| 40 | 180 µs | 199 µs | 183 µs | 111.8 KiB | 5,552 |
| 80 | 348 µs | 368 µs | 782 µs | 222.5 KiB | 2,871 |
| 160 | 547 µs | 673 µs | 1.86 ms | 443.7 KiB | 1,828 |
| 320 | 958 µs | 1.06 ms | 2.34 ms | 886.2 KiB | 1,044 |
| 640 | 1.73 ms | 1.79 ms | 3.18 ms | 1.7 MiB | 579 |
| 1280 | 3.31 ms | 3.34 ms | 5.00 ms | 3.5 MiB | 302 |
| 2560 | 6.39 ms | 10.6 ms | 7.67 ms | 6.9 MiB | 156 |
| 5120 | 13.2 ms | 14.2 ms | 16.1 ms | 13.8 MiB | 76 |
| 10240 | 27.4 ms | 28.0 ms | 32.2 ms | 27.7 MiB | 37 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 688 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 353 µs | 353 µs | 51% |
| `run-policies` | 1 | 148 µs | 148 µs | 21% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 187 µs | 27% |

**At 10240 checks** (whole operation: 69.0 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 40.0 ms | 40.0 ms | 58% |
| `run-policies` | 1 | 26.8 ms | 26.8 ms | 39% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 2.22 ms | 3.2% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-13T07:10:22.101Z` → `2026-11-13T07:11:58.009Z` (96 s), ci: CI (run 43381456262)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `b9f0e4b67443ab57e8aa90a4fe3f7d97e5c83d78` on `chore/bump-internal-package-contract-v0.18.0`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

