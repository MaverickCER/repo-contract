# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **188 µs** per operation compared with a bare-minimum baseline (**118% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.00). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 188 µs | 39.2 ms |
| Added latency, relative to baseline | 118% | 233% |
| Added CPU time per operation | 365 µs | 41.5 ms |
| Added memory per operation (heap delta) | 345.2 KiB | 44.6 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 5,332 ops/s | 26 ops/s |

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
| 20 | 44.4 µs | 121 µs | 76.6 µs | 173% | 277 µs | $0.00016 – $0.0031 |
| 40 | 79.4 µs | 194 µs | 114 µs | 144% | 296 µs | $0.00024 – $0.0033 |
| 80 | 159 µs | 346 µs | 188 µs | 118% | 365 µs | $0.00039 – $0.0041 |
| 160 | 301 µs | 670 µs | 369 µs | 123% | 622 µs | $0.00077 – $0.007 |
| 320 | 590 µs | 1.36 ms | 771 µs | 131% | 1.38 ms | $0.0016 – $0.015 |
| 640 | 1.19 ms | 2.78 ms | 1.59 ms | 134% | 1.89 ms | $0.0033 – $0.021 |
| 1280 | 2.20 ms | 11.3 ms | 9.09 ms | 412% | 9.61 ms | $0.019 – $0.108 |
| 2560 | 4.28 ms | 15.8 ms | 11.5 ms | 268% | 12.1 ms | $0.024 – $0.136 |
| 5120 | 8.53 ms | 28.3 ms | 19.7 ms | 232% | 18.7 ms | $0.041 – $0.211 |
| 10240 | 16.8 ms | 55.9 ms | 39.2 ms | 233% | 41.5 ms | $0.082 – $0.467 |

**How the total grows:** O(n) (linear), exponent 1.00 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 239 µs | 31.1 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 2.25 ms | 316 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 99.3 µs | 22.3 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 130 µs | 32.0 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 105 µs | 23.4 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 133 µs | 32.2 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n log n) | ✅ matches | 58.5 µs | 8.03 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 215 µs | 304 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 601 µs | 75.3 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n) | ✅ matches | 5.93 ms | 1.12 s |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 203 µs | 24.7 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 287 µs | 59.4 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 268 µs | 22.3 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 267 µs | 24.0 ms |

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
| 20 | 66.0 µs | 71.1 µs | 205 µs | 52.8 KiB | 15,158 |
| 40 | 120 µs | 127 µs | 329 µs | 104.4 KiB | 8,356 |
| 80 | 239 µs | 250 µs | 654 µs | 211.4 KiB | 4,192 |
| 160 | 451 µs | 470 µs | 1.08 ms | 436.2 KiB | 2,219 |
| 320 | 827 µs | 858 µs | 1.48 ms | 938.5 KiB | 1,209 |
| 640 | 1.67 ms | 1.86 ms | 3.04 ms | 2.1 MiB | 600 |
| 1280 | 6.17 ms | 6.64 ms | 7.58 ms | 4.7 MiB | 162 |
| 2560 | 9.40 ms | 10.8 ms | 11.5 ms | 8.0 MiB | 106 |
| 5120 | 16.5 ms | 19.6 ms | 18.7 ms | 14.5 MiB | 61 |
| 10240 | 31.1 ms | 31.7 ms | 34.6 ms | 27.5 MiB | 32 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.07, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 612 µs | 1.08 ms | 1.27 ms | 294.9 KiB | 1,634 |
| 40 | 1.21 ms | 1.26 ms | 2.57 ms | 587.0 KiB | 824 |
| 80 | 2.25 ms | 2.76 ms | 3.73 ms | 1.1 MiB | 445 |
| 160 | 4.27 ms | 4.37 ms | 5.91 ms | 2.3 MiB | 234 |
| 320 | 8.33 ms | 8.38 ms | 10.4 ms | 4.7 MiB | 120 |
| 640 | 16.5 ms | 16.6 ms | 19.4 ms | 9.8 MiB | 61 |
| 1280 | 35.8 ms | 40.2 ms | 40.8 ms | 20.1 MiB | 28 |
| 2560 | 69.1 ms | 76.4 ms | 77.6 ms | 38.7 MiB | 14 |
| 5120 | 158 ms | 161 ms | 239 ms | 73.5 MiB | 6 |
| 10240 | 316 ms | 319 ms | 485 ms | 145.3 MiB | 3 |

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
| 20 | 37.6 µs | 42.3 µs | 79.5 µs | 48.0 KiB | 26,630 |
| 40 | 52.0 µs | 63.1 µs | 155 µs | 92.4 KiB | 19,241 |
| 80 | 99.3 µs | 131 µs | 285 µs | 188.3 KiB | 10,074 |
| 160 | 198 µs | 273 µs | 560 µs | 392.2 KiB | 5,058 |
| 320 | 433 µs | 549 µs | 1.25 ms | 855.1 KiB | 2,310 |
| 640 | 858 µs | 1.06 ms | 1.94 ms | 1.9 MiB | 1,166 |
| 1280 | 4.64 ms | 5.01 ms | 6.80 ms | 4.4 MiB | 216 |
| 2560 | 6.18 ms | 6.56 ms | 8.96 ms | 7.3 MiB | 162 |
| 5120 | 11.4 ms | 13.0 ms | 15.4 ms | 13.2 MiB | 88 |
| 10240 | 22.3 ms | 22.9 ms | 29.6 ms | 24.3 MiB | 45 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.03, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 39.6 µs | 44.2 µs | 84.7 µs | 54.1 KiB | 25,270 |
| 40 | 66.0 µs | 82.8 µs | 206 µs | 106.9 KiB | 15,147 |
| 80 | 130 µs | 167 µs | 380 µs | 217.2 KiB | 7,671 |
| 160 | 281 µs | 349 µs | 836 µs | 451.7 KiB | 3,558 |
| 320 | 573 µs | 725 µs | 1.70 ms | 970.6 KiB | 1,745 |
| 640 | 1.46 ms | 1.74 ms | 4.45 ms | 2.2 MiB | 685 |
| 1280 | 6.16 ms | 6.57 ms | 11.6 ms | 4.9 MiB | 162 |
| 2560 | 8.76 ms | 9.05 ms | 17.1 ms | 8.3 MiB | 114 |
| 5120 | 16.5 ms | 16.9 ms | 31.5 ms | 14.9 MiB | 61 |
| 10240 | 32.0 ms | 32.7 ms | 60.2 ms | 28.0 MiB | 31 |

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

**Measured: O(n)** (exponent 1.05, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 32.8 µs | 35.8 µs | 54.9 µs | 46.9 KiB | 30,533 |
| 40 | 52.6 µs | 67.7 µs | 162 µs | 92.5 KiB | 18,996 |
| 80 | 105 µs | 136 µs | 313 µs | 188.3 KiB | 9,510 |
| 160 | 199 µs | 278 µs | 555 µs | 389.4 KiB | 5,020 |
| 320 | 429 µs | 559 µs | 1.24 ms | 856.0 KiB | 2,332 |
| 640 | 934 µs | 1.24 ms | 2.40 ms | 1.9 MiB | 1,071 |
| 1280 | 4.76 ms | 5.14 ms | 7.05 ms | 4.4 MiB | 210 |
| 2560 | 6.48 ms | 6.87 ms | 9.23 ms | 7.3 MiB | 154 |
| 5120 | 11.0 ms | 11.9 ms | 15.2 ms | 13.2 MiB | 91 |
| 10240 | 23.4 ms | 23.6 ms | 30.6 ms | 24.2 MiB | 43 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.03, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 39.8 µs | 44.1 µs | 85.0 µs | 54.2 KiB | 25,136 |
| 40 | 66.9 µs | 82.9 µs | 207 µs | 106.9 KiB | 14,946 |
| 80 | 133 µs | 168 µs | 382 µs | 217.2 KiB | 7,524 |
| 160 | 283 µs | 349 µs | 846 µs | 451.7 KiB | 3,531 |
| 320 | 605 µs | 750 µs | 1.77 ms | 970.4 KiB | 1,652 |
| 640 | 1.50 ms | 1.84 ms | 4.48 ms | 2.2 MiB | 665 |
| 1280 | 6.16 ms | 6.40 ms | 11.5 ms | 4.9 MiB | 162 |
| 2560 | 8.78 ms | 9.39 ms | 17.1 ms | 8.3 MiB | 114 |
| 5120 | 17.2 ms | 18.1 ms | 32.9 ms | 14.9 MiB | 58 |
| 10240 | 32.2 ms | 32.7 ms | 60.9 ms | 27.7 MiB | 31 |

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

**Measured: O(n log n)** (exponent 1.26, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 24.6 µs | 35.6 µs | 30.9 µs | 30.5 KiB | 40,722 |
| 40 | 28.3 µs | 37.8 µs | 77.9 µs | 55.1 KiB | 35,336 |
| 80 | 58.5 µs | 79.8 µs | 191 µs | 104.6 KiB | 17,103 |
| 160 | 109 µs | 135 µs | 332 µs | 207.7 KiB | 9,209 |
| 320 | 200 µs | 266 µs | 555 µs | 402.0 KiB | 5,003 |
| 640 | 207 µs | 224 µs | 581 µs | 615.2 KiB | 4,840 |
| 1280 | 961 µs | 1.05 ms | 2.71 ms | 1.3 MiB | 1,041 |
| 2560 | 1.83 ms | 1.92 ms | 4.05 ms | 2.7 MiB | 546 |
| 5120 | 3.84 ms | 5.46 ms | 7.35 ms | 5.5 MiB | 260 |
| 10240 | 8.03 ms | 8.19 ms | 14.2 ms | 10.8 MiB | 125 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent 0.01, 10 sizes) -- ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 206 µs | 227 µs | 579 µs | 616.4 KiB | 4,866 |
| 40 | 210 µs | 231 µs | 590 µs | 618.2 KiB | 4,761 |
| 80 | 215 µs | 237 µs | 595 µs | 625.9 KiB | 4,651 |
| 160 | 225 µs | 247 µs | 598 µs | 663.4 KiB | 4,442 |
| 320 | 245 µs | 267 µs | 625 µs | 722.7 KiB | 4,085 |
| 640 | 299 µs | 319 µs | 792 µs | 829.2 KiB | 3,343 |
| 1280 | 300 µs | 322 µs | 805 µs | 829.2 KiB | 3,334 |
| 2560 | 301 µs | 316 µs | 799 µs | 829.2 KiB | 3,317 |
| 5120 | 302 µs | 326 µs | 805 µs | 829.2 KiB | 3,315 |
| 10240 | 304 µs | 357 µs | 813 µs | 829.2 KiB | 3,291 |

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
| 20 | 155 µs | 168 µs | 475 µs | 45.6 KiB | 6,447 |
| 40 | 273 µs | 286 µs | 707 µs | 115.7 KiB | 3,663 |
| 80 | 601 µs | 626 µs | 1.32 ms | 178.6 KiB | 1,663 |
| 160 | 1.52 ms | 1.59 ms | 3.00 ms | 357.3 KiB | 657 |
| 320 | 2.89 ms | 3.00 ms | 4.64 ms | 712.3 KiB | 346 |
| 640 | 5.63 ms | 5.89 ms | 7.64 ms | 1.4 MiB | 178 |
| 1280 | 11.0 ms | 11.4 ms | 13.2 ms | 2.8 MiB | 91 |
| 2560 | 22.0 ms | 22.4 ms | 24.1 ms | 5.7 MiB | 45 |
| 5120 | 44.4 ms | 44.8 ms | 45.5 ms | 11.3 MiB | 23 |
| 10240 | 75.3 ms | 76.2 ms | 75.7 ms | 22.7 MiB | 13 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.81 ms | 1.92 ms | 3.46 ms | 599.8 KiB | 554 |
| 40 | 3.13 ms | 3.28 ms | 4.86 ms | 1.2 MiB | 320 |
| 80 | 5.93 ms | 6.54 ms | 7.92 ms | 2.3 MiB | 169 |
| 160 | 11.2 ms | 11.4 ms | 13.2 ms | 4.6 MiB | 89 |
| 320 | 33.7 ms | 34.1 ms | 34.3 ms | 9.3 MiB | 30 |
| 640 | 67.1 ms | 67.4 ms | 67.5 ms | 18.5 MiB | 15 |
| 1280 | 140 ms | 140 ms | 140 ms | 37.0 MiB | 7 |
| 2560 | 283 ms | 284 ms | 284 ms | 73.9 MiB | 4 |
| 5120 | 569 ms | 571 ms | 586 ms | 147.7 MiB | 2 |
| 10240 | 1.12 s | 1.12 s | 1.15 s | 295.3 MiB | 1 |

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

**Measured: O(n)** (exponent 1.03, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 81.7 µs | 107 µs | 318 µs | 98.0 KiB | 12,238 |
| 40 | 123 µs | 164 µs | 368 µs | 179.0 KiB | 8,157 |
| 80 | 203 µs | 302 µs | 514 µs | 322.2 KiB | 4,923 |
| 160 | 394 µs | 447 µs | 1.02 ms | 637.9 KiB | 2,538 |
| 320 | 709 µs | 786 µs | 1.34 ms | 1.2 MiB | 1,411 |
| 640 | 1.41 ms | 1.50 ms | 2.69 ms | 2.5 MiB | 709 |
| 1280 | 2.73 ms | 2.85 ms | 4.08 ms | 4.9 MiB | 366 |
| 2560 | 5.46 ms | 5.58 ms | 7.15 ms | 9.9 MiB | 183 |
| 5120 | 11.4 ms | 11.9 ms | 13.8 ms | 19.8 MiB | 88 |
| 10240 | 24.7 ms | 25.5 ms | 28.9 ms | 39.6 MiB | 40 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.19, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 79.1 µs | 87.7 µs | 232 µs | 281.1 KiB | 12,637 |
| 40 | 142 µs | 164 µs | 385 µs | 539.5 KiB | 7,037 |
| 80 | 287 µs | 316 µs | 699 µs | 1.0 MiB | 3,489 |
| 160 | 566 µs | 604 µs | 1.21 ms | 2.1 MiB | 1,767 |
| 320 | 1.14 ms | 1.19 ms | 2.33 ms | 4.2 MiB | 878 |
| 640 | 2.26 ms | 2.39 ms | 3.64 ms | 8.3 MiB | 443 |
| 1280 | 4.55 ms | 4.89 ms | 6.31 ms | 16.7 MiB | 220 |
| 2560 | 9.26 ms | 9.43 ms | 11.6 ms | 33.3 MiB | 108 |
| 5120 | 25.2 ms | 25.9 ms | 28.7 ms | 52.0 MiB | 40 |
| 10240 | 59.4 ms | 60.4 ms | 68.5 ms | 103.7 MiB | 17 |

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
| 20 | 81.1 µs | 98.6 µs | 84.0 µs | 57.4 KiB | 12,335 |
| 40 | 143 µs | 169 µs | 146 µs | 113.5 KiB | 6,995 |
| 80 | 268 µs | 287 µs | 272 µs | 225.7 KiB | 3,731 |
| 160 | 455 µs | 486 µs | 1.66 ms | 450.0 KiB | 2,199 |
| 320 | 762 µs | 959 µs | 1.93 ms | 898.9 KiB | 1,313 |
| 640 | 1.41 ms | 1.45 ms | 2.66 ms | 1.8 MiB | 708 |
| 1280 | 2.71 ms | 2.75 ms | 3.65 ms | 3.5 MiB | 369 |
| 2560 | 5.11 ms | 5.25 ms | 5.29 ms | 6.9 MiB | 196 |
| 5120 | 10.7 ms | 11.0 ms | 10.8 ms | 13.8 MiB | 93 |
| 10240 | 22.3 ms | 23.1 ms | 22.7 ms | 27.7 MiB | 45 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.02, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 75.6 µs | 91.9 µs | 78.0 µs | 56.5 KiB | 13,220 |
| 40 | 140 µs | 158 µs | 143 µs | 111.8 KiB | 7,164 |
| 80 | 267 µs | 283 µs | 271 µs | 222.5 KiB | 3,746 |
| 160 | 449 µs | 471 µs | 1.60 ms | 443.7 KiB | 2,227 |
| 320 | 771 µs | 938 µs | 2.02 ms | 886.2 KiB | 1,298 |
| 640 | 1.42 ms | 1.45 ms | 2.88 ms | 1.7 MiB | 703 |
| 1280 | 2.63 ms | 2.68 ms | 4.25 ms | 3.5 MiB | 380 |
| 2560 | 5.16 ms | 5.45 ms | 6.38 ms | 6.9 MiB | 194 |
| 5120 | 10.9 ms | 11.7 ms | 13.7 ms | 13.8 MiB | 92 |
| 10240 | 24.0 ms | 24.2 ms | 29.2 ms | 27.7 MiB | 42 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 346 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 239 µs | 239 µs | 69% |
| `run-policies` | 1 | 99.3 µs | 99.3 µs | 29% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 8.29 µs | 2.4% |

**At 10240 checks** (whole operation: 55.9 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 31.1 ms | 31.1 ms | 56% |
| `run-policies` | 1 | 22.3 ms | 22.3 ms | 40% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 2.61 ms | 4.7% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-31T15:46:21.599Z` → `2026-10-31T15:47:41.050Z` (79 s), ci: CI (run 41215322995)
- Machine: AMD EPYC 9V74 80-Core Processor, 4 logical core(s) (2 physical), 15984 MB RAM, linux/x64, Node v24.22.1, GitHub Actions
- Git: `8b44c385e3a8b28ec92580870f90d28f676f6d52` on `dependabot/npm_and_yarn/dev-dependencies-6c9b387527`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

