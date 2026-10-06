# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **112 µs** per operation compared with a bare-minimum baseline (**107%** of the baseline). Overall, it grows O(n) with workload size (measured exponent 1.04). At list prices that is on the order of **~$0.0001 – $0.001 per million operations** of compute.

> The relative figure and the growth class are the dependable ones: both come from the same run, so they survive a change of machine. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 112 µs | 26.1 ms |
| Added latency, relative to baseline | 107% | 233% |
| Added CPU time per operation | 225 µs | 30.2 ms |
| Added memory per operation (heap delta) | 319.2 KiB | 41.5 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.0001 – $0.001 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 8,890 ops/s | 38 ops/s |

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
| 20 | 29.3 µs | 69.5 µs | 40.2 µs | 137% | 144 µs | $0.000084 – $0.0016 |
| 40 | 53.4 µs | 113 µs | 60.1 µs | 113% | 146 µs | $0.00013 – $0.0016 |
| 80 | 105 µs | 218 µs | 112 µs | 107% | 225 µs | $0.00023 – $0.0025 |
| 160 | 207 µs | 431 µs | 224 µs | 108% | 464 µs | $0.00047 – $0.0052 |
| 320 | 386 µs | 784 µs | 397 µs | 103% | 597 µs | $0.00083 – $0.0067 |
| 640 | 764 µs | 1.65 ms | 891 µs | 117% | 1.58 ms | $0.0019 – $0.018 |
| 1280 | 1.52 ms | 7.11 ms | 5.59 ms | 367% | 6.03 ms | $0.012 – $0.068 |
| 2560 | 2.83 ms | 10.4 ms | 7.59 ms | 268% | 8.32 ms | $0.016 – $0.094 |
| 5120 | 5.67 ms | 18.9 ms | 13.2 ms | 232% | 14.3 ms | $0.027 – $0.161 |
| 10240 | 11.2 ms | 37.2 ms | 26.1 ms | 233% | 30.2 ms | $0.054 – $0.340 |

**How the total grows:** O(n) (linear), exponent 1.04 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | O(n) | O(n) | ✅ matches | 143 µs | 19.7 ms |
| `buildEvidence` (chatty-output) | O(n) | O(n) | ✅ matches | 1.54 ms | 238 ms |
| `runPolicies` (quiet-output) | O(n) | O(n log n) | 🟡 close (neighbouring class) | 60.1 µs | 15.6 ms |
| `runPolicies` (chatty-output) | O(n) | O(n) | ✅ matches | 84.6 µs | 24.6 ms |

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

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 39.3 µs | 42.2 µs | 109 µs | 49.2 KiB | 25,429 |
| 40 | 74.8 µs | 86.0 µs | 187 µs | 97.4 KiB | 13,370 |
| 80 | 143 µs | 151 µs | 340 µs | 197.5 KiB | 6,985 |
| 160 | 269 µs | 328 µs | 589 µs | 409.0 KiB | 3,711 |
| 320 | 536 µs | 600 µs | 1.05 ms | 884.4 KiB | 1,864 |
| 640 | 1.09 ms | 1.14 ms | 2.15 ms | 2.0 MiB | 915 |
| 1280 | 3.89 ms | 4.02 ms | 5.01 ms | 4.5 MiB | 257 |
| 2560 | 6.11 ms | 7.78 ms | 7.64 ms | 7.7 MiB | 164 |
| 5120 | 11.6 ms | 27.1 ms | 14.1 ms | 13.7 MiB | 86 |
| 10240 | 19.7 ms | 20.3 ms | 22.9 ms | 26.0 MiB | 51 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.10, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 397 µs | 404 µs | 713 µs | 290.6 KiB | 2,521 |
| 40 | 766 µs | 791 µs | 1.27 ms | 578.4 KiB | 1,306 |
| 80 | 1.54 ms | 1.92 ms | 2.64 ms | 1.1 MiB | 648 |
| 160 | 3.09 ms | 3.12 ms | 4.40 ms | 2.3 MiB | 324 |
| 320 | 5.90 ms | 6.07 ms | 7.62 ms | 4.7 MiB | 169 |
| 640 | 11.5 ms | 13.4 ms | 14.1 ms | 9.7 MiB | 87 |
| 1280 | 24.9 ms | 28.3 ms | 29.3 ms | 19.9 MiB | 40 |
| 2560 | 48.9 ms | 55.3 ms | 57.0 ms | 38.2 MiB | 20 |
| 5120 | 116 ms | 117 ms | 177 ms | 72.6 MiB | 9 |
| 10240 | 238 ms | 240 ms | 376 ms | 143.5 MiB | 4 |

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

**Measured: O(n log n)** (exponent 1.11, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 22.2 µs | 27.6 µs | 22.6 µs | 43.9 KiB | 44,997 |
| 40 | 30.7 µs | 41.2 µs | 84.5 µs | 86.2 KiB | 32,542 |
| 80 | 60.1 µs | 82.5 µs | 170 µs | 175.7 KiB | 16,636 |
| 160 | 116 µs | 171 µs | 318 µs | 364.7 KiB | 8,586 |
| 320 | 250 µs | 351 µs | 680 µs | 803.2 KiB | 4,001 |
| 640 | 516 µs | 706 µs | 1.14 ms | 1.8 MiB | 1,937 |
| 1280 | 2.91 ms | 3.23 ms | 4.85 ms | 4.2 MiB | 343 |
| 2560 | 4.03 ms | 4.31 ms | 6.38 ms | 7.0 MiB | 248 |
| 5120 | 7.15 ms | 7.45 ms | 10.4 ms | 12.4 MiB | 140 |
| 10240 | 15.6 ms | 16.3 ms | 22.4 ms | 23.2 MiB | 64 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.04, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 25.7 µs | 29.7 µs | 26.1 µs | 51.1 KiB | 38,852 |
| 40 | 44.5 µs | 52.1 µs | 121 µs | 100.6 KiB | 22,476 |
| 80 | 84.6 µs | 110 µs | 239 µs | 204.5 KiB | 11,827 |
| 160 | 193 µs | 229 µs | 536 µs | 425.8 KiB | 5,193 |
| 320 | 399 µs | 472 µs | 1.22 ms | 919.7 KiB | 2,504 |
| 640 | 1.13 ms | 1.28 ms | 3.69 ms | 2.1 MiB | 888 |
| 1280 | 4.44 ms | 4.79 ms | 9.13 ms | 4.7 MiB | 225 |
| 2560 | 6.57 ms | 9.95 ms | 13.8 ms | 7.8 MiB | 152 |
| 5120 | 12.7 ms | 14.4 ms | 25.9 ms | 14.2 MiB | 79 |
| 10240 | 24.6 ms | 25.0 ms | 48.3 ms | 26.5 MiB | 41 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 218 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 143 µs | 143 µs | 66% |
| `run-policies` | 1 | 60.1 µs | 60.1 µs | 28% |
| _unattributed_ |  |  | 14.3 µs | 6.6% |

**At 10240 checks** (whole operation: 37.2 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 19.7 ms | 19.7 ms | 53% |
| `run-policies` | 1 | 15.6 ms | 15.6 ms | 42% |
| _unattributed_ |  |  | 1.91 ms | 5.1% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-06T21:09:01.073Z` → `2026-10-06T21:09:21.185Z` (20 s), ci: CI (run 37530693420)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `0e51d582a5907ff18ce2808aa638415dd4cc43ce` on `dependabot/npm_and_yarn/shell-quote-1.11.0`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

