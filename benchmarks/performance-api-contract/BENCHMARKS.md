# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend, and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **160 exports** per operation, routing the work through `repo-contract` adds **1.44 s** per operation compared with a bare-minimum baseline (**801× the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.04). At list prices that is on the order of **~$1 – $10 per million operations** of compute.

> The relative figure and the growth class are the steadier ones. Both come from the same run, so they depend far less on the machine than a time does. Runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below). They show scale, not a budget.

| Cost | Typical (160 exports) | Largest (1280 exports) |
| --- | --- | --- |
| Added latency per operation | 1.44 s | 11.5 s |
| Added latency, relative to baseline | 801× baseline | 1,262× baseline |
| Added CPU time per operation | 2.36 s | 18.6 s |
| Added memory per operation (heap delta) | 88.2 MiB | 253.8 MiB |
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
| 20 | 410 µs | 173 ms | 173 ms | 422× baseline | 288 ms | $0.360 – $3.24 |
| 40 | 551 µs | 318 ms | 317 ms | 577× baseline | 507 ms | $0.661 – $5.70 |
| 80 | 877 µs | 626 ms | 625 ms | 714× baseline | 995 ms | $1.66 – $11.19 |
| 160 | 1.81 ms | 1.45 s | 1.44 s | 801× baseline | 2.36 s | $3.01 – $26.50 |
| 320 | 3.15 ms | 2.70 s | 2.70 s | 859× baseline | 4.24 s | $5.63 – $47.70 |
| 640 | 5.69 ms | 5.71 s | 5.70 s | 1,004× baseline | 9.25 s | $28.04 – $103.96 |
| 1280 | 9.09 ms | 11.5 s | 11.5 s | 1,262× baseline | 18.6 s | $47.33 – $208.60 |

**How the total grows:** O(n) (linear), exponent 1.04 over 7 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder. Its measured growth rate is then compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report. Either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 160 | At 1280 |
| --- | --- | --- | --- | --- | --- | --- |
| `loadApiModel (both API descriptions)` | export | O(n) | O(n) | ✅ matches | 27.3 ms | 140 ms |
| `normalizeApiPackage` | export | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.17 ms | 7.70 ms |
| `classifyContractChanges (with type-assignability probing)` | export | O(n) | O(n) | ✅ matches | 1.44 s | 11.2 s |

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

**Measured: O(n)** (exponent 0.74, 7 sizes): ✅ matches.

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 6.93 ms | 12.4 ms | 24.4 ms | 1.6 MiB | 144 |
| 40 | 12.8 ms | 18.1 ms | 38.5 ms | 2.9 MiB | 78 |
| 80 | 17.2 ms | 27.4 ms | 59.0 ms | 5.5 MiB | 58 |
| 160 | 27.3 ms | 43.2 ms | 72.2 ms | 10.5 MiB | 37 |
| 320 | 39.4 ms | 43.0 ms | 84.6 ms | 19.9 MiB | 25 |
| 640 | 71.2 ms | 78.3 ms | 141 ms | 38.6 MiB | 14 |
| 1280 | 140 ms | 161 ms | 256 ms | 24.9 MiB | 7 |

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

**Measured: O(n)** (exponent 0.96, 7 sizes): 🟡 close (neighbouring class).

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 259 µs | 473 µs | 480 µs | 65.2 KiB | 3,864 |
| 40 | 412 µs | 1.39 ms | 1.42 ms | 127.1 KiB | 2,425 |
| 80 | 579 µs | 1.79 ms | 1.36 ms | 247.4 KiB | 1,729 |
| 160 | 1.17 ms | 1.49 ms | 4.37 ms | 492.1 KiB | 857 |
| 320 | 1.70 ms | 3.40 ms | 6.18 ms | 986.5 KiB | 589 |
| 640 | 5.25 ms | 7.83 ms | 20.0 ms | 1.8 MiB | 190 |
| 1280 | 7.70 ms | 9.60 ms | 30.8 ms | 3.6 MiB | 130 |

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

**Measured: O(n)** (exponent 1.02, 7 sizes): ✅ matches.

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 146 ms | 182 ms | 248 ms | 44.8 MiB | 7 |
| 40 | 296 ms | 339 ms | 471 ms | 97.7 MiB | 3 |
| 80 | 633 ms | 674 ms | 989 ms | 169.5 MiB | 2 |
| 160 | 1.44 s | 1.49 s | 2.37 s | 80.8 MiB | 1 |
| 320 | 2.73 s | 2.75 s | 4.32 s | 416.8 MiB | 0 |
| 640 | 5.53 s | 5.61 s | 9.02 s | 236.5 MiB | 0 |
| 1280 | 11.2 s | 11.5 s | 18.1 s | 145.7 MiB | 0 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls. So where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time). Every moment of the operation then belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly. They are not measured against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 160 exports** (whole operation: 1.45 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `classify-contract-changes` | 1 | 1.44 s | 1.44 s | 99% |
| `load-api-model` | 1 | 27.3 ms | 27.3 ms | 1.9% |
| `normalize-api-package` | 1 | 1.17 ms | 1.17 ms | 0.1% |
| _unattributed_ |  |  | 0 | 0.0% |

**At 1280 exports** (whole operation: 11.5 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `classify-contract-changes` | 1 | 11.2 s | 11.2 s | 98% |
| `load-api-model` | 1 | 140 ms | 140 ms | 1.2% |
| `normalize-api-package` | 1 | 7.70 ms | 7.70 ms | 0.1% |
| _unattributed_ |  |  | 94.9 ms | 0.8% |

## Cost model

Estimates use two bracketing price shapes. **Low** is CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time). **High** is duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-17T18:47:20.824Z` → `2026-11-17T18:51:00.740Z` (220 s), ci: CI (run 44148884303)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `ff0304f1cc5188d15ea2c2acc56e5ac2ab9340cf` on `fix/round7-gaps`
- Sizes: 20, 40, 80, 160, 320, 640, 1280 exports: One exported function in the package's public API. 160 is a mid-sized library's surface; the ladder reaches 1,280. It stops there, not at 10,240, because every size compiles a real synthetic TypeScript package and runs API Extractor over it, which takes minutes at the largest sizes.

**Do not compare these numbers with another machine's, another day's, or another package's.** They show how _this_ package's cost changes between runs on comparable hardware, and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

