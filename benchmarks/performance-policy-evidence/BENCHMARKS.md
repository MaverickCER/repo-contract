# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **314 µs** per operation compared with a bare-minimum baseline (**159%** of the baseline). Overall, it grows O(n) with workload size (measured exponent 0.94). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 314 µs | 39.7 ms |
| Added latency, relative to baseline | 159% | 194% |
| Added CPU time per operation | 890 µs | 42.4 ms |
| Added memory per operation (heap delta) | 346.0 KiB | 44.5 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,189 ops/s | 25 ops/s |

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
| 20 | 67.3 µs | 187 µs | 120 µs | 178% | 490 µs | $0.00025 – $0.0055 |
| 40 | 113 µs | 280 µs | 166 µs | 147% | 487 µs | $0.00035 – $0.0055 |
| 80 | 197 µs | 511 µs | 314 µs | 159% | 890 µs | $0.00065 – $0.010 |
| 160 | 439 µs | 1.03 ms | 595 µs | 136% | 1.46 ms | $0.0012 – $0.016 |
| 320 | 760 µs | 1.77 ms | 1.01 ms | 132% | 1.78 ms | $0.0021 – $0.020 |
| 640 | 1.52 ms | 3.56 ms | 2.04 ms | 134% | 2.33 ms | $0.0042 – $0.026 |
| 1280 | 2.75 ms | 13.6 ms | 10.8 ms | 393% | 11.3 ms | $0.023 – $0.128 |
| 2560 | 5.29 ms | 20.1 ms | 14.8 ms | 281% | 16.1 ms | $0.031 – $0.181 |
| 5120 | 10.3 ms | 32.9 ms | 22.5 ms | 218% | 20.5 ms | $0.047 – $0.231 |
| 10240 | 20.5 ms | 60.3 ms | 39.7 ms | 194% | 42.4 ms | $0.083 – $0.476 |

**How the total grows:** O(n) (linear), exponent 0.94 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | O(n) | O(n) | ✅ matches | 319 µs | 36.8 ms |
| `buildEvidence` (chatty-output) | O(n) | O(n) | ✅ matches | 2.81 ms | 394 ms |
| `runPolicies` (quiet-output) | O(n) | O(n) | ✅ matches | 154 µs | 23.8 ms |
| `runPolicies` (chatty-output) | O(n) | O(n) | ✅ matches | 215 µs | 34.3 ms |
| `runPolicies with an onVerdict hook` (quiet-output) | O(n) | O(n) | ✅ matches | 166 µs | 24.4 ms |
| `runPolicies with an onVerdict hook` (chatty-output) | O(n) | O(n) | ✅ matches | 228 µs | 36.1 ms |
| `renderMarkdownSummary` | O(n log n) | n/a | ❔ not enough data | n/a | n/a |
| `serializeRun` (quiet-output) | O(n) | O(n) | ✅ matches | 736 µs | 77.2 ms |
| `serializeRun` (chatty-output) | O(n) | O(n) | ✅ matches | 7.18 ms | 899 ms |
| `repoContractLogs saveEvidence` (quiet-output) | O(n) | O(n) | ✅ matches | 282 µs | 27.1 ms |
| `repoContractLogs saveEvidence` (chatty-output) | O(n) | O(n log n) | 🟡 close (neighbouring class) | 382 µs | 77.5 ms |
| `repoContractLogs prependVerdict` (quiet-output) | O(n) | O(n) | ✅ matches | 337 µs | 25.0 ms |
| `repoContractLogs prependVerdict` (chatty-output) | O(n) | O(n) | ✅ matches | 342 µs | 29.4 ms |

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

**Measured: O(n)** (exponent 0.95, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 105 µs | 109 µs | 385 µs | 52.9 KiB | 9,553 |
| 40 | 183 µs | 206 µs | 602 µs | 104.6 KiB | 5,451 |
| 80 | 319 µs | 386 µs | 880 µs | 211.4 KiB | 3,139 |
| 160 | 593 µs | 633 µs | 1.45 ms | 436.2 KiB | 1,685 |
| 320 | 1.21 ms | 1.25 ms | 2.95 ms | 938.9 KiB | 830 |
| 640 | 2.13 ms | 2.22 ms | 3.83 ms | 2.1 MiB | 471 |
| 1280 | 8.11 ms | 8.37 ms | 10.1 ms | 4.7 MiB | 123 |
| 2560 | 12.2 ms | 12.8 ms | 14.3 ms | 8.0 MiB | 82 |
| 5120 | 20.2 ms | 20.4 ms | 22.3 ms | 14.5 MiB | 50 |
| 10240 | 36.8 ms | 36.9 ms | 40.5 ms | 27.6 MiB | 27 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.07, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 782 µs | 847 µs | 1.67 ms | 294.9 KiB | 1,279 |
| 40 | 1.56 ms | 1.61 ms | 3.39 ms | 587.0 KiB | 642 |
| 80 | 2.81 ms | 3.17 ms | 4.76 ms | 1.1 MiB | 356 |
| 160 | 5.32 ms | 5.39 ms | 7.56 ms | 2.3 MiB | 188 |
| 320 | 10.3 ms | 10.7 ms | 13.1 ms | 4.7 MiB | 97 |
| 640 | 20.3 ms | 21.9 ms | 24.3 ms | 9.8 MiB | 49 |
| 1280 | 44.6 ms | 46.1 ms | 51.6 ms | 20.1 MiB | 22 |
| 2560 | 85.0 ms | 89.4 ms | 97.0 ms | 38.7 MiB | 12 |
| 5120 | 199 ms | 203 ms | 318 ms | 73.5 MiB | 5 |
| 10240 | 394 ms | 398 ms | 638 ms | 145.2 MiB | 3 |

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

**Measured: O(n)** (exponent 0.96, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 52.6 µs | 69.7 µs | 54.0 µs | 47.4 KiB | 18,998 |
| 40 | 80.5 µs | 91.6 µs | 264 µs | 92.5 KiB | 12,419 |
| 80 | 154 µs | 188 µs | 511 µs | 188.5 KiB | 6,515 |
| 160 | 281 µs | 377 µs | 889 µs | 393.8 KiB | 3,564 |
| 320 | 568 µs | 726 µs | 1.64 ms | 847.1 KiB | 1,759 |
| 640 | 1.20 ms | 1.56 ms | 3.13 ms | 1.9 MiB | 835 |
| 1280 | 6.23 ms | 6.54 ms | 8.79 ms | 4.4 MiB | 161 |
| 2560 | 8.33 ms | 8.66 ms | 11.8 ms | 7.3 MiB | 120 |
| 5120 | 12.6 ms | 13.7 ms | 17.4 ms | 13.2 MiB | 79 |
| 10240 | 23.8 ms | 24.0 ms | 32.4 ms | 24.4 MiB | 42 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.98, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 56.7 µs | 61.7 µs | 60.4 µs | 54.2 KiB | 17,644 |
| 40 | 111 µs | 134 µs | 388 µs | 107.0 KiB | 9,011 |
| 80 | 215 µs | 248 µs | 725 µs | 217.5 KiB | 4,648 |
| 160 | 461 µs | 547 µs | 1.59 ms | 452.9 KiB | 2,171 |
| 320 | 979 µs | 1.06 ms | 3.71 ms | 975.5 KiB | 1,021 |
| 640 | 1.83 ms | 2.35 ms | 5.89 ms | 2.2 MiB | 547 |
| 1280 | 7.86 ms | 8.10 ms | 14.9 ms | 4.9 MiB | 127 |
| 2560 | 10.8 ms | 11.3 ms | 22.7 ms | 8.3 MiB | 92 |
| 5120 | 19.4 ms | 20.2 ms | 42.0 ms | 15.0 MiB | 51 |
| 10240 | 34.3 ms | 34.5 ms | 75.9 ms | 28.1 MiB | 29 |

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
| 20 | 48.8 µs | 56.4 µs | 50.9 µs | 47.0 KiB | 20,502 |
| 40 | 87.0 µs | 95.1 µs | 317 µs | 92.7 KiB | 11,497 |
| 80 | 166 µs | 197 µs | 530 µs | 188.5 KiB | 6,035 |
| 160 | 296 µs | 389 µs | 926 µs | 393.9 KiB | 3,376 |
| 320 | 576 µs | 740 µs | 1.66 ms | 848.4 KiB | 1,736 |
| 640 | 1.28 ms | 1.67 ms | 3.32 ms | 1.9 MiB | 779 |
| 1280 | 6.27 ms | 6.59 ms | 9.09 ms | 4.4 MiB | 160 |
| 2560 | 8.48 ms | 9.01 ms | 12.0 ms | 7.3 MiB | 118 |
| 5120 | 13.7 ms | 14.1 ms | 19.1 ms | 13.2 MiB | 73 |
| 10240 | 24.4 ms | 24.7 ms | 33.2 ms | 24.3 MiB | 41 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.95, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 64.9 µs | 74.4 µs | 71.2 µs | 54.4 KiB | 15,404 |
| 40 | 114 µs | 124 µs | 414 µs | 107.1 KiB | 8,739 |
| 80 | 228 µs | 261 µs | 774 µs | 217.5 KiB | 4,385 |
| 160 | 492 µs | 534 µs | 1.65 ms | 452.9 KiB | 2,032 |
| 320 | 1.09 ms | 1.20 ms | 4.03 ms | 975.7 KiB | 920 |
| 640 | 2.09 ms | 2.52 ms | 6.58 ms | 2.2 MiB | 478 |
| 1280 | 8.10 ms | 8.27 ms | 15.5 ms | 4.9 MiB | 123 |
| 2560 | 11.2 ms | 11.6 ms | 23.6 ms | 8.3 MiB | 89 |
| 5120 | 20.0 ms | 20.7 ms | 42.2 ms | 15.1 MiB | 50 |
| 10240 | 36.1 ms | 36.5 ms | 79.1 ms | 28.0 MiB | 28 |

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

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | ❌ Cannot read properties of undefined (reading 'values') |  |  |  |  |
| 40 | ❌ Cannot read properties of undefined (reading 'values') |  |  |  |  |
| 80 | ❌ Cannot read properties of undefined (reading 'values') |  |  |  |  |
| 160 | ❌ Cannot read properties of undefined (reading 'values') |  |  |  |  |
| 320 | ❌ Cannot read properties of undefined (reading 'values') |  |  |  |  |
| 640 | ❌ Cannot read properties of undefined (reading 'values') |  |  |  |  |
| 1280 | ❌ Cannot read properties of undefined (reading 'values') |  |  |  |  |
| 2560 | ❌ Cannot read properties of undefined (reading 'values') |  |  |  |  |
| 5120 | ❌ Cannot read properties of undefined (reading 'values') |  |  |  |  |
| 10240 | ❌ Cannot read properties of undefined (reading 'values') |  |  |  |  |

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

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 236 µs | 260 µs | 830 µs | 45.8 KiB | 4,231 |
| 40 | 414 µs | 447 µs | 1.31 ms | 90.3 KiB | 2,418 |
| 80 | 736 µs | 770 µs | 1.70 ms | 178.7 KiB | 1,359 |
| 160 | 1.48 ms | 1.55 ms | 3.47 ms | 357.4 KiB | 674 |
| 320 | 2.63 ms | 2.88 ms | 5.04 ms | 712.5 KiB | 381 |
| 640 | 4.91 ms | 5.12 ms | 7.47 ms | 1.4 MiB | 204 |
| 1280 | 9.70 ms | 9.98 ms | 12.4 ms | 2.8 MiB | 103 |
| 2560 | 18.6 ms | 19.0 ms | 22.3 ms | 5.7 MiB | 54 |
| 5120 | 36.7 ms | 37.2 ms | 41.4 ms | 11.3 MiB | 27 |
| 10240 | 77.2 ms | 77.8 ms | 84.1 ms | 22.7 MiB | 13 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.14 ms | 2.31 ms | 4.31 ms | 599.9 KiB | 467 |
| 40 | 3.80 ms | 4.00 ms | 6.01 ms | 1.2 MiB | 263 |
| 80 | 7.18 ms | 7.42 ms | 9.67 ms | 2.3 MiB | 139 |
| 160 | 13.6 ms | 14.0 ms | 16.7 ms | 4.6 MiB | 73 |
| 320 | 26.4 ms | 27.1 ms | 30.1 ms | 9.3 MiB | 38 |
| 640 | 54.3 ms | 54.7 ms | 59.0 ms | 18.5 MiB | 18 |
| 1280 | 110 ms | 110 ms | 117 ms | 37.0 MiB | 9 |
| 2560 | 226 ms | 236 ms | 237 ms | 73.9 MiB | 4 |
| 5120 | 448 ms | 453 ms | 469 ms | 147.7 MiB | 2 |
| 10240 | 899 ms | 904 ms | 942 ms | 295.3 MiB | 1 |

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
| 20 | 110 µs | 137 µs | 436 µs | 98.0 KiB | 9,112 |
| 40 | 161 µs | 218 µs | 504 µs | 178.9 KiB | 6,201 |
| 80 | 282 µs | 352 µs | 860 µs | 322.3 KiB | 3,548 |
| 160 | 492 µs | 530 µs | 1.32 ms | 637.8 KiB | 2,034 |
| 320 | 970 µs | 1.04 ms | 2.67 ms | 1.2 MiB | 1,031 |
| 640 | 1.74 ms | 1.88 ms | 3.50 ms | 2.5 MiB | 574 |
| 1280 | 3.47 ms | 3.92 ms | 5.39 ms | 4.9 MiB | 288 |
| 2560 | 6.61 ms | 6.78 ms | 8.70 ms | 9.9 MiB | 151 |
| 5120 | 13.4 ms | 13.8 ms | 16.7 ms | 19.8 MiB | 75 |
| 10240 | 27.1 ms | 28.1 ms | 32.3 ms | 39.6 MiB | 37 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.21, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 104 µs | 112 µs | 384 µs | 281.1 KiB | 9,572 |
| 40 | 194 µs | 201 µs | 613 µs | 540.1 KiB | 5,152 |
| 80 | 382 µs | 403 µs | 1.22 ms | 1.0 MiB | 2,615 |
| 160 | 689 µs | 740 µs | 1.56 ms | 2.1 MiB | 1,451 |
| 320 | 1.40 ms | 1.47 ms | 3.21 ms | 4.2 MiB | 713 |
| 640 | 2.78 ms | 2.91 ms | 4.73 ms | 8.3 MiB | 359 |
| 1280 | 5.54 ms | 5.75 ms | 8.07 ms | 16.7 MiB | 181 |
| 2560 | 11.3 ms | 11.8 ms | 15.0 ms | 33.3 MiB | 89 |
| 5120 | 31.3 ms | 32.8 ms | 37.3 ms | 52.0 MiB | 32 |
| 10240 | 77.5 ms | 78.2 ms | 92.3 ms | 103.7 MiB | 13 |

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

**Measured: O(n)** (exponent 0.96, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 102 µs | 124 µs | 104 µs | 57.4 KiB | 9,825 |
| 40 | 185 µs | 229 µs | 188 µs | 113.5 KiB | 5,417 |
| 80 | 337 µs | 358 µs | 341 µs | 225.7 KiB | 2,967 |
| 160 | 586 µs | 622 µs | 2.17 ms | 450.0 KiB | 1,706 |
| 320 | 986 µs | 1.05 ms | 2.65 ms | 898.9 KiB | 1,014 |
| 640 | 1.77 ms | 1.85 ms | 3.43 ms | 1.8 MiB | 564 |
| 1280 | 3.34 ms | 3.38 ms | 5.09 ms | 3.5 MiB | 299 |
| 2560 | 6.31 ms | 6.59 ms | 6.61 ms | 6.9 MiB | 158 |
| 5120 | 12.8 ms | 12.9 ms | 13.0 ms | 13.8 MiB | 78 |
| 10240 | 25.0 ms | 25.4 ms | 25.5 ms | 27.7 MiB | 40 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 97.8 µs | 110 µs | 101 µs | 56.5 KiB | 10,229 |
| 40 | 180 µs | 204 µs | 183 µs | 111.8 KiB | 5,563 |
| 80 | 342 µs | 358 µs | 347 µs | 222.5 KiB | 2,921 |
| 160 | 582 µs | 618 µs | 2.06 ms | 443.7 KiB | 1,717 |
| 320 | 979 µs | 1.01 ms | 2.52 ms | 886.2 KiB | 1,021 |
| 640 | 1.81 ms | 1.84 ms | 3.70 ms | 1.7 MiB | 554 |
| 1280 | 3.45 ms | 3.55 ms | 5.77 ms | 3.5 MiB | 290 |
| 2560 | 6.56 ms | 7.07 ms | 8.69 ms | 6.9 MiB | 152 |
| 5120 | 13.7 ms | 13.9 ms | 17.3 ms | 13.8 MiB | 73 |
| 10240 | 29.4 ms | 30.1 ms | 36.5 ms | 27.7 MiB | 34 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 511 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 319 µs | 319 µs | 62% |
| `run-policies` | 1 | 154 µs | 154 µs | 30% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 38.8 µs | 7.6% |

**At 10240 checks** (whole operation: 60.3 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 36.8 ms | 36.8 ms | 61% |
| `run-policies` | 1 | 23.8 ms | 23.8 ms | 39% |
| `run-policies-with-verdict-hook` | 0 | 0 | 0 | 0.0% |
| `serialize-run` | 0 | 0 | 0 | 0.0% |
| `save-evidence-to-logs` | 0 | 0 | 0 | 0.0% |
| `prepend-verdict-to-logs` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 0 | 0.0% |

## Failed measurements

- **fn:render-markdown-summary** at n20: TypeError: Cannot read properties of undefined (reading 'values')
- **fn:render-markdown-summary** at n40: TypeError: Cannot read properties of undefined (reading 'values')
- **fn:render-markdown-summary** at n80: TypeError: Cannot read properties of undefined (reading 'values')
- **fn:render-markdown-summary** at n160: TypeError: Cannot read properties of undefined (reading 'values')
- **fn:render-markdown-summary** at n320: TypeError: Cannot read properties of undefined (reading 'values')
- **fn:render-markdown-summary** at n640: TypeError: Cannot read properties of undefined (reading 'values')
- **fn:render-markdown-summary** at n1280: TypeError: Cannot read properties of undefined (reading 'values')
- **fn:render-markdown-summary** at n2560: TypeError: Cannot read properties of undefined (reading 'values')
- **fn:render-markdown-summary** at n5120: TypeError: Cannot read properties of undefined (reading 'values')
- **fn:render-markdown-summary** at n10240: TypeError: Cannot read properties of undefined (reading 'values')

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-20T08:45:01.238Z` → `2026-10-20T08:46:23.401Z` (82 s), ci: CI (run 39393922433)
- Machine: Intel(R) Xeon(R) Platinum 8370C CPU @ 2.80GHz, 4 logical core(s) (2 physical), 15989 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `1831ca7deaf3e275b509755b9cba687091fc5811` on `dependabot/npm_and_yarn/internal-package-contract-v0.11.0`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

