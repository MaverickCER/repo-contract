# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.98 ms** per operation compared with a bare-minimum baseline (**297% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.01). At list prices that is on the order of **~$0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.98 ms | 34.4 ms |
| Added latency, relative to baseline | 297% | 339% |
| Added CPU time per operation | 2.69 ms | 33.7 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 506 ops/s | 29 ops/s |

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
| 20 | 29.4 µs | 138 µs | 109 µs | 370% | 384 µs | $0.00023 – $0.0043 |
| 40 | 51.0 µs | 208 µs | 157 µs | 308% | 394 µs | $0.00033 – $0.0044 |
| 80 | 94.5 µs | 366 µs | 272 µs | 288% | 575 µs | $0.00057 – $0.0065 |
| 160 | 188 µs | 680 µs | 491 µs | 261% | 848 µs | $0.001 – $0.0095 |
| 320 | 349 µs | 1.36 ms | 1.01 ms | 291% | 1.99 ms | $0.0021 – $0.022 |
| 640 | 666 µs | 2.64 ms | 1.98 ms | 297% | 2.69 ms | $0.0041 – $0.030 |
| 1280 | 1.34 ms | 5.03 ms | 3.69 ms | 275% | 3.74 ms | $0.0077 – $0.042 |
| 2560 | 2.53 ms | 9.91 ms | 7.38 ms | 291% | 7.35 ms | $0.015 – $0.083 |
| 5120 | 5.08 ms | 20.0 ms | 14.9 ms | 294% | 15.2 ms | $0.031 – $0.170 |
| 10240 | 10.1 ms | 44.5 ms | 34.4 ms | 339% | 33.7 ms | $0.072 – $0.379 |

**How the total grows:** O(n) (linear), exponent 1.01 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 381 µs | 4.21 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 57.9 µs | 1.38 ms |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 545 µs | 7.39 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 2.04 ms | 33.3 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 37.8 ms | 580 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 156 µs | 4.36 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 69.0 ms | 1.09 s |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 35.1 ms | 571 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 86.5 µs | 3.62 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 13.0 µs | 163 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 165 µs | 2.36 ms |

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

**Measured: O(n)** (exponent 0.89, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 106 µs | 133 µs | 351 µs | 115.4 KiB | 9,469 |
| 40 | 75.6 µs | 81.0 µs | 280 µs | 99.2 KiB | 13,220 |
| 80 | 77.9 µs | 84.8 µs | 237 µs | 120.8 KiB | 12,837 |
| 160 | 102 µs | 108 µs | 309 µs | 159.3 KiB | 9,777 |
| 320 | 153 µs | 169 µs | 442 µs | 237.4 KiB | 6,522 |
| 640 | 381 µs | 456 µs | 1.10 ms | 656.2 KiB | 2,624 |
| 1280 | 532 µs | 603 µs | 1.24 ms | 1.0 MiB | 1,880 |
| 2560 | 1.05 ms | 1.07 ms | 2.46 ms | 2.1 MiB | 954 |
| 5120 | 2.09 ms | 2.12 ms | 3.38 ms | 4.3 MiB | 479 |
| 10240 | 4.21 ms | 4.25 ms | 5.20 ms | 8.6 MiB | 237 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.14, 10 sizes) -- 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 11.2 µs | 11.7 µs | 42.6 µs | 17.0 KiB | 89,173 |
| 40 | 13.0 µs | 14.2 µs | 13.2 µs | 16.3 KiB | 77,127 |
| 80 | 14.0 µs | 15.0 µs | 50.6 µs | 20.5 KiB | 71,226 |
| 160 | 19.7 µs | 20.9 µs | 67.4 µs | 28.6 KiB | 50,734 |
| 320 | 32.0 µs | 33.7 µs | 107 µs | 48.2 KiB | 31,219 |
| 640 | 57.9 µs | 61.2 µs | 174 µs | 86.8 KiB | 17,273 |
| 1280 | 128 µs | 133 µs | 375 µs | 168.3 KiB | 7,802 |
| 2560 | 245 µs | 251 µs | 636 µs | 329.7 KiB | 4,074 |
| 5120 | 609 µs | 625 µs | 1.49 ms | 634.3 KiB | 1,643 |
| 10240 | 1.38 ms | 1.40 ms | 3.50 ms | 1.3 MiB | 727 |

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
| 20 | 22.3 µs | 23.5 µs | 81.9 µs | 7.3 KiB | 44,941 |
| 40 | 38.3 µs | 39.5 µs | 114 µs | 13.2 KiB | 26,128 |
| 80 | 74.1 µs | 76.8 µs | 211 µs | 25.1 KiB | 13,498 |
| 160 | 151 µs | 156 µs | 440 µs | 48.9 KiB | 6,610 |
| 320 | 288 µs | 314 µs | 779 µs | 96.5 KiB | 3,470 |
| 640 | 545 µs | 555 µs | 1.27 ms | 191.6 KiB | 1,836 |
| 1280 | 1.09 ms | 1.15 ms | 2.58 ms | 381.9 KiB | 915 |
| 2560 | 2.00 ms | 2.38 ms | 3.65 ms | 761.9 KiB | 499 |
| 5120 | 4.52 ms | 4.71 ms | 6.35 ms | 1.5 MiB | 221 |
| 10240 | 7.39 ms | 7.86 ms | 9.57 ms | 3.0 MiB | 135 |

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
| 20 | 84.8 µs | 95.8 µs | 281 µs | 44.3 KiB | 11,792 |
| 40 | 148 µs | 163 µs | 438 µs | 83.3 KiB | 6,740 |
| 80 | 286 µs | 305 µs | 777 µs | 161.9 KiB | 3,491 |
| 160 | 541 µs | 571 µs | 1.27 ms | 319.5 KiB | 1,847 |
| 320 | 1.08 ms | 1.15 ms | 2.54 ms | 634.7 KiB | 927 |
| 640 | 2.04 ms | 2.14 ms | 3.52 ms | 1.2 MiB | 491 |
| 1280 | 3.83 ms | 3.97 ms | 5.39 ms | 2.5 MiB | 261 |
| 2560 | 7.51 ms | 7.66 ms | 9.21 ms | 4.9 MiB | 133 |
| 5120 | 14.7 ms | 14.8 ms | 16.9 ms | 9.8 MiB | 68 |
| 10240 | 33.3 ms | 36.4 ms | 36.0 ms | 19.7 MiB | 30 |

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

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.94 ms | 2.30 ms | 4.21 ms | 652.8 KiB | 514 |
| 40 | 2.46 ms | 3.82 ms | 3.96 ms | 1.3 MiB | 406 |
| 80 | 4.66 ms | 6.23 ms | 6.16 ms | 2.6 MiB | 214 |
| 160 | 9.24 ms | 11.5 ms | 10.9 ms | 5.3 MiB | 108 |
| 320 | 17.8 ms | 21.0 ms | 19.6 ms | 10.6 MiB | 56 |
| 640 | 37.8 ms | 40.5 ms | 44.2 ms | 21.5 MiB | 26 |
| 1280 | 70.9 ms | 73.9 ms | 73.1 ms | 43.7 MiB | 14 |
| 2560 | 143 ms | 146 ms | 145 ms | 25.9 MiB | 7 |
| 5120 | 292 ms | 293 ms | 302 ms | 54.2 MiB | 3 |
| 10240 | 580 ms | 581 ms | 591 ms | 47.0 MiB | 2 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.16, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 8.00 µs | 8.97 µs | 8.22 µs | 7.4 KiB | 124,939 |
| 40 | 10.5 µs | 12.1 µs | 30.8 µs | 14.0 KiB | 95,476 |
| 80 | 21.1 µs | 24.6 µs | 65.7 µs | 27.3 KiB | 47,417 |
| 160 | 39.4 µs | 44.6 µs | 119 µs | 53.9 KiB | 25,404 |
| 320 | 77.1 µs | 90.8 µs | 220 µs | 107.0 KiB | 12,967 |
| 640 | 156 µs | 186 µs | 460 µs | 213.3 KiB | 6,392 |
| 1280 | 527 µs | 576 µs | 1.28 ms | 516.0 KiB | 1,897 |
| 2560 | 980 µs | 991 µs | 1.79 ms | 1.0 MiB | 1,021 |
| 5120 | 2.12 ms | 2.31 ms | 3.68 ms | 2.1 MiB | 471 |
| 10240 | 4.36 ms | 4.56 ms | 6.49 ms | 4.2 MiB | 229 |

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
| 20 | 2.52 ms | 2.58 ms | 4.39 ms | 1.2 MiB | 397 |
| 40 | 4.69 ms | 4.74 ms | 6.59 ms | 2.5 MiB | 213 |
| 80 | 8.95 ms | 9.00 ms | 10.8 ms | 5.0 MiB | 112 |
| 160 | 17.6 ms | 21.9 ms | 19.5 ms | 10.0 MiB | 57 |
| 320 | 34.8 ms | 34.9 ms | 36.8 ms | 20.0 MiB | 29 |
| 640 | 69.0 ms | 73.9 ms | 71.2 ms | 40.1 MiB | 14 |
| 1280 | 138 ms | 144 ms | 140 ms | 16.1 MiB | 7 |
| 2560 | 274 ms | 275 ms | 277 ms | 32.3 MiB | 4 |
| 5120 | 548 ms | 549 ms | 550 ms | 707.4 KiB | 2 |
| 10240 | 1.09 s | 1.09 s | 1.09 s | 1.4 MiB | 1 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.38 ms | 1.48 ms | 3.32 ms | 645.6 KiB | 722 |
| 40 | 2.48 ms | 2.56 ms | 4.40 ms | 1.3 MiB | 403 |
| 80 | 4.65 ms | 4.98 ms | 6.58 ms | 2.5 MiB | 215 |
| 160 | 8.94 ms | 9.05 ms | 10.9 ms | 5.2 MiB | 112 |
| 320 | 17.7 ms | 17.9 ms | 19.7 ms | 10.6 MiB | 57 |
| 640 | 35.1 ms | 35.4 ms | 37.4 ms | 21.4 MiB | 29 |
| 1280 | 70.4 ms | 70.6 ms | 72.5 ms | 43.6 MiB | 14 |
| 2560 | 142 ms | 142 ms | 144 ms | 25.7 MiB | 7 |
| 5120 | 285 ms | 285 ms | 289 ms | 53.9 MiB | 4 |
| 10240 | 571 ms | 571 ms | 575 ms | 46.2 MiB | 2 |

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

**Measured: O(n log n)** (exponent 1.28, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 5.83 µs | 15.1 µs | 5.95 µs | 9.3 KiB | 171,525 |
| 40 | 7.63 µs | 8.66 µs | 28.9 µs | 8.4 KiB | 131,055 |
| 80 | 12.6 µs | 13.0 µs | 42.5 µs | 16.2 KiB | 79,534 |
| 160 | 23.3 µs | 24.1 µs | 72.5 µs | 31.8 KiB | 42,874 |
| 320 | 44.5 µs | 51.3 µs | 133 µs | 63.1 KiB | 22,459 |
| 640 | 86.5 µs | 89.6 µs | 252 µs | 127.7 KiB | 11,565 |
| 1280 | 436 µs | 443 µs | 1.19 ms | 340.8 KiB | 2,293 |
| 2560 | 807 µs | 817 µs | 1.60 ms | 694.2 KiB | 1,239 |
| 5120 | 1.75 ms | 1.78 ms | 3.37 ms | 1.3 MiB | 571 |
| 10240 | 3.62 ms | 3.71 ms | 5.41 ms | 2.7 MiB | 276 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.91, 10 sizes) -- ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 4.38 µs | 4.66 µs | 18.1 µs | 4.5 KiB | 228,312 |
| 40 | 4.77 µs | 5.16 µs | 19.1 µs | 4.5 KiB | 209,686 |
| 80 | 5.26 µs | 5.56 µs | 20.9 µs | 4.5 KiB | 190,058 |
| 160 | 6.42 µs | 6.79 µs | 24.7 µs | 4.5 KiB | 155,816 |
| 320 | 8.51 µs | 8.86 µs | 30.2 µs | 4.5 KiB | 117,494 |
| 640 | 13.0 µs | 14.0 µs | 43.6 µs | 4.5 KiB | 77,218 |
| 1280 | 21.6 µs | 22.5 µs | 69.3 µs | 4.5 KiB | 46,219 |
| 2560 | 33.6 µs | 34.7 µs | 80.7 µs | 4.5 KiB | 29,732 |
| 5120 | 72.6 µs | 95.1 µs | 220 µs | 4.5 KiB | 13,783 |
| 10240 | 163 µs | 167 µs | 491 µs | 4.5 KiB | 6,124 |

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
| 20 | 12.8 µs | 14.7 µs | 13.1 µs | 3.6 KiB | 77,972 |
| 40 | 18.7 µs | 20.5 µs | 18.9 µs | 6.3 KiB | 53,488 |
| 80 | 32.0 µs | 35.5 µs | 111 µs | 11.7 KiB | 31,281 |
| 160 | 52.8 µs | 64.8 µs | 189 µs | 22.3 KiB | 18,934 |
| 320 | 92.3 µs | 106 µs | 309 µs | 45.3 KiB | 10,839 |
| 640 | 165 µs | 183 µs | 464 µs | 92.1 KiB | 6,052 |
| 1280 | 314 µs | 328 µs | 818 µs | 191.5 KiB | 3,185 |
| 2560 | 585 µs | 604 µs | 1.37 ms | 360.0 KiB | 1,708 |
| 5120 | 1.36 ms | 1.47 ms | 2.90 ms | 685.3 KiB | 738 |
| 10240 | 2.36 ms | 2.42 ms | 4.04 ms | 1.3 MiB | 424 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 2.64 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 2.04 ms | 2.04 ms | 77% |
| `load-exception-registry` | 1 | 545 µs | 545 µs | 21% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 60.3 µs | 2.3% |

**At 10240 entrys** (whole operation: 44.5 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 33.3 ms | 33.3 ms | 75% |
| `load-exception-registry` | 1 | 7.39 ms | 7.39 ms | 17% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 3.79 ms | 8.5% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-02T14:06:06.190Z` → `2026-11-02T14:07:10.067Z` (64 s), ci: CI (run 41455884342)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15988 MB RAM, linux/x64, Node v24.22.1, GitHub Actions
- Git: `0bdf617c68d04211032ef0bffedb007ee01756af` on `feat/affected-scope`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

