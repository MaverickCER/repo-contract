# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **160 exports** per operation, routing the work through `repo-contract` adds **2.37 s** per operation compared with a bare-minimum baseline (**1,482× baseline** of the baseline). Overall, it grows O(n) with workload size (measured exponent 1.06). At list prices that is on the order of **~$10 – $100 per million operations** of compute.

> The relative figure and the growth class are the dependable ones: both come from the same run, so they survive a change of machine. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (160 exports) | Largest (1280 exports) |
| --- | --- | --- |
| Added latency per operation | 2.37 s | 19.8 s |
| Added latency, relative to baseline | 1,482× baseline | 2,984× baseline |
| Added CPU time per operation | 3.73 s | 30.8 s |
| Added memory per operation (heap delta) | 276.2 MiB | 704.4 MiB |
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
| 20 | 232 µs | 285 ms | 284 ms | 1,224× baseline | 470 ms | $0.592 – $5.29 |
| 40 | 389 µs | 523 ms | 523 ms | 1,346× baseline | 796 ms | $1.56 – $8.95 |
| 80 | 686 µs | 1.03 s | 1.03 s | 1,501× baseline | 1.54 s | $5.90 – $17.32 |
| 160 | 1.60 ms | 2.38 s | 2.37 s | 1,482× baseline | 3.73 s | $10.67 – $41.95 |
| 320 | 2.51 ms | 4.79 s | 4.79 s | 1,911× baseline | 7.56 s | $27.32 – $85.01 |
| 640 | 3.92 ms | 9.68 s | 9.68 s | 2,471× baseline | 15.0 s | $83.23 – $169.03 |
| 1280 | 6.65 ms | 19.9 s | 19.8 s | 2,984× baseline | 30.8 s | $227.54 – $346.41 |

**How the total grows:** O(n) (linear), exponent 1.06 over 7 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 160 | At 1280 |
| --- | --- | --- | --- | --- | --- |
| `loadApiModel (both API descriptions)` | O(n) | O(n) | ✅ matches | 26.1 ms | 123 ms |
| `normalizeApiPackage` | O(n log n) | O(n) | 🟡 close (neighbouring class) | 922 µs | 6.36 ms |
| `classifyContractChanges (with type-assignability probing)` | O(n) | O(n) | ✅ matches | 2.30 s | 19.9 s |

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

**Measured: O(n)** (exponent 0.70, 7 sizes) -- ✅ matches.

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 5.89 ms | 9.50 ms | 22.7 ms | 1.5 MiB | 170 |
| 40 | 11.4 ms | 12.1 ms | 44.4 ms | 2.9 MiB | 88 |
| 80 | 17.3 ms | 19.9 ms | 57.5 ms | 5.5 MiB | 58 |
| 160 | 26.1 ms | 35.6 ms | 69.1 ms | 10.5 MiB | 38 |
| 320 | 36.7 ms | 40.3 ms | 82.0 ms | 19.8 MiB | 27 |
| 640 | 66.4 ms | 72.8 ms | 133 ms | 38.6 MiB | 15 |
| 1280 | 123 ms | 127 ms | 209 ms | 18.2 MiB | 8 |

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

**Measured: O(n)** (exponent 0.77, 7 sizes) -- 🟡 close (neighbouring class).

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 236 µs | 265 µs | 592 µs | 65.2 KiB | 4,239 |
| 40 | 523 µs | 546 µs | 959 µs | 128.8 KiB | 1,912 |
| 80 | 809 µs | 918 µs | 2.01 ms | 252.4 KiB | 1,235 |
| 160 | 922 µs | 1.31 ms | 3.31 ms | 492.1 KiB | 1,084 |
| 320 | 1.63 ms | 2.18 ms | 5.53 ms | 986.5 KiB | 613 |
| 640 | 3.13 ms | 3.17 ms | 11.6 ms | 1.8 MiB | 320 |
| 1280 | 6.36 ms | 7.02 ms | 24.4 ms | 3.6 MiB | 157 |

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
| 20 | 264 ms | 329 ms | 424 ms | 90.6 MiB | 4 |
| 40 | 548 ms | 562 ms | 856 ms | 167.2 MiB | 2 |
| 80 | 1.05 s | 1.06 s | 1.58 s | 340.8 MiB | 1 |
| 160 | 2.30 s | 2.30 s | 3.61 s | 270.6 MiB | 0 |
| 320 | 4.73 s | 4.76 s | 7.35 s | 367.4 MiB | 0 |
| 640 | 9.56 s | 9.58 s | 14.8 s | 437.4 MiB | 0 |
| 1280 | 19.9 s | 20.0 s | 31.0 s | 449.6 MiB | 0 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 160 exports** (whole operation: 2.38 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `classify-contract-changes` | 1 | 2.30 s | 2.30 s | 97% |
| `load-api-model` | 1 | 26.1 ms | 26.1 ms | 1.1% |
| `normalize-api-package` | 1 | 922 µs | 922 µs | 0.0% |
| _unattributed_ |  |  | 53.7 ms | 2.3% |

**At 1280 exports** (whole operation: 19.9 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `classify-contract-changes` | 1 | 19.9 s | 19.9 s | 100% |
| `load-api-model` | 1 | 123 ms | 123 ms | 0.6% |
| `normalize-api-package` | 1 | 6.36 ms | 6.36 ms | 0.0% |
| _unattributed_ |  |  | 0 | 0.0% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-13T03:20:54.855Z` → `2026-10-13T03:26:32.834Z` (338 s), ci: CI (run 38340527682)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `f6033f91f20c59a3afc96e2bc460cbf2d8c7adaf` on `dependabot/npm_and_yarn/internal-package-contract-v0.10.0`
- Sizes: 20, 40, 80, 160, 320, 640, 1280 exports -- One exported function in the package's public API. 160 is a mid-sized library's surface; the ladder reaches 1,280. It stops there, not at 10,240, because every size compiles a real synthetic TypeScript package and runs API Extractor over it, which takes minutes at the largest sizes.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

