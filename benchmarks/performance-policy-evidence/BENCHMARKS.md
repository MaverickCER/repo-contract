# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **298 µs** per operation compared with a bare-minimum baseline (**139% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.98). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 298 µs | 44.6 ms |
| Added latency, relative to baseline | 139% | 203% |
| Added CPU time per operation | 682 µs | 48.9 ms |
| Added memory per operation (heap delta) | 345.9 KiB | 44.5 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,354 ops/s | 22 ops/s |

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
| 20 | 61.2 µs | 183 µs | 122 µs | 200% | 465 µs | $0.00025 – $0.0052 |
| 40 | 112 µs | 289 µs | 177 µs | 158% | 464 µs | $0.00037 – $0.0052 |
| 80 | 214 µs | 512 µs | 298 µs | 139% | 682 µs | $0.00062 – $0.0077 |
| 160 | 423 µs | 1.02 ms | 597 µs | 141% | 1.38 ms | $0.0012 – $0.015 |
| 320 | 781 µs | 1.81 ms | 1.03 ms | 131% | 1.75 ms | $0.0021 – $0.020 |
| 640 | 1.55 ms | 3.60 ms | 2.05 ms | 132% | 2.52 ms | $0.0043 – $0.028 |
| 1280 | 2.89 ms | 13.2 ms | 10.3 ms | 357% | 11.1 ms | $0.021 – $0.125 |
| 2560 | 5.64 ms | 19.8 ms | 14.2 ms | 252% | 14.8 ms | $0.030 – $0.166 |
| 5120 | 11.1 ms | 34.6 ms | 23.5 ms | 211% | 25.0 ms | $0.049 – $0.281 |
| 10240 | 22.0 ms | 66.6 ms | 44.6 ms | 203% | 48.9 ms | $0.093 – $0.550 |

**How the total grows:** O(n) (linear), exponent 0.98 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 320 µs | 37.4 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 2.98 ms | 416 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 151 µs | 27.4 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 208 µs | 37.8 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 156 µs | 27.5 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 202 µs | 38.1 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n) | 🟡 close (neighbouring class) | 80.0 µs | 9.75 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 300 µs | 433 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 845 µs | 100 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 8.27 ms | 1.56 s |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 284 µs | 29.3 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 334 µs | 65.7 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 379 µs | 27.5 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 355 µs | 27.7 ms |

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
| 20 | 104 µs | 110 µs | 379 µs | 53.0 KiB | 9,582 |
| 40 | 171 µs | 185 µs | 500 µs | 104.5 KiB | 5,835 |
| 80 | 320 µs | 340 µs | 811 µs | 211.4 KiB | 3,127 |
| 160 | 601 µs | 619 µs | 1.35 ms | 436.2 KiB | 1,664 |
| 320 | 1.21 ms | 1.29 ms | 2.73 ms | 938.9 KiB | 830 |
| 640 | 2.17 ms | 2.35 ms | 3.45 ms | 2.1 MiB | 461 |
| 1280 | 7.27 ms | 7.90 ms | 8.89 ms | 4.7 MiB | 138 |
| 2560 | 11.4 ms | 11.7 ms | 13.5 ms | 8.0 MiB | 87 |
| 5120 | 20.5 ms | 23.3 ms | 22.8 ms | 14.5 MiB | 49 |
| 10240 | 37.4 ms | 38.7 ms | 42.1 ms | 27.6 MiB | 27 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.06, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 806 µs | 819 µs | 1.56 ms | 294.9 KiB | 1,241 |
| 40 | 1.60 ms | 1.63 ms | 3.17 ms | 587.0 KiB | 624 |
| 80 | 2.98 ms | 3.56 ms | 4.68 ms | 1.1 MiB | 335 |
| 160 | 5.73 ms | 5.78 ms | 7.62 ms | 2.3 MiB | 175 |
| 320 | 11.2 ms | 11.7 ms | 13.6 ms | 4.7 MiB | 89 |
| 640 | 22.2 ms | 22.4 ms | 25.5 ms | 9.8 MiB | 45 |
| 1280 | 47.6 ms | 50.4 ms | 53.1 ms | 20.1 MiB | 21 |
| 2560 | 92.2 ms | 100 ms | 101 ms | 38.7 MiB | 11 |
| 5120 | 212 ms | 212 ms | 313 ms | 73.5 MiB | 5 |
| 10240 | 416 ms | 423 ms | 620 ms | 145.3 MiB | 2 |

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
| 20 | 60.6 µs | 75.4 µs | 61.5 µs | 48.3 KiB | 16,512 |
| 40 | 87.7 µs | 119 µs | 299 µs | 92.6 KiB | 11,409 |
| 80 | 151 µs | 203 µs | 446 µs | 188.5 KiB | 6,641 |
| 160 | 297 µs | 416 µs | 903 µs | 393.8 KiB | 3,373 |
| 320 | 609 µs | 794 µs | 1.51 ms | 855.1 KiB | 1,642 |
| 640 | 1.23 ms | 1.51 ms | 3.00 ms | 1.9 MiB | 812 |
| 1280 | 5.36 ms | 5.79 ms | 7.61 ms | 4.4 MiB | 187 |
| 2560 | 7.46 ms | 8.14 ms | 10.3 ms | 7.3 MiB | 134 |
| 5120 | 13.5 ms | 14.4 ms | 18.5 ms | 13.2 MiB | 74 |
| 10240 | 27.4 ms | 28.5 ms | 36.4 ms | 24.7 MiB | 36 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 60.4 µs | 64.9 µs | 242 µs | 54.1 KiB | 16,546 |
| 40 | 114 µs | 126 µs | 340 µs | 107.0 KiB | 8,785 |
| 80 | 208 µs | 253 µs | 661 µs | 217.5 KiB | 4,816 |
| 160 | 453 µs | 507 µs | 1.43 ms | 452.9 KiB | 2,208 |
| 320 | 789 µs | 1.03 ms | 2.12 ms | 970.6 KiB | 1,268 |
| 640 | 1.90 ms | 2.28 ms | 5.34 ms | 2.2 MiB | 525 |
| 1280 | 6.99 ms | 7.46 ms | 12.9 ms | 4.9 MiB | 143 |
| 2560 | 10.0 ms | 10.5 ms | 20.2 ms | 8.3 MiB | 100 |
| 5120 | 18.6 ms | 20.4 ms | 35.9 ms | 15.0 MiB | 54 |
| 10240 | 37.8 ms | 38.5 ms | 72.9 ms | 28.0 MiB | 26 |

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
| 20 | 51.8 µs | 55.4 µs | 106 µs | 47.0 KiB | 19,294 |
| 40 | 80.5 µs | 105 µs | 259 µs | 92.6 KiB | 12,423 |
| 80 | 156 µs | 211 µs | 479 µs | 188.5 KiB | 6,428 |
| 160 | 298 µs | 430 µs | 883 µs | 393.9 KiB | 3,355 |
| 320 | 576 µs | 813 µs | 1.46 ms | 853.7 KiB | 1,736 |
| 640 | 1.26 ms | 1.56 ms | 3.00 ms | 1.9 MiB | 796 |
| 1280 | 5.46 ms | 5.86 ms | 8.04 ms | 4.4 MiB | 183 |
| 2560 | 8.23 ms | 8.52 ms | 11.4 ms | 7.3 MiB | 122 |
| 5120 | 13.3 ms | 14.3 ms | 18.0 ms | 13.2 MiB | 75 |
| 10240 | 27.5 ms | 28.8 ms | 36.4 ms | 24.7 MiB | 36 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 60.2 µs | 65.3 µs | 207 µs | 54.2 KiB | 16,608 |
| 40 | 101 µs | 125 µs | 302 µs | 107.0 KiB | 9,858 |
| 80 | 202 µs | 263 µs | 647 µs | 217.5 KiB | 4,953 |
| 160 | 425 µs | 516 µs | 1.45 ms | 452.9 KiB | 2,355 |
| 320 | 755 µs | 807 µs | 2.08 ms | 970.6 KiB | 1,325 |
| 640 | 1.95 ms | 2.38 ms | 5.63 ms | 2.2 MiB | 514 |
| 1280 | 7.30 ms | 8.01 ms | 13.5 ms | 4.9 MiB | 137 |
| 2560 | 10.9 ms | 11.8 ms | 21.0 ms | 8.3 MiB | 91 |
| 5120 | 20.1 ms | 20.9 ms | 38.9 ms | 15.0 MiB | 50 |
| 10240 | 38.1 ms | 39.0 ms | 72.6 ms | 28.3 MiB | 26 |

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
| 20 | 33.9 µs | 47.4 µs | 35.3 µs | 30.5 KiB | 29,538 |
| 40 | 44.0 µs | 57.7 µs | 144 µs | 55.2 KiB | 22,720 |
| 80 | 80.0 µs | 110 µs | 251 µs | 104.6 KiB | 12,493 |
| 160 | 157 µs | 211 µs | 494 µs | 208.3 KiB | 6,355 |
| 320 | 289 µs | 445 µs | 847 µs | 402.2 KiB | 3,455 |
| 640 | 532 µs | 779 µs | 1.40 ms | 821.1 KiB | 1,880 |
| 1280 | 1.19 ms | 1.28 ms | 3.19 ms | 1.3 MiB | 840 |
| 2560 | 2.26 ms | 2.33 ms | 4.86 ms | 2.7 MiB | 442 |
| 5120 | 4.74 ms | 4.91 ms | 8.69 ms | 5.5 MiB | 211 |
| 10240 | 9.75 ms | 10.0 ms | 16.9 ms | 10.8 MiB | 103 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent -0.00, 10 sizes) -- ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 267 µs | 292 µs | 701 µs | 616.5 KiB | 3,745 |
| 40 | 291 µs | 332 µs | 870 µs | 620.3 KiB | 3,439 |
| 80 | 300 µs | 325 µs | 887 µs | 626.2 KiB | 3,330 |
| 160 | 316 µs | 330 µs | 906 µs | 667.5 KiB | 3,164 |
| 320 | 340 µs | 366 µs | 930 µs | 716.3 KiB | 2,941 |
| 640 | 436 µs | 494 µs | 1.30 ms | 834.3 KiB | 2,293 |
| 1280 | 431 µs | 455 µs | 1.29 ms | 834.3 KiB | 2,322 |
| 2560 | 431 µs | 470 µs | 1.30 ms | 834.3 KiB | 2,321 |
| 5120 | 431 µs | 472 µs | 1.31 ms | 834.3 KiB | 2,319 |
| 10240 | 433 µs | 468 µs | 1.30 ms | 834.3 KiB | 2,308 |

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
| 20 | 226 µs | 250 µs | 728 µs | 45.8 KiB | 4,426 |
| 40 | 405 µs | 438 µs | 1.16 ms | 90.2 KiB | 2,472 |
| 80 | 845 µs | 879 µs | 1.63 ms | 178.6 KiB | 1,183 |
| 160 | 1.60 ms | 1.71 ms | 3.22 ms | 357.3 KiB | 626 |
| 320 | 2.83 ms | 3.10 ms | 4.75 ms | 712.3 KiB | 354 |
| 640 | 5.35 ms | 5.49 ms | 7.38 ms | 1.4 MiB | 187 |
| 1280 | 10.8 ms | 11.2 ms | 13.2 ms | 2.8 MiB | 93 |
| 2560 | 21.2 ms | 21.9 ms | 23.7 ms | 5.7 MiB | 47 |
| 5120 | 42.9 ms | 43.4 ms | 43.9 ms | 11.3 MiB | 23 |
| 10240 | 100 ms | 102 ms | 101 ms | 22.7 MiB | 10 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.10, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.48 ms | 2.62 ms | 4.36 ms | 599.8 KiB | 404 |
| 40 | 4.46 ms | 4.67 ms | 6.39 ms | 1.2 MiB | 224 |
| 80 | 8.27 ms | 8.42 ms | 10.3 ms | 2.3 MiB | 121 |
| 160 | 15.8 ms | 16.2 ms | 18.0 ms | 4.6 MiB | 63 |
| 320 | 31.1 ms | 31.4 ms | 31.7 ms | 9.3 MiB | 32 |
| 640 | 71.3 ms | 75.6 ms | 72.0 ms | 18.5 MiB | 14 |
| 1280 | 177 ms | 179 ms | 178 ms | 37.0 MiB | 6 |
| 2560 | 376 ms | 377 ms | 377 ms | 73.9 MiB | 3 |
| 5120 | 771 ms | 785 ms | 791 ms | 147.7 MiB | 1 |
| 10240 | 1.56 s | 1.57 s | 1.60 s | 295.3 MiB | 1 |

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
| 20 | 118 µs | 180 µs | 479 µs | 98.0 KiB | 8,510 |
| 40 | 158 µs | 211 µs | 448 µs | 179.0 KiB | 6,312 |
| 80 | 284 µs | 415 µs | 772 µs | 328.4 KiB | 3,520 |
| 160 | 502 µs | 568 µs | 1.24 ms | 637.9 KiB | 1,993 |
| 320 | 984 µs | 1.43 ms | 2.48 ms | 1.2 MiB | 1,017 |
| 640 | 1.78 ms | 1.93 ms | 3.32 ms | 2.5 MiB | 563 |
| 1280 | 3.38 ms | 3.49 ms | 4.95 ms | 4.9 MiB | 296 |
| 2560 | 6.68 ms | 6.87 ms | 8.65 ms | 9.9 MiB | 150 |
| 5120 | 13.9 ms | 14.3 ms | 16.9 ms | 19.8 MiB | 72 |
| 10240 | 29.3 ms | 29.8 ms | 34.0 ms | 39.6 MiB | 34 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.17, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 97.7 µs | 107 µs | 303 µs | 281.1 KiB | 10,239 |
| 40 | 184 µs | 203 µs | 543 µs | 540.1 KiB | 5,448 |
| 80 | 334 µs | 395 µs | 806 µs | 1.0 MiB | 2,995 |
| 160 | 665 µs | 750 µs | 1.42 ms | 2.1 MiB | 1,505 |
| 320 | 1.36 ms | 1.50 ms | 2.93 ms | 4.2 MiB | 734 |
| 640 | 2.59 ms | 2.75 ms | 4.26 ms | 8.3 MiB | 387 |
| 1280 | 5.13 ms | 5.37 ms | 7.25 ms | 16.7 MiB | 195 |
| 2560 | 10.3 ms | 13.4 ms | 12.8 ms | 33.3 MiB | 97 |
| 5120 | 27.3 ms | 29.0 ms | 31.5 ms | 52.0 MiB | 37 |
| 10240 | 65.7 ms | 67.2 ms | 77.0 ms | 103.7 MiB | 15 |

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
| 20 | 108 µs | 134 µs | 112 µs | 57.4 KiB | 9,235 |
| 40 | 195 µs | 227 µs | 198 µs | 113.5 KiB | 5,135 |
| 80 | 379 µs | 402 µs | 672 µs | 225.7 KiB | 2,637 |
| 160 | 611 µs | 658 µs | 2.06 ms | 450.0 KiB | 1,635 |
| 320 | 994 µs | 1.05 ms | 2.46 ms | 898.9 KiB | 1,006 |
| 640 | 1.80 ms | 1.97 ms | 3.30 ms | 1.8 MiB | 554 |
| 1280 | 3.40 ms | 3.58 ms | 4.41 ms | 3.5 MiB | 294 |
| 2560 | 6.46 ms | 6.81 ms | 6.79 ms | 6.9 MiB | 155 |
| 5120 | 13.3 ms | 13.6 ms | 13.3 ms | 13.8 MiB | 75 |
| 10240 | 27.5 ms | 27.8 ms | 28.1 ms | 27.7 MiB | 36 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 99.3 µs | 125 µs | 103 µs | 56.5 KiB | 10,073 |
| 40 | 189 µs | 214 µs | 193 µs | 111.8 KiB | 5,288 |
| 80 | 355 µs | 379 µs | 1.16 ms | 222.5 KiB | 2,815 |
| 160 | 576 µs | 619 µs | 1.91 ms | 443.7 KiB | 1,737 |
| 320 | 987 µs | 1.19 ms | 2.47 ms | 886.2 KiB | 1,013 |
| 640 | 1.81 ms | 1.85 ms | 3.60 ms | 1.7 MiB | 553 |
| 1280 | 3.39 ms | 3.49 ms | 5.41 ms | 3.5 MiB | 295 |
| 2560 | 6.48 ms | 6.52 ms | 7.77 ms | 6.9 MiB | 154 |
| 5120 | 13.5 ms | 13.9 ms | 16.7 ms | 13.8 MiB | 74 |
| 10240 | 27.7 ms | 30.3 ms | 33.7 ms | 27.7 MiB | 36 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 512 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 320 µs | 320 µs | 62% |
| `run-policies` | 1 | 151 µs | 151 µs | 29% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 42.0 µs | 8.2% |

**At 10240 checks** (whole operation: 66.6 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 37.4 ms | 37.4 ms | 56% |
| `run-policies` | 1 | 27.4 ms | 27.4 ms | 41% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 1.72 ms | 2.6% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-02T09:48:04.049Z` → `2026-11-02T09:49:41.646Z` (98 s), ci: CI (run 41421212088)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15984 MB RAM, linux/x64, Node v24.22.1, GitHub Actions
- Git: `fbe54786c595c09f8085f9f45cf13643ab70457c` on `dependabot/npm_and_yarn/dev-dependencies-ab16461808`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

