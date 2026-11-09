# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **151 µs** per operation compared with a bare-minimum baseline (**139% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.03). At list prices that is on the order of **~$0.0001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 151 µs | 32.9 ms |
| Added latency, relative to baseline | 139% | 272% |
| Added CPU time per operation | 340 µs | 36.7 ms |
| Added memory per operation (heap delta) | 345.3 KiB | 44.7 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.0001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 6,610 ops/s | 30 ops/s |

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
| 20 | 32.6 µs | 84.2 µs | 51.6 µs | 158% | 170 µs | $0.00011 – $0.0019 |
| 40 | 55.7 µs | 134 µs | 78.6 µs | 141% | 198 µs | $0.00016 – $0.0022 |
| 80 | 109 µs | 260 µs | 151 µs | 139% | 340 µs | $0.00032 – $0.0038 |
| 160 | 208 µs | 507 µs | 300 µs | 144% | 599 µs | $0.00062 – $0.0067 |
| 320 | 403 µs | 915 µs | 511 µs | 127% | 741 µs | $0.0011 – $0.0083 |
| 640 | 786 µs | 2.04 ms | 1.25 ms | 160% | 2.24 ms | $0.0026 – $0.025 |
| 1280 | 1.58 ms | 8.07 ms | 6.50 ms | 412% | 7.29 ms | $0.014 – $0.082 |
| 2560 | 2.98 ms | 11.8 ms | 8.86 ms | 297% | 9.81 ms | $0.018 – $0.110 |
| 5120 | 6.13 ms | 20.9 ms | 14.8 ms | 241% | 16.7 ms | $0.031 – $0.188 |
| 10240 | 12.1 ms | 45.1 ms | 32.9 ms | 272% | 36.7 ms | $0.069 – $0.413 |

**How the total grows:** O(n) (linear), exponent 1.03 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 158 µs | 23.0 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 1.70 ms | 246 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 76.3 µs | 21.1 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 98.4 µs | 26.9 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 72.3 µs | 19.2 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 103 µs | 29.2 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n log n) | ✅ matches | 42.4 µs | 6.53 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 153 µs | 216 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 420 µs | 57.1 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 4.04 ms | 843 ms |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 145 µs | 24.0 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 213 µs | 49.7 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 203 µs | 19.1 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 200 µs | 17.2 ms |

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

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 57.9 µs | 61.1 µs | 222 µs | 52.9 KiB | 17,277 |
| 40 | 85.2 µs | 88.4 µs | 224 µs | 104.3 KiB | 11,734 |
| 80 | 158 µs | 180 µs | 354 µs | 211.1 KiB | 6,343 |
| 160 | 313 µs | 327 µs | 679 µs | 436.0 KiB | 3,199 |
| 320 | 604 µs | 692 µs | 1.20 ms | 938.5 KiB | 1,656 |
| 640 | 1.22 ms | 1.35 ms | 2.40 ms | 2.1 MiB | 817 |
| 1280 | 4.33 ms | 4.48 ms | 6.00 ms | 4.7 MiB | 231 |
| 2560 | 6.80 ms | 7.29 ms | 8.71 ms | 8.0 MiB | 147 |
| 5120 | 12.8 ms | 13.1 ms | 14.9 ms | 14.5 MiB | 78 |
| 10240 | 23.0 ms | 23.1 ms | 26.5 ms | 27.6 MiB | 44 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.08, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 457 µs | 477 µs | 1.00 ms | 294.9 KiB | 2,190 |
| 40 | 829 µs | 856 µs | 1.35 ms | 585.9 KiB | 1,207 |
| 80 | 1.70 ms | 2.21 ms | 2.97 ms | 1.1 MiB | 589 |
| 160 | 3.28 ms | 4.25 ms | 4.84 ms | 2.3 MiB | 305 |
| 320 | 6.46 ms | 12.5 ms | 9.03 ms | 4.7 MiB | 155 |
| 640 | 12.6 ms | 13.3 ms | 15.7 ms | 9.8 MiB | 80 |
| 1280 | 27.5 ms | 30.8 ms | 32.4 ms | 20.1 MiB | 36 |
| 2560 | 53.1 ms | 57.9 ms | 62.8 ms | 38.7 MiB | 19 |
| 5120 | 125 ms | 126 ms | 198 ms | 73.5 MiB | 8 |
| 10240 | 246 ms | 252 ms | 389 ms | 145.2 MiB | 4 |

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

**Measured: O(n log n)** (exponent 1.17, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 31.0 µs | 38.4 µs | 32.3 µs | 48.1 KiB | 32,302 |
| 40 | 43.6 µs | 52.2 µs | 145 µs | 92.5 KiB | 22,930 |
| 80 | 76.3 µs | 99.7 µs | 218 µs | 188.3 KiB | 13,112 |
| 160 | 143 µs | 152 µs | 370 µs | 393.0 KiB | 7,009 |
| 320 | 301 µs | 427 µs | 762 µs | 852.2 KiB | 3,326 |
| 640 | 605 µs | 804 µs | 1.28 ms | 1.9 MiB | 1,652 |
| 1280 | 3.31 ms | 3.50 ms | 5.58 ms | 4.4 MiB | 302 |
| 2560 | 5.15 ms | 5.56 ms | 7.94 ms | 7.3 MiB | 194 |
| 5120 | 9.34 ms | 14.4 ms | 12.9 ms | 13.2 MiB | 107 |
| 10240 | 21.1 ms | 40.2 ms | 29.5 ms | 24.4 MiB | 47 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.04, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 31.1 µs | 36.7 µs | 31.6 µs | 54.2 KiB | 32,170 |
| 40 | 49.4 µs | 60.9 µs | 155 µs | 106.9 KiB | 20,263 |
| 80 | 98.4 µs | 122 µs | 307 µs | 217.2 KiB | 10,161 |
| 160 | 197 µs | 263 µs | 568 µs | 451.1 KiB | 5,065 |
| 320 | 464 µs | 555 µs | 1.41 ms | 970.6 KiB | 2,157 |
| 640 | 1.26 ms | 1.62 ms | 3.94 ms | 2.2 MiB | 793 |
| 1280 | 4.87 ms | 5.18 ms | 10.2 ms | 4.9 MiB | 206 |
| 2560 | 7.33 ms | 7.76 ms | 14.8 ms | 8.3 MiB | 136 |
| 5120 | 14.7 ms | 15.5 ms | 28.5 ms | 15.0 MiB | 68 |
| 10240 | 26.9 ms | 28.4 ms | 51.3 ms | 28.2 MiB | 37 |

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
| 20 | 27.9 µs | 33.7 µs | 30.5 µs | 47.0 KiB | 35,890 |
| 40 | 39.4 µs | 51.1 µs | 123 µs | 92.5 KiB | 25,375 |
| 80 | 72.3 µs | 99.6 µs | 190 µs | 188.2 KiB | 13,831 |
| 160 | 153 µs | 195 µs | 435 µs | 393.6 KiB | 6,519 |
| 320 | 284 µs | 423 µs | 660 µs | 843.2 KiB | 3,526 |
| 640 | 675 µs | 919 µs | 1.40 ms | 1.9 MiB | 1,481 |
| 1280 | 3.31 ms | 3.75 ms | 5.14 ms | 4.4 MiB | 303 |
| 2560 | 5.14 ms | 5.69 ms | 7.93 ms | 7.3 MiB | 195 |
| 5120 | 9.33 ms | 9.84 ms | 13.0 ms | 13.2 MiB | 107 |
| 10240 | 19.2 ms | 19.7 ms | 26.4 ms | 24.4 MiB | 52 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 34.6 µs | 39.7 µs | 86.4 µs | 54.2 KiB | 28,921 |
| 40 | 50.5 µs | 63.5 µs | 158 µs | 106.9 KiB | 19,803 |
| 80 | 103 µs | 135 µs | 318 µs | 217.2 KiB | 9,731 |
| 160 | 220 µs | 277 µs | 684 µs | 451.7 KiB | 4,547 |
| 320 | 538 µs | 738 µs | 1.59 ms | 970.6 KiB | 1,860 |
| 640 | 1.50 ms | 1.69 ms | 4.71 ms | 2.2 MiB | 668 |
| 1280 | 5.17 ms | 5.53 ms | 10.8 ms | 4.9 MiB | 193 |
| 2560 | 7.22 ms | 8.23 ms | 15.3 ms | 8.3 MiB | 139 |
| 5120 | 13.7 ms | 14.8 ms | 26.8 ms | 15.1 MiB | 73 |
| 10240 | 29.2 ms | 30.0 ms | 54.5 ms | 28.1 MiB | 34 |

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

**Measured: O(n log n)** (exponent 1.30, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 22.9 µs | 30.9 µs | 27.2 µs | 30.5 KiB | 43,657 |
| 40 | 23.8 µs | 30.9 µs | 86.2 µs | 55.2 KiB | 42,043 |
| 80 | 42.4 µs | 70.7 µs | 141 µs | 104.6 KiB | 23,601 |
| 160 | 73.0 µs | 95.9 µs | 204 µs | 206.7 KiB | 13,692 |
| 320 | 144 µs | 209 µs | 405 µs | 401.9 KiB | 6,932 |
| 640 | 155 µs | 167 µs | 425 µs | 612.2 KiB | 6,457 |
| 1280 | 729 µs | 774 µs | 1.58 ms | 1.3 MiB | 1,371 |
| 2560 | 1.65 ms | 1.81 ms | 3.96 ms | 2.7 MiB | 605 |
| 5120 | 3.46 ms | 3.73 ms | 6.75 ms | 5.5 MiB | 289 |
| 10240 | 6.53 ms | 6.78 ms | 12.3 ms | 10.8 MiB | 153 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent -0.01, 10 sizes) -- ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 149 µs | 168 µs | 405 µs | 614.2 KiB | 6,720 |
| 40 | 157 µs | 176 µs | 433 µs | 628.1 KiB | 6,377 |
| 80 | 153 µs | 174 µs | 403 µs | 628.3 KiB | 6,525 |
| 160 | 169 µs | 201 µs | 489 µs | 663.4 KiB | 5,924 |
| 320 | 188 µs | 210 µs | 528 µs | 722.7 KiB | 5,313 |
| 640 | 222 µs | 268 µs | 645 µs | 829.2 KiB | 4,504 |
| 1280 | 214 µs | 238 µs | 546 µs | 826.6 KiB | 4,667 |
| 2560 | 221 µs | 247 µs | 647 µs | 829.2 KiB | 4,522 |
| 5120 | 211 µs | 237 µs | 535 µs | 826.6 KiB | 4,747 |
| 10240 | 216 µs | 239 µs | 623 µs | 829.2 KiB | 4,622 |

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

**Measured: O(n)** (exponent 1.08, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 100 µs | 110 µs | 285 µs | 50.5 KiB | 9,984 |
| 40 | 164 µs | 175 µs | 348 µs | 115.3 KiB | 6,104 |
| 80 | 420 µs | 449 µs | 1.00 ms | 178.6 KiB | 2,382 |
| 160 | 737 µs | 831 µs | 1.48 ms | 355.8 KiB | 1,356 |
| 320 | 1.45 ms | 1.64 ms | 2.98 ms | 712.3 KiB | 692 |
| 640 | 2.66 ms | 2.85 ms | 4.40 ms | 1.4 MiB | 376 |
| 1280 | 5.62 ms | 5.91 ms | 7.65 ms | 2.8 MiB | 178 |
| 2560 | 11.0 ms | 11.3 ms | 13.3 ms | 5.7 MiB | 91 |
| 5120 | 22.2 ms | 22.7 ms | 22.8 ms | 11.3 MiB | 45 |
| 10240 | 57.1 ms | 57.4 ms | 57.5 ms | 22.7 MiB | 18 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.13, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.30 ms | 1.49 ms | 2.87 ms | 599.8 KiB | 769 |
| 40 | 2.27 ms | 2.49 ms | 3.98 ms | 1.2 MiB | 441 |
| 80 | 4.04 ms | 4.28 ms | 5.87 ms | 2.3 MiB | 247 |
| 160 | 7.71 ms | 7.96 ms | 9.42 ms | 4.6 MiB | 130 |
| 320 | 14.8 ms | 15.0 ms | 15.3 ms | 9.3 MiB | 68 |
| 640 | 36.6 ms | 37.5 ms | 37.1 ms | 18.5 MiB | 27 |
| 1280 | 88.2 ms | 91.5 ms | 88.8 ms | 37.0 MiB | 11 |
| 2560 | 203 ms | 204 ms | 204 ms | 73.9 MiB | 5 |
| 5120 | 419 ms | 422 ms | 434 ms | 147.7 MiB | 2 |
| 10240 | 843 ms | 862 ms | 863 ms | 295.3 MiB | 1 |

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

**Measured: O(n log n)** (exponent 1.12, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 68.0 µs | 100 µs | 151 µs | 98.0 KiB | 14,712 |
| 40 | 80.2 µs | 113 µs | 206 µs | 178.9 KiB | 12,464 |
| 80 | 145 µs | 171 µs | 400 µs | 322.2 KiB | 6,884 |
| 160 | 267 µs | 305 µs | 613 µs | 637.6 KiB | 3,750 |
| 320 | 511 µs | 549 µs | 1.04 ms | 1.2 MiB | 1,955 |
| 640 | 1.04 ms | 1.17 ms | 2.15 ms | 2.5 MiB | 965 |
| 1280 | 2.04 ms | 2.23 ms | 3.15 ms | 4.9 MiB | 490 |
| 2560 | 4.40 ms | 5.06 ms | 6.20 ms | 9.9 MiB | 227 |
| 5120 | 9.10 ms | 9.35 ms | 11.4 ms | 19.8 MiB | 110 |
| 10240 | 24.0 ms | 33.1 ms | 28.9 ms | 39.6 MiB | 42 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.24, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 62.2 µs | 67.3 µs | 214 µs | 281.1 KiB | 16,072 |
| 40 | 109 µs | 115 µs | 290 µs | 539.2 KiB | 9,151 |
| 80 | 213 µs | 227 µs | 553 µs | 1.0 MiB | 4,700 |
| 160 | 405 µs | 438 µs | 934 µs | 2.1 MiB | 2,471 |
| 320 | 798 µs | 851 µs | 1.35 ms | 4.2 MiB | 1,254 |
| 640 | 1.67 ms | 1.77 ms | 2.85 ms | 8.3 MiB | 599 |
| 1280 | 3.37 ms | 3.63 ms | 5.04 ms | 16.7 MiB | 297 |
| 2560 | 6.77 ms | 7.34 ms | 9.01 ms | 33.3 MiB | 148 |
| 5120 | 20.7 ms | 22.1 ms | 24.3 ms | 52.0 MiB | 48 |
| 10240 | 49.7 ms | 52.7 ms | 59.4 ms | 103.7 MiB | 20 |

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

**Measured: O(n)** (exponent 1.03, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 59.4 µs | 76.5 µs | 63.0 µs | 57.3 KiB | 16,838 |
| 40 | 103 µs | 124 µs | 106 µs | 113.3 KiB | 9,735 |
| 80 | 203 µs | 225 µs | 207 µs | 225.5 KiB | 4,933 |
| 160 | 349 µs | 382 µs | 1.40 ms | 450.0 KiB | 2,865 |
| 320 | 592 µs | 675 µs | 1.65 ms | 898.7 KiB | 1,690 |
| 640 | 1.13 ms | 1.24 ms | 2.37 ms | 1.8 MiB | 886 |
| 1280 | 1.90 ms | 2.20 ms | 2.03 ms | 3.5 MiB | 526 |
| 2560 | 3.95 ms | 4.33 ms | 4.15 ms | 6.9 MiB | 253 |
| 5120 | 8.24 ms | 8.83 ms | 8.74 ms | 13.8 MiB | 121 |
| 10240 | 19.1 ms | 19.8 ms | 19.7 ms | 27.7 MiB | 52 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 56.5 µs | 69.9 µs | 59.0 µs | 56.4 KiB | 17,685 |
| 40 | 107 µs | 116 µs | 111 µs | 111.7 KiB | 9,371 |
| 80 | 200 µs | 232 µs | 204 µs | 222.3 KiB | 4,998 |
| 160 | 351 µs | 390 µs | 1.36 ms | 443.6 KiB | 2,852 |
| 320 | 610 µs | 671 µs | 1.86 ms | 886.1 KiB | 1,640 |
| 640 | 1.06 ms | 1.13 ms | 2.45 ms | 1.7 MiB | 947 |
| 1280 | 2.00 ms | 2.02 ms | 3.50 ms | 3.5 MiB | 501 |
| 2560 | 3.89 ms | 4.04 ms | 5.21 ms | 6.9 MiB | 257 |
| 5120 | 8.42 ms | 9.18 ms | 11.3 ms | 13.8 MiB | 119 |
| 10240 | 17.2 ms | 17.3 ms | 21.9 ms | 27.7 MiB | 58 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 260 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 158 µs | 158 µs | 61% |
| `run-policies` | 1 | 76.3 µs | 76.3 µs | 29% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 26.0 µs | 10% |

**At 10240 checks** (whole operation: 45.1 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 23.0 ms | 23.0 ms | 51% |
| `run-policies` | 1 | 21.1 ms | 21.1 ms | 47% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 978 µs | 2.2% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-09T20:14:23.026Z` → `2026-11-09T20:15:30.288Z` (67 s), ci: CI (run 42688972549)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `6a44026fb94c96831f0f0a3fd88fd58afb21b25c` on `chore/bump-internal-package-contract-v0.16.0`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

