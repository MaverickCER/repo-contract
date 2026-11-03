# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **288 µs** per operation compared with a bare-minimum baseline (**134% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.98). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 288 µs | 42.8 ms |
| Added latency, relative to baseline | 134% | 196% |
| Added CPU time per operation | 669 µs | 44.0 ms |
| Added memory per operation (heap delta) | 345.9 KiB | 44.5 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,473 ops/s | 23 ops/s |

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
| 20 | 60.3 µs | 162 µs | 101 µs | 168% | 329 µs | $0.00021 – $0.0037 |
| 40 | 111 µs | 277 µs | 166 µs | 149% | 425 µs | $0.00035 – $0.0048 |
| 80 | 215 µs | 503 µs | 288 µs | 134% | 669 µs | $0.0006 – $0.0075 |
| 160 | 427 µs | 1.01 ms | 580 µs | 136% | 1.38 ms | $0.0012 – $0.015 |
| 320 | 777 µs | 1.77 ms | 996 µs | 128% | 1.72 ms | $0.0021 – $0.019 |
| 640 | 1.56 ms | 3.44 ms | 1.88 ms | 120% | 2.28 ms | $0.0039 – $0.026 |
| 1280 | 2.89 ms | 12.8 ms | 9.92 ms | 343% | 10.5 ms | $0.021 – $0.119 |
| 2560 | 5.58 ms | 19.3 ms | 13.7 ms | 245% | 14.1 ms | $0.029 – $0.159 |
| 5120 | 11.0 ms | 33.2 ms | 22.2 ms | 202% | 24.8 ms | $0.046 – $0.279 |
| 10240 | 21.8 ms | 64.6 ms | 42.8 ms | 196% | 44.0 ms | $0.089 – $0.495 |

**How the total grows:** O(n) (linear), exponent 0.98 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 318 µs | 37.2 ms |
| `buildEvidence` (chatty-output) | check | O(n) | O(n) | ✅ matches | 3.01 ms | 414 ms |
| `runPolicies` (quiet-output) | check | O(n) | O(n) | ✅ matches | 178 µs | 25.1 ms |
| `runPolicies` (chatty-output) | check | O(n) | O(n) | ✅ matches | 194 µs | 35.7 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | check | O(n) | O(n) | ✅ matches | 148 µs | 24.6 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | check | O(n) | O(n) | ✅ matches | 178 µs | 36.0 ms |
| `renderMarkdownSummary` | check | O(n log n) | O(n) | 🟡 close (neighbouring class) | 93.0 µs | 9.39 ms |
| `renderMarkdownSummary` | slowest | O(1) | O(1) | ✅ matches | 287 µs | 428 µs |
| `serializeRun` (quiet-output) | check | O(n) | O(n) | ✅ matches | 847 µs | 98.5 ms |
| `serializeRun` (chatty-output) | check | O(n) | O(n) | ✅ matches | 8.26 ms | 1.54 s |
| `repoContractLogs saveEvidence` (quiet-output) | check | O(n) | O(n) | ✅ matches | 278 µs | 27.7 ms |
| `repoContractLogs saveEvidence` (chatty-output) | check | O(n) | O(n log n) | 🟡 close (neighbouring class) | 319 µs | 61.0 ms |
| `repoContractLogs prependVerdict` (quiet-output) | check | O(n) | O(n) | ✅ matches | 365 µs | 28.1 ms |
| `repoContractLogs prependVerdict` (chatty-output) | check | O(n) | O(n) | ✅ matches | 357 µs | 28.4 ms |

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
| 20 | 88.4 µs | 95.4 µs | 271 µs | 52.8 KiB | 11,313 |
| 40 | 167 µs | 176 µs | 464 µs | 104.5 KiB | 5,982 |
| 80 | 318 µs | 334 µs | 807 µs | 211.4 KiB | 3,147 |
| 160 | 600 µs | 733 µs | 1.33 ms | 436.2 KiB | 1,667 |
| 320 | 1.19 ms | 1.36 ms | 2.73 ms | 938.9 KiB | 837 |
| 640 | 2.19 ms | 2.26 ms | 3.77 ms | 2.1 MiB | 457 |
| 1280 | 7.16 ms | 7.66 ms | 8.73 ms | 4.7 MiB | 140 |
| 2560 | 11.3 ms | 11.9 ms | 13.5 ms | 8.0 MiB | 88 |
| 5120 | 19.6 ms | 20.7 ms | 21.4 ms | 14.5 MiB | 51 |
| 10240 | 37.2 ms | 37.9 ms | 41.0 ms | 27.6 MiB | 27 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.06, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 814 µs | 830 µs | 1.58 ms | 294.9 KiB | 1,228 |
| 40 | 1.60 ms | 1.66 ms | 3.19 ms | 587.0 KiB | 623 |
| 80 | 3.01 ms | 3.58 ms | 4.69 ms | 1.1 MiB | 332 |
| 160 | 5.73 ms | 5.94 ms | 7.63 ms | 2.3 MiB | 174 |
| 320 | 11.2 ms | 11.5 ms | 13.5 ms | 4.7 MiB | 89 |
| 640 | 22.2 ms | 22.6 ms | 25.5 ms | 9.8 MiB | 45 |
| 1280 | 47.4 ms | 50.1 ms | 53.4 ms | 20.1 MiB | 21 |
| 2560 | 92.1 ms | 100 ms | 101 ms | 38.7 MiB | 11 |
| 5120 | 209 ms | 219 ms | 308 ms | 73.5 MiB | 5 |
| 10240 | 414 ms | 416 ms | 613 ms | 145.3 MiB | 2 |

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

**Measured: O(n)** (exponent 1.02, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 53.1 µs | 63.3 µs | 55.8 µs | 47.2 KiB | 18,821 |
| 40 | 83.2 µs | 102 µs | 279 µs | 92.6 KiB | 12,020 |
| 80 | 178 µs | 207 µs | 564 µs | 188.7 KiB | 5,604 |
| 160 | 284 µs | 402 µs | 855 µs | 393.6 KiB | 3,521 |
| 320 | 542 µs | 622 µs | 1.40 ms | 853.7 KiB | 1,845 |
| 640 | 1.17 ms | 1.52 ms | 2.88 ms | 1.9 MiB | 852 |
| 1280 | 5.03 ms | 5.49 ms | 7.49 ms | 4.4 MiB | 199 |
| 2560 | 7.13 ms | 7.31 ms | 9.94 ms | 7.3 MiB | 140 |
| 5120 | 12.4 ms | 14.7 ms | 16.5 ms | 13.2 MiB | 80 |
| 10240 | 25.1 ms | 26.4 ms | 32.8 ms | 24.6 MiB | 40 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.04, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 55.3 µs | 62.2 µs | 217 µs | 54.1 KiB | 18,088 |
| 40 | 93.4 µs | 118 µs | 303 µs | 107.0 KiB | 10,710 |
| 80 | 194 µs | 236 µs | 644 µs | 217.5 KiB | 5,152 |
| 160 | 351 µs | 473 µs | 1.06 ms | 451.7 KiB | 2,851 |
| 320 | 710 µs | 915 µs | 1.95 ms | 951.1 KiB | 1,408 |
| 640 | 1.66 ms | 2.05 ms | 5.02 ms | 2.2 MiB | 604 |
| 1280 | 6.30 ms | 6.71 ms | 12.1 ms | 4.9 MiB | 159 |
| 2560 | 9.84 ms | 10.5 ms | 19.7 ms | 8.3 MiB | 102 |
| 5120 | 18.0 ms | 19.6 ms | 35.5 ms | 15.1 MiB | 56 |
| 10240 | 35.7 ms | 36.8 ms | 68.4 ms | 28.4 MiB | 28 |

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
| 20 | 47.7 µs | 53.5 µs | 118 µs | 47.0 KiB | 20,955 |
| 40 | 78.6 µs | 102 µs | 255 µs | 92.6 KiB | 12,717 |
| 80 | 148 µs | 201 µs | 447 µs | 188.5 KiB | 6,742 |
| 160 | 290 µs | 414 µs | 877 µs | 387.8 KiB | 3,451 |
| 320 | 549 µs | 759 µs | 1.40 ms | 853.7 KiB | 1,821 |
| 640 | 1.22 ms | 1.57 ms | 2.97 ms | 1.9 MiB | 817 |
| 1280 | 5.12 ms | 5.37 ms | 7.37 ms | 4.4 MiB | 195 |
| 2560 | 7.25 ms | 7.44 ms | 10.2 ms | 7.3 MiB | 138 |
| 5120 | 12.2 ms | 13.7 ms | 16.3 ms | 13.2 MiB | 82 |
| 10240 | 24.6 ms | 24.9 ms | 32.2 ms | 24.7 MiB | 41 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.04, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 55.5 µs | 61.5 µs | 216 µs | 54.2 KiB | 18,014 |
| 40 | 111 µs | 120 µs | 359 µs | 107.0 KiB | 9,014 |
| 80 | 178 µs | 238 µs | 585 µs | 217.3 KiB | 5,609 |
| 160 | 345 µs | 475 µs | 1.03 ms | 451.7 KiB | 2,897 |
| 320 | 715 µs | 927 µs | 2.00 ms | 970.6 KiB | 1,398 |
| 640 | 1.71 ms | 2.09 ms | 5.05 ms | 2.2 MiB | 583 |
| 1280 | 6.16 ms | 6.54 ms | 12.1 ms | 4.9 MiB | 162 |
| 2560 | 10.0 ms | 11.1 ms | 19.8 ms | 8.3 MiB | 100 |
| 5120 | 19.3 ms | 20.2 ms | 35.5 ms | 15.0 MiB | 52 |
| 10240 | 36.0 ms | 36.9 ms | 68.7 ms | 28.2 MiB | 28 |

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
| 20 | 32.4 µs | 48.1 µs | 33.1 µs | 30.5 KiB | 30,880 |
| 40 | 43.9 µs | 56.4 µs | 134 µs | 55.2 KiB | 22,780 |
| 80 | 93.0 µs | 151 µs | 346 µs | 104.6 KiB | 10,755 |
| 160 | 153 µs | 198 µs | 468 µs | 208.3 KiB | 6,535 |
| 320 | 285 µs | 398 µs | 829 µs | 402.2 KiB | 3,508 |
| 640 | 536 µs | 617 µs | 1.44 ms | 821.1 KiB | 1,864 |
| 1280 | 1.15 ms | 1.24 ms | 3.14 ms | 1.3 MiB | 873 |
| 2560 | 2.18 ms | 2.29 ms | 4.67 ms | 2.7 MiB | 459 |
| 5120 | 4.51 ms | 4.61 ms | 8.27 ms | 5.5 MiB | 222 |
| 10240 | 9.39 ms | 9.54 ms | 15.8 ms | 10.8 MiB | 106 |

##### Varying `slowest`

How many of the slowest checks the summary lists.

**Expected: O(1).** Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.

**Measured: O(1)** (exponent -0.00, 10 sizes) -- ✅ matches.

| slowests | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 280 µs | 301 µs | 854 µs | 620.2 KiB | 3,567 |
| 40 | 279 µs | 298 µs | 850 µs | 620.3 KiB | 3,584 |
| 80 | 287 µs | 344 µs | 869 µs | 626.2 KiB | 3,482 |
| 160 | 304 µs | 346 µs | 887 µs | 667.5 KiB | 3,286 |
| 320 | 334 µs | 368 µs | 916 µs | 716.3 KiB | 2,990 |
| 640 | 428 µs | 454 µs | 1.28 ms | 834.3 KiB | 2,334 |
| 1280 | 427 µs | 468 µs | 1.28 ms | 834.3 KiB | 2,344 |
| 2560 | 430 µs | 470 µs | 1.30 ms | 834.3 KiB | 2,325 |
| 5120 | 425 µs | 467 µs | 1.30 ms | 834.3 KiB | 2,351 |
| 10240 | 428 µs | 470 µs | 1.30 ms | 834.3 KiB | 2,339 |

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

**Measured: O(n)** (exponent 0.96, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 225 µs | 246 µs | 726 µs | 45.8 KiB | 4,448 |
| 40 | 426 µs | 455 µs | 1.18 ms | 90.2 KiB | 2,347 |
| 80 | 847 µs | 879 µs | 1.66 ms | 178.6 KiB | 1,181 |
| 160 | 2.03 ms | 2.08 ms | 3.60 ms | 357.3 KiB | 494 |
| 320 | 3.70 ms | 3.82 ms | 5.57 ms | 712.3 KiB | 271 |
| 640 | 7.05 ms | 7.31 ms | 9.02 ms | 1.4 MiB | 142 |
| 1280 | 14.1 ms | 14.4 ms | 16.3 ms | 2.8 MiB | 71 |
| 2560 | 28.0 ms | 28.6 ms | 29.7 ms | 5.7 MiB | 36 |
| 5120 | 56.1 ms | 57.0 ms | 56.7 ms | 11.3 MiB | 18 |
| 10240 | 98.5 ms | 99.7 ms | 99.0 ms | 22.7 MiB | 10 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.04, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.55 ms | 2.68 ms | 4.38 ms | 599.8 KiB | 392 |
| 40 | 4.51 ms | 4.64 ms | 6.39 ms | 1.2 MiB | 222 |
| 80 | 8.26 ms | 8.44 ms | 10.3 ms | 2.3 MiB | 121 |
| 160 | 15.6 ms | 15.9 ms | 17.7 ms | 4.6 MiB | 64 |
| 320 | 43.2 ms | 43.6 ms | 43.6 ms | 9.3 MiB | 23 |
| 640 | 85.4 ms | 86.0 ms | 85.8 ms | 18.5 MiB | 12 |
| 1280 | 191 ms | 195 ms | 192 ms | 37.0 MiB | 5 |
| 2560 | 387 ms | 399 ms | 388 ms | 73.9 MiB | 3 |
| 5120 | 775 ms | 792 ms | 795 ms | 147.7 MiB | 1 |
| 10240 | 1.54 s | 1.59 s | 1.58 s | 295.3 MiB | 1 |

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
| 20 | 109 µs | 155 µs | 394 µs | 98.0 KiB | 9,179 |
| 40 | 161 µs | 217 µs | 448 µs | 179.0 KiB | 6,211 |
| 80 | 278 µs | 455 µs | 754 µs | 322.3 KiB | 3,598 |
| 160 | 504 µs | 565 µs | 1.22 ms | 637.9 KiB | 1,985 |
| 320 | 999 µs | 1.05 ms | 2.49 ms | 1.2 MiB | 1,001 |
| 640 | 1.77 ms | 1.92 ms | 3.30 ms | 2.5 MiB | 565 |
| 1280 | 3.35 ms | 3.56 ms | 4.87 ms | 4.9 MiB | 299 |
| 2560 | 6.79 ms | 7.33 ms | 8.72 ms | 9.9 MiB | 147 |
| 5120 | 13.3 ms | 13.9 ms | 16.1 ms | 19.8 MiB | 75 |
| 10240 | 27.7 ms | 28.0 ms | 31.9 ms | 39.6 MiB | 36 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.17, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 96.0 µs | 102 µs | 302 µs | 281.1 KiB | 10,418 |
| 40 | 175 µs | 217 µs | 532 µs | 540.1 KiB | 5,720 |
| 80 | 319 µs | 332 µs | 805 µs | 1.0 MiB | 3,131 |
| 160 | 624 µs | 674 µs | 1.37 ms | 2.1 MiB | 1,603 |
| 320 | 1.30 ms | 1.43 ms | 2.82 ms | 4.2 MiB | 771 |
| 640 | 2.44 ms | 2.54 ms | 4.06 ms | 8.3 MiB | 410 |
| 1280 | 4.83 ms | 5.00 ms | 6.71 ms | 16.7 MiB | 207 |
| 2560 | 9.69 ms | 10.0 ms | 12.1 ms | 33.3 MiB | 103 |
| 5120 | 25.3 ms | 26.2 ms | 28.9 ms | 52.0 MiB | 40 |
| 10240 | 61.0 ms | 64.8 ms | 71.1 ms | 103.7 MiB | 16 |

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
| 20 | 108 µs | 132 µs | 111 µs | 57.4 KiB | 9,289 |
| 40 | 195 µs | 225 µs | 198 µs | 113.5 KiB | 5,139 |
| 80 | 365 µs | 393 µs | 373 µs | 225.7 KiB | 2,738 |
| 160 | 614 µs | 665 µs | 2.05 ms | 450.0 KiB | 1,629 |
| 320 | 1.01 ms | 1.05 ms | 2.45 ms | 898.9 KiB | 995 |
| 640 | 1.81 ms | 1.97 ms | 3.27 ms | 1.8 MiB | 551 |
| 1280 | 3.38 ms | 3.77 ms | 4.17 ms | 3.5 MiB | 296 |
| 2560 | 6.69 ms | 6.75 ms | 7.02 ms | 6.9 MiB | 149 |
| 5120 | 13.6 ms | 13.7 ms | 13.6 ms | 13.8 MiB | 74 |
| 10240 | 28.1 ms | 29.1 ms | 28.6 ms | 27.7 MiB | 36 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 99.1 µs | 123 µs | 102 µs | 56.5 KiB | 10,094 |
| 40 | 185 µs | 209 µs | 188 µs | 111.8 KiB | 5,414 |
| 80 | 357 µs | 387 µs | 1.21 ms | 222.5 KiB | 2,802 |
| 160 | 602 µs | 718 µs | 1.99 ms | 443.7 KiB | 1,660 |
| 320 | 1.02 ms | 1.09 ms | 2.47 ms | 886.2 KiB | 979 |
| 640 | 1.83 ms | 1.85 ms | 3.33 ms | 1.7 MiB | 547 |
| 1280 | 3.46 ms | 3.50 ms | 5.31 ms | 3.5 MiB | 289 |
| 2560 | 6.68 ms | 6.83 ms | 8.01 ms | 6.9 MiB | 150 |
| 5120 | 13.5 ms | 14.0 ms | 17.0 ms | 13.8 MiB | 74 |
| 10240 | 28.4 ms | 28.6 ms | 33.6 ms | 27.7 MiB | 35 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 503 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 318 µs | 318 µs | 63% |
| `run-policies` | 1 | 178 µs | 178 µs | 35% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 6.56 µs | 1.3% |

**At 10240 checks** (whole operation: 64.6 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 37.2 ms | 37.2 ms | 58% |
| `run-policies` | 1 | 25.1 ms | 25.1 ms | 39% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `render-markdown-summary` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 2.32 ms | 3.6% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-03T05:06:35.913Z` → `2026-11-03T05:08:12.859Z` (97 s), ci: CI (run 41580298786)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15984 MB RAM, linux/x64, Node v24.22.1, GitHub Actions
- Git: `5edac933ba4b5f1269e56defe92cd43592c4039d` on `chore/dependency-updates`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

