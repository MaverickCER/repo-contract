# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend, and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **160 exports** per operation, routing the work through `repo-contract` adds **1.23 s** per operation compared with a bare-minimum baseline (**696× the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.04). At list prices that is on the order of **~$1 – $10 per million operations** of compute.

> The relative figure and the growth class are the steadier ones. Both come from the same run, so they depend far less on the machine than a time does. Runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below). They show scale, not a budget.

| Cost | Typical (160 exports) | Largest (1280 exports) |
| --- | --- | --- |
| Added latency per operation | 1.23 s | 9.99 s |
| Added latency, relative to baseline | 696× baseline | 1,022× baseline |
| Added CPU time per operation | 2.00 s | 15.5 s |
| Added memory per operation (heap delta) | 88.2 MiB | 313.2 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$1 – $10 | ~$100 |
| Single-core throughput ceiling of the overhead alone | 1 ops/s | 0 ops/s |

## 1. End-to-end: the package's total impact

Shows what a pull request pays, on every API-contract check, to find out whether the public API changed compatibly, compared with the bare minimum of reading the two API descriptions. Both sides start from the same extracted `.api.json` files; the difference is the engine's model loading, normalization and compatibility classification (including its type-assignability probing). This runs on every pull request and every pre-push.

- **Baseline (no package):** Read and JSON-parse the baseline and current API descriptions -- the least anyone would do to look at them.
- **With the package:** Load both API models, normalize them to the public surface, build the reference indexes and classify every change, probing type assignability where needed.

Both sides use empty or minimal functions on purpose. The difference is then the package's own cost, not the cost of the work an application would plug into it. Real applications add their own work on top; this is the floor the package imposes.

**Variables that could change this result**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| exported symbols | swept | The tier axis: how many functions the package's public surface exports. |
| surface shape | fixed at "functions with one parameter each" | Interfaces, classes, generics and overloads add proportionally more per symbol and are not covered. |
| change mix | fixed at "about 6% widened, 6% breaking, 2 removed, 2 added" | A realistic mixed diff rather than 'identical' or 'completely different'; more changes mean more assignability probes. |
| extraction | fixed at "excluded" | Compiling and running API Extractor is a separate, larger cost done once per build; it is generated once per size and not measured here. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

The baseline is an empty or minimal function, so it costs almost nothing. The _relative_ overhead can then look enormous (shown as a multiple of the baseline). Read the absolute columns (time, CPU and dollars added): they are what a bill and a latency budget are made of.

| exports | Baseline | With package | Added | Added vs baseline | Added CPU | Est. $ / 1M ops |
| --- | --- | --- | --- | --- | --- | --- |
| 20 | 332 µs | 150 ms | 150 ms | 452× baseline | 252 ms | $0.311 – $2.83 |
| 40 | 479 µs | 277 ms | 277 ms | 579× baseline | 441 ms | $0.577 – $4.96 |
| 80 | 904 µs | 544 ms | 543 ms | 601× baseline | 840 ms | $1.44 – $9.44 |
| 160 | 1.76 ms | 1.23 s | 1.23 s | 696× baseline | 2.00 s | $2.55 – $22.49 |
| 320 | 3.37 ms | 2.38 s | 2.38 s | 707× baseline | 3.78 s | $4.95 – $42.52 |
| 640 | 6.09 ms | 5.00 s | 5.00 s | 821× baseline | 7.81 s | $25.25 – $87.84 |
| 1280 | 9.78 ms | 10.0 s | 9.99 s | 1,022× baseline | 15.5 s | $50.91 – $174.38 |

**How the total grows:** O(n) (linear), exponent 1.04 over 7 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder. Its measured growth rate is then compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report. Either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 160 | At 1280 |
| --- | --- | --- | --- | --- | --- | --- |
| `loadApiModel (both API descriptions)` | export | O(n) | O(n) | ✅ matches | 27.5 ms | 130 ms |
| `normalizeApiPackage` | export | O(n log n) | O(n) | 🟡 close (neighbouring class) | 765 µs | 5.16 ms |
| `classifyContractChanges (with type-assignability probing)` | export | O(n) | O(n) | ✅ matches | 1.16 s | 9.81 s |

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

**Measured: O(n)** (exponent 0.71, 7 sizes): ✅ matches.

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 6.77 ms | 7.91 ms | 25.4 ms | 1.5 MiB | 148 |
| 40 | 9.39 ms | 12.7 ms | 35.7 ms | 2.8 MiB | 106 |
| 80 | 18.2 ms | 19.9 ms | 59.1 ms | 5.5 MiB | 55 |
| 160 | 27.5 ms | 28.7 ms | 70.4 ms | 10.5 MiB | 36 |
| 320 | 40.3 ms | 44.4 ms | 86.1 ms | 19.9 MiB | 25 |
| 640 | 72.1 ms | 77.4 ms | 143 ms | 38.6 MiB | 14 |
| 1280 | 130 ms | 137 ms | 229 ms | 25.0 MiB | 8 |

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

**Measured: O(n)** (exponent 0.85, 7 sizes): 🟡 close (neighbouring class).

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 246 µs | 269 µs | 597 µs | 65.2 KiB | 4,057 |
| 40 | 384 µs | 400 µs | 1.28 ms | 127.1 KiB | 2,607 |
| 80 | 495 µs | 792 µs | 1.98 ms | 247.4 KiB | 2,020 |
| 160 | 765 µs | 1.39 ms | 1.51 ms | 492.1 KiB | 1,307 |
| 320 | 1.52 ms | 4.51 ms | 6.29 ms | 986.5 KiB | 660 |
| 640 | 2.63 ms | 2.94 ms | 9.77 ms | 1.8 MiB | 381 |
| 1280 | 5.16 ms | 5.82 ms | 19.1 ms | 3.6 MiB | 194 |

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

- **changes that need the compiler to be conservative**: Rare generic and conditional-type edge cases take slower probing paths; the synthetic surface uses simple parameter types.

**In the end-to-end run:** Once per API check, after both models are normalized.

**Measured: O(n)** (exponent 1.06, 7 sizes): ✅ matches.

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 135 ms | 140 ms | 222 ms | 44.8 MiB | 7 |
| 40 | 258 ms | 264 ms | 405 ms | 97.5 MiB | 4 |
| 80 | 509 ms | 520 ms | 767 ms | 169.6 MiB | 2 |
| 160 | 1.16 s | 1.17 s | 1.85 s | 75.8 MiB | 1 |
| 320 | 2.26 s | 2.26 s | 3.46 s | 416.6 MiB | 0 |
| 640 | 4.69 s | 4.75 s | 7.26 s | 298.3 MiB | 0 |
| 1280 | 9.81 s | 9.87 s | 15.4 s | 99.6 MiB | 0 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls. So where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time). Every moment of the operation then belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly. They are not measured against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 160 exports** (whole operation: 1.23 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `classify-contract-changes` | 1 | 1.16 s | 1.16 s | 94% |
| `load-api-model` | 1 | 27.5 ms | 27.5 ms | 2.2% |
| `normalize-api-package` | 1 | 765 µs | 765 µs | 0.1% |
| _unattributed_ |  |  | 41.8 ms | 3.4% |

**At 1280 exports** (whole operation: 10.0 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `classify-contract-changes` | 1 | 9.81 s | 9.81 s | 98% |
| `load-api-model` | 1 | 130 ms | 130 ms | 1.3% |
| `normalize-api-package` | 1 | 5.16 ms | 5.16 ms | 0.1% |
| _unattributed_ |  |  | 48.4 ms | 0.5% |

## Cost model

Estimates use two bracketing price shapes. **Low** is CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time). **High** is duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-15T21:49:54.920Z` → `2026-11-15T21:53:04.814Z` (190 s), ci: CI (run 43764681048)
- Machine: Intel(R) Xeon(R) 6975P-C, 4 logical core(s) (2 physical), 15701 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `4e579bb6c18fc4991d98d19f391f709f27edd82e` on `feat/v1-readiness`
- Sizes: 20, 40, 80, 160, 320, 640, 1280 exports: One exported function in the package's public API. 160 is a mid-sized library's surface; the ladder reaches 1,280. It stops there, not at 10,240, because every size compiles a real synthetic TypeScript package and runs API Extractor over it, which takes minutes at the largest sizes.

**Do not compare these numbers with another machine's, another day's, or another package's.** They show how _this_ package's cost changes between runs on comparable hardware, and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

