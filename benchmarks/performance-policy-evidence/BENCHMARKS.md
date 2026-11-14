# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend, and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **300 µs** per operation compared with a bare-minimum baseline (**142% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.86). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones. Both come from the same run, so they depend far less on the machine than a time does. Runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below). They show scale, not a budget.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 300 µs | 38.6 ms |
| Added latency, relative to baseline | 142% | 227% |
| Added CPU time per operation | 1.48 ms | 47.6 ms |
| Added memory per operation (heap delta) | 354.1 KiB | 44.8 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,332 ops/s | 26 ops/s |

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
| 20 | 65.5 µs | 188 µs | 125 µs | 190% | 124 µs | $0.00026 – $0.0014 |
| 40 | 110 µs | 321 µs | 199 µs | 181% | 594 µs | $0.00042 – $0.0067 |
| 80 | 211 µs | 510 µs | 300 µs | 142% | 1.48 ms | $0.00063 – $0.017 |
| 160 | 400 µs | 911 µs | 514 µs | 128% | 536 µs | $0.0011 – $0.006 |
| 320 | 671 µs | 1.92 ms | 1.24 ms | 184% | 1.28 ms | $0.0026 – $0.014 |
| 640 | 1.20 ms | 4.69 ms | 3.48 ms | 290% | 3.47 ms | $0.0072 – $0.039 |
| 1280 | 2.24 ms | 10.5 ms | 8.30 ms | 371% | 8.86 ms | $0.017 – $0.100 |
| 2560 | 4.42 ms | 16.3 ms | 11.9 ms | 268% | 12.2 ms | $0.025 – $0.137 |
| 5120 | 8.90 ms | 29.5 ms | 20.7 ms | 233% | 21.7 ms | $0.043 – $0.244 |
| 10240 | 17.0 ms | 55.7 ms | 38.6 ms | 227% | 47.6 ms | $0.080 – $0.536 |

**How the total grows:** O(n) (linear), exponent 0.86 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder. Its measured growth rate is then compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report. Either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 220 µs | 30.2 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 2.22 ms | 313 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 100 µs | 22.4 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 155 µs | 32.3 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 99.3 µs | 23.5 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 128 µs | 32.1 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n log n) | ✅ matches | 53.0 µs | 8.21 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 220 µs | 288 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 553 µs | 74.4 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n) | ✅ matches | 5.77 ms | 1.11 s |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 194 µs | 23.5 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 256 µs | 64.1 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 257 µs | 22.2 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 254 µs | 23.2 ms |

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

**Measured: O(n)** (exponent 0.98, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 64.2 µs | 75.6 µs | 189 µs | 52.8 KiB | 15,574 |
| 40 | 118 µs | 128 µs | 325 µs | 104.4 KiB | 8,470 |
| 80 | 220 µs | 237 µs | 533 µs | 211.2 KiB | 4,538 |
| 160 | 444 µs | 466 µs | 1.07 ms | 436.3 KiB | 2,252 |
| 320 | 814 µs | 890 µs | 1.46 ms | 938.5 KiB | 1,228 |
| 640 | 1.65 ms | 1.75 ms | 2.98 ms | 2.1 MiB | 605 |
| 1280 | 6.00 ms | 6.92 ms | 7.31 ms | 4.7 MiB | 167 |
| 2560 | 9.10 ms | 9.43 ms | 11.0 ms | 8.0 MiB | 110 |
| 5120 | 15.7 ms | 16.1 ms | 17.4 ms | 14.5 MiB | 64 |
| 10240 | 30.2 ms | 30.9 ms | 33.0 ms | 27.5 MiB | 33 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.07, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 597 µs | 605 µs | 1.23 ms | 294.9 KiB | 1,675 |
| 40 | 1.19 ms | 1.22 ms | 2.51 ms | 587.1 KiB | 838 |
| 80 | 2.22 ms | 2.71 ms | 3.64 ms | 1.1 MiB | 451 |
| 160 | 4.22 ms | 4.25 ms | 5.84 ms | 2.3 MiB | 237 |
| 320 | 8.23 ms | 8.29 ms | 10.2 ms | 4.7 MiB | 121 |
| 640 | 16.4 ms | 17.4 ms | 19.2 ms | 9.8 MiB | 61 |
| 1280 | 35.6 ms | 35.9 ms | 40.9 ms | 20.1 MiB | 28 |
| 2560 | 69.3 ms | 75.1 ms | 78.9 ms | 38.7 MiB | 14 |
| 5120 | 157 ms | 163 ms | 237 ms | 73.4 MiB | 6 |
| 10240 | 313 ms | 314 ms | 481 ms | 145.2 MiB | 3 |

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

**Measured: O(n)** (exponent 1.06, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 38.7 µs | 47.7 µs | 39.7 µs | 48.2 KiB | 25,825 |
| 40 | 55.0 µs | 72.3 µs | 180 µs | 92.5 KiB | 18,181 |
| 80 | 100 µs | 134 µs | 291 µs | 188.3 KiB | 9,972 |
| 160 | 196 µs | 273 µs | 545 µs | 393.1 KiB | 5,094 |
| 320 | 411 µs | 542 µs | 1.17 ms | 855.2 KiB | 2,435 |
| 640 | 897 µs | 1.16 ms | 2.38 ms | 1.9 MiB | 1,115 |
| 1280 | 4.26 ms | 4.55 ms | 6.42 ms | 4.4 MiB | 235 |
| 2560 | 5.92 ms | 6.28 ms | 8.27 ms | 7.3 MiB | 169 |
| 5120 | 10.4 ms | 13.4 ms | 14.1 ms | 13.2 MiB | 96 |
| 10240 | 22.4 ms | 24.5 ms | 29.8 ms | 24.4 MiB | 45 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.08, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 39.1 µs | 42.8 µs | 84.1 µs | 54.1 KiB | 25,573 |
| 40 | 77.7 µs | 84.0 µs | 219 µs | 106.9 KiB | 12,875 |
| 80 | 155 µs | 169 µs | 457 µs | 217.3 KiB | 6,462 |
| 160 | 266 µs | 336 µs | 800 µs | 451.7 KiB | 3,763 |
| 320 | 562 µs | 697 µs | 1.68 ms | 968.0 KiB | 1,779 |
| 640 | 1.28 ms | 1.49 ms | 4.15 ms | 2.2 MiB | 779 |
| 1280 | 5.79 ms | 6.25 ms | 10.9 ms | 4.9 MiB | 173 |
| 2560 | 8.63 ms | 9.10 ms | 17.1 ms | 8.3 MiB | 116 |
| 5120 | 16.0 ms | 28.8 ms | 31.0 ms | 15.1 MiB | 62 |
| 10240 | 32.3 ms | 36.2 ms | 60.7 ms | 28.1 MiB | 31 |

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
| 20 | 31.8 µs | 35.0 µs | 123 µs | 46.9 KiB | 31,457 |
| 40 | 51.0 µs | 65.3 µs | 156 µs | 92.5 KiB | 19,618 |
| 80 | 99.3 µs | 135 µs | 296 µs | 188.3 KiB | 10,070 |
| 160 | 194 µs | 276 µs | 555 µs | 393.4 KiB | 5,147 |
| 320 | 457 µs | 605 µs | 1.25 ms | 856.1 KiB | 2,187 |
| 640 | 932 µs | 1.19 ms | 2.06 ms | 1.9 MiB | 1,073 |
| 1280 | 4.67 ms | 5.23 ms | 6.80 ms | 4.4 MiB | 214 |
| 2560 | 6.13 ms | 6.73 ms | 8.72 ms | 7.3 MiB | 163 |
| 5120 | 10.3 ms | 11.4 ms | 14.0 ms | 13.2 MiB | 97 |
| 10240 | 23.5 ms | 28.4 ms | 30.7 ms | 24.3 MiB | 43 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.08, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 37.8 µs | 41.1 µs | 151 µs | 54.1 KiB | 26,475 |
| 40 | 61.4 µs | 78.9 µs | 184 µs | 106.9 KiB | 16,275 |
| 80 | 128 µs | 167 µs | 394 µs | 217.2 KiB | 7,824 |
| 160 | 276 µs | 346 µs | 864 µs | 451.7 KiB | 3,626 |
| 320 | 550 µs | 703 µs | 1.62 ms | 964.0 KiB | 1,817 |
| 640 | 1.27 ms | 1.51 ms | 4.18 ms | 2.2 MiB | 785 |
| 1280 | 5.77 ms | 5.99 ms | 11.0 ms | 4.9 MiB | 173 |
| 2560 | 9.00 ms | 9.54 ms | 17.5 ms | 8.3 MiB | 111 |
| 5120 | 15.9 ms | 16.4 ms | 30.9 ms | 14.5 MiB | 63 |
| 10240 | 32.1 ms | 32.3 ms | 59.8 ms | 28.1 MiB | 31 |

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

**Measured: O(n log n)** (exponent 1.30, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 23.7 µs | 33.1 µs | 30.2 µs | 30.4 KiB | 42,241 |
| 40 | 29.5 µs | 41.7 µs | 89.7 µs | 55.1 KiB | 33,952 |
| 80 | 53.0 µs | 69.6 µs | 154 µs | 104.5 KiB | 18,868 |
| 160 | 103 µs | 135 µs | 295 µs | 204.7 KiB | 9,667 |
| 320 | 193 µs | 218 µs | 536 µs | 401.5 KiB | 5,169 |
| 640 | 196 µs | 208 µs | 559 µs | 614.5 KiB | 5,105 |
| 1280 | 832 µs | 875 µs | 1.69 ms | 1.3 MiB | 1,202 |
| 2560 | 1.86 ms | 1.93 ms | 4.02 ms | 2.7 MiB | 538 |
| 5120 | 3.81 ms | 3.87 ms | 7.02 ms | 5.5 MiB | 262 |
| 10240 | 8.21 ms | 8.37 ms | 14.2 ms | 10.8 MiB | 122 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent -0.01, 10 sizes): ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 199 µs | 215 µs | 563 µs | 615.8 KiB | 5,037 |
| 40 | 201 µs | 219 µs | 571 µs | 617.6 KiB | 4,969 |
| 80 | 220 µs | 243 µs | 611 µs | 623.8 KiB | 4,556 |
| 160 | 223 µs | 242 µs | 600 µs | 662.5 KiB | 4,487 |
| 320 | 261 µs | 286 µs | 767 µs | 715.9 KiB | 3,837 |
| 640 | 294 µs | 314 µs | 795 µs | 828.1 KiB | 3,402 |
| 1280 | 295 µs | 330 µs | 791 µs | 828.1 KiB | 3,390 |
| 2560 | 286 µs | 308 µs | 772 µs | 828.1 KiB | 3,495 |
| 5120 | 288 µs | 310 µs | 779 µs | 828.1 KiB | 3,473 |
| 10240 | 288 µs | 309 µs | 779 µs | 828.1 KiB | 3,469 |

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

**Measured: O(n)** (exponent 1.06, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 142 µs | 149 µs | 395 µs | 45.5 KiB | 7,065 |
| 40 | 264 µs | 301 µs | 695 µs | 115.7 KiB | 3,785 |
| 80 | 553 µs | 585 µs | 1.23 ms | 178.6 KiB | 1,809 |
| 160 | 1.09 ms | 1.12 ms | 2.42 ms | 357.3 KiB | 920 |
| 320 | 2.05 ms | 2.09 ms | 3.65 ms | 712.3 KiB | 487 |
| 640 | 3.77 ms | 3.84 ms | 5.49 ms | 1.4 MiB | 265 |
| 1280 | 7.53 ms | 7.76 ms | 9.43 ms | 2.8 MiB | 133 |
| 2560 | 14.9 ms | 15.4 ms | 17.4 ms | 5.7 MiB | 67 |
| 5120 | 30.6 ms | 31.3 ms | 31.1 ms | 11.3 MiB | 33 |
| 10240 | 74.4 ms | 74.9 ms | 74.8 ms | 22.7 MiB | 13 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.10, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.69 ms | 1.80 ms | 3.24 ms | 599.8 KiB | 590 |
| 40 | 3.03 ms | 3.19 ms | 4.63 ms | 1.2 MiB | 330 |
| 80 | 5.77 ms | 5.89 ms | 7.51 ms | 2.3 MiB | 173 |
| 160 | 11.0 ms | 11.3 ms | 12.9 ms | 4.6 MiB | 91 |
| 320 | 21.8 ms | 22.0 ms | 22.2 ms | 9.3 MiB | 46 |
| 640 | 51.5 ms | 59.6 ms | 51.9 ms | 18.5 MiB | 19 |
| 1280 | 123 ms | 124 ms | 123 ms | 37.0 MiB | 8 |
| 2560 | 263 ms | 264 ms | 263 ms | 73.9 MiB | 4 |
| 5120 | 545 ms | 549 ms | 559 ms | 147.7 MiB | 2 |
| 10240 | 1.11 s | 1.12 s | 1.13 s | 295.3 MiB | 1 |

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

**Measured: O(n)** (exponent 1.04, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 74.9 µs | 94.3 µs | 272 µs | 98.0 KiB | 13,354 |
| 40 | 108 µs | 140 µs | 279 µs | 178.9 KiB | 9,226 |
| 80 | 194 µs | 218 µs | 497 µs | 322.2 KiB | 5,143 |
| 160 | 363 µs | 382 µs | 782 µs | 637.7 KiB | 2,757 |
| 320 | 701 µs | 744 µs | 1.34 ms | 1.2 MiB | 1,427 |
| 640 | 1.38 ms | 1.87 ms | 2.67 ms | 2.5 MiB | 724 |
| 1280 | 2.60 ms | 2.77 ms | 3.82 ms | 4.9 MiB | 385 |
| 2560 | 5.30 ms | 10.5 ms | 6.96 ms | 9.9 MiB | 189 |
| 5120 | 11.9 ms | 13.7 ms | 14.9 ms | 19.8 MiB | 84 |
| 10240 | 23.5 ms | 25.2 ms | 27.5 ms | 39.6 MiB | 43 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.22, 10 sizes): 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 72.0 µs | 82.7 µs | 245 µs | 281.1 KiB | 13,880 |
| 40 | 123 µs | 140 µs | 326 µs | 539.2 KiB | 8,141 |
| 80 | 256 µs | 321 µs | 649 µs | 1.0 MiB | 3,906 |
| 160 | 512 µs | 550 µs | 1.13 ms | 2.1 MiB | 1,954 |
| 320 | 1.11 ms | 1.17 ms | 2.40 ms | 4.2 MiB | 902 |
| 640 | 2.23 ms | 2.36 ms | 3.57 ms | 8.3 MiB | 449 |
| 1280 | 4.60 ms | 5.21 ms | 6.22 ms | 16.7 MiB | 217 |
| 2560 | 9.46 ms | 9.76 ms | 11.8 ms | 33.3 MiB | 106 |
| 5120 | 26.3 ms | 28.8 ms | 29.6 ms | 52.0 MiB | 38 |
| 10240 | 64.1 ms | 69.9 ms | 73.4 ms | 103.7 MiB | 16 |

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
| 20 | 77.8 µs | 105 µs | 81.0 µs | 57.3 KiB | 12,850 |
| 40 | 138 µs | 153 µs | 141 µs | 113.3 KiB | 7,269 |
| 80 | 257 µs | 273 µs | 261 µs | 225.5 KiB | 3,890 |
| 160 | 443 µs | 515 µs | 1.62 ms | 450.0 KiB | 2,256 |
| 320 | 736 µs | 860 µs | 1.92 ms | 898.7 KiB | 1,359 |
| 640 | 1.32 ms | 1.36 ms | 2.51 ms | 1.8 MiB | 760 |
| 1280 | 2.44 ms | 2.78 ms | 2.94 ms | 3.5 MiB | 409 |
| 2560 | 4.91 ms | 5.12 ms | 5.08 ms | 6.9 MiB | 203 |
| 5120 | 10.0 ms | 11.0 ms | 10.3 ms | 13.8 MiB | 100 |
| 10240 | 22.2 ms | 22.6 ms | 22.7 ms | 27.7 MiB | 45 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.02, 10 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 72.0 µs | 77.7 µs | 75.0 µs | 56.4 KiB | 13,884 |
| 40 | 132 µs | 146 µs | 136 µs | 111.7 KiB | 7,560 |
| 80 | 254 µs | 269 µs | 259 µs | 222.3 KiB | 3,930 |
| 160 | 430 µs | 459 µs | 1.51 ms | 443.6 KiB | 2,327 |
| 320 | 720 µs | 749 µs | 1.82 ms | 886.1 KiB | 1,390 |
| 640 | 1.35 ms | 1.43 ms | 2.73 ms | 1.7 MiB | 742 |
| 1280 | 2.55 ms | 2.73 ms | 4.06 ms | 3.5 MiB | 392 |
| 2560 | 5.12 ms | 5.22 ms | 6.47 ms | 6.9 MiB | 195 |
| 5120 | 10.5 ms | 10.8 ms | 13.4 ms | 13.8 MiB | 95 |
| 10240 | 23.2 ms | 23.6 ms | 28.1 ms | 27.7 MiB | 43 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls. So where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time). Every moment of the operation then belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly. They are not measured against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 510 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 220 µs | 220 µs | 43% |
| `run-policies` | 1 | 100 µs | 100 µs | 20% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 189 µs | 37% |

**At 10240 checks** (whole operation: 55.7 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 30.2 ms | 30.2 ms | 54% |
| `run-policies` | 1 | 22.4 ms | 22.4 ms | 40% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 3.11 ms | 5.6% |

## Cost model

Estimates use two bracketing price shapes. **Low** is CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time). **High** is duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-14T17:30:30.470Z` → `2026-11-14T17:31:46.516Z` (76 s), ci: CI (run 43620104979)
- Machine: AMD EPYC 9V74 80-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `deaaafc18b5426f07b59528132254f2852602af3` on `dependabot/npm_and_yarn/dev-dependencies-6f64cd0fc8`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks: One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They show how _this_ package's cost changes between runs on comparable hardware, and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

