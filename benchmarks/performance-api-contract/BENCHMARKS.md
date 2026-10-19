# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **160 exports** per operation, routing the work through `repo-contract` adds **3.53 s** per operation compared with a bare-minimum baseline (**1,440× the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.04). At list prices that is on the order of **~$10 – $100 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (160 exports) | Largest (1280 exports) |
| --- | --- | --- |
| Added latency per operation | 3.53 s | 29.1 s |
| Added latency, relative to baseline | 1,440× baseline | 2,560× baseline |
| Added CPU time per operation | 5.10 s | 41.7 s |
| Added memory per operation (heap delta) | 267.6 MiB | 196.2 MiB |
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
| 20 | 390 µs | 449 ms | 449 ms | 1,150× baseline | 702 ms | $0.934 – $7.89 |
| 40 | 616 µs | 812 ms | 812 ms | 1,319× baseline | 1.17 s | $2.43 – $13.13 |
| 80 | 1.20 ms | 1.60 s | 1.60 s | 1,335× baseline | 2.22 s | $9.17 – $24.98 |
| 160 | 2.45 ms | 3.53 s | 3.53 s | 1,440× baseline | 5.10 s | $15.38 – $57.36 |
| 320 | 3.73 ms | 7.06 s | 7.05 s | 1,893× baseline | 10.2 s | $40.21 – $114.38 |
| 640 | 6.22 ms | 14.4 s | 14.4 s | 2,314× baseline | 20.5 s | $142.01 – $230.61 |
| 1280 | 11.4 ms | 29.1 s | 29.1 s | 2,560× baseline | 41.7 s | $93.04 – $468.63 |

**How the total grows:** O(n) (linear), exponent 1.04 over 7 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 160 | At 1280 |
| --- | --- | --- | --- | --- | --- | --- |
| `loadApiModel (both API descriptions)` | export | O(n) | O(n) | ✅ matches | 42.8 ms | 201 ms |
| `normalizeApiPackage` | export | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.38 ms | 9.93 ms |
| `classifyContractChanges (with type-assignability probing)` | export | O(n) | O(n) | ✅ matches | 3.48 s | 29.7 s |

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

**Measured: O(n)** (exponent 0.71, 7 sizes) -- ✅ matches.

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 11.5 ms | 15.1 ms | 41.6 ms | 1.6 MiB | 87 |
| 40 | 20.8 ms | 22.2 ms | 71.9 ms | 2.9 MiB | 48 |
| 80 | 27.9 ms | 29.5 ms | 81.2 ms | 5.5 MiB | 36 |
| 160 | 42.8 ms | 47.0 ms | 97.8 ms | 10.5 MiB | 23 |
| 320 | 63.8 ms | 67.7 ms | 124 ms | 19.8 MiB | 16 |
| 640 | 110 ms | 113 ms | 197 ms | 38.6 MiB | 9 |
| 1280 | 201 ms | 209 ms | 311 ms | 18.3 MiB | 5 |

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

**Measured: O(n)** (exponent 0.78, 7 sizes) -- 🟡 close (neighbouring class).

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 430 µs | 454 µs | 437 µs | 65.7 KiB | 2,326 |
| 40 | 738 µs | 826 µs | 1.59 ms | 128.8 KiB | 1,355 |
| 80 | 1.35 ms | 4.40 ms | 4.31 ms | 254.9 KiB | 740 |
| 160 | 1.38 ms | 2.02 ms | 4.14 ms | 492.1 KiB | 727 |
| 320 | 2.70 ms | 4.04 ms | 10.2 ms | 986.5 KiB | 370 |
| 640 | 5.51 ms | 8.87 ms | 21.3 ms | 1.8 MiB | 181 |
| 1280 | 9.93 ms | 11.5 ms | 38.5 ms | 3.6 MiB | 101 |

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

**Measured: O(n)** (exponent 1.06, 7 sizes) -- ✅ matches.

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 394 ms | 404 ms | 574 ms | 90.6 MiB | 3 |
| 40 | 776 ms | 783 ms | 1.10 s | 167.2 MiB | 1 |
| 80 | 1.53 s | 1.54 s | 2.13 s | 340.9 MiB | 1 |
| 160 | 3.48 s | 3.51 s | 5.02 s | 269.8 MiB | 0 |
| 320 | 6.94 s | 7.00 s | 9.93 s | 343.0 MiB | 0 |
| 640 | 14.4 s | 14.5 s | 20.6 s | 609.3 MiB | 0 |
| 1280 | 29.7 s | 29.9 s | 42.6 s | 112.5 MiB | 0 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 160 exports** (whole operation: 3.53 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `classify-contract-changes` | 1 | 3.48 s | 3.48 s | 99% |
| `load-api-model` | 1 | 42.8 ms | 42.8 ms | 1.2% |
| `normalize-api-package` | 1 | 1.38 ms | 1.38 ms | 0.0% |
| _unattributed_ |  |  | 5.59 ms | 0.2% |

**At 1280 exports** (whole operation: 29.1 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `classify-contract-changes` | 1 | 29.7 s | 29.7 s | 102% |
| `load-api-model` | 1 | 201 ms | 201 ms | 0.7% |
| `normalize-api-package` | 1 | 9.93 ms | 9.93 ms | 0.0% |
| _unattributed_ |  |  | 0 | 0.0% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-15T15:09:43.620Z` → `2026-10-15T15:18:01.742Z` (498 s), ci: CI (run 38755964414)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `af65e102db14817dfb2c7e77df4a11158c6ec1aa` on `release-lib`
- Sizes: 20, 40, 80, 160, 320, 640, 1280 exports -- One exported function in the package's public API. 160 is a mid-sized library's surface; the ladder reaches 1,280. It stops there, not at 10,240, because every size compiles a real synthetic TypeScript package and runs API Extractor over it, which takes minutes at the largest sizes.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

