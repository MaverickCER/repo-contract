# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.95 ms** per operation compared with a bare-minimum baseline (**295% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.00). At list prices that is on the order of **~$0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.95 ms | 31.8 ms |
| Added latency, relative to baseline | 295% | 306% |
| Added CPU time per operation | 2.74 ms | 31.4 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 514 ops/s | 31 ops/s |

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
| 20 | 32.9 µs | 161 µs | 128 µs | 389% | 621 µs | $0.00027 – $0.007 |
| 40 | 50.6 µs | 228 µs | 178 µs | 351% | 566 µs | $0.00037 – $0.0064 |
| 80 | 94.4 µs | 410 µs | 316 µs | 334% | 874 µs | $0.00066 – $0.0098 |
| 160 | 177 µs | 679 µs | 502 µs | 284% | 950 µs | $0.001 – $0.011 |
| 320 | 379 µs | 1.34 ms | 958 µs | 253% | 1.74 ms | $0.002 – $0.020 |
| 640 | 660 µs | 2.61 ms | 1.95 ms | 295% | 2.74 ms | $0.0041 – $0.031 |
| 1280 | 1.33 ms | 5.04 ms | 3.71 ms | 280% | 3.80 ms | $0.0077 – $0.043 |
| 2560 | 2.56 ms | 9.97 ms | 7.41 ms | 290% | 7.39 ms | $0.015 – $0.083 |
| 5120 | 5.15 ms | 19.8 ms | 14.6 ms | 285% | 14.8 ms | $0.031 – $0.167 |
| 10240 | 10.4 ms | 42.2 ms | 31.8 ms | 306% | 31.4 ms | $0.066 – $0.353 |

**How the total grows:** O(n) (linear), exponent 1.00 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 388 µs | 4.30 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 58.6 µs | 1.41 ms |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 539 µs | 7.26 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 2.03 ms | 30.9 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 37.5 ms | 584 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 153 µs | 4.41 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 70.2 ms | 1.11 s |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 35.7 ms | 579 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 85.6 µs | 3.53 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 13.5 µs | 143 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 185 µs | 2.37 ms |

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
| 20 | 114 µs | 139 µs | 422 µs | 115.6 KiB | 8,775 |
| 40 | 78.4 µs | 119 µs | 294 µs | 99.2 KiB | 12,750 |
| 80 | 79.4 µs | 82.5 µs | 250 µs | 120.8 KiB | 12,592 |
| 160 | 104 µs | 108 µs | 320 µs | 159.3 KiB | 9,658 |
| 320 | 154 µs | 168 µs | 461 µs | 237.4 KiB | 6,495 |
| 640 | 388 µs | 603 µs | 1.11 ms | 656.2 KiB | 2,575 |
| 1280 | 538 µs | 551 µs | 1.31 ms | 1.0 MiB | 1,860 |
| 2560 | 1.08 ms | 1.13 ms | 2.62 ms | 2.1 MiB | 927 |
| 5120 | 2.18 ms | 2.25 ms | 3.66 ms | 4.3 MiB | 458 |
| 10240 | 4.30 ms | 4.40 ms | 5.80 ms | 8.6 MiB | 233 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.16, 10 sizes) -- 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 11.5 µs | 12.1 µs | 46.3 µs | 17.0 KiB | 86,593 |
| 40 | 11.7 µs | 12.5 µs | 46.1 µs | 16.3 KiB | 85,694 |
| 80 | 14.6 µs | 15.5 µs | 53.4 µs | 20.5 KiB | 68,702 |
| 160 | 22.2 µs | 25.0 µs | 83.8 µs | 28.6 KiB | 45,086 |
| 320 | 33.0 µs | 38.1 µs | 111 µs | 48.2 KiB | 30,334 |
| 640 | 58.6 µs | 60.2 µs | 182 µs | 86.8 KiB | 17,074 |
| 1280 | 115 µs | 120 µs | 334 µs | 166.1 KiB | 8,712 |
| 2560 | 259 µs | 268 µs | 801 µs | 335.9 KiB | 3,855 |
| 5120 | 612 µs | 673 µs | 1.53 ms | 634.3 KiB | 1,633 |
| 10240 | 1.41 ms | 1.46 ms | 3.62 ms | 1.3 MiB | 708 |

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
| 20 | 25.2 µs | 26.5 µs | 106 µs | 7.3 KiB | 39,736 |
| 40 | 41.4 µs | 42.5 µs | 141 µs | 13.2 KiB | 24,149 |
| 80 | 75.5 µs | 77.1 µs | 227 µs | 25.1 KiB | 13,244 |
| 160 | 150 µs | 155 µs | 457 µs | 48.9 KiB | 6,645 |
| 320 | 286 µs | 291 µs | 797 µs | 96.5 KiB | 3,493 |
| 640 | 539 µs | 553 µs | 1.31 ms | 191.6 KiB | 1,857 |
| 1280 | 1.08 ms | 1.11 ms | 2.66 ms | 381.9 KiB | 925 |
| 2560 | 2.01 ms | 2.40 ms | 3.71 ms | 761.9 KiB | 498 |
| 5120 | 4.39 ms | 4.52 ms | 6.28 ms | 1.5 MiB | 228 |
| 10240 | 7.26 ms | 7.68 ms | 9.53 ms | 3.0 MiB | 138 |

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
| 20 | 92.7 µs | 106 µs | 344 µs | 44.5 KiB | 10,787 |
| 40 | 150 µs | 159 µs | 446 µs | 83.3 KiB | 6,658 |
| 80 | 287 µs | 337 µs | 791 µs | 161.9 KiB | 3,490 |
| 160 | 539 µs | 615 µs | 1.29 ms | 319.5 KiB | 1,857 |
| 320 | 1.06 ms | 1.11 ms | 2.55 ms | 634.8 KiB | 943 |
| 640 | 2.03 ms | 2.19 ms | 3.61 ms | 1.2 MiB | 494 |
| 1280 | 3.81 ms | 3.97 ms | 5.44 ms | 2.5 MiB | 262 |
| 2560 | 7.49 ms | 7.60 ms | 9.40 ms | 4.9 MiB | 133 |
| 5120 | 14.7 ms | 15.2 ms | 16.9 ms | 9.8 MiB | 68 |
| 10240 | 30.9 ms | 31.6 ms | 33.8 ms | 19.7 MiB | 32 |

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
| 20 | 1.94 ms | 2.42 ms | 4.30 ms | 652.5 KiB | 516 |
| 40 | 2.50 ms | 3.68 ms | 4.06 ms | 1.3 MiB | 400 |
| 80 | 4.76 ms | 6.66 ms | 6.31 ms | 2.6 MiB | 210 |
| 160 | 9.37 ms | 12.6 ms | 11.0 ms | 5.3 MiB | 107 |
| 320 | 18.1 ms | 24.6 ms | 20.1 ms | 10.6 MiB | 55 |
| 640 | 37.5 ms | 37.9 ms | 42.6 ms | 21.5 MiB | 27 |
| 1280 | 72.0 ms | 73.5 ms | 74.3 ms | 43.7 MiB | 14 |
| 2560 | 144 ms | 146 ms | 147 ms | 25.9 MiB | 7 |
| 5120 | 293 ms | 294 ms | 304 ms | 54.3 MiB | 3 |
| 10240 | 584 ms | 585 ms | 596 ms | 47.0 MiB | 2 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.17, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 8.01 µs | 10.3 µs | 8.21 µs | 7.4 KiB | 124,895 |
| 40 | 11.9 µs | 13.4 µs | 43.4 µs | 14.0 KiB | 83,974 |
| 80 | 18.8 µs | 22.8 µs | 52.5 µs | 27.3 KiB | 53,313 |
| 160 | 40.9 µs | 51.8 µs | 132 µs | 53.9 KiB | 24,434 |
| 320 | 77.1 µs | 90.9 µs | 232 µs | 107.0 KiB | 12,970 |
| 640 | 153 µs | 187 µs | 461 µs | 213.3 KiB | 6,550 |
| 1280 | 528 µs | 610 µs | 1.33 ms | 516.0 KiB | 1,893 |
| 2560 | 1.06 ms | 1.19 ms | 2.68 ms | 1.0 MiB | 945 |
| 5120 | 2.08 ms | 2.31 ms | 3.72 ms | 2.1 MiB | 480 |
| 10240 | 4.41 ms | 4.86 ms | 7.43 ms | 4.2 MiB | 227 |

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
| 20 | 2.60 ms | 2.65 ms | 4.58 ms | 1.2 MiB | 385 |
| 40 | 4.80 ms | 4.87 ms | 6.88 ms | 2.5 MiB | 208 |
| 80 | 9.14 ms | 9.17 ms | 11.2 ms | 5.0 MiB | 109 |
| 160 | 17.9 ms | 18.1 ms | 20.1 ms | 10.0 MiB | 56 |
| 320 | 35.3 ms | 35.5 ms | 37.8 ms | 20.0 MiB | 28 |
| 640 | 70.2 ms | 72.3 ms | 72.8 ms | 40.1 MiB | 14 |
| 1280 | 140 ms | 143 ms | 143 ms | 16.1 MiB | 7 |
| 2560 | 278 ms | 278 ms | 281 ms | 32.3 MiB | 4 |
| 5120 | 556 ms | 559 ms | 558 ms | 707.4 KiB | 2 |
| 10240 | 1.11 s | 1.11 s | 1.11 s | 1.4 MiB | 1 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.49 ms | 1.53 ms | 3.46 ms | 645.6 KiB | 670 |
| 40 | 2.59 ms | 2.65 ms | 4.58 ms | 1.3 MiB | 386 |
| 80 | 4.79 ms | 4.83 ms | 6.83 ms | 2.5 MiB | 209 |
| 160 | 9.18 ms | 9.25 ms | 11.3 ms | 5.2 MiB | 109 |
| 320 | 18.0 ms | 18.2 ms | 20.4 ms | 10.6 MiB | 55 |
| 640 | 35.7 ms | 35.9 ms | 38.1 ms | 21.4 MiB | 28 |
| 1280 | 71.5 ms | 72.3 ms | 74.0 ms | 43.6 MiB | 14 |
| 2560 | 144 ms | 148 ms | 146 ms | 25.7 MiB | 7 |
| 5120 | 289 ms | 289 ms | 293 ms | 53.9 MiB | 3 |
| 10240 | 579 ms | 580 ms | 584 ms | 46.2 MiB | 2 |

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
| 20 | 6.04 µs | 15.2 µs | 6.20 µs | 9.3 KiB | 165,556 |
| 40 | 7.98 µs | 9.65 µs | 33.3 µs | 8.4 KiB | 125,247 |
| 80 | 13.0 µs | 13.5 µs | 45.0 µs | 16.2 KiB | 77,187 |
| 160 | 25.7 µs | 26.4 µs | 92.1 µs | 31.9 KiB | 38,970 |
| 320 | 44.8 µs | 46.5 µs | 141 µs | 63.1 KiB | 22,327 |
| 640 | 85.6 µs | 88.7 µs | 257 µs | 127.7 KiB | 11,688 |
| 1280 | 437 µs | 446 µs | 1.23 ms | 340.8 KiB | 2,289 |
| 2560 | 791 µs | 804 µs | 1.61 ms | 694.2 KiB | 1,265 |
| 5120 | 1.73 ms | 1.78 ms | 3.42 ms | 1.3 MiB | 580 |
| 10240 | 3.53 ms | 3.60 ms | 5.37 ms | 2.7 MiB | 283 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.86, 10 sizes) -- ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 4.56 µs | 5.08 µs | 4.59 µs | 4.5 KiB | 219,499 |
| 40 | 5.05 µs | 5.28 µs | 16.0 µs | 4.5 KiB | 197,969 |
| 80 | 5.72 µs | 6.35 µs | 5.80 µs | 4.5 KiB | 174,737 |
| 160 | 6.68 µs | 7.05 µs | 26.8 µs | 4.5 KiB | 149,698 |
| 320 | 9.02 µs | 9.42 µs | 34.8 µs | 4.5 KiB | 110,881 |
| 640 | 13.5 µs | 14.3 µs | 46.4 µs | 4.5 KiB | 74,218 |
| 1280 | 22.4 µs | 23.3 µs | 73.9 µs | 4.5 KiB | 44,598 |
| 2560 | 40.2 µs | 41.4 µs | 126 µs | 4.5 KiB | 24,880 |
| 5120 | 75.7 µs | 77.4 µs | 237 µs | 4.5 KiB | 13,216 |
| 10240 | 143 µs | 148 µs | 418 µs | 4.5 KiB | 6,989 |

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

**Measured: O(n)** (exponent 0.94, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 15.1 µs | 19.2 µs | 15.8 µs | 3.7 KiB | 66,379 |
| 40 | 21.5 µs | 24.8 µs | 21.8 µs | 6.4 KiB | 46,577 |
| 80 | 34.2 µs | 40.5 µs | 112 µs | 11.7 KiB | 29,199 |
| 160 | 56.2 µs | 60.3 µs | 212 µs | 22.4 KiB | 17,791 |
| 320 | 98.3 µs | 119 µs | 319 µs | 45.3 KiB | 10,175 |
| 640 | 185 µs | 216 µs | 573 µs | 93.6 KiB | 5,406 |
| 1280 | 323 µs | 350 µs | 846 µs | 191.5 KiB | 3,099 |
| 2560 | 590 µs | 629 µs | 1.42 ms | 360.0 KiB | 1,694 |
| 5120 | 1.35 ms | 1.50 ms | 2.98 ms | 685.3 KiB | 741 |
| 10240 | 2.37 ms | 2.51 ms | 4.16 ms | 1.3 MiB | 421 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 2.61 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 2.03 ms | 2.03 ms | 78% |
| `load-exception-registry` | 1 | 539 µs | 539 µs | 21% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 42.6 µs | 1.6% |

**At 10240 entrys** (whole operation: 42.2 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 30.9 ms | 30.9 ms | 73% |
| `load-exception-registry` | 1 | 7.26 ms | 7.26 ms | 17% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 4.00 ms | 9.5% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-24T18:50:10.664Z` → `2026-10-24T18:51:15.311Z` (65 s), ci: CI (run 40121134103)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `bac2da01a8dfafb0aace4a6a1f72c1e7fe51354e` on `chore/bump-internal-package-contract-v0.13.2`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

