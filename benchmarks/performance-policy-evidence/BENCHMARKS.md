# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **293 µs** per operation compared with a bare-minimum baseline (**137% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.98). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 293 µs | 42.2 ms |
| Added latency, relative to baseline | 137% | 195% |
| Added CPU time per operation | 680 µs | 45.1 ms |
| Added memory per operation (heap delta) | 345.9 KiB | 44.5 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,413 ops/s | 24 ops/s |

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
| 20 | 59.2 µs | 161 µs | 101 µs | 171% | 313 µs | $0.00021 – $0.0035 |
| 40 | 111 µs | 277 µs | 166 µs | 150% | 428 µs | $0.00035 – $0.0048 |
| 80 | 214 µs | 507 µs | 293 µs | 137% | 680 µs | $0.00061 – $0.0076 |
| 160 | 431 µs | 999 µs | 568 µs | 132% | 1.24 ms | $0.0012 – $0.014 |
| 320 | 768 µs | 1.78 ms | 1.01 ms | 132% | 1.74 ms | $0.0021 – $0.020 |
| 640 | 1.55 ms | 3.39 ms | 1.84 ms | 119% | 2.16 ms | $0.0038 – $0.024 |
| 1280 | 2.90 ms | 12.8 ms | 9.89 ms | 341% | 10.4 ms | $0.021 – $0.117 |
| 2560 | 5.58 ms | 19.7 ms | 14.1 ms | 252% | 14.6 ms | $0.029 – $0.164 |
| 5120 | 11.0 ms | 33.1 ms | 22.1 ms | 201% | 24.8 ms | $0.046 – $0.279 |
| 10240 | 21.7 ms | 63.8 ms | 42.2 ms | 195% | 45.1 ms | $0.088 – $0.507 |

**How the total grows:** O(n) (linear), exponent 0.98 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 318 µs | 36.5 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 3.00 ms | 409 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 154 µs | 26.3 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 191 µs | 35.0 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 163 µs | 26.0 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 178 µs | 35.3 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n) | 🟡 close (neighbouring class) | 79.5 µs | 9.24 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 288 µs | 422 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 920 µs | 97.8 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 8.04 ms | 1.53 s |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 276 µs | 26.6 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 318 µs | 58.2 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 363 µs | 27.6 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 353 µs | 27.8 ms |

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

**Measured: O(n)** (exponent 0.93, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 92.6 µs | 97.2 µs | 286 µs | 52.8 KiB | 10,797 |
| 40 | 163 µs | 175 µs | 425 µs | 104.4 KiB | 6,142 |
| 80 | 318 µs | 327 µs | 808 µs | 211.4 KiB | 3,141 |
| 160 | 601 µs | 643 µs | 1.34 ms | 436.2 KiB | 1,663 |
| 320 | 1.18 ms | 1.33 ms | 2.67 ms | 938.9 KiB | 847 |
| 640 | 2.18 ms | 2.42 ms | 3.73 ms | 2.1 MiB | 459 |
| 1280 | 8.46 ms | 8.92 ms | 9.55 ms | 4.7 MiB | 118 |
| 2560 | 11.2 ms | 13.5 ms | 13.2 ms | 8.0 MiB | 89 |
| 5120 | 19.1 ms | 19.3 ms | 21.0 ms | 14.5 MiB | 52 |
| 10240 | 36.5 ms | 36.9 ms | 40.3 ms | 27.6 MiB | 27 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.05, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 806 µs | 820 µs | 1.57 ms | 294.9 KiB | 1,241 |
| 40 | 1.60 ms | 1.63 ms | 3.16 ms | 587.0 KiB | 625 |
| 80 | 3.00 ms | 3.56 ms | 4.68 ms | 1.1 MiB | 333 |
| 160 | 5.68 ms | 5.71 ms | 7.60 ms | 2.3 MiB | 176 |
| 320 | 11.1 ms | 11.5 ms | 13.5 ms | 4.7 MiB | 90 |
| 640 | 22.3 ms | 22.4 ms | 25.6 ms | 9.8 MiB | 45 |
| 1280 | 47.0 ms | 50.2 ms | 52.6 ms | 20.1 MiB | 21 |
| 2560 | 90.8 ms | 101 ms | 101 ms | 38.7 MiB | 11 |
| 5120 | 207 ms | 211 ms | 304 ms | 73.5 MiB | 5 |
| 10240 | 409 ms | 412 ms | 609 ms | 145.2 MiB | 2 |

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
| 20 | 57.2 µs | 67.0 µs | 113 µs | 48.1 KiB | 17,480 |
| 40 | 81.9 µs | 112 µs | 267 µs | 92.6 KiB | 12,215 |
| 80 | 154 µs | 204 µs | 475 µs | 188.5 KiB | 6,512 |
| 160 | 297 µs | 440 µs | 904 µs | 393.8 KiB | 3,371 |
| 320 | 571 µs | 789 µs | 1.47 ms | 853.7 KiB | 1,752 |
| 640 | 1.22 ms | 1.66 ms | 2.95 ms | 1.9 MiB | 819 |
| 1280 | 5.53 ms | 5.91 ms | 7.76 ms | 4.4 MiB | 181 |
| 2560 | 7.37 ms | 7.66 ms | 10.1 ms | 7.3 MiB | 136 |
| 5120 | 12.9 ms | 14.6 ms | 17.1 ms | 13.2 MiB | 77 |
| 10240 | 26.3 ms | 26.6 ms | 33.3 ms | 24.6 MiB | 38 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 59.1 µs | 65.0 µs | 201 µs | 54.1 KiB | 16,921 |
| 40 | 94.0 µs | 121 µs | 298 µs | 107.0 KiB | 10,641 |
| 80 | 191 µs | 240 µs | 618 µs | 217.5 KiB | 5,235 |
| 160 | 403 µs | 498 µs | 1.41 ms | 452.9 KiB | 2,481 |
| 320 | 893 µs | 1.01 ms | 3.29 ms | 975.5 KiB | 1,120 |
| 640 | 1.82 ms | 2.23 ms | 5.38 ms | 2.2 MiB | 548 |
| 1280 | 6.65 ms | 7.56 ms | 12.4 ms | 4.9 MiB | 150 |
| 2560 | 10.0 ms | 10.5 ms | 19.9 ms | 8.3 MiB | 100 |
| 5120 | 18.0 ms | 19.9 ms | 35.3 ms | 15.1 MiB | 56 |
| 10240 | 35.0 ms | 35.7 ms | 67.7 ms | 28.3 MiB | 29 |

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

**Measured: O(n)** (exponent 1.02, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 49.8 µs | 53.2 µs | 150 µs | 47.0 KiB | 20,065 |
| 40 | 79.2 µs | 104 µs | 248 µs | 92.6 KiB | 12,622 |
| 80 | 163 µs | 209 µs | 495 µs | 188.5 KiB | 6,128 |
| 160 | 293 µs | 412 µs | 873 µs | 393.9 KiB | 3,417 |
| 320 | 554 µs | 761 µs | 1.37 ms | 852.6 KiB | 1,804 |
| 640 | 1.20 ms | 1.60 ms | 2.93 ms | 1.9 MiB | 835 |
| 1280 | 5.05 ms | 5.37 ms | 7.13 ms | 4.4 MiB | 198 |
| 2560 | 7.21 ms | 8.02 ms | 10.2 ms | 7.3 MiB | 139 |
| 5120 | 12.3 ms | 13.5 ms | 16.6 ms | 13.2 MiB | 82 |
| 10240 | 26.0 ms | 27.2 ms | 33.6 ms | 24.7 MiB | 38 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.04, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 59.1 µs | 63.3 µs | 123 µs | 54.2 KiB | 16,914 |
| 40 | 90.9 µs | 100 µs | 288 µs | 107.0 KiB | 11,000 |
| 80 | 178 µs | 237 µs | 575 µs | 217.3 KiB | 5,617 |
| 160 | 350 µs | 471 µs | 1.06 ms | 451.7 KiB | 2,858 |
| 320 | 688 µs | 909 µs | 1.94 ms | 970.6 KiB | 1,454 |
| 640 | 1.61 ms | 1.95 ms | 4.99 ms | 2.2 MiB | 621 |
| 1280 | 6.44 ms | 6.80 ms | 11.8 ms | 4.9 MiB | 155 |
| 2560 | 9.67 ms | 10.3 ms | 19.6 ms | 8.3 MiB | 103 |
| 5120 | 18.1 ms | 19.0 ms | 35.4 ms | 15.1 MiB | 55 |
| 10240 | 35.3 ms | 35.5 ms | 68.1 ms | 28.2 MiB | 28 |

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

**Measured: O(n)** (exponent 1.02, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 34.2 µs | 47.7 µs | 43.5 µs | 30.5 KiB | 29,214 |
| 40 | 43.6 µs | 56.2 µs | 142 µs | 55.2 KiB | 22,912 |
| 80 | 79.5 µs | 151 µs | 250 µs | 104.6 KiB | 12,573 |
| 160 | 153 µs | 205 µs | 473 µs | 208.3 KiB | 6,556 |
| 320 | 307 µs | 407 µs | 893 µs | 402.2 KiB | 3,261 |
| 640 | 523 µs | 782 µs | 1.40 ms | 821.1 KiB | 1,910 |
| 1280 | 1.15 ms | 1.20 ms | 3.14 ms | 1.3 MiB | 872 |
| 2560 | 2.16 ms | 2.21 ms | 4.66 ms | 2.7 MiB | 463 |
| 5120 | 4.44 ms | 4.53 ms | 8.17 ms | 5.5 MiB | 225 |
| 10240 | 9.24 ms | 9.32 ms | 15.5 ms | 10.8 MiB | 108 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent 0.00, 10 sizes) -- ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 279 µs | 301 µs | 853 µs | 620.2 KiB | 3,580 |
| 40 | 281 µs | 301 µs | 864 µs | 620.3 KiB | 3,554 |
| 80 | 288 µs | 299 µs | 852 µs | 626.2 KiB | 3,469 |
| 160 | 301 µs | 331 µs | 872 µs | 667.5 KiB | 3,323 |
| 320 | 327 µs | 359 µs | 898 µs | 716.3 KiB | 3,055 |
| 640 | 420 µs | 449 µs | 1.28 ms | 834.3 KiB | 2,382 |
| 1280 | 419 µs | 443 µs | 1.29 ms | 834.3 KiB | 2,388 |
| 2560 | 418 µs | 452 µs | 1.29 ms | 834.3 KiB | 2,391 |
| 5120 | 418 µs | 438 µs | 1.28 ms | 834.3 KiB | 2,390 |
| 10240 | 422 µs | 504 µs | 1.29 ms | 834.3 KiB | 2,372 |

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
| 20 | 226 µs | 262 µs | 725 µs | 45.8 KiB | 4,427 |
| 40 | 370 µs | 403 µs | 888 µs | 115.7 KiB | 2,700 |
| 80 | 920 µs | 987 µs | 2.38 ms | 179.3 KiB | 1,087 |
| 160 | 1.58 ms | 1.63 ms | 3.18 ms | 357.3 KiB | 633 |
| 320 | 2.81 ms | 3.03 ms | 4.69 ms | 712.3 KiB | 356 |
| 640 | 5.31 ms | 5.47 ms | 7.37 ms | 1.4 MiB | 188 |
| 1280 | 10.6 ms | 10.8 ms | 13.0 ms | 2.8 MiB | 94 |
| 2560 | 21.2 ms | 21.3 ms | 23.2 ms | 5.7 MiB | 47 |
| 5120 | 42.2 ms | 42.2 ms | 42.7 ms | 11.3 MiB | 24 |
| 10240 | 97.8 ms | 98.3 ms | 98.3 ms | 22.7 MiB | 10 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.11, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.43 ms | 2.58 ms | 4.26 ms | 599.8 KiB | 411 |
| 40 | 4.42 ms | 4.59 ms | 6.34 ms | 1.2 MiB | 226 |
| 80 | 8.04 ms | 8.17 ms | 9.88 ms | 2.3 MiB | 124 |
| 160 | 15.3 ms | 15.6 ms | 17.5 ms | 4.6 MiB | 65 |
| 320 | 30.6 ms | 30.8 ms | 31.1 ms | 9.3 MiB | 33 |
| 640 | 69.2 ms | 69.9 ms | 69.6 ms | 18.5 MiB | 14 |
| 1280 | 174 ms | 175 ms | 174 ms | 37.0 MiB | 6 |
| 2560 | 369 ms | 371 ms | 370 ms | 73.9 MiB | 3 |
| 5120 | 753 ms | 759 ms | 771 ms | 147.7 MiB | 1 |
| 10240 | 1.53 s | 1.54 s | 1.57 s | 295.3 MiB | 1 |

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
| 20 | 99.4 µs | 128 µs | 335 µs | 98.0 KiB | 10,059 |
| 40 | 168 µs | 211 µs | 519 µs | 179.0 KiB | 5,970 |
| 80 | 276 µs | 369 µs | 745 µs | 322.3 KiB | 3,623 |
| 160 | 496 µs | 583 µs | 1.21 ms | 637.9 KiB | 2,015 |
| 320 | 886 µs | 967 µs | 1.63 ms | 1.2 MiB | 1,128 |
| 640 | 1.74 ms | 1.88 ms | 3.22 ms | 2.5 MiB | 574 |
| 1280 | 3.30 ms | 3.56 ms | 4.84 ms | 4.9 MiB | 303 |
| 2560 | 6.54 ms | 6.69 ms | 8.38 ms | 9.9 MiB | 153 |
| 5120 | 13.2 ms | 13.4 ms | 15.8 ms | 19.8 MiB | 76 |
| 10240 | 26.6 ms | 26.9 ms | 30.8 ms | 39.6 MiB | 38 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.16, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 97.7 µs | 110 µs | 301 µs | 281.1 KiB | 10,233 |
| 40 | 170 µs | 186 µs | 456 µs | 539.5 KiB | 5,897 |
| 80 | 318 µs | 342 µs | 796 µs | 1.0 MiB | 3,143 |
| 160 | 635 µs | 683 µs | 1.37 ms | 2.1 MiB | 1,575 |
| 320 | 1.32 ms | 1.39 ms | 2.84 ms | 4.2 MiB | 758 |
| 640 | 2.37 ms | 2.51 ms | 3.92 ms | 8.3 MiB | 423 |
| 1280 | 4.77 ms | 5.03 ms | 6.63 ms | 16.7 MiB | 209 |
| 2560 | 9.41 ms | 9.58 ms | 11.7 ms | 33.3 MiB | 106 |
| 5120 | 24.8 ms | 27.4 ms | 28.4 ms | 52.0 MiB | 40 |
| 10240 | 58.2 ms | 59.7 ms | 68.2 ms | 103.7 MiB | 17 |

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
| 20 | 107 µs | 139 µs | 110 µs | 57.4 KiB | 9,370 |
| 40 | 193 µs | 217 µs | 196 µs | 113.5 KiB | 5,190 |
| 80 | 363 µs | 391 µs | 783 µs | 225.7 KiB | 2,754 |
| 160 | 583 µs | 625 µs | 2.00 ms | 450.0 KiB | 1,716 |
| 320 | 969 µs | 1.18 ms | 2.38 ms | 898.9 KiB | 1,032 |
| 640 | 1.77 ms | 1.95 ms | 3.15 ms | 1.8 MiB | 566 |
| 1280 | 3.22 ms | 3.37 ms | 3.52 ms | 3.5 MiB | 311 |
| 2560 | 6.58 ms | 6.69 ms | 6.86 ms | 7.0 MiB | 152 |
| 5120 | 13.5 ms | 13.7 ms | 13.5 ms | 14.0 MiB | 74 |
| 10240 | 27.6 ms | 28.2 ms | 28.0 ms | 28.1 MiB | 36 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 101 µs | 126 µs | 104 µs | 57.4 KiB | 9,874 |
| 40 | 186 µs | 211 µs | 190 µs | 113.5 KiB | 5,376 |
| 80 | 353 µs | 392 µs | 1.13 ms | 225.7 KiB | 2,832 |
| 160 | 570 µs | 594 µs | 1.86 ms | 450.0 KiB | 1,753 |
| 320 | 956 µs | 981 µs | 2.17 ms | 898.9 KiB | 1,046 |
| 640 | 1.77 ms | 1.84 ms | 3.23 ms | 1.8 MiB | 566 |
| 1280 | 3.43 ms | 3.51 ms | 5.29 ms | 3.5 MiB | 292 |
| 2560 | 6.72 ms | 7.01 ms | 8.56 ms | 7.0 MiB | 149 |
| 5120 | 13.6 ms | 13.9 ms | 16.7 ms | 14.0 MiB | 73 |
| 10240 | 27.8 ms | 28.8 ms | 33.3 ms | 28.1 MiB | 36 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 507 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 318 µs | 318 µs | 63% |
| `run-policies` | 1 | 154 µs | 154 µs | 30% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 35.3 µs | 7.0% |

**At 10240 checks** (whole operation: 63.8 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 36.5 ms | 36.5 ms | 57% |
| `run-policies` | 1 | 26.3 ms | 26.3 ms | 41% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 1.03 ms | 1.6% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-31T21:50:16.999Z` → `2026-10-31T21:51:52.757Z` (96 s), ci: CI (run 41244152041)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15984 MB RAM, linux/x64, Node v24.22.1, GitHub Actions
- Git: `adf4cccb5f3c050755fc7bb35e7e8dfe83f75be5` on `dependabot/npm_and_yarn/qs-6.17.1`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

