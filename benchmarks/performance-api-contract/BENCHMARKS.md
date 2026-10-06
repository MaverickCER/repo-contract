# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **160 exports** per operation, routing the work through `repo-contract` adds **4.63 s** per operation compared with a bare-minimum baseline (**1,604× baseline** of the baseline). Overall, it grows O(n) with workload size (measured exponent 1.05). At list prices that is on the order of **~$10 – $100 per million operations** of compute.

> The relative figure and the growth class are the dependable ones: both come from the same run, so they survive a change of machine. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (160 exports) | Largest (1280 exports) |
| --- | --- | --- |
| Added latency per operation | 4.63 s | 38.9 s |
| Added latency, relative to baseline | 1,604× baseline | 2,979× baseline |
| Added CPU time per operation | 7.02 s | 58.3 s |
| Added memory per operation (heap delta) | 271.4 MiB | 356.6 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$10 – $100 | ~$100 – $1000 |
| Single-core throughput ceiling of the overhead alone | 0 ops/s | 0 ops/s |

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
| 20 | 420 µs | 576 ms | 576 ms | 1,372× baseline | 925 ms | $1.20 – $10.40 |
| 40 | 689 µs | 1.06 s | 1.06 s | 1,536× baseline | 1.60 s | $3.17 – $17.94 |
| 80 | 1.46 ms | 2.09 s | 2.09 s | 1,429× baseline | 3.03 s | $11.97 – $34.06 |
| 160 | 2.89 ms | 4.63 s | 4.63 s | 1,604× baseline | 7.02 s | $20.44 – $78.95 |
| 320 | 4.39 ms | 9.28 s | 9.27 s | 2,112× baseline | 14.0 s | $52.96 – $157.05 |
| 640 | 7.60 ms | 19.0 s | 19.0 s | 2,506× baseline | 28.5 s | $158.46 – $320.24 |
| 1280 | 13.1 ms | 38.9 s | 38.9 s | 2,979× baseline | 58.3 s | $225.91 – $655.62 |

**How the total grows:** O(n) (linear), exponent 1.05 over 7 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 160 | At 1280 |
| --- | --- | --- | --- | --- | --- |
| `loadApiModel (both API descriptions)` | O(n) | O(log n) | 🟡 close (neighbouring class) | 61.8 ms | 251 ms |
| `normalizeApiPackage` | O(n log n) | O(n) | 🟡 close (neighbouring class) | 2.22 ms | 15.2 ms |
| `classifyContractChanges (with type-assignability probing)` | O(n) | O(n) | ✅ matches | 4.78 s | 38.7 s |

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

**Measured: O(log n)** (exponent 0.64, 7 sizes) -- 🟡 close (neighbouring class).

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 13.9 ms | 15.6 ms | 52.9 ms | 1.5 MiB | 72 |
| 40 | 25.8 ms | 30.9 ms | 103 ms | 2.8 MiB | 39 |
| 80 | 42.8 ms | 50.2 ms | 164 ms | 5.5 MiB | 23 |
| 160 | 61.8 ms | 67.6 ms | 196 ms | 10.5 MiB | 16 |
| 320 | 88.9 ms | 96.3 ms | 230 ms | 19.9 MiB | 11 |
| 640 | 148 ms | 154 ms | 326 ms | 38.7 MiB | 7 |
| 1280 | 251 ms | 263 ms | 460 ms | 18.3 MiB | 4 |

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

**Measured: O(n)** (exponent 0.81, 7 sizes) -- 🟡 close (neighbouring class).

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 576 µs | 608 µs | 1.46 ms | 65.7 KiB | 1,737 |
| 40 | 1.00 ms | 1.08 ms | 3.24 ms | 128.8 KiB | 998 |
| 80 | 1.71 ms | 1.84 ms | 6.08 ms | 252.4 KiB | 585 |
| 160 | 2.22 ms | 5.56 ms | 8.31 ms | 492.1 KiB | 450 |
| 320 | 4.56 ms | 4.98 ms | 17.6 ms | 986.5 KiB | 219 |
| 640 | 7.94 ms | 17.6 ms | 31.9 ms | 1.8 MiB | 126 |
| 1280 | 15.2 ms | 17.2 ms | 60.2 ms | 3.6 MiB | 66 |

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

**Measured: O(n)** (exponent 1.04, 7 sizes) -- ✅ matches.

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 516 ms | 528 ms | 815 ms | 90.5 MiB | 2 |
| 40 | 1.05 s | 1.06 s | 1.61 s | 167.2 MiB | 1 |
| 80 | 2.08 s | 2.10 s | 3.01 s | 340.8 MiB | 0 |
| 160 | 4.78 s | 4.81 s | 7.22 s | 270.5 MiB | 0 |
| 320 | 9.20 s | 9.28 s | 13.7 s | 342.7 MiB | 0 |
| 640 | 19.3 s | 19.7 s | 29.0 s | 112.5 MiB | 0 |
| 1280 | 38.7 s | 39.8 s | 57.9 s | 366.4 MiB | 0 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 160 exports** (whole operation: 4.63 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `classify-contract-changes` | 1 | 4.78 s | 4.78 s | 103% |
| `load-api-model` | 1 | 61.8 ms | 61.8 ms | 1.3% |
| `normalize-api-package` | 1 | 2.22 ms | 2.22 ms | 0.0% |
| _unattributed_ |  |  | 0 | 0.0% |

**At 1280 exports** (whole operation: 38.9 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `classify-contract-changes` | 1 | 38.7 s | 38.7 s | 99% |
| `load-api-model` | 1 | 251 ms | 251 ms | 0.6% |
| `normalize-api-package` | 1 | 15.2 ms | 15.2 ms | 0.0% |
| _unattributed_ |  |  | 0 | 0.0% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-06T01:31:13.311Z` → `2026-10-06T01:42:16.782Z` (663 s), ci: CI (run 37398342781)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `00c49e0f51aed0c48718e00aa50ad06ec040d37f` on `fix/v1-audit`
- Sizes: 20, 40, 80, 160, 320, 640, 1280 exports -- One exported function in the package's public API. 160 is a mid-sized library's surface; the ladder reaches 1,280. It stops there, not at 10,240, because every size compiles a real synthetic TypeScript package and runs API Extractor over it, which takes minutes at the largest sizes.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

