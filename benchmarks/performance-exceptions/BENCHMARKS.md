# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.98 ms** per operation compared with a bare-minimum baseline (**302% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.02). At list prices that is on the order of **~$0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.98 ms | 34.5 ms |
| Added latency, relative to baseline | 302% | 339% |
| Added CPU time per operation | 2.72 ms | 34.2 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 505 ops/s | 29 ops/s |

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
| 20 | 28.7 µs | 158 µs | 130 µs | 452% | 516 µs | $0.00027 – $0.0058 |
| 40 | 50.2 µs | 225 µs | 175 µs | 349% | 543 µs | $0.00036 – $0.0061 |
| 80 | 95.6 µs | 376 µs | 280 µs | 293% | 581 µs | $0.00058 – $0.0065 |
| 160 | 188 µs | 687 µs | 499 µs | 265% | 858 µs | $0.001 – $0.0096 |
| 320 | 337 µs | 1.36 ms | 1.02 ms | 303% | 2.10 ms | $0.0021 – $0.024 |
| 640 | 656 µs | 2.64 ms | 1.98 ms | 302% | 2.72 ms | $0.0041 – $0.031 |
| 1280 | 1.33 ms | 5.05 ms | 3.71 ms | 279% | 3.74 ms | $0.0077 – $0.042 |
| 2560 | 2.53 ms | 9.96 ms | 7.43 ms | 294% | 7.40 ms | $0.015 – $0.083 |
| 5120 | 5.04 ms | 20.3 ms | 15.2 ms | 302% | 15.6 ms | $0.032 – $0.175 |
| 10240 | 10.2 ms | 44.7 ms | 34.5 ms | 339% | 34.2 ms | $0.072 – $0.385 |

**How the total grows:** O(n) (linear), exponent 1.02 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 336 µs | 4.14 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 57.7 µs | 1.37 ms |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 548 µs | 7.41 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 2.04 ms | 33.7 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 38.6 ms | 577 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 155 µs | 4.39 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 72.0 ms | 1.09 s |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 35.0 ms | 568 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 88.5 µs | 3.59 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 13.1 µs | 143 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 168 µs | 2.36 ms |

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

**Measured: O(n)** (exponent 0.93, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 107 µs | 173 µs | 356 µs | 115.4 KiB | 9,324 |
| 40 | 81.9 µs | 88.9 µs | 324 µs | 99.8 KiB | 12,210 |
| 80 | 77.6 µs | 81.2 µs | 240 µs | 120.8 KiB | 12,891 |
| 160 | 102 µs | 109 µs | 305 µs | 159.3 KiB | 9,821 |
| 320 | 153 µs | 177 µs | 452 µs | 237.4 KiB | 6,557 |
| 640 | 336 µs | 514 µs | 1.07 ms | 530.7 KiB | 2,975 |
| 1280 | 527 µs | 540 µs | 1.27 ms | 1.0 MiB | 1,896 |
| 2560 | 1.06 ms | 1.14 ms | 2.55 ms | 2.1 MiB | 940 |
| 5120 | 2.13 ms | 2.19 ms | 3.52 ms | 4.3 MiB | 470 |
| 10240 | 4.14 ms | 4.33 ms | 4.52 ms | 8.6 MiB | 242 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.16, 10 sizes) -- 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 11.5 µs | 12.1 µs | 43.8 µs | 17.0 KiB | 87,082 |
| 40 | 11.9 µs | 12.6 µs | 45.4 µs | 16.3 KiB | 83,852 |
| 80 | 14.9 µs | 15.5 µs | 53.7 µs | 20.5 KiB | 67,102 |
| 160 | 20.5 µs | 21.9 µs | 71.8 µs | 28.6 KiB | 48,866 |
| 320 | 31.7 µs | 33.9 µs | 104 µs | 48.2 KiB | 31,549 |
| 640 | 57.7 µs | 60.5 µs | 180 µs | 86.8 KiB | 17,327 |
| 1280 | 112 µs | 118 µs | 327 µs | 166.1 KiB | 8,898 |
| 2560 | 252 µs | 260 µs | 782 µs | 335.9 KiB | 3,971 |
| 5120 | 601 µs | 623 µs | 1.48 ms | 634.3 KiB | 1,663 |
| 10240 | 1.37 ms | 1.44 ms | 3.46 ms | 1.3 MiB | 729 |

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
| 20 | 23.3 µs | 24.5 µs | 88.2 µs | 7.3 KiB | 42,919 |
| 40 | 40.4 µs | 41.4 µs | 125 µs | 13.2 KiB | 24,769 |
| 80 | 74.6 µs | 78.0 µs | 217 µs | 25.1 KiB | 13,412 |
| 160 | 153 µs | 159 µs | 430 µs | 48.9 KiB | 6,535 |
| 320 | 290 µs | 294 µs | 772 µs | 96.5 KiB | 3,451 |
| 640 | 548 µs | 587 µs | 1.27 ms | 191.6 KiB | 1,824 |
| 1280 | 1.09 ms | 1.15 ms | 2.60 ms | 381.9 KiB | 915 |
| 2560 | 2.01 ms | 2.39 ms | 3.67 ms | 761.9 KiB | 497 |
| 5120 | 4.54 ms | 4.75 ms | 6.34 ms | 1.5 MiB | 220 |
| 10240 | 7.41 ms | 7.76 ms | 9.56 ms | 3.0 MiB | 135 |

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
| 20 | 89.5 µs | 103 µs | 329 µs | 44.5 KiB | 11,171 |
| 40 | 149 µs | 161 µs | 431 µs | 83.3 KiB | 6,702 |
| 80 | 281 µs | 316 µs | 757 µs | 161.9 KiB | 3,556 |
| 160 | 536 µs | 564 µs | 1.25 ms | 319.5 KiB | 1,866 |
| 320 | 1.07 ms | 1.13 ms | 2.54 ms | 634.7 KiB | 932 |
| 640 | 2.04 ms | 2.12 ms | 3.51 ms | 1.2 MiB | 489 |
| 1280 | 3.90 ms | 4.04 ms | 5.46 ms | 2.5 MiB | 257 |
| 2560 | 7.56 ms | 7.79 ms | 9.37 ms | 4.9 MiB | 132 |
| 5120 | 14.8 ms | 15.0 ms | 17.0 ms | 9.8 MiB | 68 |
| 10240 | 33.7 ms | 33.8 ms | 36.3 ms | 19.7 MiB | 30 |

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
| 20 | 1.88 ms | 2.34 ms | 4.09 ms | 653.2 KiB | 532 |
| 40 | 2.46 ms | 3.82 ms | 3.96 ms | 1.3 MiB | 407 |
| 80 | 4.69 ms | 6.15 ms | 6.17 ms | 2.6 MiB | 213 |
| 160 | 9.15 ms | 11.1 ms | 10.6 ms | 5.3 MiB | 109 |
| 320 | 18.0 ms | 20.7 ms | 19.8 ms | 10.6 MiB | 55 |
| 640 | 38.6 ms | 38.7 ms | 43.4 ms | 21.5 MiB | 26 |
| 1280 | 71.0 ms | 75.2 ms | 73.3 ms | 43.7 MiB | 14 |
| 2560 | 143 ms | 147 ms | 145 ms | 25.9 MiB | 7 |
| 5120 | 292 ms | 295 ms | 302 ms | 54.2 MiB | 3 |
| 10240 | 577 ms | 580 ms | 590 ms | 47.0 MiB | 2 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.16, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 8.00 µs | 9.17 µs | 8.29 µs | 7.4 KiB | 124,945 |
| 40 | 11.7 µs | 12.4 µs | 40.6 µs | 14.0 KiB | 85,652 |
| 80 | 21.3 µs | 25.2 µs | 67.4 µs | 27.3 KiB | 47,012 |
| 160 | 40.5 µs | 48.5 µs | 123 µs | 53.9 KiB | 24,679 |
| 320 | 77.7 µs | 82.6 µs | 227 µs | 107.0 KiB | 12,874 |
| 640 | 155 µs | 167 µs | 451 µs | 213.3 KiB | 6,465 |
| 1280 | 528 µs | 542 µs | 1.27 ms | 516.0 KiB | 1,893 |
| 2560 | 1.07 ms | 1.18 ms | 2.57 ms | 1.0 MiB | 939 |
| 5120 | 2.11 ms | 2.33 ms | 3.69 ms | 2.1 MiB | 475 |
| 10240 | 4.39 ms | 4.55 ms | 6.50 ms | 4.2 MiB | 228 |

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

**Measured: O(n)** (exponent 0.98, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.63 ms | 2.68 ms | 4.50 ms | 1.2 MiB | 381 |
| 40 | 4.86 ms | 4.92 ms | 6.75 ms | 2.5 MiB | 206 |
| 80 | 9.31 ms | 9.41 ms | 11.2 ms | 5.0 MiB | 107 |
| 160 | 18.3 ms | 18.7 ms | 20.3 ms | 10.0 MiB | 55 |
| 320 | 36.2 ms | 36.3 ms | 38.3 ms | 20.0 MiB | 28 |
| 640 | 72.0 ms | 73.1 ms | 74.2 ms | 40.1 MiB | 14 |
| 1280 | 144 ms | 151 ms | 146 ms | 16.1 MiB | 7 |
| 2560 | 273 ms | 274 ms | 276 ms | 32.3 MiB | 4 |
| 5120 | 547 ms | 547 ms | 549 ms | 707.4 KiB | 2 |
| 10240 | 1.09 s | 1.09 s | 1.09 s | 1.4 MiB | 1 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.45 ms | 1.49 ms | 3.34 ms | 645.6 KiB | 690 |
| 40 | 2.53 ms | 2.58 ms | 4.40 ms | 1.3 MiB | 395 |
| 80 | 4.66 ms | 4.75 ms | 6.60 ms | 2.5 MiB | 214 |
| 160 | 8.99 ms | 9.10 ms | 10.9 ms | 5.2 MiB | 111 |
| 320 | 17.7 ms | 18.0 ms | 19.6 ms | 10.6 MiB | 57 |
| 640 | 35.0 ms | 35.3 ms | 36.9 ms | 21.4 MiB | 29 |
| 1280 | 70.6 ms | 70.9 ms | 72.7 ms | 43.6 MiB | 14 |
| 2560 | 142 ms | 143 ms | 144 ms | 25.7 MiB | 7 |
| 5120 | 285 ms | 298 ms | 288 ms | 53.9 MiB | 4 |
| 10240 | 568 ms | 582 ms | 573 ms | 46.2 MiB | 2 |

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
| 20 | 5.86 µs | 15.1 µs | 6.00 µs | 9.3 KiB | 170,581 |
| 40 | 7.48 µs | 9.82 µs | 28.8 µs | 8.4 KiB | 133,637 |
| 80 | 12.9 µs | 13.3 µs | 42.8 µs | 16.2 KiB | 77,401 |
| 160 | 23.6 µs | 25.3 µs | 74.0 µs | 31.8 KiB | 42,305 |
| 320 | 45.0 µs | 46.1 µs | 133 µs | 63.1 KiB | 22,225 |
| 640 | 88.5 µs | 90.1 µs | 257 µs | 127.7 KiB | 11,296 |
| 1280 | 435 µs | 447 µs | 1.19 ms | 340.8 KiB | 2,297 |
| 2560 | 807 µs | 825 µs | 1.61 ms | 694.2 KiB | 1,239 |
| 5120 | 1.75 ms | 1.78 ms | 3.39 ms | 1.3 MiB | 572 |
| 10240 | 3.59 ms | 3.70 ms | 5.38 ms | 2.7 MiB | 278 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.87, 10 sizes) -- ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 4.55 µs | 5.31 µs | 4.67 µs | 4.5 KiB | 219,595 |
| 40 | 4.75 µs | 5.01 µs | 19.3 µs | 4.5 KiB | 210,363 |
| 80 | 5.39 µs | 5.85 µs | 21.7 µs | 4.5 KiB | 185,492 |
| 160 | 6.45 µs | 6.76 µs | 24.8 µs | 4.5 KiB | 155,142 |
| 320 | 8.76 µs | 9.12 µs | 31.4 µs | 4.5 KiB | 114,096 |
| 640 | 13.1 µs | 13.8 µs | 44.7 µs | 4.5 KiB | 76,620 |
| 1280 | 21.9 µs | 22.6 µs | 70.0 µs | 4.5 KiB | 45,728 |
| 2560 | 39.1 µs | 40.9 µs | 123 µs | 4.5 KiB | 25,548 |
| 5120 | 74.4 µs | 77.1 µs | 230 µs | 4.5 KiB | 13,441 |
| 10240 | 143 µs | 163 µs | 406 µs | 4.5 KiB | 6,993 |

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
| 20 | 12.7 µs | 15.5 µs | 13.0 µs | 3.6 KiB | 78,752 |
| 40 | 18.9 µs | 20.5 µs | 19.2 µs | 6.3 KiB | 52,938 |
| 80 | 32.0 µs | 34.6 µs | 107 µs | 11.7 KiB | 31,252 |
| 160 | 53.5 µs | 67.4 µs | 188 µs | 22.3 KiB | 18,684 |
| 320 | 94.1 µs | 103 µs | 309 µs | 45.3 KiB | 10,630 |
| 640 | 168 µs | 189 µs | 468 µs | 92.1 KiB | 5,941 |
| 1280 | 310 µs | 328 µs | 814 µs | 191.5 KiB | 3,226 |
| 2560 | 602 µs | 647 µs | 1.41 ms | 360.8 KiB | 1,660 |
| 5120 | 1.36 ms | 1.45 ms | 2.88 ms | 685.3 KiB | 738 |
| 10240 | 2.36 ms | 2.45 ms | 4.02 ms | 1.3 MiB | 424 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 2.64 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 2.04 ms | 2.04 ms | 77% |
| `load-exception-registry` | 1 | 548 µs | 548 µs | 21% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 46.3 µs | 1.8% |

**At 10240 entrys** (whole operation: 44.7 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 33.7 ms | 33.7 ms | 75% |
| `load-exception-registry` | 1 | 7.41 ms | 7.41 ms | 17% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 3.55 ms | 7.9% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-31T21:51:58.815Z` → `2026-10-31T21:53:02.641Z` (64 s), ci: CI (run 41244152041)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15984 MB RAM, linux/x64, Node v24.22.1, GitHub Actions
- Git: `adf4cccb5f3c050755fc7bb35e7e8dfe83f75be5` on `dependabot/npm_and_yarn/qs-6.17.1`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

