# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend, and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **323 µs** per operation compared with a bare-minimum baseline (**152% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.87). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones. Both come from the same run, so they depend far less on the machine than a time does. Runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below). They show scale, not a budget.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 323 µs | 45.2 ms |
| Added latency, relative to baseline | 152% | 255% |
| Added CPU time per operation | 1.55 ms | 48.5 ms |
| Added memory per operation (heap delta) | 353.9 KiB | 45.1 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,095 ops/s | 22 ops/s |

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
| 20 | 67.6 µs | 211 µs | 143 µs | 211% | 149 µs | $0.0003 – $0.0017 |
| 40 | 112 µs | 324 µs | 213 µs | 191% | 828 µs | $0.00044 – $0.0093 |
| 80 | 213 µs | 531 µs | 323 µs | 152% | 1.55 ms | $0.00067 – $0.017 |
| 160 | 405 µs | 941 µs | 520 µs | 128% | 525 µs | $0.0011 – $0.0059 |
| 320 | 680 µs | 1.94 ms | 1.28 ms | 188% | 1.30 ms | $0.0027 – $0.015 |
| 640 | 1.23 ms | 5.13 ms | 3.92 ms | 318% | 4.09 ms | $0.0082 – $0.046 |
| 1280 | 2.34 ms | 11.8 ms | 9.48 ms | 405% | 10.1 ms | $0.020 – $0.113 |
| 2560 | 4.47 ms | 17.9 ms | 13.4 ms | 299% | 14.3 ms | $0.028 – $0.161 |
| 5120 | 8.94 ms | 32.6 ms | 23.8 ms | 266% | 25.7 ms | $0.050 – $0.288 |
| 10240 | 17.7 ms | 62.8 ms | 45.2 ms | 255% | 48.5 ms | $0.094 – $0.545 |

**How the total grows:** O(n) (linear), exponent 0.87 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder. Its measured growth rate is then compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report. Either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 227 µs | 33.3 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 2.31 ms | 325 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 99.6 µs | 24.1 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 139 µs | 32.8 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 107 µs | 24.5 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 144 µs | 34.1 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n log n) | ✅ matches | 66.9 µs | 8.56 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 214 µs | 303 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 568 µs | 74.1 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 5.79 ms | 1.12 s |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 223 µs | 27.2 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 289 µs | 68.5 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 268 µs | 23.5 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 269 µs | 26.2 ms |

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

**Measured: O(n)** (exponent 1.01, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 76.0 µs | 81.9 µs | 213 µs | 52.8 KiB | 13,158 |
| 40 | 153 µs | 161 µs | 404 µs | 104.5 KiB | 6,521 |
| 80 | 227 µs | 235 µs | 537 µs | 211.2 KiB | 4,406 |
| 160 | 456 µs | 501 µs | 1.08 ms | 436.3 KiB | 2,194 |
| 320 | 852 µs | 894 µs | 1.52 ms | 938.5 KiB | 1,174 |
| 640 | 1.74 ms | 1.88 ms | 3.11 ms | 2.1 MiB | 574 |
| 1280 | 6.34 ms | 6.77 ms | 7.86 ms | 4.7 MiB | 158 |
| 2560 | 9.84 ms | 10.2 ms | 11.9 ms | 8.0 MiB | 102 |
| 5120 | 18.5 ms | 19.7 ms | 20.4 ms | 14.5 MiB | 54 |
| 10240 | 33.3 ms | 36.4 ms | 37.4 ms | 27.6 MiB | 30 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.06, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 616 µs | 628 µs | 1.26 ms | 294.9 KiB | 1,624 |
| 40 | 1.23 ms | 1.25 ms | 2.56 ms | 587.1 KiB | 815 |
| 80 | 2.31 ms | 2.83 ms | 3.78 ms | 1.1 MiB | 433 |
| 160 | 4.43 ms | 4.53 ms | 6.21 ms | 2.3 MiB | 226 |
| 320 | 8.68 ms | 8.77 ms | 11.0 ms | 4.7 MiB | 115 |
| 640 | 17.2 ms | 17.6 ms | 20.4 ms | 9.8 MiB | 58 |
| 1280 | 37.0 ms | 37.4 ms | 41.9 ms | 20.1 MiB | 27 |
| 2560 | 71.9 ms | 78.0 ms | 82.3 ms | 38.7 MiB | 14 |
| 5120 | 165 ms | 169 ms | 248 ms | 73.5 MiB | 6 |
| 10240 | 325 ms | 329 ms | 493 ms | 145.3 MiB | 3 |

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

**Measured: O(n)** (exponent 1.07, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 39.1 µs | 47.6 µs | 39.8 µs | 48.2 KiB | 25,568 |
| 40 | 52.6 µs | 73.0 µs | 168 µs | 92.5 KiB | 19,026 |
| 80 | 99.6 µs | 133 µs | 293 µs | 188.3 KiB | 10,042 |
| 160 | 199 µs | 274 µs | 597 µs | 393.3 KiB | 5,013 |
| 320 | 438 µs | 588 µs | 1.23 ms | 855.2 KiB | 2,283 |
| 640 | 959 µs | 1.22 ms | 2.15 ms | 1.9 MiB | 1,043 |
| 1280 | 4.88 ms | 5.57 ms | 7.00 ms | 4.4 MiB | 205 |
| 2560 | 7.08 ms | 7.87 ms | 9.83 ms | 7.3 MiB | 141 |
| 5120 | 12.8 ms | 13.4 ms | 16.9 ms | 13.1 MiB | 78 |
| 10240 | 24.1 ms | 24.6 ms | 31.1 ms | 24.3 MiB | 41 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.98, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 40.7 µs | 44.4 µs | 166 µs | 54.1 KiB | 24,566 |
| 40 | 65.7 µs | 83.2 µs | 203 µs | 106.9 KiB | 15,232 |
| 80 | 139 µs | 172 µs | 438 µs | 217.3 KiB | 7,177 |
| 160 | 293 µs | 371 µs | 912 µs | 451.7 KiB | 3,410 |
| 320 | 623 µs | 775 µs | 1.79 ms | 965.7 KiB | 1,606 |
| 640 | 1.74 ms | 2.06 ms | 4.93 ms | 2.2 MiB | 575 |
| 1280 | 6.54 ms | 6.83 ms | 12.1 ms | 4.9 MiB | 153 |
| 2560 | 9.44 ms | 9.88 ms | 17.9 ms | 8.3 MiB | 106 |
| 5120 | 16.5 ms | 17.3 ms | 31.4 ms | 15.0 MiB | 61 |
| 10240 | 32.8 ms | 36.4 ms | 62.3 ms | 27.9 MiB | 30 |

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

**Measured: O(n)** (exponent 1.05, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 32.6 µs | 36.2 µs | 131 µs | 46.9 KiB | 30,670 |
| 40 | 56.2 µs | 69.4 µs | 194 µs | 92.6 KiB | 17,780 |
| 80 | 107 µs | 137 µs | 319 µs | 188.3 KiB | 9,315 |
| 160 | 207 µs | 287 µs | 615 µs | 393.6 KiB | 4,830 |
| 320 | 457 µs | 617 µs | 1.29 ms | 856.1 KiB | 2,188 |
| 640 | 1.07 ms | 1.33 ms | 2.65 ms | 1.9 MiB | 939 |
| 1280 | 4.97 ms | 5.91 ms | 7.26 ms | 4.4 MiB | 201 |
| 2560 | 6.84 ms | 7.61 ms | 9.62 ms | 7.3 MiB | 146 |
| 5120 | 13.3 ms | 29.0 ms | 18.2 ms | 13.1 MiB | 75 |
| 10240 | 24.5 ms | 25.4 ms | 31.9 ms | 24.2 MiB | 41 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.00, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 41.3 µs | 46.2 µs | 133 µs | 54.2 KiB | 24,205 |
| 40 | 68.1 µs | 85.6 µs | 217 µs | 106.9 KiB | 14,693 |
| 80 | 144 µs | 176 µs | 448 µs | 217.3 KiB | 6,960 |
| 160 | 293 µs | 371 µs | 873 µs | 451.7 KiB | 3,409 |
| 320 | 662 µs | 805 µs | 1.86 ms | 970.6 KiB | 1,510 |
| 640 | 1.74 ms | 2.33 ms | 5.06 ms | 2.2 MiB | 576 |
| 1280 | 6.52 ms | 6.88 ms | 12.3 ms | 4.9 MiB | 153 |
| 2560 | 9.66 ms | 10.4 ms | 18.1 ms | 8.3 MiB | 104 |
| 5120 | 17.4 ms | 17.9 ms | 33.0 ms | 15.1 MiB | 58 |
| 10240 | 34.1 ms | 42.4 ms | 62.8 ms | 27.9 MiB | 29 |

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

**Measured: O(n log n)** (exponent 1.22, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 24.5 µs | 34.7 µs | 31.0 µs | 30.4 KiB | 40,827 |
| 40 | 30.9 µs | 36.8 µs | 102 µs | 55.1 KiB | 32,353 |
| 80 | 66.9 µs | 88.4 µs | 255 µs | 104.5 KiB | 14,943 |
| 160 | 104 µs | 162 µs | 300 µs | 204.7 KiB | 9,637 |
| 320 | 217 µs | 273 µs | 634 µs | 401.5 KiB | 4,610 |
| 640 | 256 µs | 542 µs | 1.01 ms | 599.5 KiB | 3,912 |
| 1280 | 992 µs | 1.06 ms | 2.75 ms | 1.3 MiB | 1,008 |
| 2560 | 1.94 ms | 2.27 ms | 4.24 ms | 2.7 MiB | 514 |
| 5120 | 4.03 ms | 4.32 ms | 7.57 ms | 5.5 MiB | 248 |
| 10240 | 8.56 ms | 8.81 ms | 15.1 ms | 10.8 MiB | 117 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent -0.01, 10 sizes): ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 208 µs | 232 µs | 593 µs | 615.8 KiB | 4,802 |
| 40 | 210 µs | 235 µs | 586 µs | 617.6 KiB | 4,764 |
| 80 | 214 µs | 239 µs | 597 µs | 623.8 KiB | 4,669 |
| 160 | 238 µs | 254 µs | 740 µs | 666.7 KiB | 4,193 |
| 320 | 247 µs | 304 µs | 636 µs | 722.4 KiB | 4,041 |
| 640 | 303 µs | 362 µs | 815 µs | 828.2 KiB | 3,303 |
| 1280 | 330 µs | 374 µs | 1.10 ms | 833.1 KiB | 3,033 |
| 2560 | 295 µs | 327 µs | 800 µs | 828.1 KiB | 3,386 |
| 5120 | 303 µs | 385 µs | 821 µs | 828.1 KiB | 3,297 |
| 10240 | 303 µs | 327 µs | 817 µs | 828.1 KiB | 3,303 |

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

**Measured: O(n)** (exponent 1.05, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 144 µs | 155 µs | 402 µs | 45.5 KiB | 6,968 |
| 40 | 270 µs | 286 µs | 718 µs | 115.7 KiB | 3,699 |
| 80 | 568 µs | 618 µs | 1.26 ms | 178.6 KiB | 1,760 |
| 160 | 1.10 ms | 1.13 ms | 2.49 ms | 357.3 KiB | 907 |
| 320 | 2.01 ms | 2.19 ms | 3.75 ms | 712.3 KiB | 498 |
| 640 | 3.83 ms | 4.01 ms | 5.67 ms | 1.4 MiB | 261 |
| 1280 | 7.75 ms | 8.04 ms | 10.0 ms | 2.8 MiB | 129 |
| 2560 | 15.5 ms | 15.8 ms | 18.0 ms | 5.7 MiB | 65 |
| 5120 | 30.7 ms | 31.3 ms | 32.1 ms | 11.3 MiB | 33 |
| 10240 | 74.1 ms | 74.7 ms | 74.5 ms | 22.7 MiB | 13 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.11, 10 sizes): 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.72 ms | 1.89 ms | 3.43 ms | 599.8 KiB | 583 |
| 40 | 3.08 ms | 3.24 ms | 4.90 ms | 1.2 MiB | 325 |
| 80 | 5.79 ms | 5.95 ms | 7.82 ms | 2.3 MiB | 173 |
| 160 | 11.1 ms | 22.1 ms | 13.3 ms | 4.6 MiB | 90 |
| 320 | 21.7 ms | 21.9 ms | 22.2 ms | 9.3 MiB | 46 |
| 640 | 51.2 ms | 52.0 ms | 51.9 ms | 18.5 MiB | 20 |
| 1280 | 122 ms | 129 ms | 122 ms | 37.0 MiB | 8 |
| 2560 | 269 ms | 271 ms | 269 ms | 73.9 MiB | 4 |
| 5120 | 546 ms | 565 ms | 562 ms | 147.7 MiB | 2 |
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

**Measured: O(n)** (exponent 1.07, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 90.2 µs | 125 µs | 349 µs | 98.0 KiB | 11,090 |
| 40 | 125 µs | 164 µs | 370 µs | 179.0 KiB | 8,029 |
| 80 | 223 µs | 307 µs | 624 µs | 328.4 KiB | 4,486 |
| 160 | 367 µs | 394 µs | 782 µs | 637.7 KiB | 2,726 |
| 320 | 717 µs | 797 µs | 1.37 ms | 1.2 MiB | 1,395 |
| 640 | 1.44 ms | 1.67 ms | 2.79 ms | 2.5 MiB | 692 |
| 1280 | 2.78 ms | 3.01 ms | 4.00 ms | 4.9 MiB | 359 |
| 2560 | 5.75 ms | 6.20 ms | 7.63 ms | 9.9 MiB | 174 |
| 5120 | 13.0 ms | 26.0 ms | 15.7 ms | 19.8 MiB | 77 |
| 10240 | 27.2 ms | 27.8 ms | 31.7 ms | 39.6 MiB | 37 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.20, 10 sizes): 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 84.3 µs | 95.0 µs | 289 µs | 281.1 KiB | 11,863 |
| 40 | 150 µs | 170 µs | 398 µs | 539.5 KiB | 6,689 |
| 80 | 289 µs | 360 µs | 690 µs | 1.0 MiB | 3,462 |
| 160 | 579 µs | 660 µs | 1.22 ms | 2.1 MiB | 1,728 |
| 320 | 1.24 ms | 1.45 ms | 2.56 ms | 4.2 MiB | 808 |
| 640 | 2.56 ms | 5.11 ms | 4.19 ms | 8.3 MiB | 390 |
| 1280 | 4.97 ms | 5.30 ms | 7.00 ms | 16.7 MiB | 201 |
| 2560 | 10.1 ms | 10.7 ms | 12.8 ms | 33.3 MiB | 99 |
| 5120 | 28.4 ms | 29.1 ms | 32.1 ms | 51.9 MiB | 35 |
| 10240 | 68.5 ms | 69.7 ms | 78.7 ms | 103.7 MiB | 15 |

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

**Measured: O(n)** (exponent 1.00, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 85.7 µs | 111 µs | 89.0 µs | 57.4 KiB | 11,668 |
| 40 | 143 µs | 172 µs | 146 µs | 113.5 KiB | 7,006 |
| 80 | 268 µs | 292 µs | 272 µs | 225.7 KiB | 3,729 |
| 160 | 458 µs | 514 µs | 1.70 ms | 450.0 KiB | 2,183 |
| 320 | 788 µs | 920 µs | 2.05 ms | 898.9 KiB | 1,270 |
| 640 | 1.50 ms | 1.81 ms | 2.88 ms | 1.8 MiB | 666 |
| 1280 | 2.76 ms | 2.97 ms | 3.76 ms | 3.5 MiB | 362 |
| 2560 | 5.37 ms | 5.79 ms | 5.76 ms | 6.9 MiB | 186 |
| 5120 | 11.2 ms | 11.9 ms | 11.3 ms | 13.8 MiB | 89 |
| 10240 | 23.5 ms | 23.9 ms | 23.9 ms | 27.7 MiB | 42 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.06, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 77.0 µs | 91.2 µs | 80.0 µs | 56.5 KiB | 12,981 |
| 40 | 143 µs | 161 µs | 147 µs | 111.8 KiB | 6,981 |
| 80 | 269 µs | 284 µs | 274 µs | 222.5 KiB | 3,712 |
| 160 | 468 µs | 505 µs | 1.82 ms | 443.7 KiB | 2,137 |
| 320 | 786 µs | 939 µs | 2.22 ms | 886.2 KiB | 1,272 |
| 640 | 1.38 ms | 1.44 ms | 2.83 ms | 1.7 MiB | 726 |
| 1280 | 2.74 ms | 2.86 ms | 4.82 ms | 3.5 MiB | 365 |
| 2560 | 5.33 ms | 6.30 ms | 7.31 ms | 6.9 MiB | 187 |
| 5120 | 11.8 ms | 24.6 ms | 14.9 ms | 13.8 MiB | 85 |
| 10240 | 26.2 ms | 26.9 ms | 31.8 ms | 27.7 MiB | 38 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls. So where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time). Every moment of the operation then belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly. They are not measured against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 531 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 227 µs | 227 µs | 43% |
| `run-policies` | 1 | 99.6 µs | 99.6 µs | 19% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 205 µs | 39% |

**At 10240 checks** (whole operation: 62.8 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 33.3 ms | 33.3 ms | 53% |
| `run-policies` | 1 | 24.1 ms | 24.1 ms | 38% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 5.40 ms | 8.6% |

## Cost model

Estimates use two bracketing price shapes. **Low** is CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time). **High** is duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-17T20:29:36.177Z` → `2026-11-17T20:30:54.100Z` (78 s), ci: CI (run 44167179680)
- Machine: AMD EPYC 9V74 80-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `a818d5635be77d2a10710078525555624f69cf5c` on `fix/round7-gaps`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks: One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They show how _this_ package's cost changes between runs on comparable hardware, and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

