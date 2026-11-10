# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **288 µs** per operation compared with a bare-minimum baseline (**134% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.97). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 288 µs | 42.4 ms |
| Added latency, relative to baseline | 134% | 197% |
| Added CPU time per operation | 656 µs | 46.5 ms |
| Added memory per operation (heap delta) | 345.9 KiB | 44.6 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,473 ops/s | 24 ops/s |

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
| 20 | 60.1 µs | 181 µs | 121 µs | 201% | 467 µs | $0.00025 – $0.0053 |
| 40 | 109 µs | 283 µs | 174 µs | 159% | 466 µs | $0.00036 – $0.0052 |
| 80 | 215 µs | 503 µs | 288 µs | 134% | 656 µs | $0.0006 – $0.0074 |
| 160 | 429 µs | 1.00 ms | 574 µs | 134% | 1.34 ms | $0.0012 – $0.015 |
| 320 | 761 µs | 1.78 ms | 1.02 ms | 134% | 1.67 ms | $0.0021 – $0.019 |
| 640 | 1.53 ms | 3.54 ms | 2.01 ms | 131% | 2.35 ms | $0.0042 – $0.026 |
| 1280 | 2.85 ms | 13.6 ms | 10.7 ms | 375% | 11.3 ms | $0.022 – $0.127 |
| 2560 | 5.54 ms | 20.5 ms | 15.0 ms | 271% | 15.5 ms | $0.031 – $0.174 |
| 5120 | 10.9 ms | 34.9 ms | 24.0 ms | 221% | 25.9 ms | $0.050 – $0.291 |
| 10240 | 21.6 ms | 64.0 ms | 42.4 ms | 197% | 46.5 ms | $0.088 – $0.523 |

**How the total grows:** O(n) (linear), exponent 0.97 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 310 µs | 37.4 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 3.13 ms | 407 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 150 µs | 26.4 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 180 µs | 35.1 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 162 µs | 25.9 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 192 µs | 35.5 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n) | 🟡 close (neighbouring class) | 91.3 µs | 9.69 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 284 µs | 372 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 754 µs | 96.4 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 7.78 ms | 1.50 s |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 286 µs | 29.5 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 332 µs | 60.4 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 354 µs | 27.4 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 349 µs | 28.0 ms |

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
| 20 | 92.2 µs | 96.2 µs | 287 µs | 52.9 KiB | 10,847 |
| 40 | 171 µs | 188 µs | 516 µs | 104.6 KiB | 5,832 |
| 80 | 310 µs | 326 µs | 758 µs | 211.4 KiB | 3,227 |
| 160 | 602 µs | 622 µs | 1.35 ms | 436.2 KiB | 1,662 |
| 320 | 1.20 ms | 1.26 ms | 2.72 ms | 938.9 KiB | 835 |
| 640 | 2.20 ms | 2.29 ms | 3.66 ms | 2.1 MiB | 454 |
| 1280 | 7.50 ms | 7.90 ms | 8.99 ms | 4.7 MiB | 133 |
| 2560 | 11.3 ms | 13.1 ms | 13.6 ms | 8.0 MiB | 88 |
| 5120 | 19.4 ms | 21.2 ms | 21.6 ms | 14.5 MiB | 51 |
| 10240 | 37.4 ms | 38.1 ms | 40.7 ms | 27.6 MiB | 27 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.05, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 812 µs | 1.07 ms | 1.57 ms | 294.9 KiB | 1,231 |
| 40 | 1.72 ms | 2.25 ms | 3.30 ms | 587.0 KiB | 582 |
| 80 | 3.13 ms | 4.29 ms | 4.80 ms | 1.1 MiB | 320 |
| 160 | 5.87 ms | 6.96 ms | 7.82 ms | 2.3 MiB | 170 |
| 320 | 11.5 ms | 13.2 ms | 13.9 ms | 4.7 MiB | 87 |
| 640 | 22.3 ms | 22.8 ms | 25.6 ms | 9.8 MiB | 45 |
| 1280 | 47.1 ms | 49.6 ms | 52.7 ms | 20.1 MiB | 21 |
| 2560 | 91.3 ms | 98.9 ms | 101 ms | 38.7 MiB | 11 |
| 5120 | 206 ms | 208 ms | 302 ms | 73.4 MiB | 5 |
| 10240 | 407 ms | 408 ms | 604 ms | 145.2 MiB | 2 |

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
| 20 | 56.4 µs | 73.0 µs | 59.7 µs | 48.1 KiB | 17,732 |
| 40 | 96.1 µs | 113 µs | 291 µs | 92.6 KiB | 10,411 |
| 80 | 150 µs | 200 µs | 482 µs | 188.5 KiB | 6,646 |
| 160 | 288 µs | 404 µs | 853 µs | 393.8 KiB | 3,472 |
| 320 | 555 µs | 760 µs | 1.44 ms | 855.1 KiB | 1,803 |
| 640 | 1.24 ms | 1.59 ms | 3.00 ms | 1.9 MiB | 804 |
| 1280 | 5.28 ms | 5.61 ms | 7.62 ms | 4.4 MiB | 190 |
| 2560 | 7.45 ms | 7.72 ms | 10.5 ms | 7.3 MiB | 134 |
| 5120 | 13.3 ms | 14.7 ms | 17.2 ms | 13.2 MiB | 75 |
| 10240 | 26.4 ms | 27.0 ms | 34.0 ms | 24.3 MiB | 38 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 53.7 µs | 61.2 µs | 201 µs | 54.1 KiB | 18,616 |
| 40 | 92.1 µs | 119 µs | 293 µs | 107.0 KiB | 10,855 |
| 80 | 180 µs | 238 µs | 578 µs | 217.3 KiB | 5,555 |
| 160 | 358 µs | 482 µs | 1.07 ms | 451.7 KiB | 2,794 |
| 320 | 900 µs | 1.00 ms | 3.25 ms | 975.5 KiB | 1,111 |
| 640 | 1.77 ms | 2.12 ms | 5.07 ms | 2.2 MiB | 564 |
| 1280 | 6.64 ms | 7.02 ms | 12.5 ms | 4.9 MiB | 151 |
| 2560 | 9.51 ms | 10.0 ms | 19.3 ms | 8.3 MiB | 105 |
| 5120 | 18.4 ms | 20.3 ms | 36.5 ms | 15.0 MiB | 54 |
| 10240 | 35.1 ms | 35.5 ms | 68.5 ms | 28.0 MiB | 28 |

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
| 20 | 50.1 µs | 55.3 µs | 106 µs | 47.0 KiB | 19,967 |
| 40 | 94.3 µs | 104 µs | 277 µs | 92.6 KiB | 10,599 |
| 80 | 162 µs | 208 µs | 517 µs | 188.5 KiB | 6,176 |
| 160 | 293 µs | 413 µs | 855 µs | 393.9 KiB | 3,417 |
| 320 | 564 µs | 756 µs | 1.47 ms | 854.7 KiB | 1,772 |
| 640 | 1.19 ms | 1.59 ms | 2.93 ms | 1.9 MiB | 837 |
| 1280 | 5.02 ms | 5.42 ms | 7.47 ms | 4.4 MiB | 199 |
| 2560 | 7.38 ms | 7.76 ms | 10.4 ms | 7.3 MiB | 136 |
| 5120 | 12.7 ms | 13.5 ms | 16.9 ms | 13.2 MiB | 79 |
| 10240 | 25.9 ms | 26.6 ms | 33.5 ms | 24.6 MiB | 39 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.02, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 55.5 µs | 60.5 µs | 217 µs | 54.2 KiB | 18,020 |
| 40 | 92.6 µs | 101 µs | 292 µs | 107.0 KiB | 10,800 |
| 80 | 192 µs | 238 µs | 632 µs | 217.5 KiB | 5,200 |
| 160 | 352 µs | 480 µs | 1.08 ms | 451.7 KiB | 2,837 |
| 320 | 709 µs | 908 µs | 1.98 ms | 956.3 KiB | 1,410 |
| 640 | 1.69 ms | 1.96 ms | 5.15 ms | 2.2 MiB | 590 |
| 1280 | 6.75 ms | 6.97 ms | 12.4 ms | 4.9 MiB | 148 |
| 2560 | 10.2 ms | 10.9 ms | 19.9 ms | 8.3 MiB | 98 |
| 5120 | 18.3 ms | 18.6 ms | 36.5 ms | 15.0 MiB | 55 |
| 10240 | 35.5 ms | 36.3 ms | 68.5 ms | 28.2 MiB | 28 |

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
| 20 | 33.3 µs | 45.9 µs | 43.1 µs | 30.5 KiB | 30,045 |
| 40 | 42.3 µs | 53.6 µs | 135 µs | 55.2 KiB | 23,653 |
| 80 | 91.3 µs | 144 µs | 343 µs | 104.6 KiB | 10,958 |
| 160 | 151 µs | 278 µs | 460 µs | 208.3 KiB | 6,620 |
| 320 | 334 µs | 523 µs | 925 µs | 402.2 KiB | 2,997 |
| 640 | 526 µs | 653 µs | 1.40 ms | 821.1 KiB | 1,901 |
| 1280 | 1.20 ms | 1.29 ms | 3.19 ms | 1.3 MiB | 831 |
| 2560 | 2.28 ms | 2.36 ms | 4.79 ms | 2.7 MiB | 438 |
| 5120 | 4.70 ms | 4.76 ms | 8.52 ms | 5.5 MiB | 213 |
| 10240 | 9.69 ms | 9.89 ms | 16.1 ms | 10.8 MiB | 103 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent -0.03, 10 sizes) -- ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 273 µs | 287 µs | 842 µs | 620.2 KiB | 3,658 |
| 40 | 276 µs | 291 µs | 843 µs | 620.3 KiB | 3,622 |
| 80 | 284 µs | 303 µs | 868 µs | 626.2 KiB | 3,515 |
| 160 | 296 µs | 328 µs | 880 µs | 667.5 KiB | 3,377 |
| 320 | 322 µs | 358 µs | 893 µs | 716.3 KiB | 3,110 |
| 640 | 414 µs | 456 µs | 1.28 ms | 834.3 KiB | 2,415 |
| 1280 | 412 µs | 453 µs | 1.27 ms | 834.3 KiB | 2,430 |
| 2560 | 413 µs | 434 µs | 1.28 ms | 834.3 KiB | 2,421 |
| 5120 | 415 µs | 439 µs | 1.28 ms | 834.3 KiB | 2,411 |
| 10240 | 372 µs | 411 µs | 946 µs | 829.2 KiB | 2,685 |

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
| 20 | 205 µs | 220 µs | 575 µs | 45.6 KiB | 4,888 |
| 40 | 361 µs | 374 µs | 872 µs | 115.7 KiB | 2,769 |
| 80 | 754 µs | 784 µs | 1.54 ms | 178.6 KiB | 1,326 |
| 160 | 1.47 ms | 1.51 ms | 3.03 ms | 357.3 KiB | 681 |
| 320 | 2.68 ms | 2.86 ms | 4.58 ms | 712.3 KiB | 373 |
| 640 | 5.14 ms | 5.28 ms | 7.11 ms | 1.4 MiB | 194 |
| 1280 | 10.2 ms | 10.5 ms | 12.4 ms | 2.8 MiB | 98 |
| 2560 | 20.4 ms | 20.7 ms | 23.2 ms | 5.7 MiB | 49 |
| 5120 | 41.4 ms | 41.7 ms | 42.2 ms | 11.3 MiB | 24 |
| 10240 | 96.4 ms | 97.6 ms | 96.8 ms | 22.7 MiB | 10 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.11, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.23 ms | 2.36 ms | 4.08 ms | 599.8 KiB | 447 |
| 40 | 4.04 ms | 4.40 ms | 5.96 ms | 1.2 MiB | 247 |
| 80 | 7.78 ms | 7.89 ms | 9.92 ms | 2.3 MiB | 129 |
| 160 | 15.0 ms | 15.3 ms | 17.3 ms | 4.6 MiB | 66 |
| 320 | 29.5 ms | 29.7 ms | 29.9 ms | 9.3 MiB | 34 |
| 640 | 67.4 ms | 67.5 ms | 67.8 ms | 18.5 MiB | 15 |
| 1280 | 168 ms | 172 ms | 169 ms | 37.0 MiB | 6 |
| 2560 | 357 ms | 363 ms | 357 ms | 73.9 MiB | 3 |
| 5120 | 731 ms | 736 ms | 749 ms | 147.7 MiB | 1 |
| 10240 | 1.50 s | 1.52 s | 1.54 s | 295.3 MiB | 1 |

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
| 20 | 120 µs | 166 µs | 480 µs | 98.0 KiB | 8,364 |
| 40 | 160 µs | 221 µs | 452 µs | 179.0 KiB | 6,235 |
| 80 | 286 µs | 408 µs | 776 µs | 328.4 KiB | 3,491 |
| 160 | 512 µs | 591 µs | 1.25 ms | 637.9 KiB | 1,955 |
| 320 | 1.03 ms | 1.21 ms | 2.54 ms | 1.2 MiB | 970 |
| 640 | 1.85 ms | 1.93 ms | 3.44 ms | 2.5 MiB | 540 |
| 1280 | 3.55 ms | 3.77 ms | 5.17 ms | 4.9 MiB | 282 |
| 2560 | 7.06 ms | 7.28 ms | 9.23 ms | 9.9 MiB | 142 |
| 5120 | 14.3 ms | 14.7 ms | 16.9 ms | 19.8 MiB | 70 |
| 10240 | 29.5 ms | 30.7 ms | 34.2 ms | 39.6 MiB | 34 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.16, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 98.6 µs | 107 µs | 307 µs | 281.1 KiB | 10,141 |
| 40 | 186 µs | 203 µs | 550 µs | 540.1 KiB | 5,379 |
| 80 | 332 µs | 345 µs | 805 µs | 1.0 MiB | 3,012 |
| 160 | 642 µs | 708 µs | 1.39 ms | 2.1 MiB | 1,557 |
| 320 | 1.30 ms | 1.38 ms | 2.78 ms | 4.2 MiB | 771 |
| 640 | 2.46 ms | 2.59 ms | 4.05 ms | 8.3 MiB | 406 |
| 1280 | 4.84 ms | 5.04 ms | 6.68 ms | 16.7 MiB | 207 |
| 2560 | 9.76 ms | 9.90 ms | 12.2 ms | 33.3 MiB | 102 |
| 5120 | 25.5 ms | 26.2 ms | 29.4 ms | 52.0 MiB | 39 |
| 10240 | 60.4 ms | 62.1 ms | 69.9 ms | 103.7 MiB | 17 |

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

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 106 µs | 132 µs | 110 µs | 57.4 KiB | 9,399 |
| 40 | 188 µs | 209 µs | 192 µs | 113.5 KiB | 5,319 |
| 80 | 354 µs | 379 µs | 357 µs | 225.7 KiB | 2,827 |
| 160 | 584 µs | 728 µs | 2.03 ms | 450.0 KiB | 1,713 |
| 320 | 973 µs | 1.20 ms | 2.41 ms | 898.9 KiB | 1,028 |
| 640 | 1.74 ms | 1.77 ms | 3.15 ms | 1.8 MiB | 574 |
| 1280 | 3.33 ms | 3.42 ms | 4.77 ms | 3.5 MiB | 300 |
| 2560 | 6.62 ms | 6.75 ms | 7.43 ms | 6.9 MiB | 151 |
| 5120 | 13.1 ms | 13.3 ms | 13.2 ms | 13.8 MiB | 76 |
| 10240 | 27.4 ms | 28.2 ms | 28.0 ms | 27.7 MiB | 36 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 97.5 µs | 115 µs | 101 µs | 56.5 KiB | 10,260 |
| 40 | 181 µs | 211 µs | 184 µs | 111.8 KiB | 5,519 |
| 80 | 349 µs | 373 µs | 615 µs | 222.5 KiB | 2,866 |
| 160 | 566 µs | 591 µs | 1.90 ms | 443.7 KiB | 1,767 |
| 320 | 985 µs | 1.01 ms | 2.38 ms | 886.2 KiB | 1,015 |
| 640 | 1.75 ms | 1.77 ms | 3.20 ms | 1.7 MiB | 571 |
| 1280 | 3.33 ms | 3.41 ms | 5.19 ms | 3.5 MiB | 300 |
| 2560 | 6.53 ms | 6.70 ms | 7.88 ms | 6.9 MiB | 153 |
| 5120 | 13.1 ms | 14.0 ms | 16.0 ms | 13.8 MiB | 76 |
| 10240 | 28.0 ms | 29.3 ms | 33.2 ms | 27.7 MiB | 36 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 503 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 310 µs | 310 µs | 62% |
| `run-policies` | 1 | 150 µs | 150 µs | 30% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 42.2 µs | 8.4% |

**At 10240 checks** (whole operation: 64.0 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 37.4 ms | 37.4 ms | 58% |
| `run-policies` | 1 | 26.4 ms | 26.4 ms | 41% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 187 µs | 0.3% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-10T00:05:56.751Z` → `2026-11-10T00:07:31.868Z` (95 s), ci: CI (run 42723432906)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `339a167f0909bfc64f008de8be4c80cd36db513c` on `chore/bump-internal-package-contract-v0.16.0`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

