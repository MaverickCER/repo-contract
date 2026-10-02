# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **242 µs** per operation compared with a bare-minimum baseline (127%), about **$0.0005 – $0.008 per million operations** of compute. Overall, it grows O(n) with workload size (measured exponent 1.00).

> Dollar figures are **estimates** from published list prices (see _Cost model_ below) and are for comparing orders of magnitude, not for budgeting to the cent.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 242 µs | 35.4 ms |
| Added latency, relative to baseline | 127% | 209% |
| Added CPU time per operation | 709 µs | 37.4 ms |
| Added memory per operation (heap delta) | 320.0 KiB | 41.5 MiB |
| Estimated compute cost per 1M operations | $0.0005 – $0.008 | $0.074 – $0.421 |
| Single-core throughput ceiling of the overhead alone | 4,129 ops/s | 28 ops/s |

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
| 20 | 54.2 µs | 147 µs | 92.8 µs | 171% | 400 µs | $0.00019 – $0.0045 |
| 40 | 96.0 µs | 223 µs | 127 µs | 132% | 360 µs | $0.00026 – $0.0041 |
| 80 | 190 µs | 432 µs | 242 µs | 127% | 709 µs | $0.0005 – $0.008 |
| 160 | 318 µs | 740 µs | 422 µs | 133% | 845 µs | $0.00088 – $0.0095 |
| 320 | 642 µs | 1.48 ms | 841 µs | 131% | 1.73 ms | $0.0018 – $0.019 |
| 640 | 1.30 ms | 2.84 ms | 1.53 ms | 117% | 1.91 ms | $0.0032 – $0.021 |
| 1280 | 2.31 ms | 11.3 ms | 8.94 ms | 387% | 9.35 ms | $0.019 – $0.105 |
| 2560 | 4.40 ms | 16.7 ms | 12.3 ms | 279% | 12.7 ms | $0.026 – $0.142 |
| 5120 | 8.59 ms | 28.2 ms | 19.6 ms | 228% | 20.7 ms | $0.041 – $0.233 |
| 10240 | 17.0 ms | 52.4 ms | 35.4 ms | 209% | 37.4 ms | $0.074 – $0.421 |

**How the total grows:** O(n) (linear), exponent 1.00 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | O(n) | O(n) | ✅ matches | 273 µs | 31.3 ms |
| `buildEvidence` (chatty-output) | O(n) | O(n) | ✅ matches | 2.49 ms | 341 ms |
| `runPolicies` (quiet-output) | O(n) | O(n) | ✅ matches | 130 µs | 20.2 ms |
| `runPolicies` (chatty-output) | O(n) | O(n) | ✅ matches | 172 µs | 30.6 ms |

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
| 20 | 80.9 µs | 85.5 µs | 311 µs | 49.2 KiB | 12,363 |
| 40 | 138 µs | 151 µs | 444 µs | 97.4 KiB | 7,236 |
| 80 | 273 µs | 282 µs | 884 µs | 197.5 KiB | 3,666 |
| 160 | 508 µs | 524 µs | 1.44 ms | 409.0 KiB | 1,969 |
| 320 | 1.02 ms | 1.05 ms | 2.90 ms | 884.8 KiB | 982 |
| 640 | 1.80 ms | 1.85 ms | 3.77 ms | 2.0 MiB | 556 |
| 1280 | 6.59 ms | 6.94 ms | 8.57 ms | 4.5 MiB | 152 |
| 2560 | 10.1 ms | 10.5 ms | 12.5 ms | 7.7 MiB | 99 |
| 5120 | 16.8 ms | 17.1 ms | 18.5 ms | 13.7 MiB | 59 |
| 10240 | 31.3 ms | 31.9 ms | 35.0 ms | 25.9 MiB | 32 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 694 µs | 711 µs | 1.64 ms | 290.6 KiB | 1,441 |
| 40 | 1.37 ms | 1.39 ms | 3.33 ms | 578.5 KiB | 732 |
| 80 | 2.49 ms | 2.97 ms | 4.61 ms | 1.1 MiB | 402 |
| 160 | 4.66 ms | 4.71 ms | 7.13 ms | 2.3 MiB | 214 |
| 320 | 8.99 ms | 9.08 ms | 12.1 ms | 4.7 MiB | 111 |
| 640 | 17.7 ms | 18.7 ms | 22.0 ms | 9.7 MiB | 56 |
| 1280 | 38.6 ms | 40.5 ms | 45.6 ms | 19.9 MiB | 26 |
| 2560 | 73.8 ms | 77.2 ms | 87.7 ms | 38.2 MiB | 14 |
| 5120 | 171 ms | 172 ms | 272 ms | 72.6 MiB | 6 |
| 10240 | 341 ms | 343 ms | 549 ms | 143.6 MiB | 3 |

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

**Measured: O(n)** (exponent 1.06, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 40.8 µs | 48.1 µs | 42.2 µs | 44.9 KiB | 24,501 |
| 40 | 64.3 µs | 71.2 µs | 234 µs | 86.2 KiB | 15,559 |
| 80 | 130 µs | 138 µs | 440 µs | 175.8 KiB | 7,683 |
| 160 | 224 µs | 278 µs | 690 µs | 368.2 KiB | 4,463 |
| 320 | 473 µs | 578 µs | 1.48 ms | 804.4 KiB | 2,116 |
| 640 | 1.07 ms | 1.26 ms | 3.23 ms | 1.8 MiB | 932 |
| 1280 | 5.07 ms | 5.58 ms | 8.04 ms | 4.2 MiB | 197 |
| 2560 | 6.47 ms | 6.78 ms | 9.80 ms | 7.0 MiB | 155 |
| 5120 | 10.1 ms | 10.5 ms | 14.6 ms | 12.4 MiB | 99 |
| 10240 | 20.2 ms | 20.6 ms | 28.8 ms | 23.0 MiB | 50 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.09, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 45.9 µs | 52.9 µs | 48.4 µs | 51.1 KiB | 21,810 |
| 40 | 82.2 µs | 88.4 µs | 314 µs | 100.7 KiB | 12,167 |
| 80 | 172 µs | 182 µs | 593 µs | 204.7 KiB | 5,831 |
| 160 | 329 µs | 366 µs | 1.17 ms | 426.2 KiB | 3,038 |
| 320 | 673 µs | 774 µs | 2.25 ms | 919.5 KiB | 1,486 |
| 640 | 1.53 ms | 1.60 ms | 5.75 ms | 2.1 MiB | 654 |
| 1280 | 6.03 ms | 6.47 ms | 13.2 ms | 4.7 MiB | 166 |
| 2560 | 8.49 ms | 8.99 ms | 19.3 ms | 7.8 MiB | 118 |
| 5120 | 16.0 ms | 16.2 ms | 37.1 ms | 14.2 MiB | 63 |
| 10240 | 30.6 ms | 31.1 ms | 71.3 ms | 26.4 MiB | 33 |

## 3. What makes up the end-to-end overhead

Each function's measured cost is multiplied by how many times one end-to-end operation calls it, then compared with the total overhead from section 1. This shows where the cost actually lives, so effort goes to the function that matters. Shares are estimates: they can sum to slightly more or less than 100% because the two measurements were taken separately (the remainder is shown as _unattributed_).

**At 80 checks** (total added: 242 µs)

| Function | Calls / operation | Estimated time | Share of added time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 273 µs | 113% | 63% |
| `run-policies` | 1 | 130 µs | 54% | 30% |
| _unattributed_ |  | 0 | 0.0% |  |

**At 10240 checks** (total added: 35.4 ms)

| Function | Calls / operation | Estimated time | Share of added time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 31.3 ms | 88% | 60% |
| `run-policies` | 1 | 20.2 ms | 57% | 39% |
| _unattributed_ |  | 0 | 0.0% |  |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-02T00:30:45.243Z` → `2026-10-02T00:31:12.119Z` (27 s), ci
- Machine: INTEL(R) XEON(R) PLATINUM 8573C, 4 logical core(s) (2 physical), 15989 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `2000ec3e4768c623f615e1355648547539b48b4b` on `feat/shared-benchmark-kit-migration` (uncommitted changes)
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

