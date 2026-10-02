# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **258 µs** per operation compared with a bare-minimum baseline (123%), about **$0.00054 – $0.0073 per million operations** of compute. Overall, it grows O(n) with workload size (measured exponent 0.99).

> Dollar figures are **estimates** from published list prices (see _Cost model_ below) and are for comparing orders of magnitude, not for budgeting to the cent.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 258 µs | 38.3 ms |
| Added latency, relative to baseline | 123% | 178% |
| Added CPU time per operation | 653 µs | 42.4 ms |
| Added memory per operation (heap delta) | 320.0 KiB | 41.2 MiB |
| Estimated compute cost per 1M operations | $0.00054 – $0.0073 | $0.080 – $0.477 |
| Single-core throughput ceiling of the overhead alone | 3,879 ops/s | 26 ops/s |

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
| 20 | 59.3 µs | 172 µs | 112 µs | 189% | 469 µs | $0.00023 – $0.0053 |
| 40 | 108 µs | 262 µs | 154 µs | 142% | 449 µs | $0.00032 – $0.005 |
| 80 | 209 µs | 467 µs | 258 µs | 123% | 653 µs | $0.00054 – $0.0073 |
| 160 | 427 µs | 823 µs | 396 µs | 93% | 415 µs | $0.00082 – $0.0047 |
| 320 | 755 µs | 1.65 ms | 900 µs | 119% | 1.68 ms | $0.0019 – $0.019 |
| 640 | 1.51 ms | 3.16 ms | 1.64 ms | 108% | 1.96 ms | $0.0034 – $0.022 |
| 1280 | 2.82 ms | 12.4 ms | 9.56 ms | 339% | 9.98 ms | $0.020 – $0.112 |
| 2560 | 5.49 ms | 17.7 ms | 12.2 ms | 223% | 12.6 ms | $0.026 – $0.142 |
| 5120 | 10.8 ms | 31.4 ms | 20.6 ms | 190% | 22.2 ms | $0.043 – $0.250 |
| 10240 | 21.5 ms | 59.8 ms | 38.3 ms | 178% | 42.4 ms | $0.080 – $0.477 |

**How the total grows:** O(n) (linear), exponent 0.99 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | O(n) | O(n) | ✅ matches | 295 µs | 34.5 ms |
| `buildEvidence` (chatty-output) | O(n) | O(n) | ✅ matches | 2.91 ms | 405 ms |
| `runPolicies` (quiet-output) | O(n) | O(n) | ✅ matches | 128 µs | 23.5 ms |
| `runPolicies` (chatty-output) | O(n) | O(n) | ✅ matches | 180 µs | 33.1 ms |

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

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 81.7 µs | 82.8 µs | 245 µs | 49.2 KiB | 12,244 |
| 40 | 157 µs | 163 µs | 455 µs | 97.4 KiB | 6,380 |
| 80 | 295 µs | 308 µs | 786 µs | 197.5 KiB | 3,394 |
| 160 | 553 µs | 587 µs | 1.29 ms | 409.0 KiB | 1,808 |
| 320 | 1.10 ms | 1.13 ms | 2.59 ms | 884.8 KiB | 908 |
| 640 | 2.03 ms | 2.10 ms | 3.58 ms | 2.0 MiB | 493 |
| 1280 | 6.81 ms | 7.15 ms | 8.41 ms | 4.5 MiB | 147 |
| 2560 | 10.7 ms | 11.7 ms | 12.7 ms | 7.7 MiB | 94 |
| 5120 | 18.7 ms | 20.3 ms | 20.7 ms | 13.7 MiB | 53 |
| 10240 | 34.5 ms | 34.8 ms | 37.9 ms | 26.0 MiB | 29 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 783 µs | 811 µs | 1.53 ms | 290.6 KiB | 1,277 |
| 40 | 1.57 ms | 1.58 ms | 3.14 ms | 578.5 KiB | 637 |
| 80 | 2.91 ms | 3.41 ms | 4.59 ms | 1.1 MiB | 344 |
| 160 | 5.59 ms | 5.68 ms | 7.52 ms | 2.3 MiB | 179 |
| 320 | 10.9 ms | 11.0 ms | 13.3 ms | 4.7 MiB | 91 |
| 640 | 21.7 ms | 21.9 ms | 24.9 ms | 9.7 MiB | 46 |
| 1280 | 46.0 ms | 48.2 ms | 51.2 ms | 19.9 MiB | 22 |
| 2560 | 89.7 ms | 96.4 ms | 98.5 ms | 38.2 MiB | 11 |
| 5120 | 203 ms | 206 ms | 300 ms | 72.6 MiB | 5 |
| 10240 | 405 ms | 406 ms | 606 ms | 143.5 MiB | 2 |

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

**Measured: O(n)** (exponent 1.04, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 56.7 µs | 73.8 µs | 58.5 µs | 45.2 KiB | 17,646 |
| 40 | 74.2 µs | 104 µs | 258 µs | 86.3 KiB | 13,474 |
| 80 | 128 µs | 180 µs | 372 µs | 175.8 KiB | 7,808 |
| 160 | 266 µs | 343 µs | 771 µs | 368.7 KiB | 3,755 |
| 320 | 504 µs | 545 µs | 1.41 ms | 803.7 KiB | 1,984 |
| 640 | 1.10 ms | 1.48 ms | 2.81 ms | 1.8 MiB | 906 |
| 1280 | 4.90 ms | 5.22 ms | 7.41 ms | 4.2 MiB | 204 |
| 2560 | 7.04 ms | 7.46 ms | 9.79 ms | 7.0 MiB | 142 |
| 5120 | 11.3 ms | 12.5 ms | 15.8 ms | 12.4 MiB | 88 |
| 10240 | 23.5 ms | 24.1 ms | 31.7 ms | 23.1 MiB | 43 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.10, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 52.1 µs | 55.8 µs | 212 µs | 51.0 KiB | 19,205 |
| 40 | 82.6 µs | 104 µs | 260 µs | 100.7 KiB | 12,101 |
| 80 | 180 µs | 218 µs | 626 µs | 204.8 KiB | 5,557 |
| 160 | 327 µs | 417 µs | 1.06 ms | 426.2 KiB | 3,062 |
| 320 | 666 µs | 856 µs | 1.98 ms | 918.0 KiB | 1,501 |
| 640 | 1.59 ms | 1.91 ms | 5.00 ms | 2.1 MiB | 630 |
| 1280 | 6.45 ms | 6.82 ms | 12.5 ms | 4.7 MiB | 155 |
| 2560 | 9.77 ms | 10.4 ms | 19.7 ms | 7.8 MiB | 102 |
| 5120 | 17.8 ms | 18.7 ms | 36.5 ms | 14.2 MiB | 56 |
| 10240 | 33.1 ms | 33.8 ms | 68.7 ms | 26.9 MiB | 30 |

## 3. What makes up the end-to-end overhead

Each function's measured cost is multiplied by how many times one end-to-end operation calls it, then compared with the total overhead from section 1. This shows where the cost actually lives, so effort goes to the function that matters. Shares are estimates: they can sum to slightly more or less than 100% because the two measurements were taken separately (the remainder is shown as _unattributed_).

**At 80 checks** (total added: 258 µs)

| Function | Calls / operation | Estimated time | Share of added time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 295 µs | 114% | 63% |
| `run-policies` | 1 | 128 µs | 50% | 27% |
| _unattributed_ |  | 0 | 0.0% |  |

**At 10240 checks** (total added: 38.3 ms)

| Function | Calls / operation | Estimated time | Share of added time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 34.5 ms | 90% | 58% |
| `run-policies` | 1 | 23.5 ms | 61% | 39% |
| _unattributed_ |  | 0 | 0.0% |  |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-02T16:19:59.011Z` → `2026-10-02T16:20:26.727Z` (28 s), ci
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15994 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `c74e9f4ff4a8a8dc2c0e55606a20f2ffaaf1a44c` on `chore/repin-ipc-0.7.0` (uncommitted changes)
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

