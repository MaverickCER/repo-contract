# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend, and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **160 exports** per operation, routing the work through `repo-contract` adds **1.50 s** per operation compared with a bare-minimum baseline (**753× the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.04). At list prices that is on the order of **~$1 – $10 per million operations** of compute.

> The relative figure and the growth class are the steadier ones. Both come from the same run, so they depend far less on the machine than a time does. Runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below). They show scale, not a budget.

| Cost | Typical (160 exports) | Largest (1280 exports) |
| --- | --- | --- |
| Added latency per operation | 1.50 s | 12.2 s |
| Added latency, relative to baseline | 753× baseline | 1,202× baseline |
| Added CPU time per operation | 2.28 s | 17.9 s |
| Added memory per operation (heap delta) | 88.9 MiB | 460.4 MiB |
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
| 20 | 402 µs | 181 ms | 181 ms | 451× baseline | 285 ms | $0.376 – $3.21 |
| 40 | 576 µs | 340 ms | 339 ms | 590× baseline | 517 ms | $0.706 – $5.82 |
| 80 | 991 µs | 661 ms | 660 ms | 667× baseline | 1.00e+3 ms | $1.76 – $11.24 |
| 160 | 1.99 ms | 1.50 s | 1.50 s | 753× baseline | 2.28 s | $3.11 – $25.69 |
| 320 | 4.07 ms | 2.94 s | 2.93 s | 722× baseline | 4.40 s | $20.03 – $49.46 |
| 640 | 5.97 ms | 6.01 s | 6.00 s | 1,007× baseline | 8.90 s | $30.75 – $100.02 |
| 1280 | 10.1 ms | 12.2 s | 12.2 s | 1,202× baseline | 17.9 s | $91.17 – $201.71 |

**How the total grows:** O(n) (linear), exponent 1.04 over 7 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder. Its measured growth rate is then compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report. Either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 160 | At 1280 |
| --- | --- | --- | --- | --- | --- | --- |
| `loadApiModel (both API descriptions)` | export | O(n) | O(n) | ✅ matches | 29.8 ms | 154 ms |
| `normalizeApiPackage` | export | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.09 ms | 7.45 ms |
| `classifyContractChanges (with type-assignability probing)` | export | O(n) | O(n) | ✅ matches | 1.43 s | 12.0 s |

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
| 20 | 7.74 ms | 11.9 ms | 28.6 ms | 1.6 MiB | 129 |
| 40 | 14.3 ms | 15.1 ms | 50.2 ms | 2.9 MiB | 70 |
| 80 | 19.4 ms | 21.5 ms | 57.3 ms | 5.5 MiB | 52 |
| 160 | 29.8 ms | 42.7 ms | 68.4 ms | 10.5 MiB | 34 |
| 320 | 45.0 ms | 51.3 ms | 92.4 ms | 20.0 MiB | 22 |
| 640 | 80.4 ms | 105 ms | 145 ms | 38.6 MiB | 12 |
| 1280 | 154 ms | 166 ms | 250 ms | 25.0 MiB | 6 |

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

**Measured: O(n)** (exponent 0.89, 7 sizes): 🟡 close (neighbouring class).

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 301 µs | 374 µs | 323 µs | 65.2 KiB | 3,321 |
| 40 | 489 µs | 511 µs | 1.06 ms | 127.1 KiB | 2,047 |
| 80 | 634 µs | 993 µs | 910 µs | 249.9 KiB | 1,576 |
| 160 | 1.09 ms | 1.68 ms | 3.59 ms | 492.1 KiB | 918 |
| 320 | 2.01 ms | 2.76 ms | 7.32 ms | 986.4 KiB | 499 |
| 640 | 3.83 ms | 4.09 ms | 14.7 ms | 1.8 MiB | 261 |
| 1280 | 7.45 ms | 7.76 ms | 27.7 ms | 3.6 MiB | 134 |

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

**Measured: O(n)** (exponent 1.05, 7 sizes): ✅ matches.

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 162 ms | 175 ms | 253 ms | 44.8 MiB | 6 |
| 40 | 315 ms | 318 ms | 462 ms | 97.5 MiB | 3 |
| 80 | 633 ms | 637 ms | 910 ms | 169.5 MiB | 2 |
| 160 | 1.43 s | 1.45 s | 2.18 s | 81.1 MiB | 1 |
| 320 | 2.87 s | 2.88 s | 4.20 s | 416.2 MiB | 0 |
| 640 | 5.93 s | 5.95 s | 8.81 s | 239.1 MiB | 0 |
| 1280 | 12.0 s | 12.0 s | 17.8 s | 165.7 MiB | 0 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls. So where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time). Every moment of the operation then belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly. They are not measured against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 160 exports** (whole operation: 1.50 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `classify-contract-changes` | 1 | 1.43 s | 1.43 s | 96% |
| `load-api-model` | 1 | 29.8 ms | 29.8 ms | 2.0% |
| `normalize-api-package` | 1 | 1.09 ms | 1.09 ms | 0.1% |
| _unattributed_ |  |  | 35.7 ms | 2.4% |

**At 1280 exports** (whole operation: 12.2 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `classify-contract-changes` | 1 | 12.0 s | 12.0 s | 98% |
| `load-api-model` | 1 | 154 ms | 154 ms | 1.3% |
| `normalize-api-package` | 1 | 7.45 ms | 7.45 ms | 0.1% |
| _unattributed_ |  |  | 23.7 ms | 0.2% |

## Cost model

Estimates use two bracketing price shapes. **Low** is CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time). **High** is duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-14T17:31:47.675Z` → `2026-11-14T17:35:34.921Z` (227 s), ci: CI (run 43620104979)
- Machine: AMD EPYC 9V74 80-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `deaaafc18b5426f07b59528132254f2852602af3` on `dependabot/npm_and_yarn/dev-dependencies-6f64cd0fc8`
- Sizes: 20, 40, 80, 160, 320, 640, 1280 exports: One exported function in the package's public API. 160 is a mid-sized library's surface; the ladder reaches 1,280. It stops there, not at 10,240, because every size compiles a real synthetic TypeScript package and runs API Extractor over it, which takes minutes at the largest sizes.

**Do not compare these numbers with another machine's, another day's, or another package's.** They show how _this_ package's cost changes between runs on comparable hardware, and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

