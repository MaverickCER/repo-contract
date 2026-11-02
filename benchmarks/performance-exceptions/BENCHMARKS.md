# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.92 ms** per operation compared with a bare-minimum baseline (**295% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.02). At list prices that is on the order of **~$0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.92 ms | 33.9 ms |
| Added latency, relative to baseline | 295% | 340% |
| Added CPU time per operation | 2.68 ms | 33.9 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 521 ops/s | 29 ops/s |

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
| 20 | 29.6 µs | 156 µs | 127 µs | 427% | 510 µs | $0.00026 – $0.0057 |
| 40 | 50.6 µs | 206 µs | 155 µs | 306% | 401 µs | $0.00032 – $0.0045 |
| 80 | 94.3 µs | 403 µs | 309 µs | 327% | 866 µs | $0.00064 – $0.0097 |
| 160 | 187 µs | 672 µs | 485 µs | 259% | 854 µs | $0.001 – $0.0096 |
| 320 | 342 µs | 1.33 ms | 985 µs | 288% | 1.93 ms | $0.0021 – $0.022 |
| 640 | 651 µs | 2.57 ms | 1.92 ms | 295% | 2.68 ms | $0.004 – $0.030 |
| 1280 | 1.31 ms | 4.92 ms | 3.61 ms | 276% | 3.63 ms | $0.0075 – $0.041 |
| 2560 | 2.47 ms | 9.68 ms | 7.21 ms | 292% | 7.18 ms | $0.015 – $0.081 |
| 5120 | 4.95 ms | 19.5 ms | 14.6 ms | 294% | 14.3 ms | $0.030 – $0.161 |
| 10240 | 9.99 ms | 43.9 ms | 33.9 ms | 340% | 33.9 ms | $0.071 – $0.382 |

**How the total grows:** O(n) (linear), exponent 1.02 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 372 µs | 4.25 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 58.3 µs | 1.39 ms |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 531 µs | 7.21 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.97 ms | 32.1 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 38.5 ms | 576 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 153 µs | 4.33 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 68.9 ms | 1.09 s |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 35.1 ms | 568 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 87.2 µs | 3.59 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 13.1 µs | 144 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 166 µs | 2.33 ms |

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
| 20 | 112 µs | 150 µs | 403 µs | 115.6 KiB | 8,958 |
| 40 | 77.2 µs | 145 µs | 285 µs | 99.2 KiB | 12,952 |
| 80 | 78.2 µs | 82.7 µs | 242 µs | 120.8 KiB | 12,787 |
| 160 | 103 µs | 109 µs | 312 µs | 159.3 KiB | 9,690 |
| 320 | 150 µs | 155 µs | 452 µs | 237.4 KiB | 6,681 |
| 640 | 372 µs | 432 µs | 1.09 ms | 656.2 KiB | 2,689 |
| 1280 | 534 µs | 548 µs | 1.28 ms | 1.0 MiB | 1,871 |
| 2560 | 1.07 ms | 1.10 ms | 2.55 ms | 2.1 MiB | 931 |
| 5120 | 2.11 ms | 2.21 ms | 3.34 ms | 4.3 MiB | 474 |
| 10240 | 4.25 ms | 4.31 ms | 5.27 ms | 8.6 MiB | 235 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.15, 10 sizes) -- 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 11.5 µs | 12.3 µs | 44.9 µs | 17.0 KiB | 86,591 |
| 40 | 11.6 µs | 12.3 µs | 44.1 µs | 16.3 KiB | 86,503 |
| 80 | 14.4 µs | 17.3 µs | 52.1 µs | 20.5 KiB | 69,449 |
| 160 | 20.3 µs | 21.4 µs | 70.3 µs | 28.6 KiB | 49,334 |
| 320 | 31.7 µs | 33.6 µs | 104 µs | 48.2 KiB | 31,513 |
| 640 | 58.3 µs | 59.8 µs | 177 µs | 86.8 KiB | 17,164 |
| 1280 | 118 µs | 122 µs | 364 µs | 168.3 KiB | 8,440 |
| 2560 | 234 µs | 239 µs | 623 µs | 329.7 KiB | 4,270 |
| 5120 | 618 µs | 637 µs | 1.50 ms | 634.3 KiB | 1,619 |
| 10240 | 1.39 ms | 1.46 ms | 3.49 ms | 1.3 MiB | 721 |

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
| 20 | 22.6 µs | 23.7 µs | 84.9 µs | 7.3 KiB | 44,317 |
| 40 | 38.4 µs | 39.9 µs | 120 µs | 13.2 KiB | 26,049 |
| 80 | 75.4 µs | 79.8 µs | 237 µs | 25.1 KiB | 13,267 |
| 160 | 141 µs | 145 µs | 383 µs | 48.9 KiB | 7,107 |
| 320 | 280 µs | 290 µs | 770 µs | 96.5 KiB | 3,576 |
| 640 | 531 µs | 548 µs | 1.26 ms | 191.6 KiB | 1,885 |
| 1280 | 1.08 ms | 1.11 ms | 2.59 ms | 381.9 KiB | 929 |
| 2560 | 1.98 ms | 2.34 ms | 3.63 ms | 761.9 KiB | 506 |
| 5120 | 4.49 ms | 4.71 ms | 6.29 ms | 1.5 MiB | 223 |
| 10240 | 7.21 ms | 7.87 ms | 9.35 ms | 3.0 MiB | 139 |

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
| 20 | 88.0 µs | 104 µs | 329 µs | 44.5 KiB | 11,361 |
| 40 | 143 µs | 153 µs | 433 µs | 83.3 KiB | 6,983 |
| 80 | 273 µs | 296 µs | 769 µs | 161.9 KiB | 3,668 |
| 160 | 519 µs | 566 µs | 1.25 ms | 319.5 KiB | 1,926 |
| 320 | 1.03 ms | 1.14 ms | 2.50 ms | 634.7 KiB | 971 |
| 640 | 1.97 ms | 2.07 ms | 3.44 ms | 1.2 MiB | 506 |
| 1280 | 3.69 ms | 3.79 ms | 5.25 ms | 2.5 MiB | 271 |
| 2560 | 7.15 ms | 7.48 ms | 8.85 ms | 4.9 MiB | 140 |
| 5120 | 14.0 ms | 14.1 ms | 16.0 ms | 9.8 MiB | 72 |
| 10240 | 32.1 ms | 33.1 ms | 34.7 ms | 19.7 MiB | 31 |

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

**Measured: O(n)** (exponent 0.98, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.96 ms | 2.66 ms | 4.17 ms | 653.2 KiB | 511 |
| 40 | 2.47 ms | 3.73 ms | 3.95 ms | 1.3 MiB | 405 |
| 80 | 4.66 ms | 6.06 ms | 6.16 ms | 2.6 MiB | 214 |
| 160 | 9.21 ms | 11.2 ms | 10.7 ms | 5.3 MiB | 109 |
| 320 | 17.8 ms | 21.8 ms | 19.8 ms | 10.6 MiB | 56 |
| 640 | 38.5 ms | 40.5 ms | 43.3 ms | 21.5 MiB | 26 |
| 1280 | 70.4 ms | 74.0 ms | 72.5 ms | 43.7 MiB | 14 |
| 2560 | 142 ms | 146 ms | 144 ms | 25.9 MiB | 7 |
| 5120 | 289 ms | 292 ms | 299 ms | 54.2 MiB | 3 |
| 10240 | 576 ms | 577 ms | 588 ms | 47.0 MiB | 2 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.17, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 7.77 µs | 9.32 µs | 8.17 µs | 7.4 KiB | 128,635 |
| 40 | 11.5 µs | 13.2 µs | 40.1 µs | 14.0 KiB | 86,589 |
| 80 | 21.0 µs | 22.1 µs | 67.0 µs | 27.3 KiB | 47,556 |
| 160 | 40.2 µs | 42.1 µs | 121 µs | 53.9 KiB | 24,867 |
| 320 | 82.6 µs | 86.2 µs | 265 µs | 107.0 KiB | 12,100 |
| 640 | 153 µs | 159 µs | 453 µs | 213.3 KiB | 6,549 |
| 1280 | 523 µs | 540 µs | 1.29 ms | 516.0 KiB | 1,912 |
| 2560 | 965 µs | 991 µs | 1.77 ms | 1.0 MiB | 1,037 |
| 5120 | 2.10 ms | 2.31 ms | 3.68 ms | 2.1 MiB | 476 |
| 10240 | 4.33 ms | 5.27 ms | 6.39 ms | 4.2 MiB | 231 |

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
| 20 | 2.55 ms | 2.59 ms | 4.44 ms | 1.2 MiB | 393 |
| 40 | 4.69 ms | 4.89 ms | 6.62 ms | 2.5 MiB | 213 |
| 80 | 8.94 ms | 9.06 ms | 10.9 ms | 5.0 MiB | 112 |
| 160 | 17.6 ms | 24.1 ms | 19.8 ms | 10.0 MiB | 57 |
| 320 | 34.7 ms | 34.9 ms | 36.7 ms | 20.0 MiB | 29 |
| 640 | 68.9 ms | 70.7 ms | 71.1 ms | 40.1 MiB | 15 |
| 1280 | 138 ms | 141 ms | 141 ms | 16.1 MiB | 7 |
| 2560 | 273 ms | 273 ms | 275 ms | 32.3 MiB | 4 |
| 5120 | 546 ms | 546 ms | 548 ms | 707.4 KiB | 2 |
| 10240 | 1.09 s | 1.09 s | 1.09 s | 1.4 MiB | 1 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.46 ms | 1.49 ms | 3.37 ms | 645.6 KiB | 687 |
| 40 | 2.52 ms | 2.55 ms | 4.43 ms | 1.3 MiB | 397 |
| 80 | 4.65 ms | 4.75 ms | 6.58 ms | 2.5 MiB | 215 |
| 160 | 8.97 ms | 9.05 ms | 10.9 ms | 5.2 MiB | 112 |
| 320 | 17.7 ms | 17.8 ms | 19.6 ms | 10.6 MiB | 57 |
| 640 | 35.1 ms | 35.1 ms | 37.1 ms | 21.4 MiB | 29 |
| 1280 | 70.4 ms | 72.1 ms | 72.7 ms | 43.6 MiB | 14 |
| 2560 | 141 ms | 149 ms | 144 ms | 25.7 MiB | 7 |
| 5120 | 284 ms | 285 ms | 287 ms | 53.9 MiB | 4 |
| 10240 | 568 ms | 569 ms | 573 ms | 46.2 MiB | 2 |

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
| 20 | 5.86 µs | 15.4 µs | 6.00 µs | 9.3 KiB | 170,516 |
| 40 | 7.69 µs | 9.36 µs | 29.6 µs | 8.4 KiB | 130,112 |
| 80 | 12.6 µs | 13.1 µs | 42.4 µs | 16.2 KiB | 79,454 |
| 160 | 23.1 µs | 23.9 µs | 71.9 µs | 31.8 KiB | 43,254 |
| 320 | 44.2 µs | 45.4 µs | 132 µs | 63.1 KiB | 22,608 |
| 640 | 87.2 µs | 89.9 µs | 255 µs | 127.7 KiB | 11,463 |
| 1280 | 435 µs | 448 µs | 1.18 ms | 340.8 KiB | 2,298 |
| 2560 | 796 µs | 812 µs | 1.59 ms | 694.2 KiB | 1,256 |
| 5120 | 1.75 ms | 1.78 ms | 3.40 ms | 1.3 MiB | 573 |
| 10240 | 3.59 ms | 3.66 ms | 5.38 ms | 2.7 MiB | 279 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.87, 10 sizes) -- ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 4.47 µs | 4.69 µs | 14.2 µs | 4.5 KiB | 223,555 |
| 40 | 4.80 µs | 5.09 µs | 19.7 µs | 4.5 KiB | 208,370 |
| 80 | 5.65 µs | 6.05 µs | 5.71 µs | 4.5 KiB | 177,050 |
| 160 | 6.45 µs | 6.80 µs | 24.9 µs | 4.5 KiB | 155,009 |
| 320 | 8.52 µs | 9.01 µs | 30.7 µs | 4.5 KiB | 117,434 |
| 640 | 13.1 µs | 13.7 µs | 44.7 µs | 4.5 KiB | 76,352 |
| 1280 | 21.9 µs | 22.6 µs | 69.4 µs | 4.5 KiB | 45,620 |
| 2560 | 39.1 µs | 40.4 µs | 122 µs | 4.5 KiB | 25,598 |
| 5120 | 74.7 µs | 76.9 µs | 231 µs | 4.5 KiB | 13,379 |
| 10240 | 144 µs | 148 µs | 415 µs | 4.5 KiB | 6,960 |

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

**Measured: O(n)** (exponent 0.97, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 12.9 µs | 15.1 µs | 13.2 µs | 3.6 KiB | 77,468 |
| 40 | 18.7 µs | 20.8 µs | 19.0 µs | 6.3 KiB | 53,368 |
| 80 | 32.2 µs | 34.4 µs | 133 µs | 11.7 KiB | 31,052 |
| 160 | 52.7 µs | 58.7 µs | 188 µs | 22.3 KiB | 18,978 |
| 320 | 96.0 µs | 110 µs | 312 µs | 45.3 KiB | 10,418 |
| 640 | 166 µs | 186 µs | 467 µs | 92.1 KiB | 6,033 |
| 1280 | 315 µs | 330 µs | 819 µs | 191.5 KiB | 3,176 |
| 2560 | 594 µs | 646 µs | 1.36 ms | 360.8 KiB | 1,684 |
| 5120 | 1.35 ms | 1.46 ms | 2.92 ms | 685.2 KiB | 740 |
| 10240 | 2.33 ms | 2.42 ms | 3.98 ms | 1.3 MiB | 428 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 2.57 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.97 ms | 1.97 ms | 77% |
| `load-exception-registry` | 1 | 531 µs | 531 µs | 21% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 63.2 µs | 2.5% |

**At 10240 entrys** (whole operation: 43.9 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 32.1 ms | 32.1 ms | 73% |
| `load-exception-registry` | 1 | 7.21 ms | 7.21 ms | 16% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 4.63 ms | 11% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-02T15:34:19.893Z` → `2026-11-02T15:35:23.591Z` (64 s), ci: CI (run 41469808794)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15984 MB RAM, linux/x64, Node v24.22.1, GitHub Actions
- Git: `681e9b7117407b93ad93a09625dc294ab5bdcc1b` on `feat/affected-scope`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

