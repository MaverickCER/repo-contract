# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend, and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **225 µs** per operation compared with a bare-minimum baseline (**156% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.86). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones. Both come from the same run, so they depend far less on the machine than a time does. Runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below). They show scale, not a budget.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 225 µs | 26.3 ms |
| Added latency, relative to baseline | 156% | 232% |
| Added CPU time per operation | 1.19 ms | 32.8 ms |
| Added memory per operation (heap delta) | 354.1 KiB | 45.1 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 4,437 ops/s | 38 ops/s |

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
| 20 | 45.2 µs | 136 µs | 93.6 µs | 207% | 92.0 µs | $0.00019 – $0.001 |
| 40 | 76.9 µs | 229 µs | 143 µs | 186% | 153 µs | $0.0003 – $0.0017 |
| 80 | 145 µs | 369 µs | 225 µs | 156% | 1.19 ms | $0.00047 – $0.013 |
| 160 | 280 µs | 634 µs | 345 µs | 123% | 1.05 ms | $0.00072 – $0.012 |
| 320 | 461 µs | 1.30 ms | 798 µs | 173% | 774 µs | $0.0017 – $0.0087 |
| 640 | 807 µs | 3.14 ms | 2.33 ms | 289% | 2.54 ms | $0.0049 – $0.029 |
| 1280 | 1.49 ms | 7.26 ms | 5.76 ms | 387% | 6.16 ms | $0.012 – $0.069 |
| 2560 | 2.92 ms | 10.7 ms | 7.76 ms | 266% | 8.38 ms | $0.016 – $0.094 |
| 5120 | 5.74 ms | 19.3 ms | 13.6 ms | 237% | 17.6 ms | $0.028 – $0.198 |
| 10240 | 11.4 ms | 37.9 ms | 26.3 ms | 232% | 32.8 ms | $0.055 – $0.369 |

**How the total grows:** O(n) (linear), exponent 0.86 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder. Its measured growth rate is then compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report. Either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 147 µs | 19.4 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 1.60 ms | 235 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 56.2 µs | 14.5 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 77.3 µs | 23.7 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 62.4 µs | 14.7 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 72.8 µs | 23.4 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n log n) | ✅ matches | 33.9 µs | 5.67 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 124 µs | 175 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 353 µs | 51.3 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 3.70 ms | 799 ms |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 123 µs | 15.6 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 155 µs | 39.7 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 172 µs | 15.5 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 169 µs | 14.7 ms |

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

**Measured: O(n)** (exponent 0.95, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 40.9 µs | 42.7 µs | 109 µs | 52.7 KiB | 24,436 |
| 40 | 75.4 µs | 79.1 µs | 183 µs | 104.3 KiB | 13,265 |
| 80 | 147 µs | 158 µs | 341 µs | 211.1 KiB | 6,794 |
| 160 | 284 µs | 295 µs | 610 µs | 436.0 KiB | 3,517 |
| 320 | 545 µs | 585 µs | 1.03 ms | 938.5 KiB | 1,834 |
| 640 | 1.10 ms | 1.15 ms | 2.10 ms | 2.1 MiB | 912 |
| 1280 | 4.62 ms | 5.10 ms | 5.30 ms | 4.7 MiB | 216 |
| 2560 | 5.96 ms | 7.14 ms | 7.26 ms | 8.0 MiB | 168 |
| 5120 | 10.5 ms | 11.7 ms | 12.3 ms | 14.5 MiB | 95 |
| 10240 | 19.4 ms | 20.0 ms | 22.4 ms | 27.6 MiB | 52 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.08, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 440 µs | 450 µs | 935 µs | 294.9 KiB | 2,275 |
| 40 | 797 µs | 803 µs | 1.29 ms | 585.9 KiB | 1,255 |
| 80 | 1.60 ms | 2.01 ms | 2.69 ms | 1.1 MiB | 625 |
| 160 | 3.06 ms | 3.09 ms | 4.29 ms | 2.3 MiB | 327 |
| 320 | 5.97 ms | 6.29 ms | 7.47 ms | 4.7 MiB | 167 |
| 640 | 11.8 ms | 12.0 ms | 14.0 ms | 9.8 MiB | 84 |
| 1280 | 25.7 ms | 28.3 ms | 29.6 ms | 20.1 MiB | 39 |
| 2560 | 49.9 ms | 55.0 ms | 57.1 ms | 38.7 MiB | 20 |
| 5120 | 117 ms | 118 ms | 178 ms | 73.5 MiB | 9 |
| 10240 | 235 ms | 235 ms | 361 ms | 145.3 MiB | 4 |

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

**Measured: O(n log n)** (exponent 1.10, 10 sizes): 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 26.3 µs | 30.0 µs | 26.7 µs | 48.1 KiB | 38,046 |
| 40 | 32.4 µs | 48.5 µs | 94.0 µs | 92.4 KiB | 30,881 |
| 80 | 56.2 µs | 75.7 µs | 152 µs | 186.8 KiB | 17,801 |
| 160 | 119 µs | 177 µs | 277 µs | 389.7 KiB | 8,419 |
| 320 | 245 µs | 360 µs | 610 µs | 853.1 KiB | 4,090 |
| 640 | 498 µs | 666 µs | 1.05 ms | 1.9 MiB | 2,009 |
| 1280 | 2.77 ms | 2.98 ms | 4.40 ms | 4.4 MiB | 361 |
| 2560 | 3.96 ms | 4.14 ms | 6.00 ms | 7.3 MiB | 253 |
| 5120 | 6.74 ms | 7.06 ms | 9.82 ms | 13.2 MiB | 148 |
| 10240 | 14.5 ms | 15.2 ms | 19.8 ms | 24.8 MiB | 69 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.12, 10 sizes): 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 23.4 µs | 26.9 µs | 87.6 µs | 54.0 KiB | 42,694 |
| 40 | 36.5 µs | 52.6 µs | 93.0 µs | 106.8 KiB | 27,406 |
| 80 | 77.3 µs | 107 µs | 213 µs | 217.0 KiB | 12,939 |
| 160 | 159 µs | 223 µs | 436 µs | 450.7 KiB | 6,291 |
| 320 | 325 µs | 448 µs | 841 µs | 955.8 KiB | 3,077 |
| 640 | 880 µs | 981 µs | 2.96 ms | 2.2 MiB | 1,137 |
| 1280 | 3.78 ms | 4.36 ms | 8.09 ms | 4.9 MiB | 265 |
| 2560 | 6.30 ms | 6.54 ms | 12.9 ms | 8.3 MiB | 159 |
| 5120 | 12.4 ms | 22.2 ms | 24.7 ms | 15.0 MiB | 80 |
| 10240 | 23.7 ms | 24.2 ms | 45.6 ms | 28.4 MiB | 42 |

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

**Measured: O(n)** (exponent 1.09, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 21.8 µs | 24.0 µs | 75.6 µs | 46.9 KiB | 45,804 |
| 40 | 33.3 µs | 45.0 µs | 95.4 µs | 92.5 KiB | 30,018 |
| 80 | 62.4 µs | 89.4 µs | 172 µs | 187.1 KiB | 16,036 |
| 160 | 123 µs | 179 µs | 313 µs | 389.8 KiB | 8,134 |
| 320 | 255 µs | 371 µs | 625 µs | 848.1 KiB | 3,928 |
| 640 | 516 µs | 687 µs | 1.18 ms | 1.9 MiB | 1,939 |
| 1280 | 2.81 ms | 3.05 ms | 4.56 ms | 4.4 MiB | 355 |
| 2560 | 3.91 ms | 4.10 ms | 6.03 ms | 7.3 MiB | 256 |
| 5120 | 6.83 ms | 7.17 ms | 9.86 ms | 13.2 MiB | 146 |
| 10240 | 14.7 ms | 15.7 ms | 20.6 ms | 25.0 MiB | 68 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.19, 10 sizes): 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 25.7 µs | 27.6 µs | 101 µs | 54.1 KiB | 38,977 |
| 40 | 39.0 µs | 54.2 µs | 113 µs | 105.2 KiB | 25,628 |
| 80 | 72.8 µs | 89.0 µs | 197 µs | 213.8 KiB | 13,739 |
| 160 | 152 µs | 159 µs | 401 µs | 444.3 KiB | 6,595 |
| 320 | 307 µs | 320 µs | 802 µs | 955.7 KiB | 3,256 |
| 640 | 672 µs | 712 µs | 1.74 ms | 2.1 MiB | 1,487 |
| 1280 | 3.71 ms | 3.98 ms | 7.35 ms | 4.8 MiB | 269 |
| 2560 | 6.08 ms | 6.24 ms | 12.4 ms | 8.2 MiB | 165 |
| 5120 | 11.7 ms | 12.3 ms | 23.8 ms | 14.9 MiB | 86 |
| 10240 | 23.4 ms | 23.6 ms | 44.4 ms | 28.3 MiB | 43 |

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
| 20 | 14.5 µs | 21.1 µs | 14.9 µs | 30.4 KiB | 69,109 |
| 40 | 17.9 µs | 26.2 µs | 50.6 µs | 55.0 KiB | 56,013 |
| 80 | 33.9 µs | 46.5 µs | 104 µs | 104.4 KiB | 29,459 |
| 160 | 59.9 µs | 87.9 µs | 166 µs | 204.6 KiB | 16,701 |
| 320 | 58.5 µs | 68.8 µs | 148 µs | 297.8 KiB | 17,080 |
| 640 | 119 µs | 126 µs | 311 µs | 609.4 KiB | 8,372 |
| 1280 | 546 µs | 579 µs | 1.19 ms | 1.3 MiB | 1,832 |
| 2560 | 1.22 ms | 1.30 ms | 2.80 ms | 2.7 MiB | 823 |
| 5120 | 2.54 ms | 2.61 ms | 4.78 ms | 5.5 MiB | 394 |
| 10240 | 5.67 ms | 5.72 ms | 9.80 ms | 10.8 MiB | 176 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent -0.00, 10 sizes): ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 123 µs | 210 µs | 310 µs | 612.7 KiB | 8,157 |
| 40 | 121 µs | 128 µs | 311 µs | 625.0 KiB | 8,235 |
| 80 | 124 µs | 144 µs | 314 µs | 627.3 KiB | 8,032 |
| 160 | 130 µs | 137 µs | 320 µs | 659.2 KiB | 7,670 |
| 320 | 147 µs | 155 µs | 372 µs | 731.5 KiB | 6,814 |
| 640 | 176 µs | 192 µs | 457 µs | 825.5 KiB | 5,693 |
| 1280 | 176 µs | 193 µs | 459 µs | 825.5 KiB | 5,689 |
| 2560 | 176 µs | 238 µs | 456 µs | 825.5 KiB | 5,696 |
| 5120 | 176 µs | 201 µs | 459 µs | 825.5 KiB | 5,685 |
| 10240 | 175 µs | 188 µs | 454 µs | 825.5 KiB | 5,704 |

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

**Measured: O(n)** (exponent 1.08, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 93.4 µs | 96.1 µs | 257 µs | 50.5 KiB | 10,711 |
| 40 | 161 µs | 172 µs | 362 µs | 120.6 KiB | 6,195 |
| 80 | 353 µs | 357 µs | 686 µs | 178.1 KiB | 2,835 |
| 160 | 675 µs | 733 µs | 1.28 ms | 355.8 KiB | 1,481 |
| 320 | 1.32 ms | 1.44 ms | 2.56 ms | 712.3 KiB | 756 |
| 640 | 2.43 ms | 2.60 ms | 3.73 ms | 1.4 MiB | 411 |
| 1280 | 4.92 ms | 5.02 ms | 6.32 ms | 2.8 MiB | 203 |
| 2560 | 9.92 ms | 10.1 ms | 10.4 ms | 5.7 MiB | 101 |
| 5120 | 20.2 ms | 20.5 ms | 20.7 ms | 11.3 MiB | 49 |
| 10240 | 51.3 ms | 58.3 ms | 51.8 ms | 22.7 MiB | 19 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.12, 10 sizes): 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.12 ms | 1.22 ms | 2.33 ms | 599.8 KiB | 896 |
| 40 | 1.98 ms | 2.08 ms | 3.23 ms | 1.2 MiB | 504 |
| 80 | 3.70 ms | 3.89 ms | 5.02 ms | 2.3 MiB | 270 |
| 160 | 7.22 ms | 7.46 ms | 8.07 ms | 4.6 MiB | 139 |
| 320 | 14.4 ms | 14.8 ms | 14.8 ms | 9.3 MiB | 69 |
| 640 | 35.4 ms | 35.9 ms | 36.0 ms | 18.5 MiB | 28 |
| 1280 | 86.3 ms | 86.6 ms | 86.8 ms | 37.0 MiB | 12 |
| 2560 | 191 ms | 192 ms | 191 ms | 73.9 MiB | 5 |
| 5120 | 395 ms | 399 ms | 406 ms | 147.7 MiB | 3 |
| 10240 | 799 ms | 803 ms | 821 ms | 295.3 MiB | 1 |

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
| 20 | 48.2 µs | 59.6 µs | 166 µs | 98.0 KiB | 20,746 |
| 40 | 71.8 µs | 98.2 µs | 175 µs | 178.8 KiB | 13,936 |
| 80 | 123 µs | 131 µs | 280 µs | 322.1 KiB | 8,161 |
| 160 | 244 µs | 255 µs | 566 µs | 637.6 KiB | 4,099 |
| 320 | 467 µs | 493 µs | 956 µs | 1.2 MiB | 2,143 |
| 640 | 940 µs | 1.04 ms | 1.93 ms | 2.5 MiB | 1,063 |
| 1280 | 1.76 ms | 1.83 ms | 2.65 ms | 4.9 MiB | 568 |
| 2560 | 3.53 ms | 3.59 ms | 4.72 ms | 9.9 MiB | 283 |
| 5120 | 7.39 ms | 7.69 ms | 9.07 ms | 19.8 MiB | 135 |
| 10240 | 15.6 ms | 16.0 ms | 18.5 ms | 39.6 MiB | 64 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.21, 10 sizes): 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 41.2 µs | 45.7 µs | 121 µs | 280.3 KiB | 24,285 |
| 40 | 78.0 µs | 84.6 µs | 184 µs | 538.6 KiB | 12,828 |
| 80 | 155 µs | 169 µs | 349 µs | 1.0 MiB | 6,461 |
| 160 | 313 µs | 338 µs | 630 µs | 2.1 MiB | 3,192 |
| 320 | 644 µs | 678 µs | 1.15 ms | 4.2 MiB | 1,553 |
| 640 | 1.39 ms | 1.46 ms | 2.43 ms | 8.3 MiB | 718 |
| 1280 | 2.86 ms | 2.98 ms | 4.07 ms | 16.7 MiB | 350 |
| 2560 | 5.89 ms | 6.11 ms | 7.45 ms | 33.3 MiB | 170 |
| 5120 | 15.8 ms | 16.4 ms | 18.1 ms | 52.0 MiB | 63 |
| 10240 | 39.7 ms | 42.2 ms | 46.1 ms | 103.7 MiB | 25 |

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

**Measured: O(n)** (exponent 1.02, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 53.3 µs | 65.0 µs | 56.0 µs | 57.3 KiB | 18,772 |
| 40 | 91.4 µs | 102 µs | 94.0 µs | 113.3 KiB | 10,944 |
| 80 | 172 µs | 187 µs | 174 µs | 225.5 KiB | 5,829 |
| 160 | 318 µs | 334 µs | 1.26 ms | 450.0 KiB | 3,148 |
| 320 | 508 µs | 571 µs | 1.38 ms | 898.7 KiB | 1,970 |
| 640 | 924 µs | 956 µs | 1.88 ms | 1.8 MiB | 1,083 |
| 1280 | 1.73 ms | 1.83 ms | 2.65 ms | 3.5 MiB | 578 |
| 2560 | 3.40 ms | 4.03 ms | 3.63 ms | 6.9 MiB | 294 |
| 5120 | 7.23 ms | 7.92 ms | 7.39 ms | 13.8 MiB | 138 |
| 10240 | 15.5 ms | 16.2 ms | 15.7 ms | 27.7 MiB | 64 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.99, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 49.0 µs | 53.6 µs | 51.0 µs | 56.4 KiB | 20,398 |
| 40 | 88.7 µs | 99.5 µs | 91.0 µs | 111.7 KiB | 11,272 |
| 80 | 169 µs | 180 µs | 172 µs | 222.3 KiB | 5,905 |
| 160 | 297 µs | 328 µs | 1.15 ms | 443.6 KiB | 3,365 |
| 320 | 506 µs | 529 µs | 1.34 ms | 886.1 KiB | 1,976 |
| 640 | 936 µs | 972 µs | 1.92 ms | 1.7 MiB | 1,069 |
| 1280 | 1.82 ms | 1.84 ms | 3.10 ms | 3.5 MiB | 549 |
| 2560 | 3.43 ms | 3.48 ms | 4.91 ms | 6.9 MiB | 292 |
| 5120 | 7.04 ms | 7.13 ms | 9.19 ms | 13.8 MiB | 142 |
| 10240 | 14.7 ms | 15.5 ms | 17.9 ms | 27.7 MiB | 68 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls. So where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time). Every moment of the operation then belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly. They are not measured against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 369 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 147 µs | 147 µs | 40% |
| `run-policies` | 1 | 56.2 µs | 56.2 µs | 15% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 166 µs | 45% |

**At 10240 checks** (whole operation: 37.9 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 19.4 ms | 19.4 ms | 51% |
| `run-policies` | 1 | 14.5 ms | 14.5 ms | 38% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 3.98 ms | 11% |

## Cost model

Estimates use two bracketing price shapes. **Low** is CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time). **High** is duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-17T21:55:58.772Z` → `2026-11-17T21:56:59.195Z` (60 s), ci: CI (run 44182943625)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `71673de101f1efe54db13d9f6d6315fd75ae821f` on `dependabot/npm_and_yarn/dev-dependencies-46c679c72d`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks: One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They show how _this_ package's cost changes between runs on comparable hardware, and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

