# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **285 µs** per operation compared with a bare-minimum baseline (**131% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.96). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 285 µs | 40.0 ms |
| Added latency, relative to baseline | 131% | 182% |
| Added CPU time per operation | 653 µs | 46.3 ms |
| Added memory per operation (heap delta) | 345.9 KiB | 44.6 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,513 ops/s | 25 ops/s |

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
| 20 | 60.5 µs | 165 µs | 104 µs | 173% | 330 µs | $0.00022 – $0.0037 |
| 40 | 112 µs | 281 µs | 169 µs | 151% | 452 µs | $0.00035 – $0.0051 |
| 80 | 218 µs | 503 µs | 285 µs | 131% | 653 µs | $0.00059 – $0.0073 |
| 160 | 431 µs | 1.01 ms | 574 µs | 133% | 1.32 ms | $0.0012 – $0.015 |
| 320 | 775 µs | 1.76 ms | 987 µs | 127% | 1.67 ms | $0.0021 – $0.019 |
| 640 | 1.55 ms | 3.44 ms | 1.90 ms | 123% | 2.26 ms | $0.0039 – $0.025 |
| 1280 | 2.90 ms | 13.4 ms | 10.5 ms | 361% | 11.1 ms | $0.022 – $0.125 |
| 2560 | 5.64 ms | 19.2 ms | 13.6 ms | 240% | 14.6 ms | $0.028 – $0.164 |
| 5120 | 11.1 ms | 32.9 ms | 21.8 ms | 196% | 24.8 ms | $0.045 – $0.279 |
| 10240 | 22.0 ms | 61.9 ms | 40.0 ms | 182% | 46.3 ms | $0.083 – $0.521 |

**How the total grows:** O(n) (linear), exponent 0.96 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 310 µs | 36.4 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 2.94 ms | 406 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 154 µs | 24.5 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 190 µs | 34.5 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 152 µs | 26.4 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 214 µs | 34.8 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n log n) | ✅ matches | 85.6 µs | 9.42 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 292 µs | 425 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 954 µs | 96.2 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n) | ✅ matches | 8.00 ms | 1.52 s |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 272 µs | 26.2 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 312 µs | 58.5 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 351 µs | 26.1 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 342 µs | 26.7 ms |

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
| 20 | 93.0 µs | 98.9 µs | 303 µs | 52.9 KiB | 10,758 |
| 40 | 161 µs | 198 µs | 458 µs | 104.5 KiB | 6,193 |
| 80 | 310 µs | 398 µs | 797 µs | 211.4 KiB | 3,226 |
| 160 | 589 µs | 659 µs | 1.33 ms | 436.3 KiB | 1,699 |
| 320 | 1.18 ms | 1.25 ms | 2.68 ms | 938.9 KiB | 847 |
| 640 | 2.12 ms | 2.24 ms | 3.67 ms | 2.1 MiB | 471 |
| 1280 | 7.09 ms | 7.45 ms | 8.69 ms | 4.7 MiB | 141 |
| 2560 | 11.1 ms | 11.5 ms | 13.1 ms | 8.0 MiB | 90 |
| 5120 | 19.6 ms | 21.5 ms | 22.3 ms | 14.5 MiB | 51 |
| 10240 | 36.4 ms | 36.7 ms | 40.3 ms | 27.5 MiB | 27 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.06, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 800 µs | 819 µs | 1.54 ms | 294.9 KiB | 1,249 |
| 40 | 1.59 ms | 1.62 ms | 3.16 ms | 587.1 KiB | 630 |
| 80 | 2.94 ms | 3.49 ms | 4.59 ms | 1.1 MiB | 340 |
| 160 | 5.62 ms | 6.09 ms | 7.53 ms | 2.3 MiB | 178 |
| 320 | 11.0 ms | 11.2 ms | 13.3 ms | 4.7 MiB | 91 |
| 640 | 21.7 ms | 21.8 ms | 24.9 ms | 9.8 MiB | 46 |
| 1280 | 46.4 ms | 48.8 ms | 51.6 ms | 20.1 MiB | 22 |
| 2560 | 89.8 ms | 97.2 ms | 99.9 ms | 38.7 MiB | 11 |
| 5120 | 204 ms | 205 ms | 298 ms | 73.5 MiB | 5 |
| 10240 | 406 ms | 407 ms | 605 ms | 145.2 MiB | 2 |

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

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 50.4 µs | 58.4 µs | 51.5 µs | 47.2 KiB | 19,831 |
| 40 | 79.4 µs | 103 µs | 256 µs | 92.5 KiB | 12,588 |
| 80 | 154 µs | 203 µs | 493 µs | 188.5 KiB | 6,511 |
| 160 | 284 µs | 397 µs | 833 µs | 393.8 KiB | 3,519 |
| 320 | 543 µs | 750 µs | 1.38 ms | 855.2 KiB | 1,840 |
| 640 | 1.16 ms | 1.35 ms | 2.87 ms | 1.9 MiB | 859 |
| 1280 | 5.24 ms | 5.77 ms | 7.75 ms | 4.4 MiB | 191 |
| 2560 | 7.19 ms | 7.47 ms | 9.86 ms | 7.3 MiB | 139 |
| 5120 | 11.8 ms | 12.9 ms | 16.5 ms | 13.2 MiB | 85 |
| 10240 | 24.5 ms | 25.1 ms | 32.0 ms | 24.8 MiB | 41 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.04, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 56.8 µs | 62.5 µs | 217 µs | 54.1 KiB | 17,608 |
| 40 | 90.0 µs | 116 µs | 290 µs | 107.0 KiB | 11,111 |
| 80 | 190 µs | 235 µs | 624 µs | 217.5 KiB | 5,251 |
| 160 | 401 µs | 503 µs | 1.38 ms | 452.9 KiB | 2,497 |
| 320 | 886 µs | 1.01 ms | 3.22 ms | 975.6 KiB | 1,129 |
| 640 | 1.59 ms | 1.94 ms | 4.92 ms | 2.2 MiB | 630 |
| 1280 | 6.34 ms | 6.61 ms | 11.9 ms | 4.9 MiB | 158 |
| 2560 | 9.38 ms | 10.0 ms | 19.0 ms | 8.3 MiB | 107 |
| 5120 | 17.8 ms | 18.6 ms | 34.1 ms | 15.1 MiB | 56 |
| 10240 | 34.5 ms | 35.9 ms | 68.1 ms | 28.0 MiB | 29 |

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
| 20 | 50.3 µs | 56.1 µs | 148 µs | 47.0 KiB | 19,885 |
| 40 | 81.8 µs | 101 µs | 262 µs | 92.6 KiB | 12,229 |
| 80 | 152 µs | 209 µs | 456 µs | 188.5 KiB | 6,579 |
| 160 | 288 µs | 405 µs | 862 µs | 393.9 KiB | 3,468 |
| 320 | 560 µs | 641 µs | 1.47 ms | 856.1 KiB | 1,785 |
| 640 | 1.22 ms | 1.58 ms | 2.96 ms | 1.9 MiB | 817 |
| 1280 | 5.18 ms | 5.72 ms | 7.53 ms | 4.4 MiB | 193 |
| 2560 | 7.03 ms | 7.45 ms | 9.90 ms | 7.3 MiB | 142 |
| 5120 | 12.8 ms | 13.7 ms | 17.1 ms | 13.2 MiB | 78 |
| 10240 | 26.4 ms | 29.1 ms | 33.9 ms | 24.6 MiB | 38 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.98, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 55.5 µs | 61.3 µs | 174 µs | 54.2 KiB | 18,028 |
| 40 | 93.1 µs | 119 µs | 296 µs | 107.0 KiB | 10,736 |
| 80 | 214 µs | 246 µs | 662 µs | 217.5 KiB | 4,675 |
| 160 | 420 µs | 500 µs | 1.41 ms | 452.9 KiB | 2,383 |
| 320 | 743 µs | 948 µs | 2.07 ms | 970.6 KiB | 1,345 |
| 640 | 1.86 ms | 2.25 ms | 5.41 ms | 2.2 MiB | 537 |
| 1280 | 6.72 ms | 7.01 ms | 12.5 ms | 4.9 MiB | 149 |
| 2560 | 9.83 ms | 10.4 ms | 19.9 ms | 8.3 MiB | 102 |
| 5120 | 17.8 ms | 18.5 ms | 35.1 ms | 15.1 MiB | 56 |
| 10240 | 34.8 ms | 35.9 ms | 69.0 ms | 28.1 MiB | 29 |

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

**Measured: O(n log n)** (exponent 1.21, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 34.2 µs | 51.3 µs | 36.1 µs | 30.5 KiB | 29,254 |
| 40 | 43.6 µs | 57.3 µs | 152 µs | 55.2 KiB | 22,947 |
| 80 | 85.6 µs | 105 µs | 245 µs | 104.6 KiB | 11,678 |
| 160 | 135 µs | 202 µs | 352 µs | 206.8 KiB | 7,415 |
| 320 | 259 µs | 480 µs | 703 µs | 402.0 KiB | 3,857 |
| 640 | 278 µs | 319 µs | 875 µs | 620.0 KiB | 3,594 |
| 1280 | 1.20 ms | 1.27 ms | 3.26 ms | 1.3 MiB | 836 |
| 2560 | 2.28 ms | 2.38 ms | 4.99 ms | 2.7 MiB | 438 |
| 5120 | 4.72 ms | 4.90 ms | 8.84 ms | 5.5 MiB | 212 |
| 10240 | 9.42 ms | 9.68 ms | 16.2 ms | 10.8 MiB | 106 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent -0.00, 10 sizes) -- ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 284 µs | 302 µs | 885 µs | 620.2 KiB | 3,518 |
| 40 | 284 µs | 324 µs | 876 µs | 620.3 KiB | 3,518 |
| 80 | 292 µs | 307 µs | 887 µs | 626.2 KiB | 3,429 |
| 160 | 302 µs | 336 µs | 889 µs | 667.5 KiB | 3,314 |
| 320 | 331 µs | 348 µs | 921 µs | 716.3 KiB | 3,021 |
| 640 | 426 µs | 490 µs | 1.31 ms | 834.3 KiB | 2,347 |
| 1280 | 425 µs | 491 µs | 1.31 ms | 834.3 KiB | 2,353 |
| 2560 | 424 µs | 502 µs | 1.31 ms | 834.3 KiB | 2,356 |
| 5120 | 425 µs | 491 µs | 1.32 ms | 834.3 KiB | 2,353 |
| 10240 | 425 µs | 489 µs | 1.31 ms | 834.3 KiB | 2,354 |

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

**Measured: O(n)** (exponent 0.95, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 224 µs | 246 µs | 727 µs | 45.8 KiB | 4,459 |
| 40 | 428 µs | 457 µs | 1.18 ms | 90.2 KiB | 2,339 |
| 80 | 954 µs | 1.01 ms | 2.51 ms | 179.3 KiB | 1,048 |
| 160 | 2.06 ms | 2.13 ms | 3.67 ms | 357.3 KiB | 487 |
| 320 | 3.71 ms | 3.94 ms | 5.73 ms | 712.3 KiB | 269 |
| 640 | 7.09 ms | 7.20 ms | 9.31 ms | 1.4 MiB | 141 |
| 1280 | 14.2 ms | 15.2 ms | 16.5 ms | 2.8 MiB | 70 |
| 2560 | 28.1 ms | 28.6 ms | 30.1 ms | 5.7 MiB | 36 |
| 5120 | 55.1 ms | 56.1 ms | 55.5 ms | 11.3 MiB | 18 |
| 10240 | 96.2 ms | 96.4 ms | 96.7 ms | 22.7 MiB | 10 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.04, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.49 ms | 2.66 ms | 4.33 ms | 599.8 KiB | 402 |
| 40 | 4.42 ms | 4.57 ms | 6.32 ms | 1.2 MiB | 226 |
| 80 | 8.00 ms | 8.14 ms | 10.0 ms | 2.3 MiB | 125 |
| 160 | 15.3 ms | 15.7 ms | 17.2 ms | 4.6 MiB | 65 |
| 320 | 42.3 ms | 42.5 ms | 42.8 ms | 9.3 MiB | 24 |
| 640 | 84.4 ms | 85.2 ms | 84.8 ms | 18.5 MiB | 12 |
| 1280 | 187 ms | 188 ms | 187 ms | 37.0 MiB | 5 |
| 2560 | 379 ms | 381 ms | 379 ms | 73.9 MiB | 3 |
| 5120 | 763 ms | 770 ms | 781 ms | 147.7 MiB | 1 |
| 10240 | 1.52 s | 1.53 s | 1.56 s | 295.3 MiB | 1 |

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

**Measured: O(n)** (exponent 0.97, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 105 µs | 153 µs | 386 µs | 98.0 KiB | 9,546 |
| 40 | 158 µs | 219 µs | 435 µs | 179.0 KiB | 6,346 |
| 80 | 272 µs | 331 µs | 742 µs | 322.3 KiB | 3,680 |
| 160 | 491 µs | 553 µs | 1.20 ms | 637.9 KiB | 2,037 |
| 320 | 1.00 ms | 1.42 ms | 2.46 ms | 1.2 MiB | 1,000 |
| 640 | 1.78 ms | 1.94 ms | 3.29 ms | 2.5 MiB | 563 |
| 1280 | 3.36 ms | 3.54 ms | 4.87 ms | 4.9 MiB | 298 |
| 2560 | 6.47 ms | 6.65 ms | 8.12 ms | 9.9 MiB | 155 |
| 5120 | 13.1 ms | 13.4 ms | 15.4 ms | 19.8 MiB | 76 |
| 10240 | 26.2 ms | 27.3 ms | 30.0 ms | 39.6 MiB | 38 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.16, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 93.3 µs | 98.1 µs | 296 µs | 281.1 KiB | 10,720 |
| 40 | 169 µs | 214 µs | 524 µs | 540.1 KiB | 5,905 |
| 80 | 312 µs | 321 µs | 772 µs | 1.0 MiB | 3,204 |
| 160 | 613 µs | 654 µs | 1.34 ms | 2.1 MiB | 1,632 |
| 320 | 1.29 ms | 1.41 ms | 2.77 ms | 4.2 MiB | 778 |
| 640 | 2.36 ms | 2.50 ms | 3.96 ms | 8.3 MiB | 423 |
| 1280 | 4.71 ms | 4.85 ms | 6.54 ms | 16.7 MiB | 212 |
| 2560 | 9.42 ms | 9.52 ms | 11.7 ms | 33.3 MiB | 106 |
| 5120 | 24.2 ms | 25.2 ms | 27.8 ms | 52.0 MiB | 41 |
| 10240 | 58.5 ms | 63.1 ms | 67.8 ms | 103.7 MiB | 17 |

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
| 20 | 106 µs | 134 µs | 109 µs | 57.4 KiB | 9,468 |
| 40 | 188 µs | 213 µs | 191 µs | 113.5 KiB | 5,324 |
| 80 | 351 µs | 384 µs | 355 µs | 225.7 KiB | 2,849 |
| 160 | 577 µs | 723 µs | 1.99 ms | 450.0 KiB | 1,734 |
| 320 | 959 µs | 1.08 ms | 2.37 ms | 898.9 KiB | 1,043 |
| 640 | 1.76 ms | 1.82 ms | 3.15 ms | 1.8 MiB | 569 |
| 1280 | 3.35 ms | 3.63 ms | 4.62 ms | 3.5 MiB | 299 |
| 2560 | 6.32 ms | 6.45 ms | 6.56 ms | 6.9 MiB | 158 |
| 5120 | 12.9 ms | 13.6 ms | 13.2 ms | 13.8 MiB | 77 |
| 10240 | 26.1 ms | 26.3 ms | 26.6 ms | 27.7 MiB | 38 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.98, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 96.2 µs | 120 µs | 99.0 µs | 56.5 KiB | 10,394 |
| 40 | 178 µs | 203 µs | 182 µs | 111.8 KiB | 5,612 |
| 80 | 342 µs | 368 µs | 751 µs | 222.5 KiB | 2,921 |
| 160 | 552 µs | 595 µs | 1.78 ms | 443.7 KiB | 1,812 |
| 320 | 952 µs | 982 µs | 2.21 ms | 886.2 KiB | 1,050 |
| 640 | 1.75 ms | 1.80 ms | 3.06 ms | 1.7 MiB | 572 |
| 1280 | 3.29 ms | 3.89 ms | 4.96 ms | 3.5 MiB | 304 |
| 2560 | 6.39 ms | 6.45 ms | 7.51 ms | 6.9 MiB | 156 |
| 5120 | 13.0 ms | 13.3 ms | 16.2 ms | 13.8 MiB | 77 |
| 10240 | 26.7 ms | 26.8 ms | 31.1 ms | 27.7 MiB | 37 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 503 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 310 µs | 310 µs | 62% |
| `run-policies` | 1 | 154 µs | 154 µs | 31% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 39.2 µs | 7.8% |

**At 10240 checks** (whole operation: 61.9 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 36.4 ms | 36.4 ms | 59% |
| `run-policies` | 1 | 24.5 ms | 24.5 ms | 40% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 1.01 ms | 1.6% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-21T14:26:36.329Z` → `2026-10-21T14:28:12.304Z` (96 s), ci: CI (run 39614518835)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15984 MB RAM, linux/x64, Node v24.22.0, GitHub Actions
- Git: `489f3721c4dae30a98bd471426f11fadaf2eaac4` on `fix/license-config-and-e2e-zero-tests`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

