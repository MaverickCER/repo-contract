# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **256 µs** per operation compared with a bare-minimum baseline (**154% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.87). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 256 µs | 31.3 ms |
| Added latency, relative to baseline | 154% | 248% |
| Added CPU time per operation | 1.33 ms | 33.6 ms |
| Added memory per operation (heap delta) | 354.1 KiB | 45.1 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,910 ops/s | 32 ops/s |

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
| 20 | 51.9 µs | 162 µs | 111 µs | 213% | 111 µs | $0.00023 – $0.0012 |
| 40 | 86.9 µs | 252 µs | 164 µs | 189% | 174 µs | $0.00034 – $0.002 |
| 80 | 166 µs | 426 µs | 256 µs | 154% | 1.33 ms | $0.00053 – $0.015 |
| 160 | 317 µs | 668 µs | 357 µs | 113% | 773 µs | $0.00074 – $0.0087 |
| 320 | 519 µs | 1.45 ms | 926 µs | 178% | 944 µs | $0.0019 – $0.011 |
| 640 | 893 µs | 3.55 ms | 2.65 ms | 297% | 2.95 ms | $0.0055 – $0.033 |
| 1280 | 1.66 ms | 8.11 ms | 6.48 ms | 391% | 7.07 ms | $0.013 – $0.080 |
| 2560 | 3.26 ms | 12.3 ms | 8.90 ms | 273% | 9.96 ms | $0.019 – $0.112 |
| 5120 | 6.56 ms | 21.9 ms | 15.6 ms | 237% | 16.2 ms | $0.032 – $0.183 |
| 10240 | 12.6 ms | 43.9 ms | 31.3 ms | 248% | 33.6 ms | $0.065 – $0.378 |

**How the total grows:** O(n) (linear), exponent 0.87 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 175 µs | 22.0 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 1.69 ms | 251 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 66.2 µs | 18.0 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 88.6 µs | 27.9 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 68.2 µs | 17.5 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 89.6 µs | 25.5 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n log n) | ✅ matches | 41.9 µs | 6.17 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 150 µs | 206 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 421 µs | 53.2 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 3.96 ms | 832 ms |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 132 µs | 18.8 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 191 µs | 50.7 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 182 µs | 16.6 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 183 µs | 16.3 ms |

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
| 20 | 51.8 µs | 61.3 µs | 168 µs | 52.8 KiB | 19,296 |
| 40 | 85.0 µs | 99.3 µs | 216 µs | 104.3 KiB | 11,760 |
| 80 | 175 µs | 302 µs | 446 µs | 211.2 KiB | 5,715 |
| 160 | 316 µs | 340 µs | 675 µs | 436.0 KiB | 3,166 |
| 320 | 598 µs | 621 µs | 1.11 ms | 938.5 KiB | 1,673 |
| 640 | 1.20 ms | 1.31 ms | 2.31 ms | 2.1 MiB | 832 |
| 1280 | 4.25 ms | 4.48 ms | 5.30 ms | 4.7 MiB | 235 |
| 2560 | 6.66 ms | 6.88 ms | 8.47 ms | 8.0 MiB | 150 |
| 5120 | 11.5 ms | 12.6 ms | 13.7 ms | 14.5 MiB | 87 |
| 10240 | 22.0 ms | 22.8 ms | 25.4 ms | 27.6 MiB | 45 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.08, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 459 µs | 496 µs | 994 µs | 294.9 KiB | 2,176 |
| 40 | 828 µs | 1.00e+3 µs | 1.37 ms | 585.9 KiB | 1,208 |
| 80 | 1.69 ms | 2.24 ms | 2.89 ms | 1.1 MiB | 592 |
| 160 | 3.29 ms | 3.38 ms | 4.91 ms | 2.3 MiB | 304 |
| 320 | 6.43 ms | 6.58 ms | 8.77 ms | 4.7 MiB | 155 |
| 640 | 12.4 ms | 13.2 ms | 15.3 ms | 9.8 MiB | 80 |
| 1280 | 27.2 ms | 27.7 ms | 32.5 ms | 20.1 MiB | 37 |
| 2560 | 52.3 ms | 56.8 ms | 63.9 ms | 38.7 MiB | 19 |
| 5120 | 122 ms | 126 ms | 193 ms | 73.5 MiB | 8 |
| 10240 | 251 ms | 286 ms | 401 ms | 145.3 MiB | 4 |

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

**Measured: O(n log n)** (exponent 1.13, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 27.5 µs | 33.8 µs | 28.3 µs | 48.2 KiB | 36,402 |
| 40 | 37.5 µs | 47.7 µs | 107 µs | 92.4 KiB | 26,693 |
| 80 | 66.2 µs | 93.6 µs | 193 µs | 188.2 KiB | 15,099 |
| 160 | 134 µs | 189 µs | 382 µs | 393.0 KiB | 7,459 |
| 320 | 268 µs | 379 µs | 695 µs | 847.7 KiB | 3,733 |
| 640 | 544 µs | 732 µs | 1.16 ms | 1.9 MiB | 1,839 |
| 1280 | 3.27 ms | 3.78 ms | 5.02 ms | 4.4 MiB | 306 |
| 2560 | 4.87 ms | 5.41 ms | 7.04 ms | 7.3 MiB | 205 |
| 5120 | 7.78 ms | 8.34 ms | 11.1 ms | 13.2 MiB | 129 |
| 10240 | 18.0 ms | 18.5 ms | 24.9 ms | 24.5 MiB | 56 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.11, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 28.6 µs | 32.0 µs | 30.9 µs | 54.1 KiB | 34,965 |
| 40 | 43.0 µs | 56.8 µs | 117 µs | 106.8 KiB | 23,280 |
| 80 | 88.6 µs | 118 µs | 256 µs | 217.1 KiB | 11,280 |
| 160 | 187 µs | 238 µs | 539 µs | 451.1 KiB | 5,343 |
| 320 | 437 µs | 511 µs | 1.33 ms | 970.6 KiB | 2,290 |
| 640 | 1.03 ms | 1.27 ms | 2.38 ms | 2.1 MiB | 975 |
| 1280 | 4.84 ms | 5.21 ms | 9.74 ms | 4.9 MiB | 207 |
| 2560 | 7.84 ms | 14.3 ms | 16.6 ms | 8.3 MiB | 128 |
| 5120 | 14.8 ms | 16.1 ms | 28.8 ms | 15.1 MiB | 68 |
| 10240 | 27.9 ms | 29.4 ms | 52.0 ms | 28.2 MiB | 36 |

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
| 20 | 26.5 µs | 33.7 µs | 26.9 µs | 47.0 KiB | 37,698 |
| 40 | 38.1 µs | 48.2 µs | 114 µs | 92.5 KiB | 26,224 |
| 80 | 68.2 µs | 96.1 µs | 199 µs | 188.2 KiB | 14,672 |
| 160 | 140 µs | 198 µs | 397 µs | 393.2 KiB | 7,138 |
| 320 | 308 µs | 418 µs | 896 µs | 856.1 KiB | 3,248 |
| 640 | 594 µs | 859 µs | 1.30 ms | 1.9 MiB | 1,683 |
| 1280 | 3.13 ms | 3.71 ms | 5.16 ms | 4.4 MiB | 320 |
| 2560 | 4.47 ms | 4.92 ms | 7.00 ms | 7.3 MiB | 224 |
| 5120 | 8.50 ms | 9.57 ms | 12.2 ms | 13.2 MiB | 118 |
| 10240 | 17.5 ms | 19.0 ms | 24.5 ms | 24.5 MiB | 57 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.04, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 27.8 µs | 31.3 µs | 59.0 µs | 54.2 KiB | 36,035 |
| 40 | 47.2 µs | 57.7 µs | 136 µs | 106.9 KiB | 21,169 |
| 80 | 89.6 µs | 116 µs | 250 µs | 217.1 KiB | 11,161 |
| 160 | 218 µs | 263 µs | 661 µs | 451.7 KiB | 4,585 |
| 320 | 447 µs | 523 µs | 1.36 ms | 970.6 KiB | 2,235 |
| 640 | 1.24 ms | 1.56 ms | 3.84 ms | 2.2 MiB | 807 |
| 1280 | 4.93 ms | 5.36 ms | 10.2 ms | 4.9 MiB | 203 |
| 2560 | 7.28 ms | 7.89 ms | 15.1 ms | 8.3 MiB | 137 |
| 5120 | 15.8 ms | 25.8 ms | 30.7 ms | 15.0 MiB | 63 |
| 10240 | 25.5 ms | 26.4 ms | 49.3 ms | 28.3 MiB | 39 |

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

**Measured: O(n log n)** (exponent 1.31, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 17.1 µs | 25.2 µs | 17.4 µs | 30.5 KiB | 58,366 |
| 40 | 21.4 µs | 34.3 µs | 68.4 µs | 55.1 KiB | 46,771 |
| 80 | 41.9 µs | 50.6 µs | 140 µs | 104.6 KiB | 23,891 |
| 160 | 73.0 µs | 98.6 µs | 217 µs | 207.0 KiB | 13,700 |
| 320 | 135 µs | 216 µs | 398 µs | 401.9 KiB | 7,394 |
| 640 | 145 µs | 247 µs | 364 µs | 610.7 KiB | 6,908 |
| 1280 | 631 µs | 666 µs | 1.35 ms | 1.3 MiB | 1,586 |
| 2560 | 1.39 ms | 1.50 ms | 3.17 ms | 2.7 MiB | 719 |
| 5120 | 3.05 ms | 3.21 ms | 5.81 ms | 5.5 MiB | 328 |
| 10240 | 6.17 ms | 6.73 ms | 11.2 ms | 10.8 MiB | 162 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent 0.03, 10 sizes) -- ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 141 µs | 156 µs | 345 µs | 612.9 KiB | 7,084 |
| 40 | 150 µs | 172 µs | 397 µs | 628.1 KiB | 6,653 |
| 80 | 150 µs | 168 µs | 393 µs | 628.3 KiB | 6,671 |
| 160 | 154 µs | 170 µs | 384 µs | 661.3 KiB | 6,503 |
| 320 | 170 µs | 188 µs | 461 µs | 722.7 KiB | 5,894 |
| 640 | 194 µs | 216 µs | 488 µs | 826.6 KiB | 5,144 |
| 1280 | 204 µs | 260 µs | 518 µs | 826.6 KiB | 4,898 |
| 2560 | 206 µs | 228 µs | 518 µs | 826.6 KiB | 4,851 |
| 5120 | 224 µs | 259 µs | 654 µs | 829.2 KiB | 4,459 |
| 10240 | 206 µs | 223 µs | 523 µs | 826.6 KiB | 4,846 |

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

**Measured: O(n)** (exponent 1.09, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 98.8 µs | 107 µs | 278 µs | 50.5 KiB | 10,122 |
| 40 | 177 µs | 221 µs | 453 µs | 109.0 KiB | 5,657 |
| 80 | 421 µs | 447 µs | 1.01 ms | 178.6 KiB | 2,374 |
| 160 | 731 µs | 826 µs | 1.43 ms | 355.8 KiB | 1,368 |
| 320 | 1.47 ms | 1.61 ms | 2.90 ms | 712.3 KiB | 682 |
| 640 | 2.52 ms | 2.77 ms | 4.01 ms | 1.4 MiB | 396 |
| 1280 | 5.15 ms | 5.33 ms | 7.05 ms | 2.8 MiB | 194 |
| 2560 | 10.4 ms | 11.4 ms | 10.9 ms | 5.7 MiB | 96 |
| 5120 | 21.6 ms | 31.3 ms | 22.1 ms | 11.3 MiB | 46 |
| 10240 | 53.2 ms | 55.5 ms | 53.7 ms | 22.7 MiB | 19 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.12, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.23 ms | 1.37 ms | 2.61 ms | 599.8 KiB | 815 |
| 40 | 2.21 ms | 2.32 ms | 3.63 ms | 1.2 MiB | 453 |
| 80 | 3.96 ms | 4.16 ms | 5.61 ms | 2.3 MiB | 252 |
| 160 | 7.61 ms | 7.83 ms | 8.44 ms | 4.6 MiB | 131 |
| 320 | 14.7 ms | 25.1 ms | 15.2 ms | 9.3 MiB | 68 |
| 640 | 36.6 ms | 37.1 ms | 37.0 ms | 18.5 MiB | 27 |
| 1280 | 89.4 ms | 94.3 ms | 89.9 ms | 37.0 MiB | 11 |
| 2560 | 193 ms | 197 ms | 194 ms | 73.9 MiB | 5 |
| 5120 | 411 ms | 516 ms | 424 ms | 147.7 MiB | 2 |
| 10240 | 832 ms | 838 ms | 857 ms | 295.3 MiB | 1 |

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

**Measured: O(n)** (exponent 1.07, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 59.2 µs | 81.3 µs | 232 µs | 97.9 KiB | 16,900 |
| 40 | 77.1 µs | 110 µs | 200 µs | 178.9 KiB | 12,966 |
| 80 | 132 µs | 156 µs | 325 µs | 322.2 KiB | 7,588 |
| 160 | 251 µs | 268 µs | 576 µs | 637.7 KiB | 3,988 |
| 320 | 487 µs | 546 µs | 981 µs | 1.2 MiB | 2,053 |
| 640 | 974 µs | 1.05 ms | 2.03 ms | 2.5 MiB | 1,026 |
| 1280 | 1.85 ms | 1.99 ms | 2.78 ms | 4.9 MiB | 539 |
| 2560 | 3.85 ms | 3.99 ms | 5.24 ms | 9.9 MiB | 260 |
| 5120 | 8.38 ms | 11.0 ms | 10.4 ms | 19.8 MiB | 119 |
| 10240 | 18.8 ms | 19.6 ms | 22.3 ms | 39.6 MiB | 53 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.24, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 54.7 µs | 57.8 µs | 166 µs | 281.2 KiB | 18,290 |
| 40 | 94.9 µs | 107 µs | 235 µs | 538.9 KiB | 10,532 |
| 80 | 191 µs | 211 µs | 446 µs | 1.0 MiB | 5,242 |
| 160 | 365 µs | 403 µs | 692 µs | 2.1 MiB | 2,738 |
| 320 | 737 µs | 787 µs | 1.25 ms | 4.2 MiB | 1,357 |
| 640 | 1.58 ms | 1.72 ms | 2.68 ms | 8.3 MiB | 633 |
| 1280 | 3.24 ms | 3.40 ms | 4.54 ms | 16.7 MiB | 309 |
| 2560 | 6.38 ms | 6.79 ms | 8.23 ms | 33.3 MiB | 157 |
| 5120 | 17.4 ms | 18.4 ms | 20.4 ms | 52.0 MiB | 57 |
| 10240 | 50.7 ms | 53.6 ms | 59.9 ms | 103.7 MiB | 20 |

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

**Measured: O(n)** (exponent 1.02, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 57.2 µs | 74.1 µs | 60.0 µs | 57.3 KiB | 17,468 |
| 40 | 97.0 µs | 140 µs | 100 µs | 113.3 KiB | 10,306 |
| 80 | 182 µs | 198 µs | 185 µs | 225.5 KiB | 5,488 |
| 160 | 333 µs | 354 µs | 1.33 ms | 450.0 KiB | 3,003 |
| 320 | 542 µs | 600 µs | 1.47 ms | 898.7 KiB | 1,845 |
| 640 | 990 µs | 1.08 ms | 1.99 ms | 1.8 MiB | 1,010 |
| 1280 | 1.93 ms | 2.06 ms | 2.82 ms | 3.5 MiB | 519 |
| 2560 | 3.99 ms | 4.33 ms | 4.83 ms | 6.9 MiB | 251 |
| 5120 | 8.02 ms | 11.1 ms | 8.44 ms | 13.8 MiB | 125 |
| 10240 | 16.6 ms | 16.9 ms | 17.3 ms | 27.7 MiB | 60 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 50.9 µs | 62.6 µs | 53.0 µs | 56.4 KiB | 19,632 |
| 40 | 95.8 µs | 109 µs | 99.0 µs | 111.7 KiB | 10,438 |
| 80 | 183 µs | 205 µs | 186 µs | 222.3 KiB | 5,473 |
| 160 | 324 µs | 351 µs | 1.24 ms | 443.6 KiB | 3,084 |
| 320 | 540 µs | 557 µs | 1.42 ms | 886.1 KiB | 1,852 |
| 640 | 999 µs | 1.07 ms | 2.04 ms | 1.7 MiB | 1,001 |
| 1280 | 2.04 ms | 2.12 ms | 3.64 ms | 3.5 MiB | 491 |
| 2560 | 3.75 ms | 3.87 ms | 4.67 ms | 6.9 MiB | 267 |
| 5120 | 7.52 ms | 8.28 ms | 9.96 ms | 13.8 MiB | 133 |
| 10240 | 16.3 ms | 16.8 ms | 20.6 ms | 27.7 MiB | 61 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 426 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 175 µs | 175 µs | 41% |
| `run-policies` | 1 | 66.2 µs | 66.2 µs | 16% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 185 µs | 43% |

**At 10240 checks** (whole operation: 43.9 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 22.0 ms | 22.0 ms | 50% |
| `run-policies` | 1 | 18.0 ms | 18.0 ms | 41% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 3.88 ms | 8.8% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-12T23:48:48.699Z` → `2026-11-12T23:49:52.766Z` (64 s), ci: CI (run 43329499751)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `dcebcbeaca5e30d6b95caa0682b802a63a4c8412` on `docs/v1-claims-evidence`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

