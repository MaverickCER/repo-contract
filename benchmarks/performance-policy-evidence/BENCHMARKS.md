# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **100 µs** per operation compared with a bare-minimum baseline (124%), about **$0.00021 – $0.0029 per million operations** of compute. Overall, it grows O(n) with workload size (measured exponent 1.08).

> Dollar figures are **estimates** from published list prices (see _Cost model_ below) and are for comparing orders of magnitude, not for budgeting to the cent.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 100 µs | 20.0 ms |
| Added latency, relative to baseline | 124% | 195% |
| Added CPU time per operation | 256 µs | 22.1 ms |
| Added memory per operation (heap delta) | 319.2 KiB | 40.8 MiB |
| Estimated compute cost per 1M operations | $0.00021 – $0.0029 | $0.042 – $0.248 |
| Single-core throughput ceiling of the overhead alone | 9,993 ops/s | 50 ops/s |
| Shipped code parsed at every cold start (gzip) | 19.3 KiB | 19.3 KiB |

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
| 20 | 20.6 µs | 46.9 µs | 26.3 µs | 128% | 97.9 µs | $0.000055 – $0.0011 |
| 40 | 41.2 µs | 89.2 µs | 48.0 µs | 117% | 103 µs | $0.0001 – $0.0012 |
| 80 | 80.4 µs | 181 µs | 100 µs | 124% | 256 µs | $0.00021 – $0.0029 |
| 160 | 167 µs | 367 µs | 200 µs | 120% | 386 µs | $0.00042 – $0.0043 |
| 320 | 336 µs | 707 µs | 371 µs | 110% | 601 µs | $0.00077 – $0.0068 |
| 640 | 668 µs | 1.42 ms | 750 µs | 112% | 1.36 ms | $0.0016 – $0.015 |
| 1280 | 1.29 ms | 6.51 ms | 5.22 ms | 406% | 5.44 ms | $0.011 – $0.061 |
| 2560 | 2.71 ms | 9.22 ms | 6.51 ms | 240% | 6.42 ms | $0.014 – $0.072 |
| 5120 | 5.05 ms | 16.1 ms | 11.0 ms | 218% | 12.1 ms | $0.023 – $0.136 |
| 10240 | 10.2 ms | 30.2 ms | 20.0 ms | 195% | 22.1 ms | $0.042 – $0.248 |

**How the total grows:** O(n) (linear), exponent 1.08 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | O(n) | O(n) | ✅ matches | 108 µs | 17.8 ms |
| `buildEvidence` (chatty-output) | O(n) | O(n) | ✅ matches | 1.25 ms | 192 ms |
| `runPolicies` (quiet-output) | O(n) | O(n log n) | 🟡 close (neighbouring class) | 46.4 µs | 15.0 ms |
| `runPolicies` (chatty-output) | O(n) | O(n log n) | 🟡 close (neighbouring class) | 61.9 µs | 18.3 ms |

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

**Measured: O(n)** (exponent 1.07, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 28.6 µs | 28.9 µs | 61.7 µs | 49.2 KiB | 34,966 |
| 40 | 54.9 µs | 55.8 µs | 106 µs | 97.3 KiB | 18,222 |
| 80 | 108 µs | 109 µs | 206 µs | 197.4 KiB | 9,260 |
| 160 | 214 µs | 235 µs | 392 µs | 408.8 KiB | 4,671 |
| 320 | 427 µs | 466 µs | 730 µs | 884.5 KiB | 2,339 |
| 640 | 854 µs | 929 µs | 1.32 ms | 2.0 MiB | 1,171 |
| 1280 | 3.64 ms | 3.71 ms | 4.64 ms | 4.5 MiB | 274 |
| 2560 | 5.41 ms | 5.48 ms | 6.58 ms | 7.7 MiB | 185 |
| 5120 | 9.54 ms | 9.73 ms | 10.9 ms | 13.7 MiB | 105 |
| 10240 | 17.8 ms | 19.2 ms | 19.9 ms | 25.9 MiB | 56 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.03, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 317 µs | 319 µs | 533 µs | 290.4 KiB | 3,154 |
| 40 | 628 µs | 635 µs | 1.08 ms | 578.3 KiB | 1,592 |
| 80 | 1.25 ms | 1.27 ms | 2.27 ms | 1.1 MiB | 798 |
| 160 | 2.48 ms | 2.63 ms | 3.67 ms | 2.3 MiB | 404 |
| 320 | 4.95 ms | 5.22 ms | 6.43 ms | 4.7 MiB | 202 |
| 640 | 9.97 ms | 10.9 ms | 12.3 ms | 9.7 MiB | 100 |
| 1280 | 22.6 ms | 23.7 ms | 26.1 ms | 19.9 MiB | 44 |
| 2560 | 43.9 ms | 44.5 ms | 50.5 ms | 38.2 MiB | 23 |
| 5120 | 97.6 ms | 98.6 ms | 149 ms | 72.6 MiB | 10 |
| 10240 | 192 ms | 196 ms | 300 ms | 143.5 MiB | 5 |

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

**Measured: O(n log n)** (exponent 1.18, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 12.8 µs | 14.4 µs | 21.7 µs | 43.7 KiB | 78,401 |
| 40 | 22.9 µs | 23.4 µs | 58.1 µs | 84.2 KiB | 43,718 |
| 80 | 46.4 µs | 47.3 µs | 123 µs | 171.8 KiB | 21,557 |
| 160 | 92.5 µs | 101 µs | 231 µs | 358.6 KiB | 10,808 |
| 320 | 188 µs | 202 µs | 446 µs | 777.4 KiB | 5,325 |
| 640 | 411 µs | 438 µs | 1.08 ms | 1.8 MiB | 2,436 |
| 1280 | 2.76 ms | 2.85 ms | 4.27 ms | 4.2 MiB | 363 |
| 2560 | 3.69 ms | 3.80 ms | 5.46 ms | 7.0 MiB | 271 |
| 5120 | 6.04 ms | 8.68 ms | 8.64 ms | 12.4 MiB | 165 |
| 10240 | 15.0 ms | 23.5 ms | 19.5 ms | 37.6 MiB | 67 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.16, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 19.3 µs | 79.2 µs | 35.5 µs | 51.0 KiB | 51,815 |
| 40 | 32.5 µs | 51.7 µs | 84.9 µs | 99.5 KiB | 30,783 |
| 80 | 61.9 µs | 80.2 µs | 164 µs | 200.8 KiB | 16,145 |
| 160 | 126 µs | 145 µs | 356 µs | 416.6 KiB | 7,923 |
| 320 | 255 µs | 271 µs | 736 µs | 896.4 KiB | 3,924 |
| 640 | 541 µs | 581 µs | 1.69 ms | 2.0 MiB | 1,850 |
| 1280 | 3.05 ms | 3.27 ms | 6.53 ms | 4.6 MiB | 328 |
| 2560 | 4.64 ms | 5.40 ms | 10.6 ms | 7.7 MiB | 215 |
| 5120 | 8.18 ms | 8.85 ms | 20.1 ms | 14.0 MiB | 122 |
| 10240 | 18.3 ms | 18.8 ms | 38.8 ms | 41.6 MiB | 55 |

## 3. What makes up the end-to-end overhead

Each function's measured cost is multiplied by how many times one end-to-end operation calls it, then compared with the total overhead from section 1. This shows where the cost actually lives, so effort goes to the function that matters. Shares are estimates: they can sum to slightly more or less than 100% because the two measurements were taken separately (the remainder is shown as _unattributed_).

**At 80 checks** (total added: 100 µs)

| Function | Calls / operation | Estimated time | Share of added time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 108 µs | 108% | 60% |
| `run-policies` | 1 | 46.4 µs | 46% | 26% |
| _unattributed_ |  | 0 | 0.0% |  |

**At 10240 checks** (total added: 20.0 ms)

| Function | Calls / operation | Estimated time | Share of added time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 17.8 ms | 89% | 59% |
| `run-policies` | 1 | 15.0 ms | 75% | 50% |
| _unattributed_ |  | 0 | 0.0% |  |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-01T14:35:40.593Z` → `2026-10-01T14:35:57.321Z` (17 s), npm run benchmark
- Machine: Apple M3, 8 logical core(s) (8 physical), 24576 MB RAM, darwin/arm64, Node v24.20.0, local
- Git: `4ef058336f9a3755b92926f8d2bfaa07ef43fdae` on `feat/remove-minimatch-dist-no-urls` (uncommitted changes)
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

