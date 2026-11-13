# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **299 µs** per operation compared with a bare-minimum baseline (**140% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.86). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 299 µs | 40.9 ms |
| Added latency, relative to baseline | 140% | 236% |
| Added CPU time per operation | 1.48 ms | 47.9 ms |
| Added memory per operation (heap delta) | 353.9 KiB | 44.7 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,341 ops/s | 24 ops/s |

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
| 20 | 65.9 µs | 197 µs | 129 µs | 196% | 139 µs | $0.00027 – $0.0016 |
| 40 | 114 µs | 335 µs | 221 µs | 194% | 598 µs | $0.00046 – $0.0067 |
| 80 | 215 µs | 514 µs | 299 µs | 140% | 1.48 ms | $0.00062 – $0.017 |
| 160 | 403 µs | 933 µs | 522 µs | 130% | 534 µs | $0.0011 – $0.006 |
| 320 | 671 µs | 1.92 ms | 1.24 ms | 184% | 1.29 ms | $0.0026 – $0.014 |
| 640 | 1.20 ms | 5.02 ms | 3.84 ms | 321% | 4.16 ms | $0.008 – $0.047 |
| 1280 | 2.24 ms | 10.6 ms | 8.41 ms | 376% | 8.83 ms | $0.018 – $0.099 |
| 2560 | 4.52 ms | 17.4 ms | 12.8 ms | 283% | 14.3 ms | $0.027 – $0.160 |
| 5120 | 8.79 ms | 29.6 ms | 20.8 ms | 236% | 23.5 ms | $0.043 – $0.265 |
| 10240 | 17.3 ms | 58.4 ms | 40.9 ms | 236% | 47.9 ms | $0.085 – $0.539 |

**How the total grows:** O(n) (linear), exponent 0.86 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 241 µs | 31.7 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 2.32 ms | 320 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 100 µs | 22.9 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 140 µs | 34.6 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 102 µs | 23.1 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 136 µs | 32.7 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n log n) | ✅ matches | 63.2 µs | 8.12 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 218 µs | 304 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 575 µs | 75.9 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 5.91 ms | 1.11 s |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 199 µs | 26.4 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 281 µs | 64.2 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 258 µs | 21.4 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 263 µs | 23.0 ms |

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

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 64.8 µs | 68.2 µs | 189 µs | 52.8 KiB | 15,430 |
| 40 | 121 µs | 126 µs | 326 µs | 104.4 KiB | 8,271 |
| 80 | 241 µs | 263 µs | 654 µs | 211.4 KiB | 4,156 |
| 160 | 454 µs | 475 µs | 1.10 ms | 436.3 KiB | 2,201 |
| 320 | 825 µs | 877 µs | 1.49 ms | 938.5 KiB | 1,213 |
| 640 | 1.68 ms | 1.84 ms | 3.05 ms | 2.1 MiB | 594 |
| 1280 | 6.02 ms | 6.54 ms | 7.54 ms | 4.7 MiB | 166 |
| 2560 | 9.49 ms | 10.8 ms | 11.6 ms | 8.0 MiB | 105 |
| 5120 | 16.3 ms | 17.0 ms | 18.4 ms | 14.5 MiB | 61 |
| 10240 | 31.7 ms | 32.1 ms | 35.1 ms | 27.6 MiB | 32 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.07, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 619 µs | 636 µs | 1.27 ms | 294.9 KiB | 1,615 |
| 40 | 1.24 ms | 1.30 ms | 2.59 ms | 587.1 KiB | 806 |
| 80 | 2.32 ms | 2.84 ms | 3.77 ms | 1.1 MiB | 432 |
| 160 | 4.39 ms | 4.54 ms | 6.08 ms | 2.3 MiB | 228 |
| 320 | 8.48 ms | 8.53 ms | 10.7 ms | 4.7 MiB | 118 |
| 640 | 16.7 ms | 17.1 ms | 19.8 ms | 9.8 MiB | 60 |
| 1280 | 35.9 ms | 36.3 ms | 41.2 ms | 20.1 MiB | 28 |
| 2560 | 70.3 ms | 76.6 ms | 79.5 ms | 38.7 MiB | 14 |
| 5120 | 161 ms | 162 ms | 242 ms | 73.5 MiB | 6 |
| 10240 | 320 ms | 326 ms | 487 ms | 145.3 MiB | 3 |

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

**Measured: O(n)** (exponent 1.07, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 38.5 µs | 45.7 µs | 40.2 µs | 48.2 KiB | 26,006 |
| 40 | 56.8 µs | 71.6 µs | 192 µs | 92.5 KiB | 17,619 |
| 80 | 100 µs | 133 µs | 288 µs | 188.3 KiB | 9,963 |
| 160 | 199 µs | 270 µs | 568 µs | 393.3 KiB | 5,037 |
| 320 | 414 µs | 546 µs | 1.18 ms | 855.2 KiB | 2,413 |
| 640 | 932 µs | 1.19 ms | 2.45 ms | 1.9 MiB | 1,073 |
| 1280 | 4.47 ms | 4.92 ms | 6.45 ms | 4.4 MiB | 224 |
| 2560 | 7.08 ms | 7.71 ms | 9.67 ms | 7.3 MiB | 141 |
| 5120 | 12.4 ms | 13.4 ms | 16.4 ms | 13.1 MiB | 80 |
| 10240 | 22.9 ms | 24.6 ms | 29.8 ms | 24.4 MiB | 44 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.02, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 38.2 µs | 42.0 µs | 155 µs | 54.1 KiB | 26,173 |
| 40 | 66.7 µs | 83.4 µs | 208 µs | 106.9 KiB | 15,001 |
| 80 | 140 µs | 169 µs | 439 µs | 217.3 KiB | 7,139 |
| 160 | 287 µs | 353 µs | 879 µs | 451.7 KiB | 3,490 |
| 320 | 628 µs | 815 µs | 1.79 ms | 967.2 KiB | 1,593 |
| 640 | 1.67 ms | 2.02 ms | 4.81 ms | 2.2 MiB | 598 |
| 1280 | 6.64 ms | 7.05 ms | 12.1 ms | 4.9 MiB | 151 |
| 2560 | 9.24 ms | 10.1 ms | 17.9 ms | 8.3 MiB | 108 |
| 5120 | 18.4 ms | 18.6 ms | 34.4 ms | 15.0 MiB | 54 |
| 10240 | 34.6 ms | 46.2 ms | 63.3 ms | 27.9 MiB | 29 |

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

**Measured: O(n)** (exponent 1.04, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 32.9 µs | 37.6 µs | 106 µs | 46.9 KiB | 30,401 |
| 40 | 55.2 µs | 68.3 µs | 174 µs | 92.5 KiB | 18,112 |
| 80 | 102 µs | 135 µs | 295 µs | 188.3 KiB | 9,790 |
| 160 | 203 µs | 283 µs | 589 µs | 393.6 KiB | 4,920 |
| 320 | 442 µs | 569 µs | 1.23 ms | 856.1 KiB | 2,263 |
| 640 | 973 µs | 1.15 ms | 2.50 ms | 1.9 MiB | 1,028 |
| 1280 | 4.71 ms | 5.10 ms | 6.85 ms | 4.4 MiB | 212 |
| 2560 | 6.28 ms | 6.97 ms | 8.98 ms | 7.3 MiB | 159 |
| 5120 | 11.6 ms | 12.4 ms | 15.3 ms | 13.2 MiB | 87 |
| 10240 | 23.1 ms | 24.1 ms | 30.2 ms | 24.3 MiB | 43 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 40.3 µs | 44.5 µs | 167 µs | 54.2 KiB | 24,784 |
| 40 | 71.4 µs | 85.0 µs | 228 µs | 107.0 KiB | 14,004 |
| 80 | 136 µs | 173 µs | 396 µs | 217.2 KiB | 7,376 |
| 160 | 291 µs | 371 µs | 908 µs | 451.7 KiB | 3,432 |
| 320 | 659 µs | 854 µs | 1.87 ms | 956.4 KiB | 1,518 |
| 640 | 1.61 ms | 2.01 ms | 4.80 ms | 2.2 MiB | 620 |
| 1280 | 6.11 ms | 6.38 ms | 11.3 ms | 4.9 MiB | 164 |
| 2560 | 9.23 ms | 9.78 ms | 17.9 ms | 8.3 MiB | 108 |
| 5120 | 16.5 ms | 17.2 ms | 31.4 ms | 15.1 MiB | 61 |
| 10240 | 32.7 ms | 45.2 ms | 61.5 ms | 28.0 MiB | 31 |

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
| 20 | 23.8 µs | 48.5 µs | 25.6 µs | 30.4 KiB | 42,014 |
| 40 | 30.9 µs | 38.9 µs | 100 µs | 55.1 KiB | 32,327 |
| 80 | 63.2 µs | 72.4 µs | 225 µs | 104.6 KiB | 15,832 |
| 160 | 105 µs | 133 µs | 308 µs | 207.3 KiB | 9,496 |
| 320 | 206 µs | 253 µs | 580 µs | 402.0 KiB | 4,852 |
| 640 | 260 µs | 277 µs | 1.03 ms | 604.1 KiB | 3,840 |
| 1280 | 893 µs | 957 µs | 1.83 ms | 1.3 MiB | 1,120 |
| 2560 | 1.90 ms | 2.04 ms | 4.20 ms | 2.7 MiB | 528 |
| 5120 | 4.04 ms | 4.16 ms | 7.59 ms | 5.5 MiB | 247 |
| 10240 | 8.12 ms | 8.29 ms | 14.5 ms | 10.8 MiB | 123 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent 0.00, 10 sizes) -- ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 212 µs | 228 µs | 606 µs | 616.5 KiB | 4,723 |
| 40 | 216 µs | 231 µs | 615 µs | 618.2 KiB | 4,625 |
| 80 | 218 µs | 271 µs | 606 µs | 625.9 KiB | 4,592 |
| 160 | 231 µs | 251 µs | 625 µs | 663.4 KiB | 4,334 |
| 320 | 267 µs | 285 µs | 792 µs | 716.3 KiB | 3,751 |
| 640 | 304 µs | 335 µs | 828 µs | 829.2 KiB | 3,288 |
| 1280 | 301 µs | 368 µs | 812 µs | 829.2 KiB | 3,325 |
| 2560 | 301 µs | 330 µs | 815 µs | 829.2 KiB | 3,324 |
| 5120 | 302 µs | 331 µs | 809 µs | 829.2 KiB | 3,316 |
| 10240 | 304 µs | 342 µs | 817 µs | 829.2 KiB | 3,289 |

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
| 20 | 145 µs | 172 µs | 404 µs | 45.5 KiB | 6,895 |
| 40 | 271 µs | 317 µs | 725 µs | 115.7 KiB | 3,692 |
| 80 | 575 µs | 593 µs | 1.27 ms | 178.6 KiB | 1,739 |
| 160 | 1.13 ms | 1.17 ms | 2.54 ms | 357.3 KiB | 881 |
| 320 | 2.07 ms | 2.30 ms | 3.88 ms | 712.3 KiB | 483 |
| 640 | 4.03 ms | 4.27 ms | 6.21 ms | 1.4 MiB | 248 |
| 1280 | 7.90 ms | 11.4 ms | 9.96 ms | 2.8 MiB | 127 |
| 2560 | 15.8 ms | 22.7 ms | 18.0 ms | 5.7 MiB | 63 |
| 5120 | 31.4 ms | 31.6 ms | 32.4 ms | 11.3 MiB | 32 |
| 10240 | 75.9 ms | 86.0 ms | 76.3 ms | 22.7 MiB | 13 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.10, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.77 ms | 1.91 ms | 3.43 ms | 599.8 KiB | 565 |
| 40 | 3.10 ms | 3.26 ms | 4.84 ms | 1.2 MiB | 322 |
| 80 | 5.91 ms | 6.11 ms | 7.95 ms | 2.3 MiB | 169 |
| 160 | 11.3 ms | 13.7 ms | 13.5 ms | 4.6 MiB | 89 |
| 320 | 22.1 ms | 22.3 ms | 22.5 ms | 9.3 MiB | 45 |
| 640 | 51.6 ms | 52.6 ms | 52.0 ms | 18.5 MiB | 19 |
| 1280 | 123 ms | 124 ms | 123 ms | 37.0 MiB | 8 |
| 2560 | 267 ms | 274 ms | 267 ms | 73.9 MiB | 4 |
| 5120 | 549 ms | 559 ms | 565 ms | 147.7 MiB | 2 |
| 10240 | 1.11 s | 1.11 s | 1.14 s | 295.3 MiB | 1 |

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

**Measured: O(n)** (exponent 1.05, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 87.5 µs | 119 µs | 281 µs | 98.0 KiB | 11,431 |
| 40 | 115 µs | 156 µs | 316 µs | 178.9 KiB | 8,695 |
| 80 | 199 µs | 230 µs | 512 µs | 322.2 KiB | 5,031 |
| 160 | 396 µs | 447 µs | 1.03 ms | 637.8 KiB | 2,526 |
| 320 | 719 µs | 781 µs | 1.37 ms | 1.2 MiB | 1,391 |
| 640 | 1.43 ms | 1.52 ms | 2.75 ms | 2.5 MiB | 701 |
| 1280 | 2.77 ms | 2.93 ms | 4.01 ms | 4.9 MiB | 361 |
| 2560 | 5.71 ms | 6.87 ms | 7.48 ms | 9.9 MiB | 175 |
| 5120 | 11.7 ms | 12.2 ms | 14.2 ms | 19.8 MiB | 85 |
| 10240 | 26.4 ms | 27.7 ms | 30.7 ms | 39.6 MiB | 38 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.20, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 78.2 µs | 86.6 µs | 235 µs | 281.1 KiB | 12,781 |
| 40 | 145 µs | 159 µs | 389 µs | 539.5 KiB | 6,912 |
| 80 | 281 µs | 313 µs | 698 µs | 1.0 MiB | 3,561 |
| 160 | 569 µs | 598 µs | 1.23 ms | 2.1 MiB | 1,756 |
| 320 | 1.20 ms | 1.27 ms | 2.56 ms | 4.2 MiB | 835 |
| 640 | 2.32 ms | 2.49 ms | 3.77 ms | 8.3 MiB | 431 |
| 1280 | 4.84 ms | 5.25 ms | 6.67 ms | 16.7 MiB | 207 |
| 2560 | 9.60 ms | 10.1 ms | 12.1 ms | 33.3 MiB | 104 |
| 5120 | 26.4 ms | 27.4 ms | 29.8 ms | 52.0 MiB | 38 |
| 10240 | 64.2 ms | 66.4 ms | 73.9 ms | 103.7 MiB | 16 |

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

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 78.9 µs | 98.5 µs | 82.0 µs | 57.3 KiB | 12,676 |
| 40 | 139 µs | 175 µs | 142 µs | 113.3 KiB | 7,219 |
| 80 | 258 µs | 283 µs | 262 µs | 225.5 KiB | 3,869 |
| 160 | 441 µs | 477 µs | 1.62 ms | 450.0 KiB | 2,267 |
| 320 | 746 µs | 786 µs | 1.93 ms | 898.7 KiB | 1,341 |
| 640 | 1.37 ms | 1.46 ms | 2.61 ms | 1.8 MiB | 730 |
| 1280 | 2.50 ms | 2.63 ms | 2.92 ms | 3.5 MiB | 400 |
| 2560 | 5.05 ms | 5.15 ms | 5.37 ms | 6.9 MiB | 198 |
| 5120 | 10.4 ms | 11.0 ms | 10.7 ms | 13.8 MiB | 97 |
| 10240 | 21.4 ms | 23.7 ms | 21.7 ms | 27.7 MiB | 47 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.04, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 74.5 µs | 88.9 µs | 78.0 µs | 56.4 KiB | 13,429 |
| 40 | 138 µs | 153 µs | 142 µs | 111.7 KiB | 7,262 |
| 80 | 263 µs | 281 µs | 268 µs | 222.3 KiB | 3,798 |
| 160 | 453 µs | 471 µs | 1.66 ms | 443.6 KiB | 2,210 |
| 320 | 731 µs | 792 µs | 1.90 ms | 886.1 KiB | 1,368 |
| 640 | 1.34 ms | 1.50 ms | 2.66 ms | 1.7 MiB | 744 |
| 1280 | 2.56 ms | 2.71 ms | 4.07 ms | 3.5 MiB | 391 |
| 2560 | 5.25 ms | 5.30 ms | 6.67 ms | 6.9 MiB | 190 |
| 5120 | 11.6 ms | 11.9 ms | 14.6 ms | 13.8 MiB | 86 |
| 10240 | 23.0 ms | 25.4 ms | 29.9 ms | 27.7 MiB | 43 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 514 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 241 µs | 241 µs | 47% |
| `run-policies` | 1 | 100 µs | 100 µs | 20% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 173 µs | 34% |

**At 10240 checks** (whole operation: 58.4 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 31.7 ms | 31.7 ms | 54% |
| `run-policies` | 1 | 22.9 ms | 22.9 ms | 39% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 3.77 ms | 6.4% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-13T00:18:17.707Z` → `2026-11-13T00:19:35.086Z` (77 s), ci: CI (run 43333798477)
- Machine: AMD EPYC 9V74 80-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `364060fc11152ee4034737a0bc82ec8f721c5c53` on `docs/v1-claims-evidence`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

