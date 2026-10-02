# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **160 exports** per operation, routing the work through `repo-contract` adds **3.72 s** per operation compared with a bare-minimum baseline (1,553× baseline), about **$16.66 – $60.74 per million operations** of compute. Overall, it grows O(n) with workload size (measured exponent 1.03).

> Dollar figures are **estimates** from published list prices (see _Cost model_ below) and are for comparing orders of magnitude, not for budgeting to the cent.

| Cost | Typical (160 exports) | Largest (1280 exports) |
| --- | --- | --- |
| Added latency per operation | 3.72 s | 30.8 s |
| Added latency, relative to baseline | 1,553× baseline | 2,499× baseline |
| Added CPU time per operation | 5.40 s | 44.3 s |
| Added memory per operation (heap delta) | 275.5 MiB | 533.5 MiB |
| Estimated compute cost per 1M operations | $16.66 – $60.74 | $267.03 – $498.25 |
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
| 20 | 387 µs | 445 ms | 445 ms | 1,150× baseline | 701 ms | $0.927 – $7.88 |
| 40 | 614 µs | 836 ms | 836 ms | 1,362× baseline | 1.22 s | $2.61 – $13.67 |
| 80 | 1.16 ms | 1.65 s | 1.65 s | 1,423× baseline | 2.37 s | $9.09 – $26.62 |
| 160 | 2.40 ms | 3.72 s | 3.72 s | 1,553× baseline | 5.40 s | $16.66 – $60.74 |
| 320 | 3.95 ms | 7.36 s | 7.36 s | 1,864× baseline | 10.6 s | $63.61 – $118.96 |
| 640 | 7.04 ms | 15.2 s | 15.2 s | 2,157× baseline | 22.1 s | $106.65 – $247.99 |
| 1280 | 12.3 ms | 30.8 s | 30.8 s | 2,499× baseline | 44.3 s | $267.03 – $498.25 |

**How the total grows:** O(n) (linear), exponent 1.03 over 7 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 160 | At 1280 |
| --- | --- | --- | --- | --- | --- |
| `loadApiModel (both API descriptions)` | O(n) | O(n) | ✅ matches | 39.5 ms | 191 ms |
| `normalizeApiPackage` | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.24 ms | 8.77 ms |
| `classifyContractChanges (with type-assignability probing)` | O(n) | O(n) | ✅ matches | 3.66 s | 30.4 s |

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
| 20 | 10.0 ms | 12.4 ms | 38.2 ms | 1.6 MiB | 100 |
| 40 | 19.5 ms | 20.1 ms | 69.4 ms | 2.9 MiB | 51 |
| 80 | 26.6 ms | 28.1 ms | 80.5 ms | 5.5 MiB | 38 |
| 160 | 39.5 ms | 40.9 ms | 95.7 ms | 10.4 MiB | 25 |
| 320 | 59.9 ms | 63.9 ms | 120 ms | 20.0 MiB | 17 |
| 640 | 107 ms | 117 ms | 198 ms | 38.6 MiB | 9 |
| 1280 | 191 ms | 202 ms | 315 ms | 18.2 MiB | 5 |

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

**Measured: O(n)** (exponent 0.70, 7 sizes) -- 🟡 close (neighbouring class).

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 414 µs | 3.45 ms | 949 µs | 46.4 KiB | 2,413 |
| 40 | 701 µs | 825 µs | 2.06 ms | 90.5 KiB | 1,427 |
| 80 | 1.17 ms | 1.30 ms | 4.23 ms | 178.5 KiB | 853 |
| 160 | 1.24 ms | 2.08 ms | 4.25 ms | 350.6 KiB | 805 |
| 320 | 2.30 ms | 3.91 ms | 8.28 ms | 686.0 KiB | 435 |
| 640 | 4.65 ms | 6.60 ms | 17.4 ms | 1.3 MiB | 215 |
| 1280 | 8.77 ms | 10.1 ms | 33.7 ms | 2.7 MiB | 114 |

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
| 20 | 412 ms | 418 ms | 595 ms | 93.7 MiB | 2 |
| 40 | 813 ms | 817 ms | 1.16 s | 173.3 MiB | 1 |
| 80 | 1.61 s | 1.64 s | 2.26 s | 357.5 MiB | 1 |
| 160 | 3.66 s | 3.67 s | 5.34 s | 267.3 MiB | 0 |
| 320 | 7.26 s | 7.32 s | 10.5 s | 338.6 MiB | 0 |
| 640 | 14.8 s | 14.8 s | 21.2 s | 690.7 MiB | 0 |
| 1280 | 30.4 s | 30.6 s | 44.0 s | 182.3 MiB | 0 |

## 3. What makes up the end-to-end overhead

Each function's measured cost is multiplied by how many times one end-to-end operation calls it, then compared with the total overhead from section 1. This shows where the cost actually lives, so effort goes to the function that matters. Shares are estimates: they can sum to slightly more or less than 100% because the two measurements were taken separately (the remainder is shown as _unattributed_).

**At 160 exports** (total added: 3.72 s)

| Function | Calls / operation | Estimated time | Share of added time | Share of operation |
| --- | --- | --- | --- | --- |
| `classify-contract-changes` | 1 | 3.66 s | 98% | 98% |
| `load-api-model` | 1 | 39.5 ms | 1.1% | 1.1% |
| `normalize-api-package` | 1 | 1.24 ms | 0.0% | 0.0% |
| _unattributed_ |  | 16.1 ms | 0.4% |  |

**At 1280 exports** (total added: 30.8 s)

| Function | Calls / operation | Estimated time | Share of added time | Share of operation |
| --- | --- | --- | --- | --- |
| `classify-contract-changes` | 1 | 30.4 s | 99% | 99% |
| `load-api-model` | 1 | 191 ms | 0.6% | 0.6% |
| `normalize-api-package` | 1 | 8.77 ms | 0.0% | 0.0% |
| _unattributed_ |  | 140 ms | 0.5% |  |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-02T01:11:28.607Z` → `2026-10-02T01:20:06.012Z` (517 s), ci
- Machine: AMD EPYC 9V74 80-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `b07c91a8c03cc24917a0038c33290079d3291a61` on `chore/repin-ipc-8e8f680` (uncommitted changes)
- Sizes: 20, 40, 80, 160, 320, 640, 1280 exports -- One exported function in the package's public API. 160 is a mid-sized library's surface; the ladder reaches 1,280. It stops there, not at 10,240, because every size compiles a real synthetic TypeScript package and runs API Extractor over it, which takes minutes at the largest sizes.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

