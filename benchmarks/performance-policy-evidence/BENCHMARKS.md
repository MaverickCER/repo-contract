# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **141 µs** per operation compared with a bare-minimum baseline (**132%** of the baseline). Overall, it grows O(n) with workload size (measured exponent 1.04). At list prices that is on the order of **~$0.0001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the dependable ones: both come from the same run, so they survive a change of machine. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 141 µs | 28.8 ms |
| Added latency, relative to baseline | 132% | 238% |
| Added CPU time per operation | 335 µs | 33.8 ms |
| Added memory per operation (heap delta) | 331.0 KiB | 42.8 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.0001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 7,116 ops/s | 35 ops/s |

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
| 20 | 29.9 µs | 89.5 µs | 59.7 µs | 200% | 255 µs | $0.00012 – $0.0029 |
| 40 | 54.7 µs | 129 µs | 74.6 µs | 136% | 195 µs | $0.00016 – $0.0022 |
| 80 | 107 µs | 247 µs | 141 µs | 132% | 335 µs | $0.00029 – $0.0038 |
| 160 | 213 µs | 469 µs | 256 µs | 120% | 514 µs | $0.00053 – $0.0058 |
| 320 | 400 µs | 845 µs | 446 µs | 112% | 676 µs | $0.00093 – $0.0076 |
| 640 | 786 µs | 1.83 ms | 1.04 ms | 132% | 1.76 ms | $0.0022 – $0.020 |
| 1280 | 1.59 ms | 7.47 ms | 5.88 ms | 370% | 6.33 ms | $0.012 – $0.071 |
| 2560 | 3.01 ms | 11.1 ms | 8.09 ms | 269% | 8.65 ms | $0.017 – $0.097 |
| 5120 | 5.98 ms | 20.3 ms | 14.3 ms | 239% | 13.9 ms | $0.030 – $0.157 |
| 10240 | 12.1 ms | 40.8 ms | 28.8 ms | 238% | 33.8 ms | $0.060 – $0.381 |

**How the total grows:** O(n) (linear), exponent 1.04 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | O(n) | O(n) | ✅ matches | 155 µs | 20.7 ms |
| `buildEvidence` (chatty-output) | O(n) | O(n) | ✅ matches | 1.68 ms | 244 ms |
| `runPolicies` (quiet-output) | O(n) | O(n) | ✅ matches | 62.2 µs | 15.0 ms |
| `runPolicies` (chatty-output) | O(n) | O(n log n) | 🟡 close (neighbouring class) | 79.3 µs | 27.2 ms |

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
| 20 | 46.8 µs | 54.9 µs | 148 µs | 52.8 KiB | 21,353 |
| 40 | 81.2 µs | 116 µs | 207 µs | 104.3 KiB | 12,316 |
| 80 | 155 µs | 164 µs | 355 µs | 211.1 KiB | 6,450 |
| 160 | 307 µs | 354 µs | 665 µs | 436.0 KiB | 3,262 |
| 320 | 597 µs | 664 µs | 1.15 ms | 938.5 KiB | 1,674 |
| 640 | 1.21 ms | 1.38 ms | 2.36 ms | 2.1 MiB | 826 |
| 1280 | 4.29 ms | 4.71 ms | 5.59 ms | 4.7 MiB | 233 |
| 2560 | 6.63 ms | 15.4 ms | 8.51 ms | 8.0 MiB | 151 |
| 5120 | 11.4 ms | 13.6 ms | 13.5 ms | 14.5 MiB | 88 |
| 10240 | 20.7 ms | 21.8 ms | 23.6 ms | 27.6 MiB | 48 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.08, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 444 µs | 458 µs | 953 µs | 294.9 KiB | 2,254 |
| 40 | 818 µs | 835 µs | 1.34 ms | 585.9 KiB | 1,223 |
| 80 | 1.68 ms | 2.16 ms | 2.92 ms | 1.1 MiB | 595 |
| 160 | 3.15 ms | 3.20 ms | 4.48 ms | 2.3 MiB | 317 |
| 320 | 6.15 ms | 6.27 ms | 7.81 ms | 4.7 MiB | 163 |
| 640 | 12.3 ms | 12.5 ms | 15.1 ms | 9.8 MiB | 81 |
| 1280 | 26.4 ms | 29.8 ms | 30.9 ms | 20.1 MiB | 38 |
| 2560 | 51.8 ms | 57.0 ms | 60.8 ms | 38.7 MiB | 19 |
| 5120 | 120 ms | 122 ms | 187 ms | 73.5 MiB | 8 |
| 10240 | 244 ms | 245 ms | 383 ms | 145.2 MiB | 4 |

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

**Measured: O(n)** (exponent 1.09, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 21.7 µs | 26.1 µs | 22.1 µs | 43.4 KiB | 46,001 |
| 40 | 31.5 µs | 42.1 µs | 89.0 µs | 85.2 KiB | 31,740 |
| 80 | 62.2 µs | 86.6 µs | 169 µs | 173.7 KiB | 16,081 |
| 160 | 130 µs | 178 µs | 346 µs | 364.4 KiB | 7,711 |
| 320 | 255 µs | 349 µs | 641 µs | 796.0 KiB | 3,922 |
| 640 | 516 µs | 697 µs | 1.17 ms | 1.8 MiB | 1,936 |
| 1280 | 2.95 ms | 3.32 ms | 4.57 ms | 4.2 MiB | 339 |
| 2560 | 4.69 ms | 5.12 ms | 7.05 ms | 6.9 MiB | 213 |
| 5120 | 6.70 ms | 7.36 ms | 10.1 ms | 12.3 MiB | 149 |
| 10240 | 15.0 ms | 15.7 ms | 21.3 ms | 22.9 MiB | 67 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.14, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 25.6 µs | 29.0 µs | 26.3 µs | 50.5 KiB | 39,029 |
| 40 | 42.2 µs | 52.8 µs | 129 µs | 99.6 KiB | 23,724 |
| 80 | 79.3 µs | 109 µs | 228 µs | 202.6 KiB | 12,613 |
| 160 | 176 µs | 220 µs | 503 µs | 422.2 KiB | 5,670 |
| 320 | 436 µs | 589 µs | 1.33 ms | 912.5 KiB | 2,291 |
| 640 | 858 µs | 1.20 ms | 2.17 ms | 2.0 MiB | 1,165 |
| 1280 | 4.76 ms | 5.29 ms | 9.99 ms | 4.6 MiB | 210 |
| 2560 | 6.62 ms | 7.17 ms | 14.1 ms | 7.8 MiB | 151 |
| 5120 | 12.6 ms | 14.3 ms | 25.7 ms | 14.1 MiB | 79 |
| 10240 | 27.2 ms | 27.5 ms | 52.4 ms | 26.1 MiB | 37 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 247 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 155 µs | 155 µs | 63% |
| `run-policies` | 1 | 62.2 µs | 62.2 µs | 25% |
| _unattributed_ |  |  | 30.2 µs | 12% |

**At 10240 checks** (whole operation: 40.8 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 20.7 ms | 20.7 ms | 51% |
| `run-policies` | 1 | 15.0 ms | 15.0 ms | 37% |
| _unattributed_ |  |  | 5.15 ms | 13% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-13T03:20:33.273Z` → `2026-10-13T03:20:53.886Z` (21 s), ci: CI (run 38340527682)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `f6033f91f20c59a3afc96e2bc460cbf2d8c7adaf` on `dependabot/npm_and_yarn/internal-package-contract-v0.10.0`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

