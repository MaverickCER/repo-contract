# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **137 µs** per operation compared with a bare-minimum baseline (**125%** of the baseline). Overall, it grows O(n) with workload size (measured exponent 1.00). At list prices that is on the order of **~$0.0001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the dependable ones: both come from the same run, so they survive a change of machine. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 137 µs | 25.5 ms |
| Added latency, relative to baseline | 125% | 213% |
| Added CPU time per operation | 325 µs | 27.8 ms |
| Added memory per operation (heap delta) | 345.3 KiB | 44.6 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.0001 – $0.01 | ~$0.1 |
| Single-core throughput ceiling of the overhead alone | 7,293 ops/s | 39 ops/s |

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
| 20 | 32.4 µs | 82.0 µs | 49.7 µs | 154% | 175 µs | $0.0001 – $0.002 |
| 40 | 56.3 µs | 129 µs | 72.9 µs | 130% | 187 µs | $0.00015 – $0.0021 |
| 80 | 109 µs | 247 µs | 137 µs | 125% | 325 µs | $0.00029 – $0.0037 |
| 160 | 215 µs | 453 µs | 239 µs | 111% | 484 µs | $0.0005 – $0.0054 |
| 320 | 407 µs | 855 µs | 448 µs | 110% | 650 µs | $0.00093 – $0.0073 |
| 640 | 794 µs | 1.86 ms | 1.06 ms | 134% | 1.86 ms | $0.0022 – $0.021 |
| 1280 | 1.59 ms | 7.67 ms | 6.08 ms | 383% | 6.50 ms | $0.013 – $0.073 |
| 2560 | 2.97 ms | 11.3 ms | 8.30 ms | 279% | 9.06 ms | $0.017 – $0.102 |
| 5120 | 5.92 ms | 19.0 ms | 13.1 ms | 221% | 15.8 ms | $0.027 – $0.177 |
| 10240 | 12.0 ms | 37.5 ms | 25.5 ms | 213% | 27.8 ms | $0.053 – $0.312 |

**How the total grows:** O(n) (linear), exponent 1.00 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | O(n) | O(n) | ✅ matches | 150 µs | 20.0 ms |
| `buildEvidence` (chatty-output) | O(n) | O(n) | ✅ matches | 1.64 ms | 236 ms |
| `runPolicies` (quiet-output) | O(n) | O(n log n) | 🟡 close (neighbouring class) | 69.4 µs | 15.7 ms |
| `runPolicies` (chatty-output) | O(n) | O(n log n) | 🟡 close (neighbouring class) | 104 µs | 25.7 ms |

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
| 20 | 42.7 µs | 47.1 µs | 118 µs | 52.7 KiB | 23,414 |
| 40 | 81.3 µs | 95.0 µs | 205 µs | 104.3 KiB | 12,305 |
| 80 | 150 µs | 161 µs | 346 µs | 211.1 KiB | 6,660 |
| 160 | 290 µs | 302 µs | 616 µs | 436.0 KiB | 3,452 |
| 320 | 558 µs | 613 µs | 1.06 ms | 938.5 KiB | 1,793 |
| 640 | 1.13 ms | 1.26 ms | 2.13 ms | 2.1 MiB | 883 |
| 1280 | 3.95 ms | 4.14 ms | 4.93 ms | 4.7 MiB | 253 |
| 2560 | 6.12 ms | 6.83 ms | 7.37 ms | 8.0 MiB | 163 |
| 5120 | 10.9 ms | 12.7 ms | 12.6 ms | 14.5 MiB | 92 |
| 10240 | 20.0 ms | 20.7 ms | 23.5 ms | 27.6 MiB | 50 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.08, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 404 µs | 413 µs | 716 µs | 294.5 KiB | 2,475 |
| 40 | 793 µs | 843 µs | 1.29 ms | 585.9 KiB | 1,261 |
| 80 | 1.64 ms | 2.09 ms | 2.77 ms | 1.1 MiB | 609 |
| 160 | 3.06 ms | 3.18 ms | 4.33 ms | 2.3 MiB | 327 |
| 320 | 5.95 ms | 6.14 ms | 7.51 ms | 4.7 MiB | 168 |
| 640 | 11.9 ms | 12.2 ms | 14.5 ms | 9.8 MiB | 84 |
| 1280 | 27.3 ms | 29.0 ms | 32.8 ms | 20.1 MiB | 37 |
| 2560 | 51.9 ms | 54.1 ms | 59.7 ms | 38.7 MiB | 19 |
| 5120 | 123 ms | 125 ms | 195 ms | 73.5 MiB | 8 |
| 10240 | 236 ms | 236 ms | 370 ms | 145.1 MiB | 4 |

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

**Measured: O(n log n)** (exponent 1.12, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 26.4 µs | 36.4 µs | 27.4 µs | 48.1 KiB | 37,920 |
| 40 | 36.3 µs | 48.7 µs | 102 µs | 92.4 KiB | 27,550 |
| 80 | 69.4 µs | 92.8 µs | 199 µs | 188.3 KiB | 14,400 |
| 160 | 149 µs | 180 µs | 386 µs | 393.0 KiB | 6,720 |
| 320 | 254 µs | 363 µs | 633 µs | 845.9 KiB | 3,945 |
| 640 | 515 µs | 698 µs | 1.11 ms | 1.9 MiB | 1,942 |
| 1280 | 2.88 ms | 3.20 ms | 4.59 ms | 4.4 MiB | 347 |
| 2560 | 4.20 ms | 4.79 ms | 6.41 ms | 7.3 MiB | 238 |
| 5120 | 7.07 ms | 7.80 ms | 10.2 ms | 13.2 MiB | 141 |
| 10240 | 15.7 ms | 16.4 ms | 21.8 ms | 24.7 MiB | 64 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.16, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 29.6 µs | 34.9 µs | 31.8 µs | 54.1 KiB | 33,778 |
| 40 | 46.4 µs | 60.1 µs | 138 µs | 106.8 KiB | 21,567 |
| 80 | 104 µs | 120 µs | 300 µs | 217.2 KiB | 9,651 |
| 160 | 186 µs | 232 µs | 507 µs | 451.1 KiB | 5,367 |
| 320 | 393 µs | 486 µs | 1.21 ms | 970.6 KiB | 2,543 |
| 640 | 769 µs | 1.18 ms | 1.90 ms | 2.1 MiB | 1,300 |
| 1280 | 4.48 ms | 4.97 ms | 9.62 ms | 4.9 MiB | 223 |
| 2560 | 7.07 ms | 7.93 ms | 14.5 ms | 8.3 MiB | 142 |
| 5120 | 12.4 ms | 13.9 ms | 25.2 ms | 15.1 MiB | 81 |
| 10240 | 25.7 ms | 26.4 ms | 50.7 ms | 28.1 MiB | 39 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 247 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 150 µs | 150 µs | 61% |
| `run-policies` | 1 | 69.4 µs | 69.4 µs | 28% |
| _unattributed_ |  |  | 26.9 µs | 11% |

**At 10240 checks** (whole operation: 37.5 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 20.0 ms | 20.0 ms | 53% |
| `run-policies` | 1 | 15.7 ms | 15.7 ms | 42% |
| _unattributed_ |  |  | 1.75 ms | 4.7% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-19T09:37:07.643Z` → `2026-10-19T09:37:27.939Z` (20 s), ci: CI (run 39230286789)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `8e978cf85f2c5d03fc8593966399f0df396af203` on `dependabot/npm_and_yarn/dev-dependencies-f33c6aedb8`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

