# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **301 µs** per operation compared with a bare-minimum baseline (**141% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.97). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 301 µs | 46.8 ms |
| Added latency, relative to baseline | 141% | 210% |
| Added CPU time per operation | 681 µs | 49.8 ms |
| Added memory per operation (heap delta) | 345.9 KiB | 44.6 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,325 ops/s | 21 ops/s |

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
| 20 | 61.9 µs | 186 µs | 124 µs | 200% | 473 µs | $0.00026 – $0.0053 |
| 40 | 111 µs | 286 µs | 174 µs | 157% | 463 µs | $0.00036 – $0.0052 |
| 80 | 213 µs | 514 µs | 301 µs | 141% | 681 µs | $0.00063 – $0.0077 |
| 160 | 432 µs | 1.03 ms | 595 µs | 138% | 1.35 ms | $0.0012 – $0.015 |
| 320 | 775 µs | 1.86 ms | 1.08 ms | 140% | 1.76 ms | $0.0023 – $0.020 |
| 640 | 1.55 ms | 3.87 ms | 2.31 ms | 149% | 2.80 ms | $0.0048 – $0.031 |
| 1280 | 2.91 ms | 13.8 ms | 10.9 ms | 376% | 11.6 ms | $0.023 – $0.131 |
| 2560 | 5.64 ms | 21.0 ms | 15.4 ms | 272% | 15.9 ms | $0.032 – $0.179 |
| 5120 | 11.2 ms | 35.9 ms | 24.7 ms | 221% | 23.5 ms | $0.051 – $0.265 |
| 10240 | 22.2 ms | 69.0 ms | 46.8 ms | 210% | 49.8 ms | $0.097 – $0.560 |

**How the total grows:** O(n) (linear), exponent 0.97 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 315 µs | 38.6 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 3.00 ms | 409 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 151 µs | 27.4 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 202 µs | 36.0 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 154 µs | 28.3 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 213 µs | 37.5 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n) | 🟡 close (neighbouring class) | 77.5 µs | 9.98 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 289 µs | 428 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 765 µs | 96.6 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 7.83 ms | 1.49 s |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 286 µs | 31.0 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 333 µs | 65.2 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 350 µs | 27.1 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 358 µs | 28.3 ms |

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
| 20 | 93.9 µs | 97.7 µs | 307 µs | 52.9 KiB | 10,648 |
| 40 | 178 µs | 188 µs | 544 µs | 104.6 KiB | 5,631 |
| 80 | 315 µs | 328 µs | 804 µs | 211.4 KiB | 3,179 |
| 160 | 598 µs | 613 µs | 1.33 ms | 436.2 KiB | 1,673 |
| 320 | 1.20 ms | 1.30 ms | 2.73 ms | 938.9 KiB | 830 |
| 640 | 2.22 ms | 2.31 ms | 3.81 ms | 2.1 MiB | 451 |
| 1280 | 7.36 ms | 7.54 ms | 9.15 ms | 4.7 MiB | 136 |
| 2560 | 11.6 ms | 12.0 ms | 14.0 ms | 8.0 MiB | 86 |
| 5120 | 20.3 ms | 22.9 ms | 22.9 ms | 14.5 MiB | 49 |
| 10240 | 38.6 ms | 38.9 ms | 43.1 ms | 27.5 MiB | 26 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.05, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 797 µs | 812 µs | 1.57 ms | 294.9 KiB | 1,254 |
| 40 | 1.61 ms | 1.63 ms | 3.17 ms | 587.0 KiB | 623 |
| 80 | 3.00 ms | 3.60 ms | 4.72 ms | 1.1 MiB | 333 |
| 160 | 5.75 ms | 5.96 ms | 7.70 ms | 2.3 MiB | 174 |
| 320 | 11.2 ms | 11.5 ms | 13.7 ms | 4.7 MiB | 89 |
| 640 | 22.3 ms | 22.5 ms | 25.8 ms | 9.8 MiB | 45 |
| 1280 | 47.7 ms | 50.3 ms | 53.2 ms | 20.1 MiB | 21 |
| 2560 | 92.2 ms | 97.8 ms | 102 ms | 38.7 MiB | 11 |
| 5120 | 208 ms | 211 ms | 308 ms | 73.5 MiB | 5 |
| 10240 | 409 ms | 411 ms | 612 ms | 145.1 MiB | 2 |

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

**Measured: O(n)** (exponent 0.98, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 56.0 µs | 65.1 µs | 175 µs | 48.0 KiB | 17,842 |
| 40 | 82.3 µs | 111 µs | 272 µs | 92.6 KiB | 12,158 |
| 80 | 151 µs | 201 µs | 454 µs | 188.5 KiB | 6,618 |
| 160 | 299 µs | 415 µs | 911 µs | 393.8 KiB | 3,349 |
| 320 | 607 µs | 803 µs | 1.53 ms | 855.1 KiB | 1,648 |
| 640 | 1.39 ms | 1.80 ms | 3.21 ms | 1.9 MiB | 721 |
| 1280 | 5.88 ms | 6.18 ms | 8.29 ms | 4.4 MiB | 170 |
| 2560 | 8.23 ms | 8.64 ms | 11.2 ms | 7.3 MiB | 122 |
| 5120 | 13.6 ms | 14.2 ms | 17.8 ms | 13.2 MiB | 74 |
| 10240 | 27.4 ms | 27.6 ms | 35.7 ms | 24.6 MiB | 36 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.97, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 57.6 µs | 62.2 µs | 214 µs | 54.1 KiB | 17,361 |
| 40 | 106 µs | 123 µs | 372 µs | 107.1 KiB | 9,397 |
| 80 | 202 µs | 242 µs | 651 µs | 217.5 KiB | 4,957 |
| 160 | 436 µs | 518 µs | 1.47 ms | 452.9 KiB | 2,296 |
| 320 | 973 µs | 1.08 ms | 3.44 ms | 975.5 KiB | 1,028 |
| 640 | 1.97 ms | 2.35 ms | 5.67 ms | 2.2 MiB | 507 |
| 1280 | 7.31 ms | 7.96 ms | 13.3 ms | 4.9 MiB | 137 |
| 2560 | 10.5 ms | 10.7 ms | 20.1 ms | 8.3 MiB | 95 |
| 5120 | 18.5 ms | 19.8 ms | 35.5 ms | 15.1 MiB | 54 |
| 10240 | 36.0 ms | 37.5 ms | 69.6 ms | 28.1 MiB | 28 |

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

**Measured: O(n)** (exponent 0.96, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 49.5 µs | 53.3 µs | 181 µs | 47.0 KiB | 20,216 |
| 40 | 78.1 µs | 101 µs | 250 µs | 92.6 KiB | 12,809 |
| 80 | 154 µs | 210 µs | 479 µs | 188.5 KiB | 6,500 |
| 160 | 319 µs | 411 µs | 887 µs | 393.9 KiB | 3,135 |
| 320 | 772 µs | 884 µs | 1.61 ms | 856.0 KiB | 1,296 |
| 640 | 1.54 ms | 1.87 ms | 3.41 ms | 1.9 MiB | 649 |
| 1280 | 6.06 ms | 8.16 ms | 8.98 ms | 4.4 MiB | 165 |
| 2560 | 8.44 ms | 12.1 ms | 12.0 ms | 7.3 MiB | 118 |
| 5120 | 13.7 ms | 16.1 ms | 18.6 ms | 13.2 MiB | 73 |
| 10240 | 28.3 ms | 29.4 ms | 36.4 ms | 24.5 MiB | 35 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.96, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 60.1 µs | 66.5 µs | 63.0 µs | 54.3 KiB | 16,640 |
| 40 | 99.1 µs | 123 µs | 328 µs | 107.0 KiB | 10,086 |
| 80 | 213 µs | 248 µs | 658 µs | 217.5 KiB | 4,692 |
| 160 | 450 µs | 565 µs | 1.47 ms | 452.9 KiB | 2,222 |
| 320 | 1.04 ms | 1.22 ms | 3.55 ms | 975.7 KiB | 963 |
| 640 | 2.14 ms | 2.44 ms | 6.25 ms | 2.2 MiB | 467 |
| 1280 | 7.15 ms | 8.10 ms | 12.9 ms | 4.9 MiB | 140 |
| 2560 | 10.6 ms | 11.0 ms | 20.6 ms | 8.3 MiB | 94 |
| 5120 | 18.6 ms | 19.0 ms | 35.7 ms | 15.1 MiB | 54 |
| 10240 | 37.5 ms | 38.1 ms | 71.2 ms | 28.1 MiB | 27 |

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

**Measured: O(n)** (exponent 1.05, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 33.8 µs | 48.0 µs | 35.7 µs | 30.5 KiB | 29,550 |
| 40 | 45.0 µs | 56.6 µs | 155 µs | 55.2 KiB | 22,200 |
| 80 | 77.5 µs | 102 µs | 249 µs | 104.6 KiB | 12,909 |
| 160 | 150 µs | 203 µs | 462 µs | 208.3 KiB | 6,684 |
| 320 | 288 µs | 541 µs | 833 µs | 402.2 KiB | 3,473 |
| 640 | 513 µs | 772 µs | 1.39 ms | 821.1 KiB | 1,951 |
| 1280 | 1.24 ms | 1.32 ms | 3.26 ms | 1.3 MiB | 808 |
| 2560 | 2.33 ms | 2.45 ms | 4.98 ms | 2.7 MiB | 429 |
| 5120 | 4.76 ms | 4.88 ms | 8.74 ms | 5.5 MiB | 210 |
| 10240 | 9.98 ms | 10.1 ms | 16.8 ms | 10.8 MiB | 100 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent 0.00, 10 sizes) -- ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 280 µs | 304 µs | 867 µs | 620.2 KiB | 3,574 |
| 40 | 285 µs | 304 µs | 888 µs | 620.3 KiB | 3,506 |
| 80 | 289 µs | 324 µs | 882 µs | 626.2 KiB | 3,458 |
| 160 | 302 µs | 322 µs | 894 µs | 667.5 KiB | 3,312 |
| 320 | 332 µs | 358 µs | 925 µs | 716.3 KiB | 3,016 |
| 640 | 426 µs | 450 µs | 1.31 ms | 834.3 KiB | 2,345 |
| 1280 | 427 µs | 470 µs | 1.31 ms | 834.3 KiB | 2,343 |
| 2560 | 425 µs | 474 µs | 1.30 ms | 834.3 KiB | 2,355 |
| 5120 | 428 µs | 473 µs | 1.30 ms | 834.3 KiB | 2,337 |
| 10240 | 428 µs | 448 µs | 1.31 ms | 834.3 KiB | 2,336 |

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
| 20 | 203 µs | 217 µs | 578 µs | 45.6 KiB | 4,931 |
| 40 | 398 µs | 423 µs | 1.15 ms | 90.2 KiB | 2,511 |
| 80 | 765 µs | 792 µs | 1.58 ms | 178.6 KiB | 1,307 |
| 160 | 1.50 ms | 1.57 ms | 3.05 ms | 357.2 KiB | 667 |
| 320 | 2.72 ms | 2.91 ms | 4.67 ms | 712.3 KiB | 368 |
| 640 | 5.33 ms | 5.44 ms | 7.48 ms | 1.4 MiB | 188 |
| 1280 | 10.5 ms | 10.8 ms | 12.9 ms | 2.8 MiB | 95 |
| 2560 | 20.8 ms | 21.2 ms | 23.2 ms | 5.7 MiB | 48 |
| 5120 | 42.0 ms | 42.5 ms | 43.3 ms | 11.3 MiB | 24 |
| 10240 | 96.6 ms | 96.9 ms | 97.0 ms | 22.7 MiB | 10 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.11, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.29 ms | 2.43 ms | 4.20 ms | 599.8 KiB | 437 |
| 40 | 4.12 ms | 4.32 ms | 6.10 ms | 1.2 MiB | 243 |
| 80 | 7.83 ms | 8.03 ms | 10.0 ms | 2.3 MiB | 128 |
| 160 | 15.1 ms | 15.5 ms | 17.2 ms | 4.6 MiB | 66 |
| 320 | 29.8 ms | 30.1 ms | 30.2 ms | 9.3 MiB | 34 |
| 640 | 67.3 ms | 67.9 ms | 67.8 ms | 18.5 MiB | 15 |
| 1280 | 169 ms | 170 ms | 169 ms | 37.0 MiB | 6 |
| 2560 | 357 ms | 374 ms | 357 ms | 73.9 MiB | 3 |
| 5120 | 736 ms | 758 ms | 754 ms | 147.7 MiB | 1 |
| 10240 | 1.49 s | 1.49 s | 1.53 s | 295.3 MiB | 1 |

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
| 20 | 121 µs | 178 µs | 476 µs | 98.0 KiB | 8,257 |
| 40 | 169 µs | 228 µs | 527 µs | 179.0 KiB | 5,933 |
| 80 | 286 µs | 412 µs | 768 µs | 351.1 KiB | 3,500 |
| 160 | 505 µs | 569 µs | 1.25 ms | 637.9 KiB | 1,978 |
| 320 | 1.02 ms | 1.24 ms | 2.54 ms | 1.2 MiB | 977 |
| 640 | 1.80 ms | 1.98 ms | 3.35 ms | 2.5 MiB | 555 |
| 1280 | 3.44 ms | 3.55 ms | 5.14 ms | 4.9 MiB | 290 |
| 2560 | 6.88 ms | 7.35 ms | 8.78 ms | 9.9 MiB | 145 |
| 5120 | 14.3 ms | 15.2 ms | 17.1 ms | 19.8 MiB | 70 |
| 10240 | 31.0 ms | 31.5 ms | 35.8 ms | 39.6 MiB | 32 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.19, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 99.8 µs | 106 µs | 311 µs | 281.1 KiB | 10,021 |
| 40 | 185 µs | 195 µs | 552 µs | 540.1 KiB | 5,391 |
| 80 | 333 µs | 348 µs | 812 µs | 1.0 MiB | 2,999 |
| 160 | 650 µs | 692 µs | 1.41 ms | 2.1 MiB | 1,538 |
| 320 | 1.33 ms | 1.38 ms | 2.88 ms | 4.2 MiB | 750 |
| 640 | 2.49 ms | 2.62 ms | 4.14 ms | 8.3 MiB | 402 |
| 1280 | 4.99 ms | 5.18 ms | 7.01 ms | 16.7 MiB | 200 |
| 2560 | 10.1 ms | 10.8 ms | 12.9 ms | 33.3 MiB | 99 |
| 5120 | 26.9 ms | 27.6 ms | 30.9 ms | 52.0 MiB | 37 |
| 10240 | 65.2 ms | 67.1 ms | 76.2 ms | 103.7 MiB | 15 |

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
| 20 | 108 µs | 135 µs | 112 µs | 57.4 KiB | 9,269 |
| 40 | 187 µs | 210 µs | 191 µs | 113.5 KiB | 5,340 |
| 80 | 350 µs | 385 µs | 353 µs | 225.7 KiB | 2,861 |
| 160 | 553 µs | 601 µs | 1.84 ms | 450.0 KiB | 1,810 |
| 320 | 972 µs | 1.06 ms | 2.44 ms | 898.9 KiB | 1,029 |
| 640 | 1.78 ms | 1.88 ms | 3.27 ms | 1.8 MiB | 562 |
| 1280 | 3.47 ms | 3.59 ms | 4.66 ms | 3.5 MiB | 288 |
| 2560 | 6.44 ms | 7.04 ms | 6.88 ms | 6.9 MiB | 155 |
| 5120 | 13.8 ms | 14.3 ms | 14.0 ms | 13.8 MiB | 73 |
| 10240 | 27.1 ms | 28.8 ms | 27.6 ms | 27.7 MiB | 37 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.02, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 99.0 µs | 121 µs | 103 µs | 56.5 KiB | 10,105 |
| 40 | 184 µs | 205 µs | 189 µs | 111.8 KiB | 5,425 |
| 80 | 358 µs | 378 µs | 1.44 ms | 222.5 KiB | 2,790 |
| 160 | 580 µs | 605 µs | 2.05 ms | 443.7 KiB | 1,725 |
| 320 | 981 µs | 1.02 ms | 2.44 ms | 886.2 KiB | 1,019 |
| 640 | 1.73 ms | 1.79 ms | 3.22 ms | 1.7 MiB | 579 |
| 1280 | 3.23 ms | 3.27 ms | 4.95 ms | 3.5 MiB | 309 |
| 2560 | 6.35 ms | 6.55 ms | 7.55 ms | 6.9 MiB | 157 |
| 5120 | 14.3 ms | 17.3 ms | 17.2 ms | 13.8 MiB | 70 |
| 10240 | 28.3 ms | 29.7 ms | 33.9 ms | 27.7 MiB | 35 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 514 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 315 µs | 315 µs | 61% |
| `run-policies` | 1 | 151 µs | 151 µs | 29% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 48.5 µs | 9.4% |

**At 10240 checks** (whole operation: 69.0 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 38.6 ms | 38.6 ms | 56% |
| `run-policies` | 1 | 27.4 ms | 27.4 ms | 40% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 2.97 ms | 4.3% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-09T09:46:15.092Z` → `2026-11-09T09:47:51.514Z` (96 s), ci: CI (run 42593748511)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `8174d7883e1c73d3d989d548e209d56171e71a2c` on `dependabot/npm_and_yarn/internal-package-contract-v0.14.0`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

