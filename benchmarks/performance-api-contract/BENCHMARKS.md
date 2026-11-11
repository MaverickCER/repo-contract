# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **160 exports** per operation, routing the work through `repo-contract` adds **1.81 s** per operation compared with a bare-minimum baseline (**628× the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.04). At list prices that is on the order of **~$10 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (160 exports) | Largest (1280 exports) |
| --- | --- | --- |
| Added latency per operation | 1.81 s | 14.6 s |
| Added latency, relative to baseline | 628× baseline | 1,161× baseline |
| Added CPU time per operation | 2.71 s | 21.4 s |
| Added memory per operation (heap delta) | 89.6 MiB | 387.8 MiB |
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
| 20 | 445 µs | 220 ms | 219 ms | 494× baseline | 352 ms | $0.457 – $3.96 |
| 40 | 697 µs | 414 ms | 413 ms | 593× baseline | 620 ms | $0.861 – $6.97 |
| 80 | 1.48 ms | 804 ms | 802 ms | 543× baseline | 1.17 s | $2.13 – $13.17 |
| 160 | 2.89 ms | 1.82 s | 1.81 s | 628× baseline | 2.71 s | $3.78 – $30.47 |
| 320 | 4.47 ms | 3.53 s | 3.53 s | 790× baseline | 5.14 s | $25.37 – $57.82 |
| 640 | 7.24 ms | 7.24 s | 7.23 s | 1,000× baseline | 10.6 s | $41.71 – $119.10 |
| 1280 | 12.6 ms | 14.6 s | 14.6 s | 1,161× baseline | 21.4 s | $92.04 – $241.03 |

**How the total grows:** O(n) (linear), exponent 1.04 over 7 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 160 | At 1280 |
| --- | --- | --- | --- | --- | --- | --- |
| `loadApiModel (both API descriptions)` | export | O(n) | O(n) | ✅ matches | 39.4 ms | 195 ms |
| `normalizeApiPackage` | export | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.33 ms | 8.48 ms |
| `classifyContractChanges (with type-assignability probing)` | export | O(n) | O(n) | ✅ matches | 1.74 s | 14.3 s |

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

**Measured: O(n)** (exponent 0.72, 7 sizes) -- ✅ matches.

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 11.4 ms | 12.8 ms | 43.5 ms | 1.6 MiB | 88 |
| 40 | 19.7 ms | 21.2 ms | 67.8 ms | 2.9 MiB | 51 |
| 80 | 26.6 ms | 28.4 ms | 79.0 ms | 5.5 MiB | 38 |
| 160 | 39.4 ms | 42.5 ms | 95.0 ms | 10.4 MiB | 25 |
| 320 | 62.0 ms | 64.0 ms | 119 ms | 20.0 MiB | 16 |
| 640 | 107 ms | 115 ms | 193 ms | 38.7 MiB | 9 |
| 1280 | 195 ms | 200 ms | 315 ms | 18.2 MiB | 5 |

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

**Measured: O(n)** (exponent 0.72, 7 sizes) -- 🟡 close (neighbouring class).

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 451 µs | 474 µs | 464 µs | 65.7 KiB | 2,216 |
| 40 | 741 µs | 837 µs | 1.67 ms | 128.8 KiB | 1,349 |
| 80 | 1.32 ms | 1.46 ms | 4.13 ms | 254.9 KiB | 757 |
| 160 | 1.33 ms | 1.40 ms | 4.34 ms | 492.1 KiB | 751 |
| 320 | 2.65 ms | 3.80 ms | 9.88 ms | 986.5 KiB | 377 |
| 640 | 4.65 ms | 7.35 ms | 17.8 ms | 1.8 MiB | 215 |
| 1280 | 8.48 ms | 9.44 ms | 32.5 ms | 3.6 MiB | 118 |

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
| 20 | 202 ms | 211 ms | 311 ms | 44.8 MiB | 5 |
| 40 | 389 ms | 394 ms | 571 ms | 97.5 MiB | 3 |
| 80 | 763 ms | 773 ms | 1.09 s | 169.3 MiB | 1 |
| 160 | 1.74 s | 1.74 s | 2.62 s | 83.1 MiB | 1 |
| 320 | 3.45 s | 3.46 s | 5.02 s | 415.8 MiB | 0 |
| 640 | 7.10 s | 7.22 s | 10.4 s | 237.4 MiB | 0 |
| 1280 | 14.3 s | 14.3 s | 21.0 s | 234.1 MiB | 0 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 160 exports** (whole operation: 1.82 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `classify-contract-changes` | 1 | 1.74 s | 1.74 s | 96% |
| `load-api-model` | 1 | 39.4 ms | 39.4 ms | 2.2% |
| `normalize-api-package` | 1 | 1.33 ms | 1.33 ms | 0.1% |
| _unattributed_ |  |  | 34.4 ms | 1.9% |

**At 1280 exports** (whole operation: 14.6 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `classify-contract-changes` | 1 | 14.3 s | 14.3 s | 98% |
| `load-api-model` | 1 | 195 ms | 195 ms | 1.3% |
| `normalize-api-package` | 1 | 8.48 ms | 8.48 ms | 0.1% |
| _unattributed_ |  |  | 105 ms | 0.7% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-11T11:56:25.238Z` → `2026-11-11T12:00:46.137Z` (261 s), ci: CI (run 43013441445)
- Machine: Intel(R) Xeon(R) Platinum 8370C CPU @ 2.80GHz, 4 logical core(s) (2 physical), 15982 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `edac848e771159164c3871993f65a7b5ccb346c8` on `docs/v1-claims-evidence`
- Sizes: 20, 40, 80, 160, 320, 640, 1280 exports -- One exported function in the package's public API. 160 is a mid-sized library's surface; the ladder reaches 1,280. It stops there, not at 10,240, because every size compiles a real synthetic TypeScript package and runs API Extractor over it, which takes minutes at the largest sizes.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

