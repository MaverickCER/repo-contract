# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **160 exports** per operation, routing the work through `repo-contract` adds **3.87 s** per operation compared with a bare-minimum baseline (1,560× baseline), about **$17.33 – $63.09 per million operations** of compute. Overall, it grows O(n) with workload size (measured exponent 1.01).

> Dollar figures are **estimates** from published list prices (see _Cost model_ below) and are for comparing orders of magnitude, not for budgeting to the cent.

| Cost | Typical (160 exports) | Largest (1280 exports) |
| --- | --- | --- |
| Added latency per operation | 3.87 s | 30.4 s |
| Added latency, relative to baseline | 1,560× baseline | 2,532× baseline |
| Added CPU time per operation | 5.61 s | 43.2 s |
| Added memory per operation (heap delta) | 274.9 MiB | 460.5 MiB |
| Estimated compute cost per 1M operations | $17.33 – $63.09 | $227.89 – $485.76 |
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
| 20 | 409 µs | 482 ms | 481 ms | 1,179× baseline | 754 ms | $1.00 – $8.47 |
| 40 | 629 µs | 889 ms | 889 ms | 1,413× baseline | 1.28 s | $2.77 – $14.36 |
| 80 | 1.32 ms | 1.73 s | 1.73 s | 1,313× baseline | 2.44 s | $9.58 – $27.43 |
| 160 | 2.49 ms | 3.88 s | 3.87 s | 1,560× baseline | 5.61 s | $17.33 – $63.09 |
| 320 | 3.89 ms | 7.69 s | 7.69 s | 1,975× baseline | 11.0 s | $36.13 – $123.69 |
| 640 | 6.57 ms | 15.3 s | 15.3 s | 2,321× baseline | 21.8 s | $151.77 – $244.63 |
| 1280 | 12.0 ms | 30.4 s | 30.4 s | 2,532× baseline | 43.2 s | $227.89 – $485.76 |

**How the total grows:** O(n) (linear), exponent 1.01 over 7 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 160 | At 1280 |
| --- | --- | --- | --- | --- | --- |
| `loadApiModel (both API descriptions)` | O(n) | O(n) | ✅ matches | 41.6 ms | 200 ms |
| `normalizeApiPackage` | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.36 ms | 10.1 ms |
| `classifyContractChanges (with type-assignability probing)` | O(n) | O(n) | ✅ matches | 3.65 s | 30.5 s |

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

**Measured: O(n)** (exponent 0.67, 7 sizes) -- ✅ matches.

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 10.5 ms | 15.2 ms | 42.5 ms | 1.6 MiB | 95 |
| 40 | 20.8 ms | 21.7 ms | 71.0 ms | 2.9 MiB | 48 |
| 80 | 28.4 ms | 30.0 ms | 80.9 ms | 5.5 MiB | 35 |
| 160 | 41.6 ms | 42.8 ms | 96.7 ms | 10.5 MiB | 24 |
| 320 | 63.2 ms | 76.1 ms | 124 ms | 19.8 MiB | 16 |
| 640 | 109 ms | 116 ms | 199 ms | 38.6 MiB | 9 |
| 1280 | 200 ms | 207 ms | 313 ms | 18.2 MiB | 5 |

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

**Measured: O(n)** (exponent 0.74, 7 sizes) -- 🟡 close (neighbouring class).

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 402 µs | 431 µs | 887 µs | 46.4 KiB | 2,486 |
| 40 | 664 µs | 720 µs | 1.07 ms | 90.5 KiB | 1,505 |
| 80 | 1.26 ms | 1.35 ms | 3.42 ms | 178.5 KiB | 796 |
| 160 | 1.36 ms | 2.08 ms | 4.23 ms | 350.4 KiB | 738 |
| 320 | 2.59 ms | 4.79 ms | 10.3 ms | 686.9 KiB | 387 |
| 640 | 5.01 ms | 6.03 ms | 19.1 ms | 1.3 MiB | 199 |
| 1280 | 10.1 ms | 11.0 ms | 38.4 ms | 2.7 MiB | 99 |

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
| 20 | 411 ms | 421 ms | 592 ms | 93.6 MiB | 2 |
| 40 | 809 ms | 815 ms | 1.14 s | 173.2 MiB | 1 |
| 80 | 1.58 s | 1.59 s | 2.19 s | 357.3 MiB | 1 |
| 160 | 3.65 s | 3.65 s | 5.22 s | 267.7 MiB | 0 |
| 320 | 7.23 s | 7.30 s | 10.3 s | 340.2 MiB | 0 |
| 640 | 14.9 s | 15.0 s | 21.1 s | 619.1 MiB | 0 |
| 1280 | 30.5 s | 30.8 s | 43.4 s | 439.7 MiB | 0 |

## 3. What makes up the end-to-end overhead

Each function's measured cost is multiplied by how many times one end-to-end operation calls it, then compared with the total overhead from section 1. This shows where the cost actually lives, so effort goes to the function that matters. Shares are estimates: they can sum to slightly more or less than 100% because the two measurements were taken separately (the remainder is shown as _unattributed_).

**At 160 exports** (total added: 3.87 s)

| Function | Calls / operation | Estimated time | Share of added time | Share of operation |
| --- | --- | --- | --- | --- |
| `classify-contract-changes` | 1 | 3.65 s | 94% | 94% |
| `load-api-model` | 1 | 41.6 ms | 1.1% | 1.1% |
| `normalize-api-package` | 1 | 1.36 ms | 0.0% | 0.0% |
| _unattributed_ |  | 181 ms | 4.7% |  |

**At 1280 exports** (total added: 30.4 s)

| Function | Calls / operation | Estimated time | Share of added time | Share of operation |
| --- | --- | --- | --- | --- |
| `classify-contract-changes` | 1 | 30.5 s | 100% | 100% |
| `load-api-model` | 1 | 200 ms | 0.7% | 0.7% |
| `normalize-api-package` | 1 | 10.1 ms | 0.0% | 0.0% |
| _unattributed_ |  | 0 | 0.0% |  |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-02T05:11:42.565Z` → `2026-10-02T05:20:24.256Z` (522 s), ci
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `abfc060144f6300a36cadcbc957dc836136189c9` on `chore/repin-ipc-0.6.0` (uncommitted changes)
- Sizes: 20, 40, 80, 160, 320, 640, 1280 exports -- One exported function in the package's public API. 160 is a mid-sized library's surface; the ladder reaches 1,280. It stops there, not at 10,240, because every size compiles a real synthetic TypeScript package and runs API Extractor over it, which takes minutes at the largest sizes.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

