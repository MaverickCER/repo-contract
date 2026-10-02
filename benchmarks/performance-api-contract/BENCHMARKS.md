# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **160 exports** per operation, routing the work through `repo-contract` adds **19.2 ms** per operation compared with a bare-minimum baseline (24× baseline), about **$0.040 – $0.372 per million operations** of compute. Overall, it grows O(n) with workload size (measured exponent 0.81).

> Dollar figures are **estimates** from published list prices (see _Cost model_ below) and are for comparing orders of magnitude, not for budgeting to the cent.

| Cost | Typical (160 exports) | Largest (1280 exports) |
| --- | --- | --- |
| Added latency per operation | 19.2 ms | 114 ms |
| Added latency, relative to baseline | 24× baseline | 19× baseline |
| Added CPU time per operation | 33.1 ms | 180 ms |
| Added memory per operation (heap delta) | 11.5 MiB | 36.4 MiB |
| Estimated compute cost per 1M operations | $0.040 – $0.372 | $0.237 – $2.02 |
| Single-core throughput ceiling of the overhead alone | 52 ops/s | 9 ops/s |

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
| 20 | 146 µs | 4.17 ms | 4.03 ms | 29× baseline | 13.0 ms | $0.0084 – $0.146 |
| 40 | 240 µs | 7.07 ms | 6.83 ms | 29× baseline | 17.2 ms | $0.014 – $0.193 |
| 80 | 443 µs | 11.6 ms | 11.2 ms | 26× baseline | 26.9 ms | $0.023 – $0.302 |
| 160 | 827 µs | 20.0 ms | 19.2 ms | 24× baseline | 33.1 ms | $0.040 – $0.372 |
| 320 | 1.70 ms | 36.6 ms | 34.9 ms | 21× baseline | 62.4 ms | $0.073 – $0.701 |
| 640 | 3.09 ms | 64.6 ms | 61.5 ms | 21× baseline | 102 ms | $0.128 – $1.15 |
| 1280 | 6.40 ms | 120 ms | 114 ms | 19× baseline | 180 ms | $0.237 – $2.02 |

**How the total grows:** O(n) (linear), exponent 0.81 over 7 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 160 | At 1280 |
| --- | --- | --- | --- | --- | --- |
| `loadApiModel (both API descriptions)` | O(n) | O(n) | ✅ matches | 15.2 ms | 94.7 ms |
| `normalizeApiPackage` | O(n log n) | O(n) | 🟡 close (neighbouring class) | 382 µs | 2.51 ms |
| `classifyContractChanges (with type-assignability probing)` | O(n) | O(n) | ✅ matches | 380 µs | 3.26 ms |

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

**Measured: O(n)** (exponent 0.82, 7 sizes) -- ✅ matches.

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 3.06 ms | 3.64 ms | 12.4 ms | 1.6 MiB | 326 |
| 40 | 5.23 ms | 5.47 ms | 19.8 ms | 2.9 MiB | 191 |
| 80 | 9.11 ms | 9.53 ms | 29.3 ms | 5.5 MiB | 110 |
| 160 | 15.2 ms | 16.0 ms | 36.2 ms | 10.2 MiB | 66 |
| 320 | 26.2 ms | 27.3 ms | 48.9 ms | 19.8 MiB | 38 |
| 640 | 49.8 ms | 50.5 ms | 87.6 ms | 38.6 MiB | 20 |
| 1280 | 94.7 ms | 95.7 ms | 147 ms | 18.1 MiB | 11 |

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

**Measured: O(n)** (exponent 0.84, 7 sizes) -- 🟡 close (neighbouring class).

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 88.3 µs | 99.2 µs | 89.7 µs | 45.9 KiB | 11,321 |
| 40 | 104 µs | 181 µs | 134 µs | 89.6 KiB | 9,615 |
| 80 | 166 µs | 301 µs | 177 µs | 173.0 KiB | 6,022 |
| 160 | 382 µs | 561 µs | 391 µs | 345.2 KiB | 2,619 |
| 320 | 631 µs | 1.05 ms | 697 µs | 686.7 KiB | 1,585 |
| 640 | 1.25 ms | 1.30 ms | 1.68 ms | 1.3 MiB | 799 |
| 1280 | 2.51 ms | 2.63 ms | 4.01 ms | 2.7 MiB | 399 |

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

**Measured: O(n)** (exponent 1.01, 7 sizes) -- ✅ matches.

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 48.4 µs | 52.1 µs | 50.3 µs | 67.4 KiB | 20,670 |
| 40 | 96.6 µs | 109 µs | 125 µs | 131.3 KiB | 10,354 |
| 80 | 187 µs | 196 µs | 190 µs | 257.2 KiB | 5,349 |
| 160 | 380 µs | 406 µs | 383 µs | 512.0 KiB | 2,634 |
| 320 | 758 µs | 818 µs | 1.37 ms | 1014.4 KiB | 1,319 |
| 640 | 1.61 ms | 1.69 ms | 2.78 ms | 2.0 MiB | 621 |
| 1280 | 3.26 ms | 3.49 ms | 13.0 ms | 4.0 MiB | 306 |

## 3. What makes up the end-to-end overhead

Each function's measured cost is multiplied by how many times one end-to-end operation calls it, then compared with the total overhead from section 1. This shows where the cost actually lives, so effort goes to the function that matters. Shares are estimates: they can sum to slightly more or less than 100% because the two measurements were taken separately (the remainder is shown as _unattributed_).

**At 160 exports** (total added: 19.2 ms)

| Function | Calls / operation | Estimated time | Share of added time | Share of operation |
| --- | --- | --- | --- | --- |
| `classify-contract-changes` | 1 | 380 µs | 2.0% | 1.9% |
| _unattributed_ |  | 18.8 ms | 98% |  |

**At 1280 exports** (total added: 114 ms)

| Function | Calls / operation | Estimated time | Share of added time | Share of operation |
| --- | --- | --- | --- | --- |
| `classify-contract-changes` | 1 | 3.26 ms | 2.9% | 2.7% |
| _unattributed_ |  | 111 ms | 97% |  |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-01T14:35:58.262Z` → `2026-10-01T14:36:15.873Z` (18 s), npm run benchmark
- Machine: Apple M3, 8 logical core(s) (8 physical), 24576 MB RAM, darwin/arm64, Node v24.20.0, local
- Git: `4ef058336f9a3755b92926f8d2bfaa07ef43fdae` on `feat/remove-minimatch-dist-no-urls` (uncommitted changes)
- Sizes: 20, 40, 80, 160, 320, 640, 1280 exports -- One exported function in the package's public API. 160 is a mid-sized library's surface; the ladder reaches 1,280. It stops there, not at 10,240, because every size compiles a real synthetic TypeScript package and runs API Extractor over it, which takes minutes at the largest sizes.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

