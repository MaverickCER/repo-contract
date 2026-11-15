# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend, and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **232 µs** per operation compared with a bare-minimum baseline (**151% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.85). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones. Both come from the same run, so they depend far less on the machine than a time does. Runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below). They show scale, not a budget.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 232 µs | 26.6 ms |
| Added latency, relative to baseline | 151% | 220% |
| Added CPU time per operation | 1.23 ms | 32.4 ms |
| Added memory per operation (heap delta) | 354.1 KiB | 44.8 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 4,302 ops/s | 38 ops/s |

## 1. End-to-end: the package's total impact

Shows what a contract run pays, after the checks have finished, for turning their raw results into structured evidence and a verdict, compared with the bare minimum of parsing each check's output and counting its findings. Neither side runs a process; this is pure CPU on data already in memory, paid once per contract run.

- **Baseline (no package):** Parse each check's JSON output and count its findings by hand -- the least anyone would do to know what the checks said.
- **With the package:** `buildEvidence` assembles the run's evidence record and `runPolicies` evaluates every check's policy against it, with dependency lookups.

Both sides use empty or minimal functions on purpose. The difference is then the package's own cost, not the cost of the work an application would plug into it. Real applications add their own work on top; this is the floor the package imposes.

**Variables that could change this result**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| checks evaluated | swept | The tier axis: how many check results are turned into evidence and judged. |
| output per check | fixed at "about 500 bytes" | Output volume is measured as a variant in each function below. |
| policy work | fixed at "reads its own parsed output and its dependencies' evidence" | A real, non-trivial policy; an application's own policy logic adds its own cost on top. |
| dependency lookups | fixed at "about 15% of checks depend on an earlier check" | Exercises the per-check dependency-evidence gathering loop. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

The baseline is an empty or minimal function, so it costs almost nothing. The _relative_ overhead can then look enormous (shown as a multiple of the baseline). Read the absolute columns (time, CPU and dollars added): they are what a bill and a latency budget are made of.

| checks | Baseline | With package | Added | Added vs baseline | Added CPU | Est. $ / 1M ops |
| --- | --- | --- | --- | --- | --- | --- |
| 20 | 48.9 µs | 145 µs | 96.0 µs | 197% | 98.0 µs | $0.0002 – $0.0011 |
| 40 | 81.4 µs | 225 µs | 144 µs | 178% | 160 µs | $0.0003 – $0.0018 |
| 80 | 154 µs | 384 µs | 232 µs | 151% | 1.23 ms | $0.00048 – $0.014 |
| 160 | 300 µs | 619 µs | 344 µs | 114% | 726 µs | $0.00072 – $0.0082 |
| 320 | 491 µs | 1.37 ms | 839 µs | 171% | 885 µs | $0.0017 – $0.01 |
| 640 | 864 µs | 3.32 ms | 2.46 ms | 285% | 2.34 ms | $0.0051 – $0.026 |
| 1280 | 1.61 ms | 7.64 ms | 6.03 ms | 374% | 6.52 ms | $0.013 – $0.073 |
| 2560 | 3.09 ms | 11.7 ms | 8.66 ms | 281% | 9.15 ms | $0.018 – $0.103 |
| 5120 | 6.20 ms | 20.2 ms | 14.0 ms | 226% | 14.7 ms | $0.029 – $0.166 |
| 10240 | 12.1 ms | 39.1 ms | 26.6 ms | 220% | 32.4 ms | $0.055 – $0.365 |

**How the total grows:** O(n) (linear), exponent 0.85 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder. Its measured growth rate is then compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report. Either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 154 µs | 20.7 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 1.68 ms | 242 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 64.6 µs | 15.2 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 85.5 µs | 23.7 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 61.5 µs | 15.5 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 81.9 µs | 23.5 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n log n) | ✅ matches | 34.1 µs | 5.98 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 141 µs | 190 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 379 µs | 53.1 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n) | ✅ matches | 3.94 ms | 817 ms |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 125 µs | 15.8 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 161 µs | 40.2 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 176 µs | 15.7 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 173 µs | 15.3 ms |

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

**Measured: O(n)** (exponent 0.97, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 43.0 µs | 47.6 µs | 115 µs | 52.7 KiB | 23,276 |
| 40 | 80.4 µs | 83.0 µs | 201 µs | 104.3 KiB | 12,444 |
| 80 | 154 µs | 168 µs | 339 µs | 211.0 KiB | 6,493 |
| 160 | 301 µs | 327 µs | 650 µs | 436.0 KiB | 3,323 |
| 320 | 571 µs | 641 µs | 1.07 ms | 938.5 KiB | 1,750 |
| 640 | 1.16 ms | 1.22 ms | 2.17 ms | 2.1 MiB | 865 |
| 1280 | 4.16 ms | 4.37 ms | 5.28 ms | 4.7 MiB | 240 |
| 2560 | 6.26 ms | 6.59 ms | 7.50 ms | 8.0 MiB | 160 |
| 5120 | 11.2 ms | 11.7 ms | 12.6 ms | 14.5 MiB | 90 |
| 10240 | 20.7 ms | 21.1 ms | 23.5 ms | 27.6 MiB | 48 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.08, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 453 µs | 458 µs | 967 µs | 294.9 KiB | 2,207 |
| 40 | 835 µs | 853 µs | 1.36 ms | 585.9 KiB | 1,198 |
| 80 | 1.68 ms | 2.15 ms | 2.83 ms | 1.1 MiB | 594 |
| 160 | 3.26 ms | 3.44 ms | 4.60 ms | 2.3 MiB | 307 |
| 320 | 6.24 ms | 6.33 ms | 7.82 ms | 4.7 MiB | 160 |
| 640 | 12.4 ms | 12.7 ms | 14.7 ms | 9.8 MiB | 80 |
| 1280 | 26.6 ms | 27.7 ms | 30.6 ms | 20.1 MiB | 38 |
| 2560 | 52.6 ms | 57.5 ms | 60.6 ms | 38.7 MiB | 19 |
| 5120 | 123 ms | 126 ms | 187 ms | 73.5 MiB | 8 |
| 10240 | 242 ms | 244 ms | 375 ms | 145.2 MiB | 4 |

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

**Measured: O(n)** (exponent 1.10, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 27.5 µs | 30.3 µs | 28.0 µs | 48.1 KiB | 36,375 |
| 40 | 39.7 µs | 48.3 µs | 107 µs | 92.4 KiB | 25,204 |
| 80 | 64.6 µs | 90.9 µs | 182 µs | 188.2 KiB | 15,491 |
| 160 | 134 µs | 190 µs | 372 µs | 392.6 KiB | 7,481 |
| 320 | 263 µs | 371 µs | 675 µs | 853.1 KiB | 3,796 |
| 640 | 527 µs | 728 µs | 1.12 ms | 1.9 MiB | 1,896 |
| 1280 | 2.95 ms | 3.22 ms | 4.44 ms | 4.4 MiB | 339 |
| 2560 | 4.24 ms | 4.54 ms | 6.31 ms | 7.3 MiB | 236 |
| 5120 | 7.21 ms | 7.48 ms | 10.4 ms | 13.2 MiB | 139 |
| 10240 | 15.2 ms | 17.4 ms | 20.6 ms | 24.8 MiB | 66 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.11, 10 sizes): 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 26.2 µs | 28.0 µs | 102 µs | 54.0 KiB | 38,138 |
| 40 | 46.6 µs | 58.0 µs | 151 µs | 106.9 KiB | 21,465 |
| 80 | 85.5 µs | 114 µs | 260 µs | 217.0 KiB | 11,702 |
| 160 | 190 µs | 248 µs | 583 µs | 451.1 KiB | 5,250 |
| 320 | 367 µs | 459 µs | 1.15 ms | 970.6 KiB | 2,726 |
| 640 | 889 µs | 1.01 ms | 3.03 ms | 2.2 MiB | 1,124 |
| 1280 | 4.15 ms | 4.67 ms | 8.50 ms | 4.9 MiB | 241 |
| 2560 | 6.71 ms | 7.42 ms | 13.5 ms | 8.3 MiB | 149 |
| 5120 | 13.0 ms | 17.0 ms | 25.3 ms | 15.1 MiB | 77 |
| 10240 | 23.7 ms | 24.2 ms | 45.6 ms | 28.3 MiB | 42 |

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

**Measured: O(n log n)** (exponent 1.11, 10 sizes): 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 22.5 µs | 24.0 µs | 46.3 µs | 46.9 KiB | 44,533 |
| 40 | 33.3 µs | 44.6 µs | 92.5 µs | 92.5 KiB | 30,056 |
| 80 | 61.5 µs | 87.8 µs | 173 µs | 187.3 KiB | 16,248 |
| 160 | 120 µs | 178 µs | 283 µs | 388.6 KiB | 8,324 |
| 320 | 249 µs | 374 µs | 616 µs | 853.8 KiB | 4,013 |
| 640 | 519 µs | 713 µs | 1.20 ms | 1.9 MiB | 1,928 |
| 1280 | 2.86 ms | 3.09 ms | 4.41 ms | 4.4 MiB | 349 |
| 2560 | 4.10 ms | 4.38 ms | 6.15 ms | 7.3 MiB | 244 |
| 5120 | 7.16 ms | 8.04 ms | 10.4 ms | 13.2 MiB | 140 |
| 10240 | 15.5 ms | 15.9 ms | 21.5 ms | 24.7 MiB | 65 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.12, 10 sizes): 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 25.9 µs | 27.6 µs | 70.8 µs | 54.1 KiB | 38,629 |
| 40 | 46.3 µs | 55.2 µs | 133 µs | 106.9 KiB | 21,589 |
| 80 | 81.9 µs | 112 µs | 228 µs | 216.6 KiB | 12,217 |
| 160 | 182 µs | 228 µs | 529 µs | 451.1 KiB | 5,506 |
| 320 | 333 µs | 439 µs | 911 µs | 955.9 KiB | 3,007 |
| 640 | 854 µs | 997 µs | 2.97 ms | 2.1 MiB | 1,171 |
| 1280 | 3.94 ms | 4.55 ms | 8.01 ms | 4.8 MiB | 254 |
| 2560 | 6.49 ms | 7.00 ms | 13.4 ms | 8.2 MiB | 154 |
| 5120 | 12.5 ms | 13.2 ms | 25.7 ms | 14.9 MiB | 80 |
| 10240 | 23.5 ms | 23.6 ms | 45.5 ms | 28.3 MiB | 43 |

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

**Measured: O(n log n)** (exponent 1.34, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 15.3 µs | 22.0 µs | 15.7 µs | 30.4 KiB | 65,554 |
| 40 | 18.8 µs | 24.4 µs | 54.8 µs | 55.0 KiB | 53,051 |
| 80 | 34.1 µs | 46.5 µs | 97.1 µs | 104.4 KiB | 29,302 |
| 160 | 64.9 µs | 94.8 µs | 183 µs | 204.6 KiB | 15,418 |
| 320 | 65.3 µs | 75.1 µs | 180 µs | 297.8 KiB | 15,310 |
| 640 | 126 µs | 161 µs | 329 µs | 609.4 KiB | 7,933 |
| 1280 | 577 µs | 603 µs | 1.24 ms | 1.3 MiB | 1,732 |
| 2560 | 1.29 ms | 1.35 ms | 2.94 ms | 2.7 MiB | 778 |
| 5120 | 2.73 ms | 3.18 ms | 5.11 ms | 5.5 MiB | 366 |
| 10240 | 5.98 ms | 6.10 ms | 10.3 ms | 10.8 MiB | 167 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent 0.01, 10 sizes): ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 135 µs | 143 µs | 380 µs | 613.5 KiB | 7,382 |
| 40 | 130 µs | 139 µs | 335 µs | 625.0 KiB | 7,672 |
| 80 | 141 µs | 159 µs | 386 µs | 628.1 KiB | 7,103 |
| 160 | 144 µs | 157 µs | 387 µs | 661.0 KiB | 6,928 |
| 320 | 171 µs | 269 µs | 430 µs | 731.5 KiB | 5,857 |
| 640 | 188 µs | 199 µs | 492 µs | 825.5 KiB | 5,325 |
| 1280 | 186 µs | 205 µs | 481 µs | 825.5 KiB | 5,364 |
| 2560 | 189 µs | 196 µs | 496 µs | 825.5 KiB | 5,298 |
| 5120 | 192 µs | 212 µs | 496 µs | 825.5 KiB | 5,214 |
| 10240 | 190 µs | 203 µs | 492 µs | 825.5 KiB | 5,273 |

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

**Measured: O(n)** (exponent 0.95, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 98.7 µs | 103 µs | 278 µs | 50.5 KiB | 10,129 |
| 40 | 179 µs | 188 µs | 450 µs | 109.0 KiB | 5,596 |
| 80 | 379 µs | 388 µs | 752 µs | 178.1 KiB | 2,641 |
| 160 | 1.07 ms | 1.09 ms | 2.16 ms | 357.3 KiB | 936 |
| 320 | 2.02 ms | 2.12 ms | 3.34 ms | 712.3 KiB | 496 |
| 640 | 3.90 ms | 4.02 ms | 5.31 ms | 1.4 MiB | 257 |
| 1280 | 7.97 ms | 8.26 ms | 9.63 ms | 2.8 MiB | 125 |
| 2560 | 15.8 ms | 16.8 ms | 16.6 ms | 5.7 MiB | 63 |
| 5120 | 31.7 ms | 31.9 ms | 32.1 ms | 11.3 MiB | 32 |
| 10240 | 53.1 ms | 54.0 ms | 53.5 ms | 22.7 MiB | 19 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.03, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.19 ms | 1.31 ms | 2.48 ms | 599.8 KiB | 838 |
| 40 | 2.12 ms | 2.23 ms | 3.44 ms | 1.2 MiB | 472 |
| 80 | 3.94 ms | 4.13 ms | 5.35 ms | 2.3 MiB | 254 |
| 160 | 7.53 ms | 7.70 ms | 8.97 ms | 4.6 MiB | 133 |
| 320 | 23.3 ms | 23.8 ms | 23.8 ms | 9.3 MiB | 43 |
| 640 | 46.9 ms | 55.4 ms | 47.3 ms | 18.5 MiB | 21 |
| 1280 | 97.3 ms | 107 ms | 97.8 ms | 37.0 MiB | 10 |
| 2560 | 202 ms | 210 ms | 203 ms | 73.9 MiB | 5 |
| 5120 | 412 ms | 424 ms | 423 ms | 147.7 MiB | 2 |
| 10240 | 817 ms | 862 ms | 839 ms | 295.3 MiB | 1 |

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

**Measured: O(n)** (exponent 1.02, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 48.2 µs | 62.8 µs | 167 µs | 98.0 KiB | 20,740 |
| 40 | 71.9 µs | 94.7 µs | 178 µs | 178.8 KiB | 13,902 |
| 80 | 125 µs | 136 µs | 283 µs | 322.1 KiB | 8,024 |
| 160 | 246 µs | 267 µs | 567 µs | 637.6 KiB | 4,057 |
| 320 | 478 µs | 504 µs | 973 µs | 1.2 MiB | 2,094 |
| 640 | 943 µs | 1.00 ms | 1.79 ms | 2.5 MiB | 1,061 |
| 1280 | 1.79 ms | 1.89 ms | 2.65 ms | 4.9 MiB | 559 |
| 2560 | 3.59 ms | 3.81 ms | 4.84 ms | 9.9 MiB | 278 |
| 5120 | 7.51 ms | 7.62 ms | 9.04 ms | 19.8 MiB | 133 |
| 10240 | 15.8 ms | 16.8 ms | 18.5 ms | 39.6 MiB | 63 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.20, 10 sizes): 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 42.3 µs | 50.1 µs | 123 µs | 280.3 KiB | 23,615 |
| 40 | 81.6 µs | 87.1 µs | 204 µs | 538.7 KiB | 12,248 |
| 80 | 161 µs | 170 µs | 362 µs | 1.0 MiB | 6,202 |
| 160 | 323 µs | 347 µs | 651 µs | 2.1 MiB | 3,094 |
| 320 | 669 µs | 726 µs | 1.17 ms | 4.2 MiB | 1,494 |
| 640 | 1.45 ms | 1.54 ms | 2.51 ms | 8.3 MiB | 689 |
| 1280 | 2.99 ms | 3.10 ms | 4.20 ms | 16.7 MiB | 335 |
| 2560 | 6.12 ms | 6.31 ms | 7.74 ms | 33.3 MiB | 163 |
| 5120 | 16.4 ms | 17.3 ms | 19.2 ms | 52.0 MiB | 61 |
| 10240 | 40.2 ms | 46.5 ms | 47.1 ms | 103.7 MiB | 25 |

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

**Measured: O(n)** (exponent 1.01, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 54.0 µs | 65.8 µs | 57.0 µs | 57.3 KiB | 18,515 |
| 40 | 93.8 µs | 106 µs | 96.0 µs | 113.3 KiB | 10,661 |
| 80 | 176 µs | 189 µs | 179 µs | 225.5 KiB | 5,680 |
| 160 | 322 µs | 337 µs | 1.27 ms | 450.0 KiB | 3,107 |
| 320 | 517 µs | 691 µs | 1.33 ms | 898.7 KiB | 1,935 |
| 640 | 954 µs | 982 µs | 1.92 ms | 1.8 MiB | 1,048 |
| 1280 | 1.78 ms | 1.88 ms | 2.58 ms | 3.5 MiB | 563 |
| 2560 | 3.53 ms | 3.68 ms | 3.88 ms | 6.9 MiB | 283 |
| 5120 | 7.31 ms | 7.92 ms | 7.50 ms | 13.8 MiB | 137 |
| 10240 | 15.7 ms | 16.4 ms | 16.1 ms | 27.7 MiB | 64 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.00, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 50.6 µs | 59.4 µs | 53.0 µs | 56.4 KiB | 19,780 |
| 40 | 90.3 µs | 102 µs | 93.0 µs | 111.7 KiB | 11,079 |
| 80 | 173 µs | 189 µs | 176 µs | 222.3 KiB | 5,778 |
| 160 | 306 µs | 329 µs | 1.18 ms | 443.6 KiB | 3,264 |
| 320 | 536 µs | 591 µs | 1.40 ms | 886.1 KiB | 1,867 |
| 640 | 969 µs | 992 µs | 1.90 ms | 1.7 MiB | 1,032 |
| 1280 | 1.87 ms | 1.90 ms | 3.20 ms | 3.5 MiB | 536 |
| 2560 | 3.54 ms | 3.77 ms | 4.52 ms | 6.9 MiB | 282 |
| 5120 | 7.48 ms | 7.67 ms | 9.64 ms | 13.8 MiB | 134 |
| 10240 | 15.3 ms | 15.4 ms | 19.1 ms | 27.7 MiB | 65 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls. So where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time). Every moment of the operation then belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly. They are not measured against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 384 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 154 µs | 154 µs | 40% |
| `run-policies` | 1 | 64.6 µs | 64.6 µs | 17% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 166 µs | 43% |

**At 10240 checks** (whole operation: 39.1 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 20.7 ms | 20.7 ms | 53% |
| `run-policies` | 1 | 15.2 ms | 15.2 ms | 39% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 3.30 ms | 8.4% |

## Cost model

Estimates use two bracketing price shapes. **Low** is CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time). **High** is duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-15T07:01:19.954Z` → `2026-11-15T07:02:22.119Z` (62 s), ci: CI (run 43687150892)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `c968b12ca3ffc07428d76f750f67c60cc7212521` on `chore/bump-internal-package-contract-v0.19.0`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks: One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They show how _this_ package's cost changes between runs on comparable hardware, and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

