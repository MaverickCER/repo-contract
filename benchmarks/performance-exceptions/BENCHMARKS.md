# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.40 ms** per operation compared with a bare-minimum baseline (**277% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.01). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.40 ms | 24.4 ms |
| Added latency, relative to baseline | 277% | 341% |
| Added CPU time per operation | 2.27 ms | 24.2 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 |
| Single-core throughput ceiling of the overhead alone | 714 ops/s | 41 ops/s |

## 1. End-to-end: the package's total impact

Shows what a check pays, once per run, to read an exception registry, reconcile it with what the check found and write it back, compared with the bare minimum of parsing the file and matching ids by hand. It is pure in-memory work, paid by every check that keeps a registry.

- **Baseline (no package):** Parse the registry JSON and match each finding to a record by id with a Map -- the least anyone would do.
- **With the package:** `loadExceptionRegistry` reads the registry, `reconcileExceptions` matches the findings and `writeExceptionRegistry` serializes it back.

Both sides use empty or minimal functions on purpose, so the difference is the package's own cost -- not the cost of the work an application would plug into it. Real applications add their own work on top; this is the floor the package imposes.

**Variables that could change this result**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| entries | swept | The tier axis: how many entries the main input holds (records, findings, rules, fields or classifications, as each function says). |
| filesystem | fixed at "an in-memory stand-in" | A real disk adds its own latency; the benchmark isolates the package's own work, as the standard asks (no real I/O). |
| runtime | fixed at "Node (V8)" | Measured on Node only. |
| match rate | fixed at "every finding matches a record" | A registry with stale or new entries does a little more work. |

The baseline is an empty or minimal function, so it costs almost nothing and the _relative_ overhead can look enormous (shown as a multiple of the baseline). Read the absolute columns -- time, CPU and dollars added -- they are what a bill and a latency budget are made of.

| entrys | Baseline | With package | Added | Added vs baseline | Added CPU | Est. $ / 1M ops |
| --- | --- | --- | --- | --- | --- | --- |
| 20 | 23.1 µs | 122 µs | 98.5 µs | 426% | 366 µs | $0.00021 – $0.0041 |
| 40 | 40.7 µs | 159 µs | 119 µs | 292% | 318 µs | $0.00025 – $0.0036 |
| 80 | 70.5 µs | 287 µs | 217 µs | 308% | 593 µs | $0.00045 – $0.0067 |
| 160 | 142 µs | 527 µs | 385 µs | 272% | 867 µs | $0.0008 – $0.0097 |
| 320 | 268 µs | 1.03 ms | 759 µs | 284% | 1.87 ms | $0.0016 – $0.021 |
| 640 | 505 µs | 1.91 ms | 1.40 ms | 277% | 2.27 ms | $0.0029 – $0.025 |
| 1280 | 1.02 ms | 3.54 ms | 2.53 ms | 248% | 2.55 ms | $0.0053 – $0.029 |
| 2560 | 1.84 ms | 6.85 ms | 5.01 ms | 272% | 4.97 ms | $0.010 – $0.056 |
| 5120 | 3.57 ms | 14.0 ms | 10.4 ms | 291% | 10.5 ms | $0.022 – $0.118 |
| 10240 | 7.17 ms | 31.6 ms | 24.4 ms | 341% | 24.2 ms | $0.051 – $0.272 |

**How the total grows:** O(n) (linear), exponent 1.01 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 309 µs | 3.17 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 51.9 µs | 1.18 ms |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 409 µs | 5.23 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.50 ms | 23.3 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 25.7 ms | 427 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 112 µs | 3.59 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 51.8 ms | 825 ms |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 25.8 ms | 427 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 66.3 µs | 2.84 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 10.6 µs | 119 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 128 µs | 1.83 ms |

### `reconcileExceptions`

**Why we benchmark it.** Every check that keeps an exception registry reconciles it with what it found on every run, so its cost is paid by every contract run that has exceptions.

**What poor performance would mean.** Slower runs in proportion to the registry and the findings, and a quadratic match would punish the repositories with the most exceptions.

**Expected growth: O(n).** It indexes the existing records by id in a Map and looks each finding up once, so cost is proportional to the findings plus the records.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| findings | swept | The tier axis: findings to match. |
| existing-records | swept | How many records the registry already holds. |
| match rate | fixed at "findings carry the even ids 0, 2, 4 ...; each one below the registry's size matches a record" | Matched findings reuse a record; the rest create a stub. With the registry at its base size of 640 records at most 320 findings match (half of them at 640 findings); on the registry sweep, every finding matches once the registry holds twice as many records. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Called once per run, between reading and writing the registry, but not attributed: the end-to-end run reconciles a registry in which every finding matches, while this benchmark holds the registry at 640 records with only some findings matching, so its time would misstate that share.

**Measured: O(n)** (exponent 0.86, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 90.7 µs | 112 µs | 361 µs | 115.4 KiB | 11,026 |
| 40 | 64.2 µs | 67.4 µs | 249 µs | 98.4 KiB | 15,570 |
| 80 | 66.5 µs | 69.3 µs | 216 µs | 122.1 KiB | 15,043 |
| 160 | 90.6 µs | 93.9 µs | 301 µs | 158.9 KiB | 11,037 |
| 320 | 130 µs | 136 µs | 407 µs | 237.1 KiB | 7,708 |
| 640 | 309 µs | 403 µs | 1.14 ms | 530.7 KiB | 3,237 |
| 1280 | 458 µs | 471 µs | 1.30 ms | 1.0 MiB | 2,186 |
| 2560 | 771 µs | 797 µs | 1.56 ms | 2.1 MiB | 1,298 |
| 5120 | 1.70 ms | 1.75 ms | 3.27 ms | 4.3 MiB | 589 |
| 10240 | 3.17 ms | 3.28 ms | 4.52 ms | 8.6 MiB | 315 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.14, 10 sizes) -- 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 9.80 µs | 10.2 µs | 9.90 µs | 17.0 KiB | 102,035 |
| 40 | 10.2 µs | 10.7 µs | 10.3 µs | 16.3 KiB | 98,396 |
| 80 | 13.3 µs | 14.0 µs | 13.5 µs | 20.5 KiB | 75,191 |
| 160 | 19.1 µs | 20.2 µs | 64.1 µs | 28.6 KiB | 52,253 |
| 320 | 31.9 µs | 33.3 µs | 131 µs | 48.4 KiB | 31,365 |
| 640 | 51.9 µs | 54.2 µs | 181 µs | 86.7 KiB | 19,281 |
| 1280 | 99.8 µs | 106 µs | 316 µs | 171.2 KiB | 10,019 |
| 2560 | 212 µs | 219 µs | 675 µs | 329.7 KiB | 4,722 |
| 5120 | 522 µs | 541 µs | 1.51 ms | 634.3 KiB | 1,916 |
| 10240 | 1.18 ms | 1.21 ms | 3.53 ms | 1.3 MiB | 848 |

### `loadExceptionRegistry`

**Why we benchmark it.** Every check that keeps a registry reads it at the start of every run.

**What poor performance would mean.** Slower starts for every check in proportion to the registry, which is the part of a contract run that cannot be skipped.

**Expected growth: O(n).** The file is parsed once and its array is handed to the schema once, so cost is proportional to the size of the registry.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| records | swept | The tier axis: records in the registry. |
| filesystem | fixed at "an in-memory stand-in" | A real disk adds its own latency; the benchmark isolates the package's own work, as the standard asks (no real I/O). |
| schema | fixed at "accepts every array" | A caller's own schema adds its own validation cost on top. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Once per run, before reconciling.

**Measured: O(n)** (exponent 0.95, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 17.7 µs | 19.1 µs | 17.9 µs | 7.3 KiB | 56,555 |
| 40 | 28.0 µs | 28.9 µs | 93.8 µs | 13.2 KiB | 35,735 |
| 80 | 53.5 µs | 55.9 µs | 174 µs | 25.1 KiB | 18,705 |
| 160 | 107 µs | 111 µs | 347 µs | 48.9 KiB | 9,344 |
| 320 | 204 µs | 214 µs | 622 µs | 96.5 KiB | 4,906 |
| 640 | 409 µs | 423 µs | 1.24 ms | 191.6 KiB | 2,446 |
| 1280 | 717 µs | 747 µs | 1.58 ms | 381.6 KiB | 1,395 |
| 2560 | 1.50 ms | 1.75 ms | 3.37 ms | 761.9 KiB | 665 |
| 5120 | 3.20 ms | 3.31 ms | 5.22 ms | 1.5 MiB | 312 |
| 10240 | 5.23 ms | 5.32 ms | 7.57 ms | 3.0 MiB | 191 |

### `writeExceptionRegistry`

**Why we benchmark it.** Every check that reconciles a registry writes it back when it changed.

**What poor performance would mean.** Slower runs whenever a registry changes, in proportion to its size.

**Expected growth: O(n log n).** Each record's keys are put in canonical order and the whole registry is serialized once, so cost grows a little faster than the number of records.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| records | swept | The tier axis: records written. |
| filesystem | fixed at "an in-memory stand-in" | A real disk adds its own latency; the benchmark isolates the package's own work, as the standard asks (no real I/O). |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Once per run, after reconciling, when the registry changed.

**Measured: O(n)** (exponent 0.98, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 74.3 µs | 84.7 µs | 307 µs | 44.3 KiB | 13,453 |
| 40 | 117 µs | 133 µs | 396 µs | 83.1 KiB | 8,570 |
| 80 | 215 µs | 228 µs | 635 µs | 161.5 KiB | 4,661 |
| 160 | 423 µs | 455 µs | 1.27 ms | 319.5 KiB | 2,367 |
| 320 | 717 µs | 759 µs | 1.56 ms | 632.2 KiB | 1,395 |
| 640 | 1.50 ms | 1.58 ms | 3.21 ms | 1.2 MiB | 668 |
| 1280 | 2.80 ms | 3.53 ms | 4.64 ms | 2.5 MiB | 358 |
| 2560 | 5.22 ms | 5.50 ms | 7.13 ms | 4.9 MiB | 192 |
| 5120 | 10.2 ms | 10.5 ms | 12.4 ms | 9.8 MiB | 98 |
| 10240 | 23.3 ms | 23.7 ms | 25.9 ms | 19.7 MiB | 43 |

### `resolveExceptionPolicy`

**Why we benchmark it.** It decides, for each exception record, which policy applies, and runs once per classification of every record.

**What poor performance would mean.** Slower judgement of every record in proportion to how many rules a policy has.

**Expected growth: O(n).** It scans the group's rules for an exact match and then for glob matches, so cost is proportional to the number of rules.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| rules | swept | The tier axis: rules in the group. |
| category | variant | An exact rule, a category matched by a glob, or every category at once. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Not part of the end-to-end operation, which reads and writes a registry.

#### Variant `glob-match`

The category matches one glob rule.

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.52 ms | 1.90 ms | 3.84 ms | 652.5 KiB | 659 |
| 40 | 1.85 ms | 2.90 ms | 3.56 ms | 1.3 MiB | 540 |
| 80 | 3.46 ms | 4.16 ms | 5.19 ms | 2.6 MiB | 289 |
| 160 | 6.76 ms | 8.96 ms | 8.61 ms | 5.3 MiB | 148 |
| 320 | 13.2 ms | 16.3 ms | 15.1 ms | 10.6 MiB | 76 |
| 640 | 25.7 ms | 28.6 ms | 27.5 ms | 21.4 MiB | 39 |
| 1280 | 52.7 ms | 56.8 ms | 55.0 ms | 43.7 MiB | 19 |
| 2560 | 105 ms | 112 ms | 107 ms | 25.9 MiB | 10 |
| 5120 | 213 ms | 214 ms | 219 ms | 54.2 MiB | 5 |
| 10240 | 427 ms | 431 ms | 438 ms | 47.0 MiB | 2 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.21, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 5.67 µs | 6.76 µs | 5.91 µs | 7.4 KiB | 176,436 |
| 40 | 9.57 µs | 10.2 µs | 34.4 µs | 14.0 KiB | 104,464 |
| 80 | 16.4 µs | 17.5 µs | 58.8 µs | 27.3 KiB | 60,801 |
| 160 | 31.6 µs | 34.9 µs | 109 µs | 53.9 KiB | 31,596 |
| 320 | 60.1 µs | 67.0 µs | 191 µs | 107.0 KiB | 16,645 |
| 640 | 112 µs | 123 µs | 327 µs | 213.3 KiB | 8,913 |
| 1280 | 422 µs | 442 µs | 1.01 ms | 515.9 KiB | 2,368 |
| 2560 | 828 µs | 1.09 ms | 1.74 ms | 1.0 MiB | 1,208 |
| 5120 | 1.75 ms | 1.87 ms | 3.55 ms | 2.1 MiB | 570 |
| 10240 | 3.59 ms | 3.74 ms | 5.87 ms | 4.2 MiB | 279 |

### `evaluateExceptionRecord`

**Why we benchmark it.** It decides whether one record is permitted, and runs for every record of a registry.

**What poor performance would mean.** Slower judgement of a whole registry, multiplied by the number of classifications each record carries and the rules each policy has.

**Expected growth: O(n).** Each classification is resolved once, so cost is proportional to the number of classifications.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| classifications | swept | The tier axis: classifications the record is judged under. |
| rules | swept | How many rules the policy group has. |
| requirements | fixed at 4 | How many fields the policy's matching rule requires. Each costs one field read and one trim, which is too small next to resolving the rules to measure a growth rate of its own. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Not part of the end-to-end operation, which reads and writes a registry.

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.88 ms | 1.99 ms | 4.09 ms | 1.2 MiB | 533 |
| 40 | 3.43 ms | 3.52 ms | 5.64 ms | 2.5 MiB | 292 |
| 80 | 6.58 ms | 10.2 ms | 8.78 ms | 5.0 MiB | 152 |
| 160 | 12.7 ms | 13.2 ms | 14.9 ms | 10.0 MiB | 79 |
| 320 | 25.9 ms | 26.1 ms | 28.1 ms | 20.0 MiB | 39 |
| 640 | 51.8 ms | 60.9 ms | 54.4 ms | 40.1 MiB | 19 |
| 1280 | 104 ms | 108 ms | 106 ms | 16.1 MiB | 10 |
| 2560 | 206 ms | 207 ms | 209 ms | 32.3 MiB | 5 |
| 5120 | 413 ms | 415 ms | 416 ms | 707.4 KiB | 2 |
| 10240 | 825 ms | 827 ms | 828 ms | 1.4 MiB | 1 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.15 ms | 1.31 ms | 3.33 ms | 645.6 KiB | 869 |
| 40 | 1.92 ms | 2.00 ms | 4.11 ms | 1.3 MiB | 522 |
| 80 | 3.43 ms | 3.54 ms | 5.60 ms | 2.5 MiB | 291 |
| 160 | 6.55 ms | 6.72 ms | 8.77 ms | 5.2 MiB | 153 |
| 320 | 12.7 ms | 13.1 ms | 15.0 ms | 10.6 MiB | 78 |
| 640 | 25.8 ms | 26.3 ms | 28.1 ms | 21.4 MiB | 39 |
| 1280 | 52.7 ms | 52.9 ms | 55.0 ms | 43.6 MiB | 19 |
| 2560 | 106 ms | 109 ms | 109 ms | 25.7 MiB | 9 |
| 5120 | 213 ms | 213 ms | 217 ms | 53.9 MiB | 5 |
| 10240 | 427 ms | 429 ms | 432 ms | 46.2 MiB | 2 |

### `validateExceptionPolicyConfig`

**Why we benchmark it.** A check validates its policy config before it judges a single record, once per run.

**What poor performance would mean.** Slower starts for every check in proportion to how large its policy is.

**Expected growth: O(n).** Each rule is validated once, and each required field is looked up in the list of valid ones.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| rules | swept | The tier axis: rules in the config. |
| valid-requirements | swept | How many requirement names are valid. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Not part of the end-to-end operation, which reads and writes a registry.

**Measured: O(n log n)** (exponent 1.29, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 4.48 µs | 10.7 µs | 4.62 µs | 9.3 KiB | 223,129 |
| 40 | 5.96 µs | 6.94 µs | 10.1 µs | 8.4 KiB | 167,755 |
| 80 | 10.3 µs | 10.9 µs | 41.9 µs | 16.2 KiB | 97,234 |
| 160 | 18.1 µs | 19.8 µs | 65.3 µs | 31.8 KiB | 55,174 |
| 320 | 34.1 µs | 35.5 µs | 115 µs | 63.1 KiB | 29,335 |
| 640 | 66.3 µs | 85.2 µs | 212 µs | 127.6 KiB | 15,081 |
| 1280 | 339 µs | 348 µs | 916 µs | 352.8 KiB | 2,952 |
| 2560 | 667 µs | 687 µs | 1.54 ms | 694.2 KiB | 1,499 |
| 5120 | 1.44 ms | 1.47 ms | 3.28 ms | 1.3 MiB | 694 |
| 10240 | 2.84 ms | 2.93 ms | 4.86 ms | 2.7 MiB | 352 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.87, 10 sizes) -- ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 3.25 µs | 3.43 µs | 3.28 µs | 4.5 KiB | 307,884 |
| 40 | 3.49 µs | 3.80 µs | 3.53 µs | 4.5 KiB | 286,524 |
| 80 | 3.98 µs | 4.20 µs | 4.02 µs | 4.5 KiB | 251,170 |
| 160 | 5.10 µs | 5.27 µs | 5.16 µs | 4.5 KiB | 196,258 |
| 320 | 7.35 µs | 7.52 µs | 24.0 µs | 4.5 KiB | 136,134 |
| 640 | 10.6 µs | 11.1 µs | 41.7 µs | 4.5 KiB | 94,310 |
| 1280 | 17.5 µs | 18.3 µs | 64.0 µs | 4.5 KiB | 57,207 |
| 2560 | 31.7 µs | 37.3 µs | 110 µs | 4.5 KiB | 31,568 |
| 5120 | 60.2 µs | 72.6 µs | 203 µs | 4.5 KiB | 16,617 |
| 10240 | 119 µs | 133 µs | 382 µs | 4.5 KiB | 8,437 |

### `hashRequirementFields`

**Why we benchmark it.** It fingerprints the fields of a record that a policy requires, so a record that changed after review can be told from one that did not.

**What poor performance would mean.** Slower review checks for every record in proportion to how many fields a policy requires.

**Expected growth: O(n).** Each field's value is read once and the whole list is hashed once, so cost is proportional to the number of fields.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| fields | swept | The tier axis: fields hashed. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Not part of the end-to-end operation, which reads and writes a registry.

**Measured: O(n)** (exponent 0.98, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 11.2 µs | 14.3 µs | 11.5 µs | 3.7 KiB | 89,261 |
| 40 | 15.2 µs | 17.4 µs | 15.4 µs | 6.3 KiB | 65,900 |
| 80 | 24.7 µs | 26.7 µs | 25.2 µs | 11.7 KiB | 40,412 |
| 160 | 42.5 µs | 45.3 µs | 44.7 µs | 22.3 KiB | 23,550 |
| 320 | 78.3 µs | 81.9 µs | 318 µs | 45.3 KiB | 12,772 |
| 640 | 128 µs | 148 µs | 417 µs | 91.0 KiB | 7,839 |
| 1280 | 238 µs | 256 µs | 675 µs | 186.4 KiB | 4,208 |
| 2560 | 476 µs | 528 µs | 1.37 ms | 360.9 KiB | 2,100 |
| 5120 | 1.07 ms | 1.15 ms | 2.86 ms | 685.3 KiB | 938 |
| 10240 | 1.83 ms | 1.93 ms | 3.74 ms | 1.3 MiB | 547 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 1.91 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.50 ms | 1.50 ms | 79% |
| `load-exception-registry` | 1 | 409 µs | 409 µs | 21% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 0 | 0.0% |

**At 10240 entrys** (whole operation: 31.6 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 23.3 ms | 23.3 ms | 74% |
| `load-exception-registry` | 1 | 5.23 ms | 5.23 ms | 17% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 3.05 ms | 9.6% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-21T16:04:14.049Z` → `2026-10-21T16:05:10.281Z` (56 s), ci: CI (run 39629298189)
- Machine: INTEL(R) XEON(R) PLATINUM 8573C, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.0, GitHub Actions
- Git: `f7d1a4bf74a791c9676a1904e49eec1b38243cf1` on `fix/license-config-and-e2e-zero-tests`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

