# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **160 exports** per operation, routing the work through `repo-contract` adds **1.78 s** per operation compared with a bare-minimum baseline (**705× the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.04). At list prices that is on the order of **~$10 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (160 exports) | Largest (1280 exports) |
| --- | --- | --- |
| Added latency per operation | 1.78 s | 14.4 s |
| Added latency, relative to baseline | 705× baseline | 1,160× baseline |
| Added CPU time per operation | 2.65 s | 20.7 s |
| Added memory per operation (heap delta) | 89.7 MiB | 440.6 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$10 | ~$100 |
| Single-core throughput ceiling of the overhead alone | 1 ops/s | 0 ops/s |

## 1. End-to-end: the package's total impact

Shows what a pull request pays, on every API-contract check, to find out whether the public API changed compatibly, compared with the bare minimum of reading the two API descriptions. Both sides start from the same extracted `.api.json` files; the difference is the engine's model loading, normalization and compatibility classification (including its type-assignability probing). This runs on every pull request and every pre-push.

- **Baseline (no package):** Read and JSON-parse the baseline and current API descriptions -- the least anyone would do to look at them.
- **With the package:** Load both API models, normalize them to the public surface, build the reference indexes and classify every change, probing type assignability where needed.

Both sides use empty or minimal functions on purpose, so the difference is the package's own cost -- not the cost of the work an application would plug into it. Real applications add their own work on top; this is the floor the package imposes.

**Variables that could change this result**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| exported symbols | swept | The tier axis: how many functions the package's public surface exports. |
| surface shape | fixed at "functions with one parameter each" | Interfaces, classes, generics and overloads add proportionally more per symbol and are not covered. |
| change mix | fixed at "about 6% widened, 6% breaking, 2 removed, 2 added" | A realistic mixed diff rather than 'identical' or 'completely different'; more changes mean more assignability probes. |
| extraction | fixed at "excluded" | Compiling and running API Extractor is a separate, larger cost done once per build; it is generated once per size and not measured here. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

The baseline is an empty or minimal function, so it costs almost nothing and the _relative_ overhead can look enormous (shown as a multiple of the baseline). Read the absolute columns -- time, CPU and dollars added -- they are what a bill and a latency budget are made of.

| exports | Baseline | With package | Added | Added vs baseline | Added CPU | Est. $ / 1M ops |
| --- | --- | --- | --- | --- | --- | --- |
| 20 | 499 µs | 223 ms | 223 ms | 448× baseline | 342 ms | $0.465 – $3.84 |
| 40 | 759 µs | 415 ms | 414 ms | 547× baseline | 600 ms | $0.863 – $6.75 |
| 80 | 1.23 ms | 793 ms | 792 ms | 643× baseline | 1.13 s | $2.10 – $12.68 |
| 160 | 2.52 ms | 1.78 s | 1.78 s | 705× baseline | 2.65 s | $3.70 – $29.83 |
| 320 | 4.47 ms | 3.51 s | 3.50 s | 785× baseline | 5.01 s | $27.09 – $56.37 |
| 640 | 7.48 ms | 7.18 s | 7.17 s | 960× baseline | 10.3 s | $41.74 – $115.97 |
| 1280 | 12.4 ms | 14.4 s | 14.4 s | 1,160× baseline | 20.7 s | $103.47 – $233.06 |

**How the total grows:** O(n) (linear), exponent 1.04 over 7 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 160 | At 1280 |
| --- | --- | --- | --- | --- | --- | --- |
| `loadApiModel (both API descriptions)` | export | O(n) | O(n) | ✅ matches | 39.1 ms | 201 ms |
| `normalizeApiPackage` | export | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.42 ms | 9.05 ms |
| `classifyContractChanges (with type-assignability probing)` | export | O(n) | O(n) | ✅ matches | 1.73 s | 14.2 s |

### `loadApiModel (both API descriptions)`

**Why we benchmark it.** The first step of every API-contract check: reading the extracted API descriptions into an in-memory model.

**What poor performance would mean.** Every API check starts slower in proportion to the size of the public surface, and a large model also raises memory use in CI.

**Expected growth: O(n).** Loading parses the JSON description and builds one model item per declaration, so cost is proportional to the size of the surface.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| exported symbols | swept | The tier axis: how many functions the package's public surface exports. |
| surface shape | fixed at "functions with one parameter each" | Interfaces, classes, generics and overloads add proportionally more per symbol and are not covered. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Once per API check, loading both the baseline and the current API description (this function loads both).

**Measured: O(n)** (exponent 0.74, 7 sizes) -- ✅ matches.

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 13.1 ms | 15.2 ms | 46.1 ms | 1.6 MiB | 76 |
| 40 | 18.7 ms | 20.3 ms | 61.2 ms | 2.9 MiB | 53 |
| 80 | 26.5 ms | 32.0 ms | 69.5 ms | 5.5 MiB | 38 |
| 160 | 39.1 ms | 41.4 ms | 85.6 ms | 10.4 MiB | 26 |
| 320 | 60.0 ms | 64.7 ms | 114 ms | 19.8 MiB | 17 |
| 640 | 115 ms | 118 ms | 192 ms | 38.5 MiB | 9 |
| 1280 | 201 ms | 221 ms | 312 ms | 24.9 MiB | 5 |

### `normalizeApiPackage`

**Why we benchmark it.** Reduces the loaded model to the comparable public surface (applying release tags and ordering), so two versions can be diffed symbol by symbol.

**What poor performance would mean.** API checks slow down with the size of the surface, and normalization runs twice per check (baseline and current).

**Expected growth: O(n log n).** It walks every declaration once and sorts members into a canonical order so the two versions line up, so the sort adds a log factor to the linear walk.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| exported symbols | swept | The tier axis: how many functions the package's public surface exports. |
| surface shape | fixed at "functions with one parameter each" | Interfaces, classes, generics and overloads add proportionally more per symbol and are not covered. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Once per API check, normalizing both the baseline and the current model (this function normalizes both).

**Measured: O(n)** (exponent 0.75, 7 sizes) -- 🟡 close (neighbouring class).

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 459 µs | 496 µs | 1.17 ms | 65.5 KiB | 2,180 |
| 40 | 716 µs | 855 µs | 2.54 ms | 127.5 KiB | 1,397 |
| 80 | 1.26 ms | 1.34 ms | 3.62 ms | 252.4 KiB | 797 |
| 160 | 1.42 ms | 2.23 ms | 5.26 ms | 492.1 KiB | 703 |
| 320 | 2.69 ms | 6.25 ms | 9.93 ms | 986.5 KiB | 372 |
| 640 | 4.93 ms | 5.21 ms | 18.7 ms | 1.8 MiB | 203 |
| 1280 | 9.05 ms | 9.63 ms | 33.0 ms | 3.6 MiB | 110 |

### `classifyContractChanges (with type-assignability probing)`

**Why we benchmark it.** Decides, change by change, whether a pull request breaks consumers -- the verdict that gates a release. It also drives the most expensive step, asking the TypeScript compiler whether one type still accepts another.

**What poor performance would mean.** Slower API checks on every pull request, and the cost lands on exactly the large packages that most need the protection; a super-linear classifier would make the check impractical for them.

**Expected growth: O(n).** It matches symbols by name through maps and classifies each difference once; type-assignability probes happen only for the changed symbols, whose number is a fixed proportion of the surface, so cost is proportional to the size of the surface.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| exported symbols | swept | The tier axis: how many functions the package's public surface exports. |
| surface shape | fixed at "functions with one parameter each" | Interfaces, classes, generics and overloads add proportionally more per symbol and are not covered. |
| change mix | fixed at "about 6% widened, 6% breaking, 2 removed, 2 added" | A realistic mixed diff rather than 'identical' or 'completely different'; more changes mean more assignability probes. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**Deliberately not covered**

- **changes that need the compiler to be conservative** -- Rare generic and conditional-type edge cases take slower probing paths; the synthetic surface uses simple parameter types.

**In the end-to-end run:** Once per API check, after both models are normalized.

**Measured: O(n)** (exponent 1.05, 7 sizes) -- ✅ matches.

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 193 ms | 202 ms | 290 ms | 44.8 MiB | 5 |
| 40 | 378 ms | 388 ms | 548 ms | 97.7 MiB | 3 |
| 80 | 754 ms | 760 ms | 1.06 s | 169.4 MiB | 1 |
| 160 | 1.73 s | 1.74 s | 2.57 s | 84.7 MiB | 1 |
| 320 | 3.38 s | 3.45 s | 4.82 s | 416.9 MiB | 0 |
| 640 | 6.98 s | 7.04 s | 10.1 s | 242.3 MiB | 0 |
| 1280 | 14.2 s | 14.2 s | 20.4 s | 242.2 MiB | 0 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 160 exports** (whole operation: 1.78 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `classify-contract-changes` | 1 | 1.73 s | 1.73 s | 97% |
| `load-api-model` | 1 | 39.1 ms | 39.1 ms | 2.2% |
| `normalize-api-package` | 1 | 1.42 ms | 1.42 ms | 0.1% |
| _unattributed_ |  |  | 5.83 ms | 0.3% |

**At 1280 exports** (whole operation: 14.4 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `classify-contract-changes` | 1 | 14.2 s | 14.2 s | 98% |
| `load-api-model` | 1 | 201 ms | 201 ms | 1.4% |
| `normalize-api-package` | 1 | 9.05 ms | 9.05 ms | 0.1% |
| _unattributed_ |  |  | 28.3 ms | 0.2% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-13T06:57:23.393Z` → `2026-11-13T07:01:53.400Z` (270 s), ci: CI (run 43379180763)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `b218ab4f7826516cb741170f087bebfb3a00c876` on `docs/v1-claims-evidence`
- Sizes: 20, 40, 80, 160, 320, 640, 1280 exports -- One exported function in the package's public API. 160 is a mid-sized library's surface; the ladder reaches 1,280. It stops there, not at 10,240, because every size compiles a real synthetic TypeScript package and runs API Extractor over it, which takes minutes at the largest sizes.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

