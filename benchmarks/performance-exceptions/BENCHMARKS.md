# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.89 ms** per operation compared with a bare-minimum baseline (**286% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.02). At list prices that is on the order of **~$0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.89 ms | 32.9 ms |
| Added latency, relative to baseline | 286% | 323% |
| Added CPU time per operation | 2.63 ms | 32.6 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 528 ops/s | 30 ops/s |

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
| 20 | 28.5 µs | 141 µs | 112 µs | 393% | 394 µs | $0.00023 – $0.0044 |
| 40 | 51.1 µs | 206 µs | 155 µs | 303% | 404 µs | $0.00032 – $0.0045 |
| 80 | 95.2 µs | 398 µs | 302 µs | 318% | 858 µs | $0.00063 – $0.0096 |
| 160 | 178 µs | 655 µs | 476 µs | 267% | 925 µs | $0.00099 – $0.010 |
| 320 | 345 µs | 1.30 ms | 957 µs | 277% | 1.92 ms | $0.002 – $0.022 |
| 640 | 663 µs | 2.55 ms | 1.89 ms | 286% | 2.63 ms | $0.0039 – $0.030 |
| 1280 | 1.33 ms | 4.88 ms | 3.55 ms | 266% | 3.63 ms | $0.0074 – $0.041 |
| 2560 | 2.51 ms | 9.60 ms | 7.09 ms | 283% | 7.08 ms | $0.015 – $0.080 |
| 5120 | 5.02 ms | 19.6 ms | 14.6 ms | 291% | 14.8 ms | $0.030 – $0.167 |
| 10240 | 10.2 ms | 43.1 ms | 32.9 ms | 323% | 32.6 ms | $0.069 – $0.367 |

**How the total grows:** O(n) (linear), exponent 1.02 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 374 µs | 4.21 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 61.3 µs | 1.39 ms |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 542 µs | 7.32 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.98 ms | 32.2 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 36.7 ms | 575 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 155 µs | 4.35 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 69.2 ms | 1.09 s |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 34.9 ms | 571 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 88.2 µs | 3.58 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 13.1 µs | 142 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 165 µs | 2.47 ms |

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

**Measured: O(n)** (exponent 0.90, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 105 µs | 129 µs | 352 µs | 115.4 KiB | 9,497 |
| 40 | 81.0 µs | 126 µs | 322 µs | 99.8 KiB | 12,350 |
| 80 | 80.1 µs | 83.0 µs | 261 µs | 118.5 KiB | 12,485 |
| 160 | 104 µs | 107 µs | 316 µs | 159.3 KiB | 9,602 |
| 320 | 152 µs | 156 µs | 445 µs | 237.4 KiB | 6,570 |
| 640 | 374 µs | 448 µs | 1.07 ms | 656.2 KiB | 2,672 |
| 1280 | 522 µs | 535 µs | 1.23 ms | 1.0 MiB | 1,915 |
| 2560 | 1.02 ms | 1.06 ms | 2.38 ms | 2.1 MiB | 977 |
| 5120 | 2.10 ms | 2.14 ms | 3.49 ms | 4.3 MiB | 476 |
| 10240 | 4.21 ms | 4.35 ms | 5.29 ms | 8.6 MiB | 237 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.14, 10 sizes) -- 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 10.9 µs | 11.6 µs | 41.2 µs | 17.0 KiB | 91,583 |
| 40 | 11.2 µs | 12.3 µs | 42.5 µs | 16.3 KiB | 89,520 |
| 80 | 14.5 µs | 15.4 µs | 52.6 µs | 20.5 KiB | 69,081 |
| 160 | 20.1 µs | 23.7 µs | 70.0 µs | 28.6 KiB | 49,839 |
| 320 | 31.7 µs | 33.7 µs | 105 µs | 48.2 KiB | 31,552 |
| 640 | 61.3 µs | 63.4 µs | 206 µs | 86.9 KiB | 16,320 |
| 1280 | 114 µs | 119 µs | 330 µs | 166.1 KiB | 8,799 |
| 2560 | 236 µs | 244 µs | 635 µs | 329.7 KiB | 4,230 |
| 5120 | 605 µs | 622 µs | 1.49 ms | 634.3 KiB | 1,653 |
| 10240 | 1.39 ms | 1.42 ms | 3.52 ms | 1.3 MiB | 719 |

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

**Measured: O(n)** (exponent 0.96, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 22.5 µs | 24.7 µs | 82.1 µs | 7.3 KiB | 44,388 |
| 40 | 37.8 µs | 39.5 µs | 115 µs | 13.2 KiB | 26,482 |
| 80 | 73.2 µs | 75.7 µs | 212 µs | 25.1 KiB | 13,652 |
| 160 | 144 µs | 149 µs | 391 µs | 48.9 KiB | 6,934 |
| 320 | 285 µs | 292 µs | 775 µs | 96.5 KiB | 3,506 |
| 640 | 542 µs | 553 µs | 1.28 ms | 191.6 KiB | 1,845 |
| 1280 | 1.09 ms | 1.13 ms | 2.60 ms | 381.9 KiB | 918 |
| 2560 | 2.00 ms | 2.36 ms | 3.66 ms | 761.9 KiB | 500 |
| 5120 | 4.49 ms | 4.68 ms | 6.30 ms | 1.5 MiB | 223 |
| 10240 | 7.32 ms | 7.90 ms | 9.47 ms | 3.0 MiB | 137 |

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

**Measured: O(n)** (exponent 1.00, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 83.4 µs | 90.7 µs | 294 µs | 44.3 KiB | 11,984 |
| 40 | 146 µs | 160 µs | 439 µs | 83.3 KiB | 6,840 |
| 80 | 279 µs | 286 µs | 763 µs | 161.9 KiB | 3,578 |
| 160 | 525 µs | 579 µs | 1.27 ms | 319.5 KiB | 1,904 |
| 320 | 1.05 ms | 1.08 ms | 2.50 ms | 634.7 KiB | 956 |
| 640 | 1.98 ms | 2.06 ms | 3.46 ms | 1.2 MiB | 505 |
| 1280 | 3.69 ms | 3.79 ms | 5.26 ms | 2.5 MiB | 271 |
| 2560 | 7.11 ms | 7.21 ms | 8.91 ms | 4.9 MiB | 141 |
| 5120 | 14.1 ms | 14.4 ms | 16.0 ms | 9.8 MiB | 71 |
| 10240 | 32.2 ms | 32.7 ms | 34.8 ms | 19.7 MiB | 31 |

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

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.92 ms | 2.22 ms | 4.09 ms | 652.5 KiB | 521 |
| 40 | 2.46 ms | 3.56 ms | 3.96 ms | 1.3 MiB | 407 |
| 80 | 4.63 ms | 5.95 ms | 6.08 ms | 2.6 MiB | 216 |
| 160 | 9.14 ms | 11.6 ms | 10.7 ms | 5.3 MiB | 109 |
| 320 | 17.8 ms | 19.0 ms | 19.6 ms | 10.6 MiB | 56 |
| 640 | 36.7 ms | 39.5 ms | 41.1 ms | 21.5 MiB | 27 |
| 1280 | 71.2 ms | 78.3 ms | 73.3 ms | 43.7 MiB | 14 |
| 2560 | 142 ms | 144 ms | 145 ms | 25.9 MiB | 7 |
| 5120 | 289 ms | 293 ms | 299 ms | 54.2 MiB | 3 |
| 10240 | 575 ms | 586 ms | 587 ms | 47.0 MiB | 2 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.16, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 8.08 µs | 9.16 µs | 8.21 µs | 7.4 KiB | 123,815 |
| 40 | 11.6 µs | 12.4 µs | 40.7 µs | 14.0 KiB | 86,009 |
| 80 | 21.6 µs | 22.6 µs | 68.7 µs | 27.3 KiB | 46,364 |
| 160 | 40.5 µs | 46.0 µs | 124 µs | 53.9 KiB | 24,715 |
| 320 | 83.5 µs | 94.5 µs | 273 µs | 107.0 KiB | 11,979 |
| 640 | 155 µs | 164 µs | 455 µs | 213.3 KiB | 6,460 |
| 1280 | 527 µs | 572 µs | 1.31 ms | 516.0 KiB | 1,897 |
| 2560 | 1.07 ms | 1.16 ms | 2.59 ms | 1.0 MiB | 936 |
| 5120 | 2.12 ms | 2.34 ms | 3.75 ms | 2.1 MiB | 472 |
| 10240 | 4.35 ms | 4.51 ms | 6.44 ms | 4.2 MiB | 230 |

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

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.56 ms | 2.75 ms | 4.45 ms | 1.2 MiB | 391 |
| 40 | 4.70 ms | 4.76 ms | 6.60 ms | 2.5 MiB | 213 |
| 80 | 8.97 ms | 9.01 ms | 10.9 ms | 5.0 MiB | 111 |
| 160 | 17.6 ms | 22.9 ms | 19.4 ms | 10.0 MiB | 57 |
| 320 | 34.7 ms | 34.9 ms | 36.7 ms | 20.0 MiB | 29 |
| 640 | 69.2 ms | 70.4 ms | 71.2 ms | 40.1 MiB | 14 |
| 1280 | 138 ms | 140 ms | 140 ms | 16.1 MiB | 7 |
| 2560 | 272 ms | 273 ms | 275 ms | 32.3 MiB | 4 |
| 5120 | 545 ms | 547 ms | 548 ms | 707.4 KiB | 2 |
| 10240 | 1.09 s | 1.09 s | 1.09 s | 1.4 MiB | 1 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.45 ms | 1.49 ms | 3.34 ms | 645.6 KiB | 690 |
| 40 | 2.52 ms | 2.58 ms | 4.40 ms | 1.3 MiB | 397 |
| 80 | 4.65 ms | 4.69 ms | 6.53 ms | 2.5 MiB | 215 |
| 160 | 8.95 ms | 9.08 ms | 10.9 ms | 5.2 MiB | 112 |
| 320 | 17.6 ms | 17.8 ms | 19.6 ms | 10.6 MiB | 57 |
| 640 | 34.9 ms | 35.0 ms | 36.9 ms | 21.4 MiB | 29 |
| 1280 | 70.4 ms | 70.4 ms | 72.7 ms | 43.6 MiB | 14 |
| 2560 | 142 ms | 146 ms | 145 ms | 25.7 MiB | 7 |
| 5120 | 285 ms | 287 ms | 289 ms | 53.9 MiB | 4 |
| 10240 | 571 ms | 572 ms | 576 ms | 46.2 MiB | 2 |

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

**Measured: O(n log n)** (exponent 1.27, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 5.95 µs | 14.9 µs | 6.09 µs | 9.3 KiB | 168,048 |
| 40 | 7.64 µs | 9.64 µs | 30.1 µs | 8.4 KiB | 130,923 |
| 80 | 12.9 µs | 13.2 µs | 42.5 µs | 16.2 KiB | 77,673 |
| 160 | 23.3 µs | 24.6 µs | 74.9 µs | 31.8 KiB | 42,864 |
| 320 | 45.0 µs | 48.8 µs | 134 µs | 63.1 KiB | 22,213 |
| 640 | 88.2 µs | 91.0 µs | 254 µs | 127.7 KiB | 11,336 |
| 1280 | 433 µs | 444 µs | 1.19 ms | 340.8 KiB | 2,307 |
| 2560 | 800 µs | 812 µs | 1.61 ms | 694.2 KiB | 1,250 |
| 5120 | 1.75 ms | 1.81 ms | 3.43 ms | 1.3 MiB | 570 |
| 10240 | 3.58 ms | 3.62 ms | 5.41 ms | 2.7 MiB | 279 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.87, 10 sizes) -- ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 4.46 µs | 4.71 µs | 18.6 µs | 4.5 KiB | 224,372 |
| 40 | 4.85 µs | 5.10 µs | 20.0 µs | 4.5 KiB | 206,178 |
| 80 | 5.44 µs | 5.72 µs | 21.9 µs | 4.5 KiB | 183,777 |
| 160 | 6.48 µs | 6.77 µs | 24.7 µs | 4.5 KiB | 154,399 |
| 320 | 8.83 µs | 9.94 µs | 31.4 µs | 4.5 KiB | 113,208 |
| 640 | 13.1 µs | 13.7 µs | 44.9 µs | 4.5 KiB | 76,618 |
| 1280 | 22.1 µs | 22.8 µs | 71.3 µs | 4.5 KiB | 45,271 |
| 2560 | 39.0 µs | 40.1 µs | 119 µs | 4.5 KiB | 25,627 |
| 5120 | 75.4 µs | 79.6 µs | 232 µs | 4.5 KiB | 13,256 |
| 10240 | 142 µs | 146 µs | 406 µs | 4.5 KiB | 7,022 |

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

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 12.7 µs | 15.8 µs | 13.2 µs | 3.6 KiB | 78,535 |
| 40 | 18.7 µs | 21.4 µs | 18.9 µs | 6.3 KiB | 53,612 |
| 80 | 32.0 µs | 35.1 µs | 99.6 µs | 11.7 KiB | 31,298 |
| 160 | 51.0 µs | 57.3 µs | 188 µs | 22.3 KiB | 19,613 |
| 320 | 96.1 µs | 102 µs | 311 µs | 45.3 KiB | 10,407 |
| 640 | 165 µs | 177 µs | 472 µs | 92.1 KiB | 6,046 |
| 1280 | 313 µs | 343 µs | 826 µs | 191.5 KiB | 3,195 |
| 2560 | 607 µs | 623 µs | 1.42 ms | 360.0 KiB | 1,648 |
| 5120 | 1.38 ms | 1.46 ms | 3.02 ms | 685.3 KiB | 727 |
| 10240 | 2.47 ms | 2.54 ms | 4.16 ms | 1.3 MiB | 405 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 2.55 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.98 ms | 1.98 ms | 78% |
| `load-exception-registry` | 1 | 542 µs | 542 µs | 21% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 32.7 µs | 1.3% |

**At 10240 entrys** (whole operation: 43.1 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 32.2 ms | 32.2 ms | 75% |
| `load-exception-registry` | 1 | 7.32 ms | 7.32 ms | 17% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 3.54 ms | 8.2% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-03T04:07:35.224Z` → `2026-11-03T04:08:39.107Z` (64 s), ci: CI (run 41574378784)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15984 MB RAM, linux/x64, Node v24.22.1, GitHub Actions
- Git: `820a5b4b910e52cda715680ee4823a5db807217e` on `chore/dependency-updates`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

