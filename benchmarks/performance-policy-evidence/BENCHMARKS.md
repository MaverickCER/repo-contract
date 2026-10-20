# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **286 µs** per operation compared with a bare-minimum baseline (**135% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.97). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 286 µs | 41.6 ms |
| Added latency, relative to baseline | 135% | 191% |
| Added CPU time per operation | 660 µs | 46.0 ms |
| Added memory per operation (heap delta) | 345.9 KiB | 44.1 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,494 ops/s | 24 ops/s |

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
| 20 | 62.4 µs | 183 µs | 121 µs | 194% | 466 µs | $0.00025 – $0.0052 |
| 40 | 115 µs | 280 µs | 165 µs | 143% | 417 µs | $0.00034 – $0.0047 |
| 80 | 212 µs | 498 µs | 286 µs | 135% | 660 µs | $0.0006 – $0.0074 |
| 160 | 432 µs | 996 µs | 564 µs | 131% | 1.34 ms | $0.0012 – $0.015 |
| 320 | 760 µs | 1.76 ms | 1.00 ms | 132% | 1.75 ms | $0.0021 – $0.020 |
| 640 | 1.53 ms | 3.49 ms | 1.96 ms | 129% | 2.39 ms | $0.0041 – $0.027 |
| 1280 | 2.84 ms | 12.9 ms | 10.0 ms | 352% | 10.5 ms | $0.021 – $0.118 |
| 2560 | 5.50 ms | 18.6 ms | 13.1 ms | 237% | 13.4 ms | $0.027 – $0.151 |
| 5120 | 10.8 ms | 32.5 ms | 21.7 ms | 200% | 23.0 ms | $0.045 – $0.259 |
| 10240 | 21.8 ms | 63.4 ms | 41.6 ms | 191% | 46.0 ms | $0.087 – $0.517 |

**How the total grows:** O(n) (linear), exponent 0.97 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 312 µs | 37.1 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 2.96 ms | 407 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 148 µs | 25.1 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 180 µs | 36.0 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 166 µs | 24.9 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 192 µs | 36.3 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n log n) | ✅ matches | 79.9 µs | 9.05 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 285 µs | 417 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 841 µs | 78.9 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n) | ✅ matches | 7.82 ms | 921 ms |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 275 µs | 28.1 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 335 µs | 61.3 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 364 µs | 26.9 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 354 µs | 27.2 ms |

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

**Measured: O(n)** (exponent 0.96, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 93.3 µs | 99.9 µs | 307 µs | 52.9 KiB | 10,720 |
| 40 | 176 µs | 196 µs | 552 µs | 104.6 KiB | 5,681 |
| 80 | 312 µs | 321 µs | 807 µs | 211.4 KiB | 3,205 |
| 160 | 591 µs | 604 µs | 1.33 ms | 436.3 KiB | 1,693 |
| 320 | 1.16 ms | 1.24 ms | 2.67 ms | 938.9 KiB | 859 |
| 640 | 2.15 ms | 2.41 ms | 3.75 ms | 2.1 MiB | 465 |
| 1280 | 7.13 ms | 7.24 ms | 8.77 ms | 4.7 MiB | 140 |
| 2560 | 11.0 ms | 12.3 ms | 12.9 ms | 8.0 MiB | 91 |
| 5120 | 19.2 ms | 20.8 ms | 21.4 ms | 14.5 MiB | 52 |
| 10240 | 37.1 ms | 37.4 ms | 41.3 ms | 27.6 MiB | 27 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.06, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 802 µs | 822 µs | 1.57 ms | 294.9 KiB | 1,247 |
| 40 | 1.59 ms | 1.61 ms | 3.18 ms | 587.1 KiB | 628 |
| 80 | 2.96 ms | 3.47 ms | 4.67 ms | 1.1 MiB | 337 |
| 160 | 5.67 ms | 5.87 ms | 7.66 ms | 2.3 MiB | 176 |
| 320 | 11.1 ms | 11.2 ms | 13.4 ms | 4.7 MiB | 90 |
| 640 | 21.9 ms | 22.1 ms | 25.2 ms | 9.8 MiB | 46 |
| 1280 | 46.6 ms | 48.4 ms | 51.9 ms | 20.1 MiB | 21 |
| 2560 | 90.0 ms | 96.6 ms | 99.8 ms | 38.7 MiB | 11 |
| 5120 | 205 ms | 207 ms | 302 ms | 73.5 MiB | 5 |
| 10240 | 407 ms | 410 ms | 609 ms | 145.2 MiB | 2 |

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
| 20 | 59.8 µs | 73.2 µs | 63.0 µs | 48.1 KiB | 16,733 |
| 40 | 78.1 µs | 116 µs | 261 µs | 92.5 KiB | 12,809 |
| 80 | 148 µs | 201 µs | 452 µs | 188.5 KiB | 6,777 |
| 160 | 287 µs | 404 µs | 900 µs | 393.8 KiB | 3,481 |
| 320 | 547 µs | 755 µs | 1.48 ms | 853.7 KiB | 1,830 |
| 640 | 1.17 ms | 1.55 ms | 2.94 ms | 1.9 MiB | 858 |
| 1280 | 5.09 ms | 6.09 ms | 7.60 ms | 4.4 MiB | 196 |
| 2560 | 7.08 ms | 7.37 ms | 10.2 ms | 7.3 MiB | 141 |
| 5120 | 12.3 ms | 12.9 ms | 16.6 ms | 13.2 MiB | 81 |
| 10240 | 25.1 ms | 25.9 ms | 32.7 ms | 24.8 MiB | 40 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.02, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 57.5 µs | 61.9 µs | 197 µs | 54.1 KiB | 17,388 |
| 40 | 102 µs | 120 µs | 349 µs | 107.0 KiB | 9,820 |
| 80 | 180 µs | 239 µs | 574 µs | 217.3 KiB | 5,566 |
| 160 | 354 µs | 479 µs | 1.10 ms | 451.7 KiB | 2,823 |
| 320 | 704 µs | 917 µs | 2.05 ms | 970.6 KiB | 1,420 |
| 640 | 1.69 ms | 1.98 ms | 5.15 ms | 2.2 MiB | 593 |
| 1280 | 6.67 ms | 6.99 ms | 13.0 ms | 4.9 MiB | 150 |
| 2560 | 10.1 ms | 11.0 ms | 20.3 ms | 8.3 MiB | 99 |
| 5120 | 17.3 ms | 17.7 ms | 35.1 ms | 15.1 MiB | 58 |
| 10240 | 36.0 ms | 36.7 ms | 71.6 ms | 28.1 MiB | 28 |

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

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 51.4 µs | 59.6 µs | 54.1 µs | 47.0 KiB | 19,459 |
| 40 | 80.4 µs | 103 µs | 255 µs | 92.6 KiB | 12,432 |
| 80 | 166 µs | 208 µs | 554 µs | 188.7 KiB | 6,032 |
| 160 | 343 µs | 438 µs | 945 µs | 393.9 KiB | 2,919 |
| 320 | 613 µs | 823 µs | 1.55 ms | 855.9 KiB | 1,632 |
| 640 | 1.25 ms | 1.68 ms | 3.03 ms | 1.9 MiB | 798 |
| 1280 | 5.16 ms | 5.67 ms | 7.82 ms | 4.4 MiB | 194 |
| 2560 | 7.69 ms | 8.31 ms | 10.8 ms | 7.3 MiB | 130 |
| 5120 | 12.5 ms | 13.3 ms | 16.7 ms | 13.2 MiB | 80 |
| 10240 | 24.9 ms | 26.1 ms | 32.7 ms | 24.6 MiB | 40 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.03, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 58.1 µs | 63.5 µs | 178 µs | 54.2 KiB | 17,204 |
| 40 | 92.3 µs | 104 µs | 296 µs | 107.0 KiB | 10,840 |
| 80 | 192 µs | 251 µs | 641 µs | 217.5 KiB | 5,204 |
| 160 | 350 µs | 475 µs | 1.08 ms | 451.7 KiB | 2,860 |
| 320 | 713 µs | 928 µs | 2.05 ms | 956.4 KiB | 1,402 |
| 640 | 1.75 ms | 2.30 ms | 5.39 ms | 2.2 MiB | 572 |
| 1280 | 6.36 ms | 6.79 ms | 12.3 ms | 4.9 MiB | 157 |
| 2560 | 9.66 ms | 10.0 ms | 20.0 ms | 8.3 MiB | 103 |
| 5120 | 18.0 ms | 18.7 ms | 36.0 ms | 15.1 MiB | 56 |
| 10240 | 36.3 ms | 36.8 ms | 72.3 ms | 28.0 MiB | 28 |

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

**Measured: O(n log n)** (exponent 1.15, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 31.6 µs | 46.5 µs | 34.1 µs | 30.5 KiB | 31,680 |
| 40 | 43.9 µs | 56.3 µs | 145 µs | 55.2 KiB | 22,796 |
| 80 | 79.9 µs | 148 µs | 252 µs | 104.6 KiB | 12,513 |
| 160 | 151 µs | 204 µs | 468 µs | 208.3 KiB | 6,625 |
| 320 | 287 µs | 402 µs | 843 µs | 402.2 KiB | 3,482 |
| 640 | 325 µs | 608 µs | 1.21 ms | 604.1 KiB | 3,074 |
| 1280 | 1.14 ms | 1.22 ms | 3.17 ms | 1.3 MiB | 875 |
| 2560 | 2.13 ms | 2.26 ms | 4.67 ms | 2.7 MiB | 469 |
| 5120 | 4.34 ms | 4.46 ms | 8.16 ms | 5.5 MiB | 231 |
| 10240 | 9.05 ms | 9.17 ms | 15.6 ms | 10.8 MiB | 110 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent -0.00, 10 sizes) -- ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 281 µs | 298 µs | 871 µs | 620.2 KiB | 3,561 |
| 40 | 282 µs | 312 µs | 877 µs | 620.3 KiB | 3,544 |
| 80 | 285 µs | 300 µs | 867 µs | 626.2 KiB | 3,503 |
| 160 | 302 µs | 338 µs | 887 µs | 667.5 KiB | 3,317 |
| 320 | 324 µs | 359 µs | 905 µs | 716.3 KiB | 3,087 |
| 640 | 420 µs | 482 µs | 1.29 ms | 834.3 KiB | 2,379 |
| 1280 | 418 µs | 484 µs | 1.28 ms | 834.3 KiB | 2,392 |
| 2560 | 417 µs | 435 µs | 1.29 ms | 834.3 KiB | 2,400 |
| 5120 | 417 µs | 480 µs | 1.29 ms | 834.3 KiB | 2,398 |
| 10240 | 417 µs | 440 µs | 1.29 ms | 834.3 KiB | 2,399 |

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

**Measured: O(n)** (exponent 0.98, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 204 µs | 220 µs | 585 µs | 45.6 KiB | 4,908 |
| 40 | 423 µs | 451 µs | 1.20 ms | 90.2 KiB | 2,364 |
| 80 | 841 µs | 891 µs | 1.64 ms | 178.6 KiB | 1,189 |
| 160 | 1.54 ms | 1.60 ms | 3.13 ms | 357.3 KiB | 649 |
| 320 | 2.85 ms | 2.90 ms | 4.74 ms | 712.3 KiB | 351 |
| 640 | 5.14 ms | 5.29 ms | 7.10 ms | 1.4 MiB | 194 |
| 1280 | 10.2 ms | 10.5 ms | 12.4 ms | 2.8 MiB | 98 |
| 2560 | 19.3 ms | 20.0 ms | 22.0 ms | 5.7 MiB | 52 |
| 5120 | 38.1 ms | 38.3 ms | 41.8 ms | 11.3 MiB | 26 |
| 10240 | 78.9 ms | 79.4 ms | 84.1 ms | 22.7 MiB | 13 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.02, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.42 ms | 2.57 ms | 4.28 ms | 599.8 KiB | 414 |
| 40 | 4.27 ms | 4.44 ms | 6.16 ms | 1.2 MiB | 234 |
| 80 | 7.82 ms | 8.09 ms | 9.82 ms | 2.3 MiB | 128 |
| 160 | 14.3 ms | 15.0 ms | 16.8 ms | 4.6 MiB | 70 |
| 320 | 26.9 ms | 27.8 ms | 29.8 ms | 9.3 MiB | 37 |
| 640 | 53.6 ms | 53.8 ms | 57.5 ms | 18.5 MiB | 19 |
| 1280 | 114 ms | 115 ms | 120 ms | 37.0 MiB | 9 |
| 2560 | 234 ms | 239 ms | 243 ms | 73.9 MiB | 4 |
| 5120 | 462 ms | 463 ms | 481 ms | 147.7 MiB | 2 |
| 10240 | 921 ms | 927 ms | 958 ms | 295.3 MiB | 1 |

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

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 108 µs | 175 µs | 393 µs | 97.9 KiB | 9,223 |
| 40 | 157 µs | 236 µs | 446 µs | 178.9 KiB | 6,378 |
| 80 | 275 µs | 403 µs | 758 µs | 322.3 KiB | 3,641 |
| 160 | 496 µs | 578 µs | 1.23 ms | 637.8 KiB | 2,015 |
| 320 | 879 µs | 984 µs | 1.63 ms | 1.2 MiB | 1,137 |
| 640 | 1.78 ms | 1.96 ms | 3.33 ms | 2.5 MiB | 560 |
| 1280 | 3.33 ms | 3.45 ms | 4.50 ms | 4.9 MiB | 300 |
| 2560 | 6.78 ms | 6.99 ms | 8.88 ms | 9.9 MiB | 148 |
| 5120 | 13.1 ms | 14.0 ms | 16.0 ms | 19.8 MiB | 76 |
| 10240 | 28.1 ms | 29.1 ms | 32.5 ms | 39.6 MiB | 36 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.17, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 98.3 µs | 106 µs | 307 µs | 281.1 KiB | 10,176 |
| 40 | 173 µs | 194 µs | 536 µs | 540.1 KiB | 5,769 |
| 80 | 335 µs | 407 µs | 826 µs | 1.0 MiB | 2,989 |
| 160 | 646 µs | 681 µs | 1.41 ms | 2.1 MiB | 1,549 |
| 320 | 1.30 ms | 1.41 ms | 2.86 ms | 4.2 MiB | 772 |
| 640 | 2.43 ms | 2.60 ms | 4.05 ms | 8.3 MiB | 411 |
| 1280 | 4.81 ms | 5.03 ms | 6.75 ms | 16.7 MiB | 208 |
| 2560 | 9.69 ms | 10.4 ms | 12.3 ms | 33.3 MiB | 103 |
| 5120 | 25.5 ms | 26.5 ms | 29.7 ms | 52.0 MiB | 39 |
| 10240 | 61.3 ms | 63.4 ms | 72.1 ms | 103.7 MiB | 16 |

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
| 20 | 108 µs | 135 µs | 112 µs | 57.3 KiB | 9,247 |
| 40 | 190 µs | 213 µs | 194 µs | 113.3 KiB | 5,261 |
| 80 | 364 µs | 395 µs | 369 µs | 225.5 KiB | 2,749 |
| 160 | 580 µs | 665 µs | 2.00 ms | 450.0 KiB | 1,724 |
| 320 | 973 µs | 1.14 ms | 2.41 ms | 898.7 KiB | 1,028 |
| 640 | 1.74 ms | 1.86 ms | 3.20 ms | 1.8 MiB | 575 |
| 1280 | 3.27 ms | 3.37 ms | 4.67 ms | 3.5 MiB | 306 |
| 2560 | 6.28 ms | 6.40 ms | 6.70 ms | 6.9 MiB | 159 |
| 5120 | 12.8 ms | 13.0 ms | 12.8 ms | 13.8 MiB | 78 |
| 10240 | 26.9 ms | 27.4 ms | 27.3 ms | 27.7 MiB | 37 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 98.3 µs | 124 µs | 103 µs | 56.4 KiB | 10,169 |
| 40 | 186 µs | 209 µs | 193 µs | 111.7 KiB | 5,373 |
| 80 | 354 µs | 375 µs | 1.17 ms | 222.3 KiB | 2,825 |
| 160 | 582 µs | 666 µs | 1.95 ms | 443.6 KiB | 1,718 |
| 320 | 964 µs | 1.00 ms | 2.38 ms | 886.1 KiB | 1,038 |
| 640 | 1.76 ms | 1.81 ms | 3.27 ms | 1.7 MiB | 570 |
| 1280 | 3.28 ms | 3.31 ms | 5.06 ms | 3.5 MiB | 305 |
| 2560 | 6.44 ms | 6.58 ms | 7.88 ms | 6.9 MiB | 155 |
| 5120 | 13.1 ms | 13.4 ms | 16.0 ms | 13.8 MiB | 76 |
| 10240 | 27.2 ms | 32.4 ms | 32.6 ms | 27.7 MiB | 37 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 498 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 312 µs | 312 µs | 63% |
| `run-policies` | 1 | 148 µs | 148 µs | 30% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 38.9 µs | 7.8% |

**At 10240 checks** (whole operation: 63.4 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 37.1 ms | 37.1 ms | 59% |
| `run-policies` | 1 | 25.1 ms | 25.1 ms | 40% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 1.23 ms | 1.9% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-20T02:01:20.524Z` → `2026-10-20T02:02:48.489Z` (88 s), ci: CI (run 39355249621)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `9caf04b4ab765d7b8c0dfe0a98e734d2083782bd` on `chore/follow-ups`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

